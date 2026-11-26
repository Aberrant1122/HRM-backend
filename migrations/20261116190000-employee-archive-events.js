module.exports={
  async up(q,D){
    const account={type:D.INTEGER,allowNull:false,references:{model:"users",key:"id"},onDelete:"RESTRICT"};
    await q.createTable("employee_archive_events",{
      commandKey:{type:D.UUID,primaryKey:true},employeeId:account,actorId:account,actorName:{type:D.STRING,allowNull:false},
      version:{type:D.INTEGER,allowNull:false},archived:{type:D.BOOLEAN,allowNull:false},reason:{type:D.STRING(600),allowNull:false},
      createdAt:{type:D.DATE,allowNull:false},updatedAt:{type:D.DATE,allowNull:false}
    });
    await q.addIndex("employee_archive_events",["employeeId","version"],{unique:true,name:"employee_archive_versions"});
  },
  async down(q){
    const [[row]]=await q.sequelize.query("SELECT COUNT(*) total FROM employee_archive_events");
    if(Number(row.total))throw Error("Employee archive history exists. Roll forward.");
    await q.dropTable("employee_archive_events");
  }
};
