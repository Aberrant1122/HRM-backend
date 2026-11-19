module.exports=(sequelize,D)=>sequelize.define('OrganizationState',{id:{type:D.INTEGER,primaryKey:true,allowNull:false},version:{type:D.INTEGER,allowNull:false}},{tableName:'organization_state'});
