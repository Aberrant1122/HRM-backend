module.exports={
 async up(q,D){const ref=table=>({type:D.INTEGER,allowNull:false,references:{model:table,key:'id'},onDelete:'RESTRICT'}),id=()=>({type:D.INTEGER,primaryKey:true,autoIncrement:true}),times=()=>({createdAt:{type:D.DATE,allowNull:false},updatedAt:{type:D.DATE,allowNull:false}});
  await q.createTable('department_structures',{id:id(),departmentId:{...ref('departments'),unique:true},parentIds:{type:D.JSON,allowNull:false},headIds:{type:D.JSON,allowNull:false},version:{type:D.INTEGER,allowNull:false},createdBy:ref('users'),...times()});
  await q.createTable('department_structure_events',{id:id(),departmentId:ref('departments'),actorId:ref('users'),version:{type:D.INTEGER,allowNull:false},commandKey:{type:D.STRING(36),allowNull:false,unique:true},payloadHash:{type:D.STRING(64),allowNull:false},details:{type:D.JSON,allowNull:false},...times()});
  await q.addIndex('department_structure_events',['departmentId','version'],{unique:true,name:'department_structure_versions'});
  await q.createTable('department_parent_links',{id:id(),departmentId:ref('departments'),parentDepartmentId:ref('departments')});await q.addIndex('department_parent_links',['departmentId','parentDepartmentId'],{unique:true,name:'department_parent_pair'});
  await q.createTable('department_head_links',{id:id(),departmentId:ref('departments'),headId:ref('users')});await q.addIndex('department_head_links',['departmentId','headId'],{unique:true,name:'department_head_pair'});
 },
 async down(q){for(const table of ['department_structures','department_structure_events','department_parent_links','department_head_links']){const [[r]]=await q.sequelize.query('SELECT COUNT(*) total FROM '+table);if(Number(r.total))throw Error('Retained department structures require a forward migration');}for(const table of ['department_head_links','department_parent_links','department_structure_events','department_structures'])await q.dropTable(table);}
};
