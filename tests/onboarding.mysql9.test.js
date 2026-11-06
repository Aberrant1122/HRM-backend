const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Sequelize,DataTypes,Op}=require('sequelize');
const {load,response}=require('./helpers/controller');

test('manual onboarding: real MySQL serialization, retries, history and rollback safety',{timeout:120000},async t=>{
  assert.equal(process.env.HRM_DISPOSABLE_MYSQL,'1');assert.equal(process.env.HRM_TEST_MYSQL_PORT,'13379');
  const options={host:'127.0.0.1',port:13379,dialect:'mysql',logging:false,pool:{max:8,min:0}};
  const admin=new Sequelize('mysql','root',process.env.HRM_TEST_MYSQL_PASSWORD||'',options);
  const schema='hrm_onboarding_'+Date.now();let db;
  try{
    const [[runtime]]=await admin.query('SELECT VERSION() AS version');assert.match(runtime.version,/^9\./);
    await admin.query('CREATE DATABASE `'+schema+'`');db=new Sequelize(schema,'root',process.env.HRM_TEST_MYSQL_PASSWORD||'',options);
    console.log('Disposable onboarding schema:',schema,'MySQL:',runtime.version,'Node:',process.version);
    const qi=db.getQueryInterface();
    const migrationFiles=fs.readdirSync(path.join(__dirname,'../migrations')).filter(name=>name.endsWith('.js')).sort();
    await t.test('additive migration upgrades populated People schema without changing account access',async()=>{
      for(const name of migrationFiles.filter(name=>name!=='20261106000000-manual-onboarding.js'))await require('../migrations/'+name).up(qi,Sequelize);
      await db.query("INSERT INTO users(fullName,email,role,status,createdAt,updatedAt) VALUES('Legacy People account','onboard-legacy@example.invalid','employee','inactive',NOW(),NOW())");
      const [[before]]=await db.query("SELECT id,role,status,sessionVersion FROM users WHERE email='onboard-legacy@example.invalid'");
      await require('../migrations/20261106000000-manual-onboarding').up(qi,Sequelize);
      const [[after]]=await db.query("SELECT id,role,status,sessionVersion FROM users WHERE email='onboard-legacy@example.invalid'");
      assert.deepEqual(after,before);
      assert.ok((await qi.describeTable('onboarding_cases')).employeeId);
    });
    const models={sequelize:db,User:require('../models/user')(db,DataTypes)};
    for(const file of ['onboardingCase','onboardingItem','onboardingEvent']){const model=require('../models/'+file)(db,DataTypes);models[model.name]=model;}
    const {User,OnboardingCase,OnboardingItem,OnboardingEvent}=models;
    const actor=await User.create({fullName:'Synthetic admin',email:'onboard-admin@example.invalid',role:'admin',status:'active'});
    const actor2=await User.create({fullName:'Other admin',email:'onboard-admin2@example.invalid',role:'admin',status:'active'});
    const employee=await User.create({fullName:'Direct employee',email:'direct@example.invalid',role:'employee',status:'inactive'});
    const other=await User.create({fullName:'Other employee',email:'other-direct@example.invalid',role:'employee',status:'active'});
    const controller=load('controllers/onboardingController.js',{'node:crypto':crypto,'../models':models,sequelize:{Op}});
    async function send(body,employeeId=employee.id,actorId=actor.id){const res=response();await controller.command({params:{employeeId:String(employeeId)},user:{id:actorId,role:'admin'},body},res);return res;}
    const command=(action,expectedVersion,extra={})=>({commandKey:crypto.randomUUID(),action,expectedVersion,...extra});
    let state,item;
    await t.test('same create command races safely and replays once, with unchanged account activation',async()=>{
      const input=command('create',0);const pair=await Promise.all([send(input),send(input)]);
      assert.deepEqual(pair.map(row=>row.code),[200,200]);assert.equal(pair.filter(row=>row.body.replayed).length,1);
      assert.equal(await OnboardingCase.count(),1);assert.equal(await OnboardingEvent.count(),1);
      state=pair[1].body.data;assert.equal((await User.findByPk(employee.id)).status,'inactive');
      assert.equal((await send({...input,expectedVersion:1})).code,409);
      assert.equal((await send(input,employee.id,actor2.id)).code,409);
      assert.equal((await send(command('create',0))).code,409);
    });
    await t.test('concurrent distinct edits reject a stale version; invalid data rolls back without audit/version drift',async()=>{
      const pair=await Promise.all(['Collect details','Schedule introduction'].map(title=>send(command('add_item',1,{title,responsibleId:actor.id,dueDate:'2026-12-01'}))));
      assert.deepEqual(pair.map(row=>row.code).sort(),[200,409]);state=pair.find(row=>row.code===200).body.data;item=state.items[0];
      assert.equal(state.onboarding.version,2);assert.equal(state.history.length,2);
      assert.equal((await send(command('edit_item',2,{itemId:item.id,title:'Valid title',responsibleId:99999999,dueDate:null,reason:'Assign unavailable account'}))).code,400);
      assert.equal((await send(command('add_item',2,{title:'Bad date',dueDate:'2026-02-30'}))).code,400);
      assert.equal((await send(command('complete_item',2,{itemId:item.id,reason:'   '}))).code,400);
      assert.equal((await send(command('add_item',2,{title:'Cannot write account state',status:'active'}))).code,400);
      assert.equal((await OnboardingCase.findOne()).version,2);assert.equal(await OnboardingEvent.count(),2);
      assert.equal((await send(command('complete_case',2,{reason:'Premature completion'}))).code,409);
      assert.equal((await OnboardingCase.findOne()).version,2);
    });
    await t.test('item ownership and command payload binding prevent cross-case edits or content reuse',async()=>{
      const created=await send(command('create',0),other.id);assert.equal(created.code,200);
      assert.equal((await send(command('waive_item',1,{itemId:item.id,reason:'Wrong checklist'}),other.id)).code,404);
      const request=command('edit_item',2,{itemId:item.id,title:'Verify direct-entry details',responsibleId:employee.id,dueDate:null,reason:'Correct checklist wording'});
      assert.equal((await send(request)).code,200);assert.equal((await send({...request,title:'Different payload'})).code,409);
      state=(await send(request)).body.data;assert.equal(state.onboarding.version,3);
      assert.equal(await OnboardingItem.count({where:{caseId:state.onboarding.id}}),1);
    });
    await t.test('completion/waiver races serialize, replay adds no event, manual reopen retains all reasons',async()=>{
      const complete=command('complete_item',3,{itemId:item.id,reason:'Details verified manually'});
      const waive=command('waive_item',3,{itemId:item.id,reason:'Not required for this case'});
      const pair=await Promise.all([send(complete),send(waive)]);assert.deepEqual(pair.map(row=>row.code).sort(),[200,409]);
      const winner=pair.findIndex(row=>row.code===200),input=[complete,waive][winner];
      const retry=await send(input);assert.equal(retry.body.replayed,true);assert.equal(retry.body.data.onboarding.version,4);
      assert.equal(retry.body.data.history.filter(event=>event.version===4).length,1);
      const closed=await send(command('complete_case',4,{reason:'All manual steps reviewed'}));assert.equal(closed.code,200);
      assert.equal(closed.body.data.onboarding.status,'completed');assert.equal((await User.findByPk(employee.id)).status,'inactive');
      assert.equal((await send(command('add_item',5,{title:'Blocked until reopened'}))).code,409);
      assert.equal((await send(command('reopen_case',5,{reason:'Additional checks needed'}))).code,200);
      assert.equal((await send(command('reopen_item',6,{itemId:item.id,reason:'Recheck evidence'}))).code,200);
      state=(await send(command('waive_item',7,{itemId:item.id,reason:'Explicit documented waiver'}))).body.data;
      assert.equal(state.onboarding.version,8);assert.equal(state.items[0].status,'waived');
      assert.ok(state.history.some(event=>event.details.reason==='All manual steps reviewed'));
      assert.equal(state.history[0].actorId,actor.id);
      const serialized=state.history[0].toJSON();
      assert.equal('commandKey' in serialized,false);assert.equal('payloadHash' in serialized,false);
    });
    await t.test('history remains accessible after role/status changes; foreign keys and down protect populated cases',async()=>{
      await employee.update({role:'client',status:'suspended'});
      const res=response();await controller.read({params:{employeeId:String(employee.id)},query:{}},res);
      assert.equal(res.code,200);assert.equal(res.body.data.history.length,8);
      assert.equal(res.body.data.employee.role,'client');assert.equal(res.body.data.items[0].status,'waived');
      await assert.rejects(()=>User.destroy({where:{id:employee.id}}),error=>error.name==='SequelizeForeignKeyConstraintError');
      await assert.rejects(()=>require('../migrations/20261106000000-manual-onboarding').down(qi),/populated onboarding history/);
      assert.equal(await OnboardingEvent.count({where:{caseId:state.onboarding.id}}),8);
    });
    await t.test('history cursor pages every event without gaps after more than 100 manual changes',async()=>{
      const current=await OnboardingCase.findOne({where:{employeeId:other.id}});
      for(let i=0;i<101;i++)assert.equal((await send(command('add_item',current.version+i,{title:'Manual step '+i}),other.id)).code,200);
      const first=response();await controller.read({params:{employeeId:String(other.id)},query:{}},first);
      assert.equal(first.body.data.history.length,100);assert.equal(first.body.data.hasEarlierHistory,true);
      const cursor=first.body.data.history.at(-1).version;
      const second=response();await controller.read({params:{employeeId:String(other.id)},query:{before:String(cursor)}},second);
      assert.equal(second.body.data.history.length,2);assert.equal(second.body.data.hasEarlierHistory,false);
      const versions=[...first.body.data.history,...second.body.data.history].map(event=>event.version);
      assert.equal(new Set(versions).size,102);assert.ok(versions.includes(1));
    });
  }finally{if(db)await db.close();await admin.close();}
});
