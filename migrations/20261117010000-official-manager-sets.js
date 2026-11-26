module.exports={
 async up(q,D){
  const account=()=>({type:D.INTEGER,allowNull:false,references:{model:'users',key:'id'},onDelete:'RESTRICT'});
  const times=()=>({createdAt:{type:D.DATE,allowNull:false},updatedAt:{type:D.DATE,allowNull:false}});
  await q.createTable('official_manager_sets',{id:{type:D.INTEGER,primaryKey:true,autoIncrement:true},employeeId:{...account(),unique:true},managerIds:{type:D.JSON,allowNull:false},version:{type:D.INTEGER,allowNull:false},createdBy:account(),...times()});
  await q.createTable('official_manager_events',{id:{type:D.INTEGER,primaryKey:true,autoIncrement:true},employeeId:account(),actorId:account(),commandKey:{type:D.STRING(36),allowNull:false,unique:true},payloadHash:{type:D.STRING(64),allowNull:false},version:{type:D.INTEGER,allowNull:false},details:{type:D.JSON,allowNull:false},...times()});
  await q.addIndex('official_manager_events',['employeeId','version'],{unique:true,name:'official_manager_event_versions'});
  await q.createTable('official_manager_links',{id:{type:D.INTEGER,primaryKey:true,autoIncrement:true},employeeId:account(),managerId:account()});
  await q.addIndex('official_manager_links',['employeeId','managerId'],{unique:true,name:'official_manager_link_pair'});
 },
 async down(q){
  for(const table of ['official_manager_events','official_manager_sets','official_manager_links']){const [[row]]=await q.sequelize.query('SELECT COUNT(*) total FROM '+table);if(Number(row.total))throw Error('Retained official-manager records require a forward migration');}
  await q.dropTable('official_manager_links');
  await q.dropTable('official_manager_events');await q.dropTable('official_manager_sets');
 }
};
