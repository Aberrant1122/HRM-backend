const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { Sequelize, DataTypes } = require('sequelize');
const execute = require('node:util').promisify(require('node:child_process').execFile);
test('populated attendance recovery upgrade via actual CLI metadata and no-op rerun', {timeout:120000}, async()=>{
  assert.equal(process.env.HRM_DISPOSABLE_MYSQL,'1');assert.equal(process.env.HRM_TEST_MYSQL_PORT,'13379');
  const opts={host:'127.0.0.1',port:13379,dialect:'mysql',logging:false}, admin=new Sequelize('mysql','root','',opts);let db;
  const schema='hrm_attendance_upgrade_'+Date.now();
  try{
    await admin.query('CREATE DATABASE `'+schema+'`');db=new Sequelize(schema,'root','',opts);const qi=db.getQueryInterface();
    const target='20261107000000-attendance-command-recovery.js';
    const names=fs.readdirSync(path.join(__dirname,'../migrations')).filter(n=>n.endsWith('.js')&&n<target).sort();
    for(const name of names)await require('../migrations/'+name).up(qi,Sequelize);
    await qi.createTable('SequelizeMeta',{name:{type:DataTypes.STRING,primaryKey:true,allowNull:false}});await qi.bulkInsert('SequelizeMeta',names.map(name=>({name})));
    const User=require('../models/user')(db,DataTypes), Attendance=require('../models/attendance')(db,DataTypes);
    const user=await User.create({fullName:'Synthetic upgrade',email:'upgrade@example.invalid',role:'employee',status:'active'});
    const old=await Attendance.create({userId:user.id,date:'2026-01-01',clockIn:'2026-01-01T08:00:00Z',status:'leave'});
    const Project=require('../models/project')(db,DataTypes),Task=require('../models/tasks')(db,DataTypes),Work=require('../models/dailyWorkRecord')(db,DataTypes);
    const project=await Project.create({name:'Synthetic migration project',managerId:user.id});
    const task=await Task.create({title:'Synthetic migration task',createdBy:user.id,assigneeId:user.id,projectId:project.id});
    const work=await Work.create({userId:user.id,attendanceId:old.id,taskId:task.id,date:'2026-01-01'});
    const cli=require.resolve('sequelize-cli/lib/sequelize'), env={...process.env,NODE_ENV:'test',DATABASE_URL:'',DB_URL:'',TEST_DB_HOST:'127.0.0.1',TEST_DB_PORT:'13379',TEST_DB_NAME:schema,TEST_DB_USER:'root',TEST_DB_PASSWORD:''};
    const run=(command='db:migrate')=>execute(process.execPath,[cli,command,'--env','test','--config',path.join(__dirname,'../config/config.js'),...(command==='db:migrate'?['--to',target]:[])],{cwd:path.join(__dirname,'..'),env,timeout:60000});
    const first=await run();assert.match(first.stdout,/attendance-command-recovery/);assert.equal((await old.reload()).status,'leave');
    assert.equal((await qi.describeTable('daily_work_records')).taskId.allowNull,true);
    assert.equal((await work.reload()).taskId,task.id);
    const invalid=await Attendance.create({userId:user.id,date:'2026-01-03',clockIn:'2026-01-03T08:00:00Z',status:'present'});
    await assert.rejects(Work.create({userId:user.id,attendanceId:invalid.id,taskId:999999999,date:'2026-01-03'}),{name:'SequelizeForeignKeyConstraintError'});
    const next=await Attendance.create({userId:user.id,date:'2026-01-02',clockIn:'2026-01-02T08:00:00Z',status:'present'});
    const general=await Work.create({userId:user.id,attendanceId:next.id,taskId:null,date:'2026-01-02'});
    const repeated=await run();assert.match(repeated.stdout,/No migrations were executed/);
    const [meta]=await db.query('SELECT name FROM SequelizeMeta ORDER BY name');assert.equal(meta.length,50);
    await run('db:migrate:undo'); // only empty new recovery history tables; retain nullable general work
    assert.ok(await Attendance.findByPk(old.id));assert.equal((await qi.describeTable('daily_work_records')).taskId.allowNull,true);
    assert.equal((await general.reload()).taskId,null);await run();assert.ok(await Attendance.findByPk(old.id));assert.equal((await work.reload()).taskId,task.id);
    console.log('Synthetic populated upgrade schema',schema,'metadata',meta.length,'Node',process.version);
  }finally{if(db)await db.close();await admin.close();}
});
