const assert=require('node:assert/strict');
const {Sequelize}=require('sequelize');
const migration=require('../migrations/20261117001000-task-stage-deadlines');
const originalNotice=require('../migrations/20261116220000-hr-task-notices');
(async()=>{
 if(process.env.HRM_DISPOSABLE_MYSQL!=='1'||process.env.HRM_TEST_MYSQL_PORT!=='13693')throw Error('Dedicated local synthetic database required');
 const opts={host:'127.0.0.1',port:13693,dialect:'mysql',logging:false};
 const server=new Sequelize('mysql','root','',opts),schema='hrm_task_stage_upgrade_'+Date.now();let db;
 try {
  await server.query('CREATE DATABASE '+schema);db=new Sequelize(schema,'root','',opts);const q=db.getQueryInterface();
  await db.query('CREATE TABLE users(id INT PRIMARY KEY)');await db.query('CREATE TABLE hr_tasks(id INT PRIMARY KEY,dueDate DATE NULL)');
  await db.query("INSERT INTO users VALUES (1)");await db.query("INSERT INTO hr_tasks VALUES(1,'2026-01-01')");
  await originalNotice.up(q,Sequelize);await db.query("INSERT INTO hr_task_notices(id,taskId,taskVersion,recipientId,senderId,taskTitle,dueDate,asOf,createdAt,updatedAt) VALUES(UUID(),1,1,1,1,'Legacy','2026-01-01','2026-01-02',NOW(),NOW())");
  await migration.up(q,Sequelize);const [[task]]=await db.query('SELECT dueDate,submissionDueDate,approvalDueDate,deadlineVersion FROM hr_tasks');
  assert.deepEqual(task,{dueDate:'2026-01-01',submissionDueDate:null,approvalDueDate:null,deadlineVersion:0});
  const [[notice]]=await db.query('SELECT stage,deadlineVersion FROM hr_task_notices');assert.deepEqual(notice,{stage:null,deadlineVersion:null});
  await migration.down(q);await migration.up(q,Sequelize);
  await db.query("UPDATE hr_tasks SET submissionDueDate='2026-02-01',approvalDueDate='2026-02-02' WHERE id=1");
  await assert.rejects(migration.down(q),/forward migration/);
  console.log('PASS populated legacy migration, no stage backfill, reversible before new data, retained-stage rollback guard.');
 }finally{if(db)await db.close();await server.query('DROP DATABASE '+schema);await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
