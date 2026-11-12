'use strict';
module.exports={
 async up(q,S){
  const ref=(model,nullable=false)=>({type:S.INTEGER,allowNull:nullable,references:{model,key:'id'},onDelete:'RESTRICT',onUpdate:'CASCADE'}),stamps=()=>({createdAt:{type:S.DATE,allowNull:false},updatedAt:{type:S.DATE,allowNull:false}});
  await q.createTable('leave_category_drafts',{id:{type:S.INTEGER,primaryKey:true,autoIncrement:true,allowNull:false},name:{type:S.STRING(200),allowNull:false},nameKey:{type:S.STRING(200),allowNull:false,unique:true},description:{type:S.TEXT,allowNull:true},isActive:{type:S.BOOLEAN,allowNull:false},version:{type:S.INTEGER,allowNull:false},createdBy:ref('users'),...stamps()});
  await q.createTable('leave_category_draft_events',{id:{type:S.INTEGER,primaryKey:true,autoIncrement:true,allowNull:false},categoryId:ref('leave_category_drafts'),actorId:ref('users'),version:{type:S.INTEGER,allowNull:false},action:{type:S.STRING(20),allowNull:false},commandKey:{type:S.STRING(36),allowNull:false,unique:true},payloadHash:{type:S.STRING(64),allowNull:false},details:{type:S.JSON,allowNull:false},...stamps()});
  await q.addIndex('leave_category_draft_events',['categoryId','version'],{unique:true});
 },
 async down(q){const [[r]]=await q.sequelize.query('SELECT (SELECT COUNT(*) FROM leave_category_drafts)+(SELECT COUNT(*) FROM leave_category_draft_events) total');if(Number(r.total))throw Error('Refusing to remove retained leave category drafts; roll forward');await q.dropTable('leave_category_draft_events');await q.dropTable('leave_category_drafts');}
};
