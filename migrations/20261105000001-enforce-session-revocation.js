"use strict";

module.exports = {
  async up(queryInterface) {
    // OLD is the current locked row, even when the writer loaded an older instance.
    // Enforce this for bulk updates, upserts and writes that bypass Sequelize hooks too.
    await queryInterface.sequelize.query(`
      CREATE TRIGGER users_revoke_sessions_before_update
      BEFORE UPDATE ON users FOR EACH ROW
      SET NEW.sessionVersion = CASE
        WHEN NOT (NEW.role <=> OLD.role)
          OR NOT (NEW.status <=> OLD.status)
          OR NOT (CAST(NEW.password AS BINARY) <=> CAST(OLD.password AS BINARY))
        THEN OLD.sessionVersion + 1
        ELSE OLD.sessionVersion
      END
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query("DROP TRIGGER IF EXISTS users_revoke_sessions_before_update");
  },
};
