module.exports = {
  async up(q) {
    await q.sequelize.query(`CREATE TABLE IF NOT EXISTS employee_document_deliveries (
      revisionId INTEGER PRIMARY KEY,
      recipientId INTEGER NOT NULL,
      sharedBy INTEGER NOT NULL,
      sharedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      acknowledgedAt DATETIME(3) NULL,
      KEY recipient_inbox (recipientId,revisionId),
      FOREIGN KEY (revisionId) REFERENCES employee_document_revisions(id) ON DELETE RESTRICT,
      FOREIGN KEY (recipientId) REFERENCES users(id) ON DELETE RESTRICT,
      FOREIGN KEY (sharedBy) REFERENCES users(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB`);
  },
  async down(q) {
    const [[row]]=await q.sequelize.query('SELECT COUNT(*) total FROM employee_document_deliveries');
    if(Number(row.total)) throw Error('Cannot remove retained employee document deliveries');
    await q.dropTable('employee_document_deliveries');
  }
};
