module.exports=(sequelize,D)=>sequelize.define('OfficialManagerEvent',{
 employeeId:{type:D.INTEGER,allowNull:false},actorId:{type:D.INTEGER,allowNull:false},
 commandKey:{type:D.STRING(36),allowNull:false,unique:true},
 payloadHash:{type:D.STRING(64),allowNull:false},version:{type:D.INTEGER,allowNull:false},
 details:{type:D.JSON,allowNull:false}
},{tableName:'official_manager_events'});
