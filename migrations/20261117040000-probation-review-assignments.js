module.exports={
 async up(q,D){const ref=table=>({type:D.INTEGER,allowNull:false,references:{model:table,key:'id'},onDelete:'RESTRICT'}),id=()=>({type:D.INTEGER,primaryKey:true,autoIncrement:true});
  await q.createTable('probation_review_sets',{id:id(),caseId:{...ref('probation_cases'),unique:true},managerIds:{type:D.JSON,allowNull:false},hrIds:{type:D.JSON,allowNull:false},managerSources:{type:D.JSON,allowNull:false},version:{type:D.INTEGER,allowNull:false},createdBy:ref('users'),createdAt:{type:D.DATE,allowNull:false},updatedAt:{type:D.DATE,allowNull:false}});
  await q.createTable('probation_review_links',{id:id(),caseId:ref('probation_cases'),userId:ref('users'),category:{type:D.STRING(12),allowNull:false}});await q.addIndex('probation_review_links',['caseId','userId','category'],{unique:true,name:'probation_review_member_category'});
 },
 async down(q){for(const table of ['probation_review_sets','probation_review_links']){const [[r]]=await q.sequelize.query('SELECT COUNT(*) total FROM '+table);if(Number(r.total))throw Error('Retained probation review assignments require a forward migration');}await q.dropTable('probation_review_links');await q.dropTable('probation_review_sets');}
};
