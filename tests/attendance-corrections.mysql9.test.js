const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Sequelize,DataTypes}=require('sequelize');const {load,response}=require('./helpers/controller');
test('dedicated correction permission, retained proposals/apply and monthly raw export',{timeout:180000},async t=>{
  assert.equal(process.env.HRM_DISPOSABLE_MYSQL,'1');assert.equal(process.env.HRM_TEST_MYSQL_PORT,'13379');
  const options={host:'127.0.0.1',port:13379,dialect:'mysql',logging:false,pool:{max:5}},adminDb=new Sequelize('mysql','root','',options);let db;
  try{
    const schema='hrm_corrections_'+Date.now();await adminDb.query('CREATE DATABASE `'+schema+'`');db=new Sequelize(schema,'root','',options);
    const names=fs.readdirSync(path.join(__dirname,'../migrations')).filter(n=>n.endsWith('.js')).sort();for(const name of names)await require('../migrations/'+name).up(db.getQueryInterface(),Sequelize);
    const models={sequelize:db};for(const name of fs.readdirSync(path.join(__dirname,'../models')).filter(n=>n.endsWith('.js')&&n!=='index.js')){const m=require('../models/'+name)(db,DataTypes);models[m.name]=m;}
    const {User,Attendance,AttendanceCorrection:Draft,AttendanceCorrectionEvent:Event,AttendanceCorrectionGrant:Grant,AttendanceCorrectionGrantEvent:GrantEvent}=models;
    const corrections=require('../controllers/attendanceCorrections')(models),permissions=require('../controllers/attendanceCorrectionPermissions')(models),facts=require('../controllers/attendanceFacts')(models);
    let sequence=0;async function actor(role='employee'){const row=await User.create({fullName:'Synthetic correction account',email:`correction-${sequence++}@example.invalid`,role,status:'active'});return {id:row.id,role,sessionVersion:0};}
    const admin=await actor('admin'),hr=await actor(),employee=await actor();
    const command=(user,body)=>{const res=response();return corrections.command({user,body:{commandKey:crypto.randomUUID(),reason:'Synthetic reviewed correction',...body}},res).then(()=>res);};
    async function grant(user,active=true){const current=await Grant.findByPk(user.id),res=response();await permissions.command({user:admin,body:{commandKey:crypto.randomUUID(),userId:user.id,active,expectedVersion:current?.version||0,reason:'Synthetic explicit correction permission'}},res);assert.equal(res.code,200);return res;}
    async function submitted(target=employee,workDate='2026-02-01',attendanceId=null,proposed={status:'absent',clockIn:null,clockOut:null}){
      const created=await command(admin,{action:'create',employeeId:target.id,expectedVersion:0,workDate,attendanceId,proposed});assert.equal(created.code,200,JSON.stringify(created.body));
      const sent=await command(admin,{action:'submit',employeeId:target.id,correctionId:created.body.id,expectedVersion:created.body.version});assert.equal(sent.code,200,JSON.stringify(sent.body));return sent.body;
    }
    await t.test('draft/submit retain facts and reasons; no automatic admin apply permission',async()=>{
      const draft=await submitted();assert.equal(await Attendance.count({where:{userId:employee.id}}),0);assert.equal(draft.events.length,2);
      const denied=await command(admin,{action:'apply',employeeId:employee.id,correctionId:draft.id,expectedVersion:draft.version});assert.equal(denied.code,403);
      const access=response();await permissions.access({user:admin},access);assert.equal(access.body.canApply,false);
      assert.equal((await command(hr,{action:'create',employeeId:employee.id,expectedVersion:0,workDate:'2026-02-02',attendanceId:null,proposed:{status:'absent',clockIn:null,clockOut:null}})).code,403);
    });
    await t.test('explicit grant is attributed without role changes; HR applies nullable absent facts and exact retry',async()=>{
      await grant(hr);assert.equal((await User.findByPk(hr.id)).role,'employee');assert.equal(await GrantEvent.count({where:{userId:hr.id}}),1);
      const draft=await Draft.findOne({where:{employeeId:employee.id,state:'submitted'}}),body={commandKey:crypto.randomUUID(),action:'apply',employeeId:employee.id,correctionId:draft.id,expectedVersion:draft.version};
      const [a,b]=await Promise.all([command(hr,body),command(hr,body)]);assert.equal(a.code,200);assert.deepEqual(a.body,b.body);
      assert.equal(await Attendance.count({where:{userId:employee.id,date:'2026-02-01'}}),1);assert.equal(a.body.appliedRecord.clockIn,null);assert.equal(a.body.appliedRecord.totalHours,null);
      assert.equal(a.body.events[0].actorId,hr.id);assert.equal((await command(hr,{...body,commandKey:crypto.randomUUID()})).code,409);
      assert.equal((await command(admin,{action:'reopen',employeeId:employee.id,correctionId:draft.id,expectedVersion:a.body.version})).code,409);
    });
    await t.test('existing recorded leave labels and elapsed clocks survive correction without pay/leave automation',async()=>{
      const target=await actor(),row=await Attendance.create({userId:target.id,date:'2026-02-03',clockIn:'2026-02-03T08:00:00Z',clockOut:'2026-02-03T09:00:00Z',totalHours:1,status:'leave'});
      const draft=await submitted(target,'2026-02-03',row.id,{status:'on-leave',clockIn:'2026-02-03T08:00:00Z',clockOut:'2026-02-03T10:30:00Z'});
      assert.equal(draft.baseline[0].status,'leave');const applied=await command(hr,{action:'apply',employeeId:target.id,correctionId:draft.id,expectedVersion:draft.version});assert.equal(applied.code,200);
      await row.reload();assert.equal(row.status,'on-leave');assert.equal(row.totalHours,2.5);assert.equal(applied.body.baseline[0].totalHours,1);
    });
    await t.test('status-only corrections preserve independent recorded hours when clocks are unchanged',async()=>{
      const target=await actor(),row=await Attendance.create({userId:target.id,date:'2026-02-11',clockIn:null,clockOut:null,totalHours:3,status:'leave'});
      const draft=await submitted(target,'2026-02-11',row.id,{status:'on-leave',clockIn:null,clockOut:null});
      const applied=await command(hr,{action:'apply',employeeId:target.id,correctionId:draft.id,expectedVersion:draft.version});assert.equal(applied.code,200);assert.equal((await row.reload()).totalHours,3);assert.equal(applied.body.appliedRecord.totalHours,3);
    });
    await t.test('stale source, stale draft, malformed timestamps and cross-target membership fail without mutation',async()=>{
      const target=await actor(),row=await Attendance.create({userId:target.id,date:'2026-02-04',clockIn:'2026-02-04T08:00:00Z',status:'present'}),draft=await submitted(target,'2026-02-04',row.id);
      await row.update({clockOut:'2026-02-04T09:00:00Z',totalHours:1});
      assert.equal((await command(hr,{action:'apply',employeeId:target.id,correctionId:draft.id,expectedVersion:draft.version})).code,409);
      assert.equal((await command(admin,{action:'cancel',employeeId:target.id,correctionId:draft.id,expectedVersion:1})).code,409);
      assert.equal((await command(admin,{action:'create',employeeId:employee.id,expectedVersion:0,workDate:'2026-02-04',attendanceId:row.id,proposed:{status:'present',clockIn:null,clockOut:null}})).code,409);
      assert.equal((await command(admin,{action:'create',employeeId:target.id,expectedVersion:0,workDate:'2026-02-05',proposed:{status:'present',clockIn:'2026-02-30T08:00:00Z',clockOut:null}})).code,400);
      assert.equal((await row.reload()).totalHours,1);
    });
    await t.test('revocation winning the lock blocks a queued apply',async()=>{
      const target=await actor(),draft=await submitted(target,'2026-02-06'),original=Grant.findByPk;let signal,release;
      const entered=new Promise(r=>signal=r),gate=new Promise(r=>release=r);let held=false;
      Grant.findByPk=async function(...args){const row=await original.apply(this,args);if(!held&&args[0]===hr.id&&args[1]?.transaction){held=true;signal();await gate;}return row;};
      try{const revoking=grant(hr,false);await entered;const applying=command(hr,{action:'apply',employeeId:target.id,correctionId:draft.id,expectedVersion:draft.version});release();await revoking;assert.equal((await applying).code,403);}finally{release();Grant.findByPk=original;}
      assert.equal(await Attendance.count({where:{userId:target.id}}),0);await grant(hr);
    });
    await t.test('apply winning the lock completes before revocation; later applies denied',async()=>{
      const target=await actor(),draft=await submitted(target,'2026-02-07'),original=Grant.findByPk;let signal,release;const entered=new Promise(r=>signal=r),gate=new Promise(r=>release=r);let held=false;
      Grant.findByPk=async function(...args){const row=await original.apply(this,args);if(!held&&args[0]===hr.id&&args[1]?.transaction){held=true;signal();await gate;}return row;};
      try{const applying=command(hr,{action:'apply',employeeId:target.id,correctionId:draft.id,expectedVersion:draft.version});await entered;const revoking=grant(hr,false);release();assert.equal((await applying).code,200);await revoking;}finally{release();Grant.findByPk=original;}
      assert.equal(await Attendance.count({where:{userId:target.id}}),1);await grant(hr);
    });
    await t.test('event failure rolls back attendance, proposal and receipt together',async()=>{
      const target=await actor(),draft=await submitted(target,'2026-02-08'),original=Event.create,key=crypto.randomUUID();Event.create=async()=>{throw Error('Synthetic audit failure');};
      try{assert.equal((await command(hr,{commandKey:key,action:'apply',employeeId:target.id,correctionId:draft.id,expectedVersion:draft.version})).code,503);}finally{Event.create=original;}
      assert.equal(await Attendance.count({where:{userId:target.id}}),0);assert.equal((await Draft.findByPk(draft.id)).state,'submitted');
      assert.equal((await command(hr,{commandKey:key,action:'apply',employeeId:target.id,correctionId:draft.id,expectedVersion:draft.version})).code,200);
    });
    await t.test('legacy duplicates require explicit target and remain preserved as conflicting raw rows',async()=>{
      const target=await actor();for(let i=0;i<2;i++)await Attendance.create({userId:target.id,date:'2026-02-09',clockIn:'2026-02-09T08:00:00Z',status:'present'});
      assert.equal((await command(admin,{action:'create',employeeId:target.id,expectedVersion:0,workDate:'2026-02-09',proposed:{status:'absent',clockIn:null,clockOut:null}})).code,409);
      const rows=await Attendance.findAll({where:{userId:target.id}}),draft=await submitted(target,'2026-02-09',rows[0].id);assert.equal((await command(hr,{action:'apply',employeeId:target.id,correctionId:draft.id,expectedVersion:draft.version})).code,200);
      assert.equal(await Attendance.count({where:{userId:target.id}}),2);assert.equal((await rows[1].reload()).status,'present');
    });
    await t.test('retained history pages are complete and nullable manual facts cannot become epoch-sized checkout hours',async()=>{
      const target=await actor(),today=new Date().toISOString().slice(0,10);
      const created=await command(admin,{action:'create',employeeId:target.id,expectedVersion:0,workDate:today,attendanceId:null,proposed:{status:'absent',clockIn:null,clockOut:null}});let draft=created.body;
      for(let i=0;i<101;i++){const edited=await command(admin,{action:'edit',employeeId:target.id,correctionId:draft.id,expectedVersion:draft.version,workDate:today,attendanceId:null,proposed:{status:'absent',clockIn:null,clockOut:null},reason:'Synthetic history version '+i});assert.equal(edited.code,200);draft=edited.body;}
      const detail=response();await corrections.detail({params:{id:String(draft.id)},query:{}},detail);assert.equal(detail.body.events.length,100);assert.equal(detail.body.hasEarlierHistory,true);
      const older=response();await corrections.detail({params:{id:String(draft.id)},query:{beforeVersion:String(detail.body.events[99].version)}},older);assert.equal(older.body.events.length,2);assert.equal(new Set([...detail.body.events,...older.body.events].map(e=>e.id)).size,102);
      const sent=await command(admin,{action:'submit',employeeId:target.id,correctionId:draft.id,expectedVersion:draft.version});const applied=await command(hr,{action:'apply',employeeId:target.id,correctionId:draft.id,expectedVersion:sent.body.version});assert.equal(applied.code,200);
      const recovery=require('../services/attendanceRecovery')(models,{bucket:'synthetic-only',put:async()=>{throw Error('No upload expected');},remove:async()=>{}});
      await assert.rejects(recovery.execute({user:target,headers:{'idempotency-key':crypto.randomUUID()},body:{workDate:today,attendanceId:applied.body.attendanceId},files:[]},'out'),{status:409});
      assert.equal((await Attendance.findByPk(applied.body.attendanceId)).totalHours,null);
    });
    await t.test('CSV includes every raw month row/duplicate, escapes formulas, rejects invalid months',async()=>{
      const target=await actor();await User.update({fullName:'=SUM(1,2)'},{where:{id:target.id}});
      for(const [date,status] of [['2026-01-01','present'],['2026-01-01','leave'],['2026-01-31','absent']])await Attendance.create({userId:target.id,date,clockIn:null,status});
      const out=response();out.send=function(body){this.body=body;return this;};await facts.monthlyExport({query:{month:'2026-01'}},out);assert.equal(out.code,200);assert.match(out.body,/"'=SUM\(1,2\)"/);assert.equal(out.body.trim().split('\r\n').length,4);assert.match(out.body,/'?conflict/);assert.match(out.headers['Content-Disposition'],/2026-01.csv/);
      const bad=response();await facts.monthlyExport({query:{month:'2026-13'}},bad);assert.equal(bad.code,400);
      const xlsx=response();xlsx.send=function(body){this.body=body;return this;};await facts.monthlyExport({query:{month:'2026-01',format:'xlsx'}},xlsx);assert.equal(xlsx.code,200);assert.ok(Buffer.isBuffer(xlsx.body));assert.equal(xlsx.body.readUInt32LE(0),0x04034b50);assert.match(xlsx.headers['Content-Disposition'],/2026-01.xlsx/);
      const count=Attendance.count;
      try{Attendance.count=async()=>10001;const limited=response();await facts.monthlyExport({query:{month:'2026-01',format:'xlsx'}},limited);assert.equal(limited.code,413);Attendance.count=async()=>50001;const csvLimit=response();await facts.monthlyExport({query:{month:'2026-01',format:'csv'}},csvLimit);assert.equal(csvLimit.code,413);}finally{Attendance.count=count;}
    });
    await t.test('permission audit cursor retains every grant/revocation event',async()=>{
      const target=await actor();for(let i=0;i<101;i++)await grant(target,i%2===1);
      const latest=response();await permissions.history({params:{id:String(target.id)},query:{}},latest);assert.equal(latest.body.events.length,100);assert.equal(latest.body.hasEarlierHistory,true);
      const older=response();await permissions.history({params:{id:String(target.id)},query:{beforeVersion:String(latest.body.events[99].version)}},older);assert.equal(older.body.events.length,1);assert.equal(new Set([...latest.body.events,...older.body.events].map(e=>e.id)).size,101);
      const bad=response();await permissions.history({params:{id:String(target.id)},query:{beforeVersion:['2']}},bad);assert.equal(bad.code,400);
    });
    await t.test('retained permission history prevents deletion; populated down refuses history loss',async()=>{
      const client=await actor('client'),profile=await models.UserInfo.create({userId:client.id,companyName:'Synthetic capability account'});await grant(client);await assert.rejects(User.destroy({where:{id:client.id}}),{name:'SequelizeForeignKeyConstraintError'});
      const controller=load('controllers/clientController.js',{'../models':models,sequelize:Sequelize,bcryptjs:require('bcryptjs'),crypto:require('node:crypto'),'express-validator':require('express-validator'),nodemailer:{createTransport:()=>({})},'../utils/pagination':{},'../config/runtimeSafety':{mailOptions:()=>({})}});
      const deletion=response();await controller.deleteClient({user:admin,params:{id:client.id}},deletion);assert.equal(deletion.code,409);assert.ok(await User.findByPk(client.id));assert.ok(await models.UserInfo.findByPk(profile.id));
      await assert.rejects(require('../migrations/20261107010000-attendance-correction-drafts').down(db.getQueryInterface()),/retained/);
    });
    console.log('Synthetic correction schema',schema,'migration files',names.length,'Node',process.version);
  }finally{if(db)await db.close();await adminDb.close();}
});
