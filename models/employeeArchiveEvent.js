module.exports = (sequelize,D) => sequelize.define("EmployeeArchiveEvent",{
  commandKey:{type:D.UUID,primaryKey:true}, employeeId:{type:D.INTEGER,allowNull:false}, actorId:{type:D.INTEGER,allowNull:false},
  actorName:{type:D.STRING,allowNull:false}, version:{type:D.INTEGER,allowNull:false}, archived:{type:D.BOOLEAN,allowNull:false},
  reason:{type:D.STRING(600),allowNull:false}
},{tableName:"employee_archive_events"});
