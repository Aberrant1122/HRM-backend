"use strict";
module.exports = {
  async up(q, S) {
    // Restore the existing nullable-task contract after later historical migrations
    // reintroduced NOT NULL. Preserve the column type and all FK references.
    const columns = await q.describeTable('daily_work_records');
    if (!/^INT(?:\(\d+\))?$/i.test(columns.taskId.type)) throw Error('Review unexpected taskId type before migration');
    if (!columns.taskId.allowNull) await q.sequelize.query('ALTER TABLE daily_work_records MODIFY COLUMN taskId INT NULL');
    await q.createTable('attendance_commands', {
      commandKey: { type: S.STRING(36), primaryKey: true },
      userId: { type: S.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT' },
      digest: { type: S.STRING(64), allowNull: false },
      response: { type: S.JSON, allowNull: false },
      createdAt: { type: S.DATE, allowNull: false },
    });
    await q.createTable('attendance_upload_attempts', {
      id: { type: S.STRING(36), primaryKey: true },
      userId: { type: S.INTEGER, allowNull: false },
      commandKey: { type: S.STRING(36), allowNull: false },
      objectKey: { type: S.STRING(255), allowNull: false, unique: true },
      bucket: { type: S.STRING(255), allowNull: false },
      state: { type: S.STRING(16), allowNull: false },
      createdAt: { type: S.DATE, allowNull: false },
    });
  },
  async down(q) {
    // Never contract taskId nullability on down; existing general-work rows survive.
    for (const table of ['attendance_commands', 'attendance_upload_attempts']) {
      const [[row]] = await q.sequelize.query('SELECT COUNT(*) AS n FROM `' + table + '`');
      if (Number(row.n)) throw Error('Attendance recovery history must be retained');
    }
    await q.dropTable('attendance_upload_attempts');
    await q.dropTable('attendance_commands');
  },
};
