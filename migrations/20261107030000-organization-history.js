'use strict';
module.exports={
  async up(q,S){
    const id={type:S.INTEGER,primaryKey:true,autoIncrement:true,allowNull:false},user={type:S.INTEGER,allowNull:false,references:{model:'users',key:'id'},onDelete:'RESTRICT',onUpdate:'CASCADE'},stamps=()=>({createdAt:{type:S.DATE,allowNull:false},updatedAt:{type:S.DATE,allowNull:false}});
    await q.createTable('organization_state',{id:{type:S.INTEGER,primaryKey:true,allowNull:false},version:{type:S.INTEGER,allowNull:false},...stamps()});
    await q.bulkInsert('organization_state',[{id:1,version:0,createdAt:new Date(),updatedAt:new Date()}]);
    await q.createTable('organization_assignments',{id,employeeId:{...user,unique:true},departmentId:{type:S.INTEGER,allowNull:true,references:{model:'departments',key:'id'},onDelete:'RESTRICT',onUpdate:'CASCADE'},managerId:{...user,allowNull:true},designation:{type:S.STRING(200),allowNull:true},version:{type:S.INTEGER,allowNull:false},createdBy:user,...stamps()});
    await q.addIndex('organization_assignments',['managerId','employeeId']);await q.addIndex('organization_assignments',['departmentId','employeeId']);
    await q.createTable('organization_events',{id,assignmentId:{type:S.INTEGER,allowNull:false,references:{model:'organization_assignments',key:'id'},onDelete:'RESTRICT',onUpdate:'CASCADE'},actorId:user,managerId:{...user,allowNull:true},departmentId:{type:S.INTEGER,allowNull:true,references:{model:'departments',key:'id'},onDelete:'RESTRICT',onUpdate:'CASCADE'},commandKey:{type:S.STRING(36),allowNull:false,unique:true},payloadHash:{type:S.STRING(64),allowNull:false},version:{type:S.INTEGER,allowNull:false},details:{type:S.JSON,allowNull:false},...stamps()});
    await q.addIndex('organization_events',['assignmentId','version'],{unique:true});
  },
  async down(q){const [[row]]=await q.sequelize.query('SELECT COUNT(*) total FROM organization_assignments');if(Number(row.total))throw Error('Refusing to remove populated organization history; roll forward');for(const name of ['organization_events','organization_assignments','organization_state'])await q.dropTable(name);}
};
