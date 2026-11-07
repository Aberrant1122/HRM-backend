'use strict';
module.exports={async up(q,S){
  await q.createTable('employee_number_sequence',{id:{type:S.INTEGER,primaryKey:true},nextNumber:{type:S.INTEGER,allowNull:false}});await q.bulkInsert('employee_number_sequence',[{id:1,nextNumber:1}]);
  const user={type:S.INTEGER,allowNull:false,references:{model:'users',key:'id'},onDelete:'RESTRICT',onUpdate:'CASCADE'};
  await q.createTable('employee_numbers',{id:{type:S.INTEGER,primaryKey:true,autoIncrement:true},userId:{...user,unique:true},actorId:user,number:{type:S.INTEGER,allowNull:false,unique:true},commandKey:{type:S.STRING(36),allowNull:false,unique:true},reason:{type:S.STRING(1000),allowNull:false},createdAt:{type:S.DATE,allowNull:false},updatedAt:{type:S.DATE,allowNull:false}});
},async down(q){const [[r]]=await q.sequelize.query('SELECT COUNT(*) total FROM employee_numbers');if(Number(r.total))throw Error('Refusing to remove assigned employee numbers; roll forward');await q.dropTable('employee_numbers');await q.dropTable('employee_number_sequence');}};
