module.exports={
 async up(q){await q.sequelize.query(`CREATE TABLE IF NOT EXISTS probation_confirmation_plans (
   caseId INT NOT NULL, sequenceNo INT NOT NULL, expectedDate DATE NULL, actorId INT NOT NULL,
   reason VARCHAR(500) NOT NULL, commandKey CHAR(36) NOT NULL UNIQUE, caseVersion INT NOT NULL,
   createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
   PRIMARY KEY(caseId,sequenceNo), FOREIGN KEY(caseId) REFERENCES probation_cases(id) ON DELETE RESTRICT,
   FOREIGN KEY(actorId) REFERENCES users(id) ON DELETE RESTRICT) ENGINE=InnoDB`);},
 async down(q){const [[r]]=await q.sequelize.query('SELECT COUNT(*) n FROM probation_confirmation_plans');if(Number(r.n))throw Error('Retained confirmation plans prevent downgrade');await q.dropTable('probation_confirmation_plans');}
};
