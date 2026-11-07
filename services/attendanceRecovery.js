const crypto = require('node:crypto');
const fs = require('node:fs');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dateOnly = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const hours = value => { const minutes = Math.round(Number(value) * 60); return `${Math.floor(minutes / 60)}h ${minutes % 60}m`; };
const fail = (status, message) => Object.assign(Error(message), { status });
function objectStore() {
  const client = new S3Client({ region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1', endpoint: process.env.AWS_S3_ENDPOINT || undefined, forcePathStyle: process.env.AWS_S3_FORCE_PATH_STYLE === 'true' });
  return {
    bucket: process.env.AWS_S3_BUCKET,
    put: (key, file, bucket) => client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: fs.createReadStream(file.path), ContentLength: file.size, ContentType: file.mimetype })),
    remove: (key, bucket) => client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })),
    sign: (key, bucket) => getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 60 }),
  };
}
module.exports = function createRecovery(models, store = objectStore()) {
  const { sequelize: db, User, Attendance, DailyWorkRecord, Task, AttendanceCommand: Commands, AttendanceUploadAttempt: Uploads } = models;
  // Safe after crashes/uncertain commits: acquire the same parent lock before deciding
  // whether an object was referenced by a committed receipt. Never delete by client key.
  async function reconcile(userId) {
    return db.transaction(async transaction => {
      await User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
      const rows = await Uploads.findAll({ where: { userId, state: 'pending' }, transaction, lock: transaction.LOCK.UPDATE });
      for (const row of rows) {
        const receipt = await Commands.findByPk(row.commandKey, { transaction });
        const keys = receipt?.response?.dailyWorkRecord?.deliverables || [];
        if (keys.some(file => file.key === row.objectKey)) await row.update({ state: 'retained' }, { transaction });
        else {
          try { await store.remove(row.objectKey, row.bucket); await row.update({ state: 'cleaned' }, { transaction }); }
          catch (_) { /* pending journal remains recoverable; no private key/error logging */ }
        }
      }
    });
  }
  async function execute(req, action) {
    const key = req.headers['idempotency-key'];
    if (typeof key !== 'string' || !uuid.test(key)) throw fail(400, 'A UUID Idempotency-Key is required');
    const commandKey = key.toLowerCase(), body = req.body || {}, files = req.files || [];
    const allowed = action === 'in' ? ['workDate'] : ['workDate', 'attendanceId', 'taskId', 'taskStatus', 'workNote', 'deliverableLink'];
    if (Object.keys(body).some(k => !allowed.includes(k)) || !dateOnly(body.workDate)) throw fail(400, 'Invalid attendance command');
    const id = (value, name) => {
      if (value === undefined || value === null || value === '') return null;
      if (!['number', 'string'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw fail(400, 'Invalid ' + name);
      return Number(value);
    };
    const text = (value, max) => {
      if (value == null || value === '') return null;
      if (typeof value !== 'string' || value.length > max) throw fail(400, 'Invalid attendance text');
      return value;
    };
    const taskId = id(body.taskId, 'task ID'), attendanceId = id(body.attendanceId, 'attendance ID');
    const taskStatus = text(body.taskStatus, 32), workNote = text(body.workNote, 120), deliverableLink = text(body.deliverableLink, 500);
    if (deliverableLink) {
      let link; try { link = new URL(deliverableLink); } catch (_) { throw fail(400, 'Invalid deliverable link'); }
      if (!['http:', 'https:'].includes(link.protocol) || link.username || link.password) throw fail(400, 'Invalid deliverable link');
    }
    if (taskStatus && !['planning', 'in-progress', 'testing', 'blocked', 'completed'].includes(taskStatus)) throw fail(400, 'Invalid task status');
    const descriptors = [];
    for (const file of files) {
      const hash = crypto.createHash('sha256'); for await (const chunk of fs.createReadStream(file.path)) hash.update(chunk);
      descriptors.push({ name: file.originalname, type: file.mimetype, size: file.size, sha256: hash.digest('hex') });
    }
    const payload = { userId: req.user.id, action, workDate: body.workDate, attendanceId, taskId, taskStatus, workNote, deliverableLink, files: descriptors };
    const digest = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    if (files.length && !store.bucket) throw fail(503, 'Attachment storage unavailable');
    const plans = [];
    // Commit intents before acquiring the business connection: uploads must not
    // wait for another pool connection while all workers hold transactions.
    for (const file of files) {
      const id = crypto.randomUUID();
      const prefix = (process.env.AWS_S3_TASKS_PREFIX || 'tasks/').replace(/^\//, '').replace(/\/?$/, '/');
      plans.push(await Uploads.create({ id, userId: req.user.id, commandKey, objectKey: `${prefix}attendance/${req.user.id}/${id}`, bucket: store.bucket, state: 'pending', createdAt: new Date() }));
    }
    let result;
    await db.transaction({ isolationLevel: 'READ COMMITTED' }, async transaction => {
      const account = await User.findByPk(req.user.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!account || account.status !== 'active' || account.role !== req.user.role || Number(account.sessionVersion) !== Number(req.user.sessionVersion ?? 0)) throw fail(401, 'Session revoked. Please sign in again.');
      const prior = await Commands.findByPk(commandKey, { transaction, lock: transaction.LOCK.UPDATE });
      if (prior) {
        if (prior.userId !== req.user.id || prior.digest !== digest) throw fail(409, 'Command key is already bound to another command');
        result = prior.response; return;
      }
      const now = new Date(), today = now.toISOString().slice(0, 10);
      if (body.workDate !== today) throw fail(409, 'Work date changed. Review current attendance before starting a new command.');
      const records = await Attendance.findAll({ where: { userId: account.id, date: today }, transaction, lock: transaction.LOCK.UPDATE, order: [['id', 'ASC']], limit: 2 });
      if (records.length > 1) throw fail(409, 'Conflicting attendance records. Contact an administrator.');
      let record = records[0];
      if (action === 'in' && record) throw fail(409, 'Already clocked in for today');
      if (action === 'out' && record?.clockOut) throw fail(409, 'Already clocked out for today');
      if (attendanceId !== (record?.id || null) && action === 'out') throw fail(409, 'Attendance session changed. Review before saving.');
      if (taskId) {
        const task = await Task.findOne({ where: { id: taskId, assigneeId: account.id, isActive: true }, transaction, lock: transaction.LOCK.UPDATE });
        if (!task) throw fail(404, 'Task not found or not assigned to you');
      }
      const deliverables = [];
      for (const [i, file] of files.entries()) {
        const plan = await Uploads.findByPk(plans[i].id, { transaction, lock: transaction.LOCK.UPDATE });
        // A reconciler may have won the parent lock before this command began.
        // Refuse to upload after it cleaned the intent; same-key retry is safe.
        if (plan.state !== 'pending') throw fail(503, 'Attachment preparation changed. Retry the same command.');
        const objectKey = plan.objectKey, attemptId = plan.id;
        await store.put(objectKey, file, store.bucket);
        deliverables.push({ filename: descriptors[i].name, key: objectKey, url: `/attendance/deliverables/${attemptId}`, size: file.size, mimetype: file.mimetype, uploadedAt: now.toISOString() });
      }
      if (!record) record = await Attendance.create({ userId: account.id, date: today, clockIn: now, status: 'present' }, { transaction });
      result = { message: action === 'in' ? 'Clock-in successful' : 'Clock-out successful', attendance: { id: record.id, date: today, clockIn: new Date(record.clockIn).toISOString(), status: record.status } };
      if (action === 'out') {
        const totalHours = (now - new Date(record.clockIn)) / 3600000;
        await record.update({ clockOut: now, totalHours }, { transaction });
        const work = await DailyWorkRecord.create({ userId: account.id, attendanceId: record.id, taskId, taskStatus, workNote: workNote || (taskId ? null : 'General work - no specific task'), deliverableLink, deliverables: deliverables.length ? deliverables : null, date: today }, { transaction });
        result.attendance = { ...result.attendance, clockOut: now.toISOString(), totalHours: hours(totalHours) };
        result.dailyWorkRecord = work.toJSON();
      }
      // Normalize dates now so first response equals the durable replay byte-for-byte.
      result = JSON.parse(JSON.stringify(result));
      await Commands.create({ commandKey, userId: account.id, digest, response: result, createdAt: now }, { transaction });
    });
    return result;
  }
  const handler = action => async (req, res) => {
    try { const result = await execute(req, action); res.status(200).json(result); }
    catch (error) { res.status(error.status || 503).json({ message: error.status ? error.message : 'Attendance outcome could not be confirmed. Retry the same command.' }); }
    finally {
      try { await req.cleanupAttendanceFiles?.(); } catch (_) { console.error('Attendance temporary-file cleanup failed'); }
      try { await reconcile(req.user.id); } catch (_) { console.error('Attendance upload reconciliation pending'); }
    }
  };
  const download = async (req, res) => {
    try {
      if (!uuid.test(req.params.id)) throw fail(404, 'Deliverable not found');
      const upload = await Uploads.findByPk(req.params.id);
      const receipt = upload && await Commands.findByPk(upload.commandKey);
      const work = receipt?.response?.dailyWorkRecord;
      if (!work?.deliverables?.some(file => file.key === upload.objectKey)) throw fail(404, 'Deliverable not found');
      let permitted = req.user.id === upload.userId || req.user.role === 'admin';
      if (!permitted && req.user.role === 'manager' && work.taskId) {
        const task = await Task.findByPk(work.taskId);
        permitted = !!task && !!await models.Project.findOne({ where: { id: task.projectId, managerId: req.user.id, isActive: true } });
      }
      if (!permitted) throw fail(403, 'Deliverable access denied');
      res.json({ url: await store.sign(upload.objectKey, upload.bucket) });
    } catch (error) { res.status(error.status || 503).json({ message: error.status ? error.message : 'Deliverable unavailable' }); }
  };
  return { clockIn: handler('in'), clockOut: handler('out'), download, reconcile, execute };
};
