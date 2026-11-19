module.exports={
  async up(q,D){
    const fk=table=>({type:D.INTEGER,allowNull:false,references:{model:table,key:"id"},onDelete:"RESTRICT"});
    await q.createTable("document_expiry_events",{commandKey:{type:D.UUID,primaryKey:true},revisionId:fk("employee_document_revisions"),version:{type:D.INTEGER,allowNull:false},
      actorId:fk("users"),reason:{type:D.STRING(600),allowNull:false},expiryDate:D.DATEONLY,reminderDate:D.DATEONLY,createdAt:{type:D.DATE,allowNull:false},updatedAt:{type:D.DATE,allowNull:false}});
    await q.addIndex("document_expiry_events",["revisionId","version"],{unique:true,name:"document_expiry_versions"});
  },
  async down(q){
    const [[row]]=await q.sequelize.query("SELECT COUNT(*) total FROM document_expiry_events");
    if(Number(row.total))throw Error("Document reminder history exists. Roll forward.");
    await q.dropTable("document_expiry_events");
  }
};
