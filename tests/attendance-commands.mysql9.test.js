const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { Sequelize, DataTypes } = require('sequelize');
const { load, response } = require('./helpers/controller');

test('serialized attendance commands against disposable MySQL', { timeout: 120000 }, async t => {
  assert.equal(process.env.HRM_DISPOSABLE_MYSQL, '1');
  assert.equal(process.env.HRM_TEST_MYSQL_PORT, '13379');
  const options = { host: '127.0.0.1', port: 13379, dialect: 'mysql', logging: false, pool: { max: 12, min: 0 } };
  const admin = new Sequelize('mysql', 'root', process.env.HRM_TEST_MYSQL_PASSWORD || '', options);
  let db;
  const schema = 'hrm_attendance_' + Date.now();
  try {
    const [[runtime]] = await admin.query('SELECT VERSION() AS version');
    assert.match(runtime.version, /^9\./);
    await admin.query('CREATE DATABASE `' + schema + '`');
    db = new Sequelize(schema, 'root', process.env.HRM_TEST_MYSQL_PASSWORD || '', options);
    const names = fs.readdirSync(path.join(__dirname, '../migrations')).filter(n => n.endsWith('.js')).sort();
    for (const name of names) await require('../migrations/' + name).up(db.getQueryInterface(), Sequelize);
    console.log('Synthetic schema:', schema, 'MySQL:', runtime.version, 'Node:', process.version, 'migrations:', names.length);
    const models = {};
    for (const name of ['user', 'attendance', 'dailyWorkRecord', 'project', 'tasks']) {
      const model = require('../models/' + name)(db, DataTypes); models[model.name] = model;
    }
    const { User, Attendance, DailyWorkRecord, Project, Task } = models;
    const controller = load('controllers/attendanceController.js', { '../models': models, sequelize: { Sequelize, Op: Sequelize.Op }, '../utils/pagination': {} });
    let sequence = 0;
    const today = new Date().toISOString().slice(0, 10);
    async function fixture(role = 'employee') {
      const user = await User.create({ fullName: 'Synthetic clock actor', email: `clock-${sequence++}@example.invalid`, role, status: 'active' });
      const project = await Project.create({ name: 'Synthetic clock project', managerId: user.id });
      const task = await Task.create({ title: 'Synthetic clock task', createdBy: user.id, assigneeId: user.id, projectId: project.id });
      return { user: { id: user.id, role, sessionVersion: Number(user.sessionVersion) }, taskId: task.id };
    }
    async function call(method, f, body = {}) {
      const res = response();
      await controller[method]({ user: f.user, body: { taskId: String(f.taskId), taskStatus: 'completed', ...body }, files: [] }, res);
      return res;
    }
    await t.test('eight simultaneous clock-ins create exactly one row', async () => {
      const f = await fixture();
      const results = await Promise.all(Array.from({ length: 8 }, () => call('clockIn', f)));
      assert.equal(results.filter(r => r.code === 200).length, 1);
      assert.equal(results.filter(r => r.code === 400).length, 7);
      assert.equal(await Attendance.count({ where: { userId: f.user.id } }), 1);
    });
    await t.test('simultaneous and repeated checkout commit one work record without overwriting it', async () => {
      const f = await fixture(); await call('clockIn', f);
      const results = await Promise.all(Array.from({ length: 8 }, (_, i) => call('clockOut', f, { workNote: 'original-' + i })));
      assert.equal(results.filter(r => r.code === 200).length, 1);
      assert.equal(results.filter(r => r.code === 409).length, 7);
      const before = (await DailyWorkRecord.findOne({ where: { userId: f.user.id } })).toJSON();
      assert.equal((await call('clockOut', f, { workNote: 'overwrite attempt' })).code, 409);
      assert.deepEqual((await DailyWorkRecord.findByPk(before.id)).toJSON(), before);
      assert.equal(await Attendance.count({ where: { userId: f.user.id } }), 1);
      assert.equal(await DailyWorkRecord.count({ where: { userId: f.user.id } }), 1);
    });
    await t.test('no-record checkout fallback remains serialized; mixed in/out never creates a second session', async () => {
      const f = await fixture();
      const results = await Promise.all([call('clockOut', f), call('clockOut', f), call('clockIn', f)]);
      assert.ok(results.some(r => r.code === 200));
      assert.ok(results.every(r => [200, 400, 409].includes(r.code)));
      assert.equal(await Attendance.count({ where: { userId: f.user.id } }), 1);
      assert.equal(await DailyWorkRecord.count({ where: { userId: f.user.id } }), 1);
    });
    await t.test('legacy duplicate records are retained and checkout refuses arbitrary selection', async () => {
      const f = await fixture();
      for (let i = 0; i < 2; i++) await Attendance.create({ userId: f.user.id, date: today, clockIn: new Date(), status: 'present' });
      assert.equal((await call('clockOut', f)).code, 409);
      assert.equal((await call('clockIn', f)).code, 400);
      assert.equal(await Attendance.count({ where: { userId: f.user.id, clockOut: null } }), 2);
      assert.equal(await DailyWorkRecord.count({ where: { userId: f.user.id } }), 0);
    });
    await t.test('invalid task IDs/status and unassigned tasks leave attendance unchanged', async () => {
      const f = await fixture(), other = await fixture();
      for (const taskId of ['abc', '0', '-1', '1.5', '1e2', ' 1 ', '9007199254740992', [], ['1'], {}, false]) {
        assert.equal((await call('clockOut', f, { taskId })).code, 400);
      }
      assert.equal((await call('clockOut', f, { taskStatus: 'invented' })).code, 400);
      assert.equal((await call('clockOut', f, { taskId: String(other.taskId) })).code, 404);
      assert.equal(await Attendance.count({ where: { userId: f.user.id } }), 0);
      assert.equal(await DailyWorkRecord.count({ where: { userId: f.user.id } }), 0);
    });
    await t.test('account updates winning the parent lock revoke queued clock commands', async () => {
      for (const method of ['clockIn', 'clockOut']) {
        for (const update of [{ status: 'inactive' }, { role: 'manager' }, { password: 'synthetic-revocation-only' }]) {
          const f = await fixture();
          const tx = await db.transaction();
          await User.findByPk(f.user.id, { transaction: tx, lock: tx.LOCK.UPDATE });
          let dispatched;
          const entered = new Promise(resolve => { dispatched = resolve; });
          const original = User.findByPk;
          User.findByPk = function (...args) { dispatched(); return original.apply(this, args); };
          const result = call(method, f);
          try { await entered; await User.update(update, { where: { id: f.user.id }, transaction: tx }); await tx.commit(); }
          finally { User.findByPk = original; if (!tx.finished) await tx.rollback(); }
          assert.equal((await result).code, 401, method + ' ' + Object.keys(update)[0]);
          assert.equal(await Attendance.count({ where: { userId: f.user.id } }), 0);
        }
      }
    });
    await t.test('existing own-clock capability for each login role remains unchanged', async () => {
      for (const role of ['admin', 'manager', 'client', 'employee']) {
        const f = await fixture(role);
        assert.equal((await call('clockIn', f)).code, 200);
        assert.equal((await call('clockOut', f)).code, 200);
      }
    });
    await t.test('both mixed-command winner orders preserve one session', async () => {
      for (const first of ['clockIn', 'clockOut']) {
        const f = await fixture();
        const original = User.findByPk;
        let entered, release;
        const locked = new Promise(resolve => { entered = resolve; });
        const gate = new Promise(resolve => { release = resolve; });
        let held = false;
        User.findByPk = async function (...args) {
          const row = await original.apply(this, args);
          if (!held && args[0] === f.user.id) { held = true; entered(); await gate; }
          return row;
        };
        const winner = call(first, f);
        try {
          await locked;
          const second = call(first === 'clockIn' ? 'clockOut' : 'clockIn', f);
          release();
          assert.equal((await winner).code, 200);
          assert.equal((await second).code, first === 'clockIn' ? 200 : 400);
        } finally { release(); User.findByPk = original; }
        assert.equal(await Attendance.count({ where: { userId: f.user.id } }), 1);
        assert.equal(await DailyWorkRecord.count({ where: { userId: f.user.id } }), 1);
      }
    });
    await t.test('a blocked employee does not serialize a different employee', async () => {
      const a = await fixture(), b = await fixture();
      const tx = await db.transaction();
      await User.findByPk(a.user.id, { transaction: tx, lock: tx.LOCK.UPDATE });
      const pending = call('clockIn', a);
      try {
        const independent = await call('clockIn', b);
        assert.equal(independent.code, 200);
        assert.equal(await Attendance.count({ where: { userId: a.user.id } }), 0);
      } finally { await tx.rollback(); }
      assert.equal((await pending).code, 200);
    });
    await t.test('work insert and pre-commit failures roll back all writes and allow a later command', async () => {
      for (const failure of ['work-insert', 'clock-in-commit', 'clock-out-commit']) {
        const f = await fixture();
        const originalCreate = DailyWorkRecord.create, originalTransaction = db.transaction;
        const method = failure === 'clock-in-commit' ? 'clockIn' : 'clockOut';
        if (failure === 'work-insert') DailyWorkRecord.create = async () => { throw new Error('Synthetic insert failure'); };
        else db.transaction = async function (...args) {
          const tx = await originalTransaction.apply(this, args);
          tx.commit = async () => { throw new Error('Synthetic failure before commit'); };
          return tx;
        };
        try { assert.equal((await call(method, f)).code, 500); }
        finally { DailyWorkRecord.create = originalCreate; db.transaction = originalTransaction; }
        assert.equal(await Attendance.count({ where: { userId: f.user.id } }), 0);
        assert.equal(await DailyWorkRecord.count({ where: { userId: f.user.id } }), 0);
        assert.equal((await call(method, f)).code, 200);
      }
    });
    await t.test('discarded committed response followed by retry conflicts without duplicate or overwrite', async () => {
      const f = await fixture();
      await call('clockIn', f);
      await call('clockOut', f, { workNote: 'Committed original' }); // response deliberately discarded
      const before = (await DailyWorkRecord.findOne({ where: { userId: f.user.id } })).toJSON();
      assert.equal((await call('clockOut', f, { workNote: 'Committed original' })).code, 409);
      assert.equal((await call('clockOut', f, { workNote: 'Different payload' })).code, 409);
      assert.deepEqual((await DailyWorkRecord.findByPk(before.id)).toJSON(), before);
      assert.equal(await Attendance.count({ where: { userId: f.user.id } }), 1);
    });
  } finally { if (db) await db.close(); await admin.close(); }
});
