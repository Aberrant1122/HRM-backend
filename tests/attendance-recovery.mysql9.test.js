const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { Sequelize, DataTypes } = require('sequelize');
test('durable attendance receipts, object reconciliation and recorded facts', { timeout: 120000 }, async t => {
  assert.equal(process.env.HRM_DISPOSABLE_MYSQL, '1'); assert.equal(process.env.HRM_TEST_MYSQL_PORT, '13379');
  const opts = { host: '127.0.0.1', port: 13379, dialect: 'mysql', logging: false, pool: { max: 5 } };
  const admin = new Sequelize('mysql', 'root', '', opts); let db;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hrm-test-files-'));
  try {
    const schema = 'hrm_recovery_' + Date.now(); await admin.query('CREATE DATABASE `' + schema + '`'); db = new Sequelize(schema, 'root', '', opts);
    const names = fs.readdirSync(path.join(__dirname, '../migrations')).filter(n => n.endsWith('.js')).sort();
    for (const name of names) await require('../migrations/' + name).up(db.getQueryInterface(), Sequelize);
    const models = { sequelize: db };
    for (const name of ['user', 'attendance', 'dailyWorkRecord', 'project', 'tasks', 'attendanceCommand', 'attendanceUploadAttempt']) { const m = require('../models/' + name)(db, DataTypes); models[m.name] = m; }
    const { User, Attendance, DailyWorkRecord, AttendanceCommand: Commands, AttendanceUploadAttempt: Uploads } = models;
    let n = 0, puts = 0, failPut = 0, failDelete = false;
    const objects = new Map(), store = { bucket: 'synthetic-only', async put(key, file) { puts++; objects.set(key, fs.readFileSync(file.path)); if (puts === failPut) throw Error('Synthetic put failure after object write'); }, async remove(key) { if (failDelete) throw Error('Synthetic cleanup failure'); objects.delete(key); } };
    const recovery = require('../services/attendanceRecovery')(models, store);
    const facts = require('../controllers/attendanceFacts')(models);
    async function actor() { const u = await User.create({ fullName: 'Synthetic attendance', email: `recovery-${n++}@example.invalid`, role: 'employee', status: 'active' }); return { id: u.id, role: u.role, sessionVersion: 0 }; }
    const today = new Date().toISOString().slice(0, 10);
    const req = (user, key = crypto.randomUUID(), body = {}, files = []) => ({ user, headers: { 'idempotency-key': key }, body: { workDate: today, ...body }, files });
    const file = () => { const p = path.join(directory, crypto.randomUUID()); fs.writeFileSync(p, 'Synthetic private content'); return { path: p, originalname: 'synthetic.txt', mimetype: 'text/plain', size: fs.statSync(p).size }; };
    const res = () => ({ code: 200, status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; } });
    await t.test('same-key concurrent commands return exact durable result after service restart; payload/actor/session mismatch conflicts', async () => {
      const user = await actor(), r = req(user);
      const [a, b] = await Promise.all([recovery.execute(r, 'in'), recovery.execute(r, 'in')]); assert.deepEqual(a, b);
      assert.deepEqual(await require('../services/attendanceRecovery')(models, store).execute(r, 'in'), a);
      assert.equal(await Attendance.count({ where: { userId: user.id } }), 1);
      await assert.rejects(recovery.execute({ ...r, body: { workDate: '2026-01-01' } }, 'in'), { status: 409 });
      await assert.rejects(recovery.execute({ ...r, user: await actor() }, 'in'), { status: 409 });
      const out = req(user, crypto.randomUUID(), { attendanceId: a.attendance.id, workNote: 'Retained note' }, [file()]);
      const committed = await recovery.execute(out, 'out'); const before = puts;
      assert.deepEqual(await recovery.execute(out, 'out'), committed); assert.equal(puts, before);
      await assert.rejects(recovery.execute({ ...out, body: { ...out.body, workNote: 'Changed' } }, 'out'), { status: 409 });
      await assert.rejects(recovery.execute({ ...out, body: { ...out.body, attendanceId: a.attendance.id + 1 } }, 'out'), { status: 409 });
      await recovery.reconcile(user.id); assert.equal(objects.size, 1);
      assert.equal(await Uploads.count({ where: { userId: user.id, state: 'retained' } }), 1);
      assert.equal(await DailyWorkRecord.count({ where: { userId: user.id } }), 1);
    });
    await t.test('invalid task/session/status reject before any object write', async () => {
      const user = await actor(); const before = puts;
      for (const body of [{ taskId: 'garbage' }, { taskId: 9999999 }, { taskStatus: 'invented' }, { attendanceId: 99999 }, { deliverableLink: 'javascript:alert(1)' }, {workNote:'x'.repeat(121)}, {deliverableLink:'https://example.invalid/'+ 'x'.repeat(500)}]) await assert.rejects(recovery.execute(req(user, crypto.randomUUID(), body, [file()]), 'out'));
      assert.equal(puts, before); assert.equal(await Attendance.count({ where: { userId: user.id } }), 0);
    });
    await t.test('assigned active task works; inactive/foreign tasks fail before storage; revoked account cannot replay', async () => {
      const user = await actor(), other = await actor();
      const project = await models.Project.create({name:'Synthetic recovery project',managerId:user.id});
      const task = await models.Task.create({title:'Synthetic recovery task',createdBy:user.id,assigneeId:user.id,projectId:project.id});
      const before=puts;
      await assert.rejects(recovery.execute(req(other,crypto.randomUUID(),{taskId:task.id},[file()]),'out'),{status:404});
      await task.update({isActive:false});
      await assert.rejects(recovery.execute(req(user,crypto.randomUUID(),{taskId:task.id},[file()]),'out'),{status:404});
      assert.equal(puts,before);await task.update({isActive:true});
      const request=req(user,crypto.randomUUID(),{taskId:task.id},[file()]);await recovery.execute(request,'out');
      await User.update({status:'inactive'},{where:{id:user.id}});
      await assert.rejects(recovery.execute(request,'out'),{status:401});
    });
    await t.test('second object failure and cleanup failure leave durable recoverable journal; only attempt objects are removed', async () => {
      const user = await actor(), baseline = new Set(objects.keys()); failPut = puts + 2; failDelete = true;
      await assert.rejects(recovery.execute(req(user, crypto.randomUUID(), {}, [file(), file()]), 'out'));
      await recovery.reconcile(user.id); assert.equal(await Uploads.count({ where: { userId: user.id, state: 'pending' } }), 2);
      failDelete = false; failPut = 0; await recovery.reconcile(user.id);
      assert.deepEqual(new Set(objects.keys()), baseline); assert.equal(await Commands.count({ where: { userId: user.id } }), 0);
      assert.equal(await Attendance.count({ where: { userId: user.id } }), 0);
    });
    await t.test('database failure after upload rolls back receipt/work and reconciliation preserves older committed evidence', async () => {
      const user = await actor(), baseline = new Set(objects.keys()), original = Commands.create;
      Commands.create = async () => { throw Error('Synthetic receipt failure'); };
      try { await assert.rejects(recovery.execute(req(user, crypto.randomUUID(), {}, [file()]), 'out')); } finally { Commands.create = original; }
      await recovery.reconcile(user.id); assert.deepEqual(new Set(objects.keys()), baseline);
      assert.equal(await Attendance.count({ where: { userId: user.id } }), 0); assert.equal(await DailyWorkRecord.count({ where: { userId: user.id } }), 0);
    });
    await t.test('lost commit acknowledgement preserves committed objects and exact receipt replay', async () => {
      const user = await actor(), request = req(user, crypto.randomUUID(), {}, [file()]);
      const original = db.transaction;
      db.transaction = function (options, callback) {
        return original.call(this, options, async tx => {
          const commit = tx.commit.bind(tx);
          tx.commit = async () => { await commit(); throw Error('Synthetic lost commit acknowledgement'); };
          return callback(tx);
        });
      };
      try { await assert.rejects(recovery.execute(request, 'out')); } finally { db.transaction = original; }
      const receipt = await Commands.findByPk(request.headers['idempotency-key']); assert.ok(receipt);
      await recovery.reconcile(user.id);
      assert.ok(objects.has(receipt.response.dailyWorkRecord.deliverables[0].key));
      assert.deepEqual(await recovery.execute(request, 'out'), receipt.response);
    });
    await t.test('eight independent uploaded commands progress with the production-sized five-connection pool', async () => {
      const users=await Promise.all(Array.from({length:8},()=>actor())), before=puts;
      const results=await Promise.all(users.map(user=>recovery.execute(req(user,crypto.randomUUID(),{},[file()]),'out')));
      assert.equal(results.length,8);assert.equal(puts-before,8);
      assert.equal(new Set(results.map(r=>r.attendance.id)).size,8);
    });
    await t.test('reconciliation winning before dispatch cannot leave a late unjournaled upload', async () => {
      const user=await actor(), request=req(user,crypto.randomUUID(),{},[file()]), original=Uploads.create, before=puts;
      Uploads.create=async function(...args){const row=await original.apply(this,args);await recovery.reconcile(user.id);return row;};
      try{await assert.rejects(recovery.execute(request,'out'),{status:503});}finally{Uploads.create=original;}
      assert.equal(puts,before);await recovery.execute(request,'out');assert.equal(puts,before+1);
    });
    await t.test('multipart file-first/metadata-first validation and real route dispatch', async () => {
      const express = require('express'), app = express(); app.use(express.json());
      app.post('/out', require('../middleware/attendanceMultipart'), (r, s) => { r.user = app.locals.actor; return recovery.clockOut(r, s); });
      const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
      try {
        for (const fileFirst of [true, false]) for (const invalid of [true, false]) {
          const user = await actor(); app.locals.actor = user; const form = new FormData();
          const appendFile = () => form.append('deliverables', new Blob(['Synthetic multipart content'], { type: 'text/plain' }), 'synthetic.txt');
          if (fileFirst) appendFile(); form.append('workDate', today); if (invalid) form.append('taskId', '99999999'); if (!fileFirst) appendFile();
          const before = puts, response = await fetch('http://127.0.0.1:' + server.address().port + '/out', { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: form });
          assert.equal(response.status, invalid ? 404 : 200); const body = await response.json();
          assert.equal(puts - before, invalid ? 0 : 1); if (!invalid) assert.equal(body.dailyWorkRecord.deliverables.length, 1);
        }
      } finally { await new Promise(resolve => server.close(resolve)); }
    });
    await t.test('missing/conflicting records are explicit; stored leave and rounded hours retained; filters/counts stable', async () => {
      const user = await actor(), r = res(); await facts.today({ user, query: {} }, r); assert.equal(r.body.status, 'missing');
      for (const status of ['present', 'leave']) await Attendance.create({ userId: user.id, date: today, clockIn: new Date(), status, totalHours: 1.999 });
      const conflict = res(); await facts.today({ user, query: {} }, conflict); assert.equal(conflict.body.recordState, 'conflict'); assert.equal(conflict.body.records.length, 2); assert.equal(conflict.body.records[1].status, 'leave'); assert.equal(conflict.body.records[0].formattedHours, '2h 0m');
      const history = res(); await facts.history({ user, query: { date: today, status: 'leave', limit: '1' } }, history); assert.equal(history.body.pagination.totalItems, 1); assert.equal(history.body.data[0].status, 'leave');
      const invalid = res(); await facts.history({ user, query: { date: '2026-02-30' } }, invalid); assert.equal(invalid.code, 400);
      const directory = res(); await facts.directory({ user, query: { date: today } }, directory); assert.equal(directory.body.data.find(r => r.userId === user.id).records.length, 2);
      const weekly = res(); await facts.weekly({ user, query: {} }, weekly); assert.equal(weekly.body.summary.conflictDays, 1); assert.equal(weekly.body.summary.missingDays, 6);
    });
    await t.test('migration keeps nullable general-work/FK references and refuses populated destructive down', async () => {
      assert.equal((await db.getQueryInterface().describeTable('daily_work_records')).taskId.allowNull, true);
      await assert.rejects(require('../migrations/20261107000000-attendance-command-recovery').down(db.getQueryInterface()), /retained/);
      const [[row]] = await db.query('SELECT COUNT(*) AS n FROM attendance_commands'); assert.ok(row.n > 0);
    });
    console.log('Synthetic schema', schema, 'migrations', names.length, 'Node', process.version);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); if (db) await db.close(); await admin.close(); }
});
