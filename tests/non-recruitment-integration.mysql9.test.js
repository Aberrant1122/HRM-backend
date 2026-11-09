const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Sequelize,DataTypes,Op}=require('sequelize'),execute=require('node:util').promisify(require('node:child_process').execFile),{load,response}=require('./helpers/controller');
test('combined52 upgrade adds backdated onboarding to populated51 attendance without losing either workflow',{timeout:180000},async()=>{
  assert.equal(process.env.HRM_DISPOSABLE_MYSQL,'1');assert.equal(process.env.HRM_TEST_MYSQL_PORT,'13379');
  const opts={host:'127.0.0.1',port:13379,dialect:'mysql',logging:false,pool:{max:8}},adminDb=new Sequelize('mysql','root','',opts);let db,isolated,combinedSource;
  try{
    const schema='hrm_combined52_'+Date.now();await adminDb.query('CREATE DATABASE `'+schema+'`');db=new Sequelize(schema,'root','',opts);
    const original=path.join(__dirname,'../migrations'),names=fs.readdirSync(original).filter(n=>n.endsWith('.js')&&n<='20261107010000-attendance-correction-drafts.js').sort(),onboarding='20261106000000-manual-onboarding.js';assert.equal(names.length,52);combinedSource=require('./helpers/isolated-migrations')(original,names);const source=combinedSource.directory;
    isolated=require('./helpers/isolated-migrations')(source,names.filter(n=>n!==onboarding));
    const cli=require.resolve('sequelize-cli/lib/sequelize'),env={...process.env,NODE_ENV:'test',DATABASE_URL:'',DB_URL:'',TEST_DB_HOST:'127.0.0.1',TEST_DB_PORT:'13379',TEST_DB_NAME:schema,TEST_DB_USER:'root',TEST_DB_PASSWORD:''};
    const run=(directory,database=schema)=>execute(process.execPath,[cli,'db:migrate','--env','test','--config',path.join(__dirname,'../config/config.js'),'--migrations-path',directory],{cwd:path.join(__dirname,'..'),env:{...env,TEST_DB_NAME:database},timeout:60000,maxBuffer:2*1024*1024});
    await run(isolated.directory);const models={sequelize:db};
    for(const filename of fs.readdirSync(path.join(__dirname,'../models')).filter(n=>n.endsWith('.js')&&n!=='index.js')){const model=(filename==='user'?require('./helpers/pre-preservation-user'):require('../models/'+filename))(db,DataTypes);models[model.name]=model;}
    const {User,UserInfo,Attendance,AttendanceCorrectionGrant:Grant,AttendanceCorrectionGrantEvent:GrantEvent}=models;
    const actors={};for(const role of ['admin','manager','employee','client']){const user=await User.create({fullName:'Synthetic integrated '+role,email:role+'-integrated@example.invalid',role,status:'active'});actors[role]={id:user.id,role,sessionVersion:0};}
    await UserInfo.create({userId:actors.employee.id,salary:1234,department:'development',position:'Synthetic retained position'});
    const permissions=require('../controllers/attendanceCorrectionPermissions')(models),corrections=require('../controllers/attendanceCorrections')(models);
    const send=async(handler,user,body)=>{const res=response();await handler({user,body},res);assert.equal(res.code,200,JSON.stringify(res.body));return res.body;};
    await send(permissions.command,actors.admin,{commandKey:crypto.randomUUID(),userId:actors.manager.id,active:true,expectedVersion:0,reason:'Synthetic integrated HR approval grant'});
    let draft=await send(corrections.command,actors.admin,{commandKey:crypto.randomUUID(),action:'create',employeeId:actors.employee.id,expectedVersion:0,workDate:'2026-01-01',attendanceId:null,proposed:{status:'absent',clockIn:null,clockOut:null},reason:'Synthetic integrated manual fact'});
    draft=await send(corrections.command,actors.admin,{commandKey:crypto.randomUUID(),action:'submit',employeeId:actors.employee.id,correctionId:draft.id,expectedVersion:draft.version,reason:'Synthetic reviewed source'});
    const appliedBody={commandKey:crypto.randomUUID(),action:'apply',employeeId:actors.employee.id,correctionId:draft.id,expectedVersion:draft.version,reason:'Synthetic integrated apply'};
    const applied=await send(corrections.command,actors.manager,appliedBody),beforeGrant=(await Grant.findByPk(actors.manager.id)).toJSON(),beforeEvents=await GrantEvent.count(),beforeFacts=(await Attendance.findAll()).map(r=>r.toJSON()),beforeProfile=(await UserInfo.findOne({where:{userId:actors.employee.id}})).toJSON();
    const [beforeMeta]=await db.query('SELECT name FROM SequelizeMeta');assert.equal(beforeMeta.length,51);
    const upgraded=await run(source);assert.match(upgraded.stdout,/manual-onboarding/);const [afterMeta]=await db.query('SELECT name FROM SequelizeMeta');assert.equal(afterMeta.length,52);assert.deepEqual(afterMeta.map(r=>r.name).filter(n=>!beforeMeta.some(row=>row.name===n)),[onboarding]);
    assert.deepEqual((await Grant.findByPk(actors.manager.id)).toJSON(),beforeGrant);assert.equal(await GrantEvent.count(),beforeEvents);assert.deepEqual((await Attendance.findAll()).map(r=>r.toJSON()),beforeFacts);assert.equal((await User.findByPk(actors.manager.id)).role,'manager');
    assert.deepEqual(await send(corrections.command,actors.manager,appliedBody),applied);assert.match((await run(source)).stdout,/No migrations were executed/);
    const onboardingController=load('controllers/onboardingController.js',{'node:crypto':crypto,'../models':models,sequelize:{Op}});
    const onboard=async body=>{const res=response();await onboardingController.command({params:{employeeId:String(actors.employee.id)},user:actors.admin,body:{commandKey:crypto.randomUUID(),...body}},res);assert.equal(res.code,200,JSON.stringify(res.body));return res.body.data;};
    let state=await onboard({action:'create',expectedVersion:0});state=await onboard({action:'add_item',expectedVersion:state.onboarding.version,title:'Synthetic clearance of direct-entry details',responsibleId:actors.client.id,dueDate:null});const item=state.items[0];
    const recovery=require('../services/attendanceRecovery')(models,{bucket:'synthetic-only',put:async()=>{throw Error('No object upload expected');},remove:async()=>{}});
    const [completed,clock]=await Promise.all([
      onboard({action:'complete_item',expectedVersion:state.onboarding.version,itemId:item.id,reason:'Synthetic independent confirmation'}),
      recovery.execute({user:actors.employee,headers:{'idempotency-key':crypto.randomUUID()},body:{workDate:new Date().toISOString().slice(0,10)},files:[]},'in'),
    ]);assert.equal(completed.items[0].status,'completed');assert.ok(clock.attendance.id);
    state=await onboard({action:'complete_case',expectedVersion:completed.onboarding.version,reason:'Synthetic manual checklist complete'});assert.equal(state.onboarding.status,'completed');assert.equal((await User.findByPk(actors.employee.id)).status,'active');assert.deepEqual((await UserInfo.findOne({where:{userId:actors.employee.id}})).toJSON(),beforeProfile);
    const clientProfile=await UserInfo.create({userId:actors.client.id,companyName:'Synthetic linked client'});
    const controller=load('controllers/clientController.js',{'../models':models,sequelize:Sequelize,bcryptjs:require('bcryptjs'),crypto:require('node:crypto'),'express-validator':require('express-validator'),nodemailer:{createTransport:()=>({})},'../utils/pagination':{},'../config/runtimeSafety':{mailOptions:()=>({})}});
    const denied=response();await controller.deleteClient({params:{id:actors.client.id},user:actors.admin},denied);assert.equal(denied.code,409);assert.ok(await UserInfo.findByPk(clientProfile.id));
    await assert.rejects(require('../migrations/'+onboarding).down(db.getQueryInterface()),/retain|populat/i);await assert.rejects(require('../migrations/20261107010000-attendance-correction-drafts').down(db.getQueryInterface()),/retained/);
    const freshName='hrm_combined52_fresh_'+Date.now();await adminDb.query('CREATE DATABASE `'+freshName+'`');const fresh=new Sequelize(freshName,'root','',opts);
    try{await run(source,freshName);const [freshMeta]=await fresh.query('SELECT name FROM SequelizeMeta ORDER BY name');assert.deepEqual(freshMeta.map(r=>r.name),names);assert.equal((await fresh.getQueryInterface().describeTable('attendances')).clockIn.allowNull,true);assert.equal((await fresh.getQueryInterface().describeTable('daily_work_records')).taskId.allowNull,true);const [[empty]]=await fresh.query('SELECT COUNT(*) AS n FROM attendance_correction_grants');assert.equal(Number(empty.n),0);}finally{await fresh.close();}
    console.log('Combined synthetic schemas',schema,freshName,'metadata52; fresh sorted install and populated51 upgrade preserved; backdated onboarding applied once; workflows/retention verified');
  }finally{if(isolated)isolated.close();if(combinedSource)combinedSource.close();if(db)await db.close();await adminDb.close();}
});
