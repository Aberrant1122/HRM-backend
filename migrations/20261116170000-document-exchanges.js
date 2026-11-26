module.exports = {
  async up(q, D) {
    const account = (allowNull) => ({type: D.INTEGER, allowNull, references: {model:"users",key:"id"}, onDelete:"RESTRICT"});
    await q.createTable("document_exchanges", {
      id: {type: D.UUID, primaryKey: true},
      employeeId: account(false), createdBy: account(false),
      title: {type:D.STRING(180),allowNull:false}, direction: {type:D.STRING(8),allowNull:false},
      dueDate:D.DATEONLY, resolvedBy:account(true), resolvedAt:D.DATE, resolution:D.STRING(16),
      note:D.STRING(240), resolutionKey:{type:D.UUID,unique:true},
      createdAt:{type:D.DATE,allowNull:false}, updatedAt:{type:D.DATE,allowNull:false}
    });
  },
  async down(q) {
    const [[r]] = await q.sequelize.query("SELECT COUNT(*) AS total FROM document_exchanges");
    if (Number(r.total)) throw Error("Document exchange records exist. Roll forward.");
    await q.dropTable("document_exchanges");
  }
};
