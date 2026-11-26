module.exports={
 async up(q){await q.sequelize.query(`CREATE TABLE document_signing_keys(
 id CHAR(36) PRIMARY KEY,ownerId INT NOT NULL,publicKey JSON NOT NULL,fingerprint CHAR(64) NOT NULL,
 createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),revokedAt DATETIME(3) NULL,
 UNIQUE(ownerId,fingerprint),FOREIGN KEY(ownerId) REFERENCES users(id) ON DELETE RESTRICT) ENGINE=InnoDB`);
 await q.sequelize.query(`CREATE TABLE document_key_trust_events(
 id INT PRIMARY KEY AUTO_INCREMENT,keyId CHAR(36) NOT NULL,actorId INT NOT NULL,active BOOLEAN NOT NULL,
 reason VARCHAR(500) NOT NULL,createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(keyId) REFERENCES document_signing_keys(id) ON DELETE RESTRICT,
 FOREIGN KEY(actorId) REFERENCES users(id) ON DELETE RESTRICT) ENGINE=InnoDB`); await q.sequelize.query(`CREATE TABLE document_revision_signatures(
 id INT PRIMARY KEY AUTO_INCREMENT,revisionId INT NOT NULL,keyId CHAR(36) NOT NULL,
 trustEventId INT NOT NULL,signerId INT NOT NULL,signerName VARCHAR(255) NOT NULL,payload TEXT NOT NULL,signature VARCHAR(88) NOT NULL,
 createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),UNIQUE(revisionId,keyId),
 FOREIGN KEY(revisionId) REFERENCES employee_document_revisions(id) ON DELETE RESTRICT,
 FOREIGN KEY(keyId) REFERENCES document_signing_keys(id) ON DELETE RESTRICT,
 FOREIGN KEY(signerId) REFERENCES users(id) ON DELETE RESTRICT) ENGINE=InnoDB`);},
 async down(q){const [[r]]=await q.sequelize.query('SELECT (SELECT COUNT(*) FROM document_revision_signatures)+(SELECT COUNT(*) FROM document_signing_keys) n');if(Number(r.n))throw Error('Retained signing keys/signatures prevent downgrade');await q.dropTable('document_revision_signatures');await q.dropTable('document_key_trust_events');await q.dropTable('document_signing_keys');}
};
