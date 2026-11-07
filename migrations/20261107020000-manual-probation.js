'use strict';
module.exports={
  async up(q,S){
    const id={type:S.INTEGER,primaryKey:true,autoIncrement:true,allowNull:false};
    const user={type:S.INTEGER,allowNull:false,references:{model:'users',key:'id'},onDelete:'RESTRICT',onUpdate:'CASCADE'};
    const stamps=()=>({createdAt:{type:S.DATE,allowNull:false},updatedAt:{type:S.DATE,allowNull:false}});
    await q.createTable('probation_cases',{id,employeeId:{...user,unique:true},createdBy:user,startDate:{type:S.DATEONLY,allowNull:false},endDate:{type:S.DATEONLY,allowNull:false},evaluationDate:{type:S.DATEONLY,allowNull:true},status:{type:S.STRING(20),allowNull:false,defaultValue:'active'},decisionDate:{type:S.DATEONLY,allowNull:true},version:{type:S.INTEGER,allowNull:false,defaultValue:1},...stamps()});
    await q.addIndex('probation_cases',['status','endDate','id']);
    await q.createTable('probation_events',{id,caseId:{type:S.INTEGER,allowNull:false,references:{model:'probation_cases',key:'id'},onDelete:'RESTRICT',onUpdate:'CASCADE'},actorId:user,sourceId:{...user,allowNull:true},commandKey:{type:S.STRING(36),allowNull:false,unique:true},payloadHash:{type:S.STRING(64),allowNull:false},version:{type:S.INTEGER,allowNull:false},action:{type:S.STRING(30),allowNull:false},details:{type:S.JSON,allowNull:false},...stamps()});
    await q.addIndex('probation_events',['caseId','version'],{unique:true});
  },
  async down(q){const [[row]]=await q.sequelize.query('SELECT COUNT(*) AS total FROM probation_cases');if(Number(row.total))throw Error('Refusing to remove populated probation history; roll forward');await q.dropTable('probation_events');await q.dropTable('probation_cases');}
};
