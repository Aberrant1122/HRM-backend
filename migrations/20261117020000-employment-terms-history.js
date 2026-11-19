module.exports={
 async up(q,D){const account=()=>({type:D.INTEGER,allowNull:false,references:{model:'users',key:'id'},onDelete:'RESTRICT'}),time=()=>({createdAt:{type:D.DATE,allowNull:false},updatedAt:{type:D.DATE,allowNull:false}});
  await q.createTable('employment_terms',{id:{type:D.INTEGER,primaryKey:true,autoIncrement:true},employeeId:{...account(),unique:true},statusLabel:{type:D.STRING(100),allowNull:true},typeLabel:{type:D.STRING(100),allowNull:true},version:{type:D.INTEGER,allowNull:false},createdBy:account(),...time()});
  await q.createTable('employment_terms_events',{id:{type:D.INTEGER,primaryKey:true,autoIncrement:true},employeeId:account(),actorId:account(),version:{type:D.INTEGER,allowNull:false},commandKey:{type:D.STRING(36),allowNull:false,unique:true},payloadHash:{type:D.STRING(64),allowNull:false},details:{type:D.JSON,allowNull:false},...time()});
  await q.addIndex('employment_terms_events',['employeeId','version'],{unique:true,name:'employment_terms_event_versions'});
 },
 async down(q){for(const table of ['employment_terms_events','employment_terms']){const [[r]]=await q.sequelize.query('SELECT COUNT(*) total FROM '+table);if(Number(r.total))throw Error('Retained employment terms require a forward migration');}await q.dropTable('employment_terms_events');await q.dropTable('employment_terms');}
};
