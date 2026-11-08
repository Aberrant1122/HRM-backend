'use strict';
module.exports={
 async up(q,S){
  const ref=(model,nullable=false)=>({type:S.INTEGER,allowNull:nullable,references:{model,key:'id'},onDelete:'RESTRICT',onUpdate:'CASCADE'}),stamps=()=>({createdAt:{type:S.DATE,allowNull:false},updatedAt:{type:S.DATE,allowNull:false}});
  await q.createTable('designation_categories',{id:{type:S.INTEGER,primaryKey:true,autoIncrement:true,allowNull:false},name:{type:S.STRING(200),allowNull:false},nameKey:{type:S.STRING(200),allowNull:false,unique:true},description:{type:S.TEXT,allowNull:true},isActive:{type:S.BOOLEAN,allowNull:false},version:{type:S.INTEGER,allowNull:false},createdBy:ref('users'),...stamps()});
  await q.addColumn('organization_assignments','designationId',ref('designation_categories',true));
  await q.createTable('designation_events',{id:{type:S.INTEGER,primaryKey:true,autoIncrement:true,allowNull:false},designationId:ref('designation_categories'),actorId:ref('users'),version:{type:S.INTEGER,allowNull:false},action:{type:S.STRING(20),allowNull:false},commandKey:{type:S.STRING(36),allowNull:false,unique:true},payloadHash:{type:S.STRING(64),allowNull:false},details:{type:S.JSON,allowNull:false},...stamps()});
  await q.addIndex('designation_events',['designationId','version'],{unique:true});
 },
 async down(q){const [[r]]=await q.sequelize.query('SELECT (SELECT COUNT(*) FROM designation_categories)+(SELECT COUNT(*) FROM designation_events) total');if(Number(r.total))throw Error('Refusing to remove retained designation categories; roll forward');await q.dropTable('designation_events');await q.removeColumn('organization_assignments','designationId');await q.dropTable('designation_categories');}
};
