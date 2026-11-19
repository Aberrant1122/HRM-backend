module.exports=(sequelize,D)=>sequelize.define('OfficialManagerSet',{
 employeeId:{type:D.INTEGER,allowNull:false,unique:true},
 managerIds:{type:D.JSON,allowNull:false},
 version:{type:D.INTEGER,allowNull:false},
 createdBy:{type:D.INTEGER,allowNull:false}
},{tableName:'official_manager_sets'});
