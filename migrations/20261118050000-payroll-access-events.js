module.exports={async up(q){await q.sequelize.query(`CREATE TABLE payroll_access_events(
 id INT PRIMARY KEY AUTO_INCREMENT,userId INT NOT NULL,actorId INT NOT NULL,version INT NOT NULL,
 commandKey CHAR(36) NOT NULL UNIQUE,payloadHash CHAR(64) NOT NULL,details JSON NOT NULL,
 createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),UNIQUE(userId,version),
 FOREIGN KEY(userId) REFERENCES users(id) ON DELETE RESTRICT,FOREIGN KEY(actorId) REFERENCES users(id) ON DELETE RESTRICT) ENGINE=InnoDB`);},
 async down(q){const [[r]]=await q.sequelize.query('SELECT COUNT(*) n FROM payroll_access_events');if(Number(r.n))throw Error('Retained payroll access decisions prevent downgrade');await q.dropTable('payroll_access_events');}};
