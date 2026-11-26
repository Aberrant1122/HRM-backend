module.exports={
 async up(q){await q.sequelize.query(`CREATE TABLE settlement_final_events (
 id INT PRIMARY KEY AUTO_INCREMENT, caseId INT NOT NULL, version INT NOT NULL,
 actorId INT NOT NULL, action VARCHAR(16) NOT NULL, details JSON NOT NULL,
 commandKey CHAR(36) NOT NULL UNIQUE, payloadHash CHAR(64) NOT NULL,
 createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), UNIQUE(caseId,version),
 FOREIGN KEY(caseId) REFERENCES offboarding_cases(id) ON DELETE RESTRICT,
 FOREIGN KEY(actorId) REFERENCES users(id) ON DELETE RESTRICT) ENGINE=InnoDB`);},
 async down(q){const [[r]]=await q.sequelize.query('SELECT COUNT(*) n FROM settlement_final_events');if(Number(r.n))throw Error('Retained final settlement history prevents downgrade');await q.dropTable('settlement_final_events');}
};
