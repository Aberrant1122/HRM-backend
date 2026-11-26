'use strict';
module.exports={
  async up(q,S){
    await q.addColumn('leave_requests','version',{type:S.INTEGER,allowNull:false,defaultValue:1});
    const user={type:S.INTEGER,allowNull:false,references:{model:'users',key:'id'},onDelete:'RESTRICT',onUpdate:'CASCADE'};
    await q.createTable('leave_events',{id:{type:S.INTEGER,primaryKey:true,autoIncrement:true,allowNull:false},requestId:{type:S.INTEGER,allowNull:false,references:{model:'leave_requests',key:'id'},onDelete:'RESTRICT',onUpdate:'CASCADE'},actorId:user,userId:user,commandKey:{type:S.STRING(36),allowNull:false,unique:true},payloadHash:{type:S.STRING(64),allowNull:false},version:{type:S.INTEGER,allowNull:false},action:{type:S.STRING(20),allowNull:false},details:{type:S.JSON,allowNull:false},createdAt:{type:S.DATE,allowNull:false},updatedAt:{type:S.DATE,allowNull:false}});
    await q.addIndex('leave_events',['requestId','version'],{unique:true});
  },
  async down(q){const [[row]]=await q.sequelize.query('SELECT COUNT(*) total FROM leave_events');if(Number(row.total))throw Error('Refusing to remove populated leave history; roll forward');await q.dropTable('leave_events');await q.removeColumn('leave_requests','version');}
};
