// Explicit opt-in only: refuses non-loopback, non-disposable targets.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { Sequelize, DataTypes } = require('sequelize');
const { load, response } = require('./helpers/controller');

test('MySQL 9 baseline upgrade, revocation and competing leave transitions', {timeout:120000}, async t => {
  assert.equal(process.env.HRM_DISPOSABLE_MYSQL, '1', 'Explicit disposable opt-in required');
  const port=Number(process.env.HRM_TEST_MYSQL_PORT);
  assert.equal(port,13379,'Only dedicated local test port is allowed');
  const dbName='hrm_slice2_upgrade_'+Date.now();
  console.log('Disposable schema:',dbName);
  const options={dialect:'mysql',host:'127.0.0.1',port,logging:false,pool:{max:8,min:0}};
  const admin=new Sequelize('mysql','root',process.env.HRM_TEST_MYSQL_PASSWORD||'',options);
  let db;
  try {
    const [[version]]=await admin.query('SELECT VERSION() AS version');
    assert.match(version.version,/^9\./);console.log('Database runtime:',version.version);
    // Never drop an existing database: repeated runs require explicit manual cleanup.
    await admin.query('CREATE DATABASE `'+dbName+'`');
    db=new Sequelize(dbName,'root',process.env.HRM_TEST_MYSQL_PASSWORD||'',options);
    const qi=db.getQueryInterface();
    const migrations=fs.readdirSync(path.join(__dirname,'../migrations')).filter(f=>f.endsWith('.js')).sort();
    await t.test('baseline migrations execute in original order',async()=>{
      for(const file of migrations.filter(f=>f<'20261105000000')) {
        console.log('Baseline migration:',file);
        await require(path.join(process.env.BASELINE_CHECKOUT,'migrations',file)).up(qi,Sequelize);
      }
    });
    const BaselineUser=require(path.join(process.env.BASELINE_CHECKOUT,'models/user.js'))(db,DataTypes);
    const old=await BaselineUser.create({fullName:'Synthetic Legacy',email:'legacy@example.invalid',password:'legacy-password',role:'employee',status:'active'});
    assert.equal(await old.comparePassword('legacy-password'),true);
    const oldColumns=await qi.describeTable('users');assert.equal(oldColumns.sessionVersion,undefined);
    const additions=migrations.filter(f=>f>='20261105000000').map(f=>require(path.join(__dirname,'../migrations',f)));
    await t.test('upgrade populated baseline preserves user and introduces version zero',async()=>{
      for(const migration of additions)await migration.up(qi,Sequelize);
      const [[row]]=await db.query('SELECT sessionVersion FROM users WHERE id=?',{replacements:[old.id]});
      assert.equal(row.sessionVersion,0);
    });
    const User=require('../models/user')(db,DataTypes);
    await t.test('actual model startup resolves both URL aliases against the disposable database',async()=>{
      const execute=require('node:util').promisify(require('node:child_process').execFile);
      const source=`
        const assert=require('node:assert/strict');
        const Sequelize=require('sequelize');
        const authenticate=Sequelize.prototype.authenticate;
        Sequelize.prototype.authenticate=function(...args){
          assert.equal(this.config.host,'127.0.0.1');
          assert.equal(Number(this.config.port),13379);
          assert.match(this.config.database,/^hrm_slice2_upgrade_\\d+$/);
          return authenticate.apply(this,args);
        };
        const db=require('./models');
        (async()=>{try{assert.ok(await db.User.count()>0);console.log('Guarded URL model boot passed');}
        finally{await db.sequelize.close();}})().catch(e=>{console.error(e);process.exitCode=1;});`;
      const url='mysql://root:'+encodeURIComponent(process.env.HRM_TEST_MYSQL_PASSWORD||'')+'@127.0.0.1:13379/'+dbName;
      for(const variable of ['DATABASE_URL','DB_URL']){
        const result=await execute(process.execPath,['-e',source],{cwd:path.join(__dirname,'..'),
          env:{...process.env,NODE_ENV:'production',DATABASE_URL:'',DB_URL:'',[variable]:url},timeout:30000});
        assert.match(result.stdout,/Guarded URL model boot passed/);
      }
    });
    const LeaveRequest=require('../models/leaveRequest')(db,DataTypes);
    const LeaveType=require('../models/leaveType')(db,DataTypes);
    await t.test('manager correction preserves populated upgrade records and is safe to rerun/down',async()=>{
      const manager=await User.create({fullName:'Synthetic Manager',email:'manager@example.invalid',role:'manager',status:'active'});
      const correction=require('../migrations/20261105000002-preserve-manager-role');
      for(let i=0;i<2;i++)await correction.up(qi,Sequelize);
      await correction.down(qi,Sequelize);
      const legacyClient=require('../migrations/20251202000000-add-client-role-to-users');
      await legacyClient.up(qi,Sequelize);await legacyClient.up(qi,Sequelize);await legacyClient.down(qi,Sequelize);
      const persisted=await User.findByPk(manager.id);assert.equal(persisted.role,'manager');assert.equal(persisted.sessionVersion,0);
      assert.ok((await qi.describeTable('users')).role.type.includes('manager'));
    });
    await t.test('fresh migration path retains a manager created before the historical client step',async()=>{
      const freshName=dbName+'_fresh';await admin.query('CREATE DATABASE `'+freshName+'`');
      const fresh=new Sequelize(freshName,'root',process.env.HRM_TEST_MYSQL_PASSWORD||'',options);
      try{
        const freshQi=fresh.getQueryInterface();
        for(const file of migrations){
          await require(path.join(__dirname,'../migrations',file)).up(freshQi,Sequelize);
          if(file==='20251116000000-add-manager-role-to-users.js'){
            await fresh.query("INSERT INTO users(fullName,email,role,status,createdAt,updatedAt) VALUES('Fresh Manager','fresh@example.invalid','manager','active',NOW(),NOW())");
          }
        }
        const [[manager]]=await fresh.query("SELECT role,sessionVersion FROM users WHERE email='fresh@example.invalid'");
        assert.equal(manager.role,'manager');assert.equal(manager.sessionVersion,0);
      }finally{await fresh.close();}
    });
    await t.test('sequelize-cli upgrades original migration metadata and reruns without replaying history',async()=>{
      const cliName=dbName+'_cli';await admin.query('CREATE DATABASE `'+cliName+'`');
      const cliDb=new Sequelize(cliName,'root',process.env.HRM_TEST_MYSQL_PASSWORD||'',options);
      const execute=require('node:util').promisify(require('node:child_process').execFile);
      const cli=require.resolve('sequelize-cli/lib/sequelize');
      const cliEnv={...process.env,NODE_ENV:'test',DATABASE_URL:'',DB_URL:'',TEST_DB_HOST:'127.0.0.1',TEST_DB_PORT:'13379',TEST_DB_NAME:cliName,TEST_DB_USER:'root',TEST_DB_PASSWORD:process.env.HRM_TEST_MYSQL_PASSWORD||''};
      const common=['--env','test','--config',path.join(__dirname,'../config/config.js')];
      async function run(command,migrationsPath){return execute(process.execPath,[cli,command,...common,'--migrations-path',migrationsPath],{env:cliEnv,timeout:60000,maxBuffer:2*1024*1024});}
      try{
        await run('db:migrate',path.join(process.env.BASELINE_CHECKOUT,'migrations'));
        const before=await cliDb.getQueryInterface().describeTable('users');assert.equal(before.sessionVersion,undefined);
        await cliDb.query("INSERT INTO users(fullName,email,role,status,createdAt,updatedAt) VALUES('CLI Legacy','cli@example.invalid','employee','active',NOW(),NOW())");
        await run('db:migrate',path.join(__dirname,'../migrations'));
        await cliDb.query("UPDATE users SET role='manager' WHERE email='cli@example.invalid'");
        const repeat=await run('db:migrate',path.join(__dirname,'../migrations'));assert.match(repeat.stdout,/No migrations were executed/);
        const [recorded]=await cliDb.query('SELECT name FROM SequelizeMeta');assert.equal(recorded.length,migrations.length);
        await run('db:migrate:undo',path.join(__dirname,'../migrations')); // Final retention down is deliberately non-contracting; no counter/provenance reset.
        await run('db:migrate',path.join(__dirname,'../migrations'));
        const [[manager]]=await cliDb.query("SELECT role,sessionVersion FROM users WHERE email='cli@example.invalid'");
        assert.equal(manager.role,'manager');assert.equal(manager.sessionVersion,1);
      }finally{await cliDb.close();}
    });
    await t.test('existing baseline password still logs in after upgrade and returns a valid session',async()=>{
      const jwt=require('jsonwebtoken'),secret='synthetic-upgrade-login';
      const middleware=load('middleware/authMiddleware.js',{'../models':{User},'../config/jwtSecret':secret,jsonwebtoken:jwt});
      const auth=load('controllers/authController.js',{
        bcryptjs:require('bcryptjs'),jsonwebtoken:jwt,crypto:require('node:crypto'),sequelize:Sequelize,
        '../models':{User},'express-validator':require('express-validator'),
        nodemailer:{createTransport:()=>({sendMail:async()=>assert.fail('Unexpected external mail')})},
        '../config/jwtSecret':secret,'../middleware/authMiddleware':middleware,
    '../config/runtimeSafety':require('../config/runtimeSafety'),
      });
      const res=response();await auth.login({body:{email:old.email,password:'legacy-password'}},res);
      assert.equal(res.code,200);assert.equal(jwt.verify(res.body.token,secret).sessionVersion,0);
      let accepted=false;await middleware.authenticate({headers:{authorization:`Bearer ${res.body.token}`},query:{}},response(),()=>{accepted=true;});
      assert.ok(accepted);
    });
    await t.test('scoped migrator creates trigger without SUPER when binary logging is disabled',async()=>{
      const [[settings]]=await admin.query('SELECT @@log_bin AS enabled');
      assert.equal(settings.enabled,0,'Start disposable MySQL with --disable-log-bin to match Railway config');
      const account=await User.create({fullName:'Restricted Synthetic',email:'restricted@example.invalid',role:'employee',status:'active'});
      const suffix=Date.now().toString();
      const migrator='hrm_m_'+suffix,writer='hrm_w_'+suffix;
      await admin.query(`CREATE USER '${migrator}'@'localhost' IDENTIFIED BY 'synthetic-test-only'`);
      await admin.query(`CREATE USER '${writer}'@'localhost' IDENTIFIED BY 'synthetic-test-only'`);
      await admin.query(`GRANT SELECT, UPDATE, TRIGGER ON \`${dbName}\`.users TO '${migrator}'@'localhost'`);
      await admin.query(`GRANT SELECT, UPDATE ON \`${dbName}\`.users TO '${writer}'@'localhost'`);
      const restricted=new Sequelize(dbName,migrator,'synthetic-test-only',options);
      const application=new Sequelize(dbName,writer,'synthetic-test-only',options);
      const trigger=require('../migrations/20261105000001-enforce-session-revocation');
      try{
        await trigger.down(qi,Sequelize);
        await trigger.up(restricted.getQueryInterface(),Sequelize);
        const before=await User.findByPk(account.id);
        await application.query("UPDATE users SET status='suspended' WHERE id=?",{replacements:[account.id]});
        const after=await User.findByPk(account.id);assert.equal(after.sessionVersion,before.sessionVersion+1);
        await application.query("UPDATE users SET status='active' WHERE id=?",{replacements:[account.id]});
        // Restore root-owned trigger before dropping the synthetic restricted accounts.
        await trigger.down(qi,Sequelize);await trigger.up(qi,Sequelize);
      }finally{
        await restricted.close();await application.close();
        await admin.query(`DROP USER '${migrator}'@'localhost', '${writer}'@'localhost'`);
      }
    });
    await t.test('stale concurrent saves, bulk updates, raw writes and upserts never reuse versions',async()=>{
      const a=await User.findByPk(old.id),b=await User.findByPk(old.id);
      await Promise.all([a.update({role:'admin'}),b.update({status:'suspended'})]);
      let user=await User.findByPk(old.id);assert.equal(user.sessionVersion,2);
      await User.update({role:'employee',status:'active'},{where:{id:old.id}});
      user=await User.findByPk(old.id);assert.equal(user.sessionVersion,3);
      const stale=await User.findByPk(old.id);
      await User.update({password:await require('bcryptjs').hash('synthetic-bulk-password',4)},{where:{id:old.id}});
      await stale.update({fullName:'Renamed Legacy'});
      user=await User.findByPk(old.id);assert.equal(user.sessionVersion,4);
      await db.query('UPDATE users SET sessionVersion=0 WHERE id=?',{replacements:[old.id]});
      user=await User.findByPk(old.id);assert.equal(user.sessionVersion,4);
      await User.upsert({id:old.id,fullName:user.fullName,email:user.email,role:'admin',status:'active'});
      user=await User.findByPk(old.id);assert.equal(user.sessionVersion,5);
      await User.update({role:'employee'},{where:{id:old.id},individualHooks:true});
      user=await User.findByPk(old.id);assert.equal(user.sessionVersion,6);
      await User.bulkCreate([{id:old.id,fullName:user.fullName,email:user.email,role:'admin',status:'active'}],{updateOnDuplicate:['role']});
      user=await User.findByPk(old.id);assert.equal(user.sessionVersion,7);
      await User.update({status:'suspended'},{where:{id:old.id},hooks:false});
      user=await User.findByPk(old.id);assert.equal(user.sessionVersion,8);
      await User.update({role:'employee',status:'active'},{where:{id:old.id},hooks:false});
      user=await User.findByPk(old.id);assert.equal(user.sessionVersion,9);
      const beforeRollback=await db.transaction();
      await User.update({status:'inactive'},{where:{id:old.id},transaction:beforeRollback});
      await beforeRollback.rollback();
      user=await User.findByPk(old.id);assert.equal(user.sessionVersion,9);assert.equal(user.status,'active');
      // Password hashes are case-sensitive even when the users table collation is not.
      await db.query("UPDATE users SET password=CONCAT(LEFT(password,59),'a') WHERE id=?",{replacements:[old.id]});
      user=await User.findByPk(old.id);assert.equal(user.sessionVersion,10);
      await db.query("UPDATE users SET password=CONCAT(LEFT(password,59),'A') WHERE id=?",{replacements:[old.id]});
      user=await User.findByPk(old.id);assert.equal(user.sessionVersion,11);
      const jwt=require('jsonwebtoken'),secret='synthetic-mysql-test-secret';
      const auth=load('middleware/authMiddleware.js',{'../models':{User},'../config/jwtSecret':secret,jsonwebtoken:jwt});
      for(const version of [0,1,2,3,4,5,6,7,8,9,10]) {
        const token=jwt.sign({id:old.id,role:'employee',sessionVersion:version},secret),res=response();
        await auth.authenticate({headers:{authorization:`Bearer ${token}`},query:{}},res,()=>assert.fail('Stale session resurrected'));
        assert.equal(res.code,401);
      }
    });
    await t.test('actual MySQL approval/rejection concurrency has one winner and enforces quota',async()=>{
      const leaveType=await LeaveType.create({name:'Synthetic Test',status:'active',annual_quota:5});
      const controller=load('controllers/leaveController.js',{'../models':{User,LeaveType,LeaveRequest},sequelize:require('sequelize'),'../utils/pagination':{}});
      const year=new Date().getFullYear();
      let day=1;
      async function request(days=1){const date=`${year}-11-${String(day++).padStart(2,'0')}`;return LeaveRequest.create({userId:old.id,leaveTypeId:leaveType.id,startDate:date,endDate:date,totalDays:days,leaveMode:'full-day',reason:'Synthetic',status:'pending'});}
      for(const winner of ['approveLeave','rejectLeave']){
        const leave=await request();const loser=winner==='approveLeave'?'rejectLeave':'approveLeave';
        // Hold employee lock until both callers have observed pending, then release them together.
        const blocker=await db.transaction();await User.findByPk(old.id,{transaction:blocker,lock:blocker.LOCK.UPDATE});
        const a=response(),b=response(),req={params:{id:leave.id},user:{id:old.id},body:{rejectionReason:'Synthetic'}};
        const first=controller[winner](req,a),second=controller[loser](req,b);
        await new Promise(resolve=>setTimeout(resolve,100));await blocker.commit();await Promise.all([first,second]);
        assert.deepEqual([a.code,b.code].sort(),[200,400]);
        const persisted=await LeaveRequest.findByPk(leave.id);assert.ok(['approved','rejected'].includes(persisted.status));
      }
      // Separate employee isolates quota case from whichever transition won above.
      const employee=await User.create({fullName:'Quota Synthetic',email:'quota@example.invalid',role:'employee',status:'active'});
      const a=await request(3),b=await request(3);await LeaveRequest.update({userId:employee.id},{where:{id:[a.id,b.id]}});
      const ra=response(),rb=response();await Promise.all([controller.approveLeave({params:{id:a.id},user:{id:old.id}},ra),controller.approveLeave({params:{id:b.id},user:{id:old.id}},rb)]);
      assert.deepEqual([ra.code,rb.code].sort(),[200,409]);
      assert.equal(Number(await LeaveRequest.sum('totalDays',{where:{userId:employee.id,status:'approved'}})),3);
    });
    await t.test('bank HTTP routes preserve self/admin writes and deny cross-account reads and mutations',async()=>{
      const express=require('express'),jwt=require('jsonwebtoken'),secret='synthetic-bank-session';
      const UserBankInfo=require('../models/userBankInfo')(db,DataTypes);
      const access=require('../middleware/employeeAccess');
      const auth=load('middleware/authMiddleware.js',{'../models':{User},'../config/jwtSecret':secret,jsonwebtoken:jwt});
      const controllers=load('controllers/employeeController.js',{
        '../models':{User,UserBankInfo},'../middleware/employeeAccess':access,sequelize:Sequelize,
        'express-validator':require('express-validator'),path,'../utils/pagination':require('../utils/pagination'),
      });
      const upload={array:()=>((req,res,next)=>next()),single:()=>((req,res,next)=>next())};
      const router=load('routes/employeeRoutes.js',{
        express,'express-validator':require('express-validator'),'../controllers/employeeController':controllers,
        '../controllers/employeeAccountSummaryController':{getEmployeeAccountSummary:(req,res)=>res.sendStatus(501)},
        '../middleware/authMiddleware':auth,'../middleware/employeeAccess':access,
        '../middleware/validationMiddleware':require('../middleware/validationMiddleware'),
        '../validations/bankInfoValidation':require('../validations/bankInfoValidation'),
        '../middleware/upload':{uploadEmployeeAttachments:upload,uploadProfilePicture:upload},'../validations/profileValidation':[],
      });
      const owner=await User.create({fullName:'Bank Owner',email:'bank-owner@example.invalid',role:'employee',status:'active'});
      const other=await User.create({fullName:'Bank Other',email:'bank-other@example.invalid',role:'manager',status:'active'});
      const adminAccount=await User.create({fullName:'Bank Admin',email:'bank-admin@example.invalid',role:'admin',status:'active'});
      const headers=user=>({'Content-Type':'application/json',Authorization:'Bearer '+jwt.sign({id:user.id,role:user.role,sessionVersion:0},secret)});
      const app=express();app.use(express.json());app.use('/api/employee',auth.authenticate,router);
      const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
      const base=`http://127.0.0.1:${server.address().port}/api/employee/${owner.id}`;
      const payload={bankName:'Synthetic Bank',accountTitle:'Synthetic Owner',accountNumber:'0000000000',IBAN:'PK00TEST0000000000000000'};
      try{
        assert.equal((await fetch(base+'/add-bank-details',{method:'POST',headers:headers(owner),body:JSON.stringify(payload)})).status,200);
        assert.equal((await fetch(base+'/update-bank-details',{method:'PUT',headers:headers(owner),body:JSON.stringify({bankName:'Synthetic Updated'})})).status,200);
        for(const [method,endpoint,body] of [['GET','get-bank-details'],['POST','add-bank-details',payload],['PUT','update-bank-details',{bankName:'Denied'}]]){
          assert.equal((await fetch(base+'/'+endpoint,{method,headers:headers(other),...(body?{body:JSON.stringify(body)}:{})})).status,403);
        }
        assert.equal((await fetch(base+'/update-bank-details',{method:'PUT',headers:headers(adminAccount),body:JSON.stringify({bankName:'Admin Updated'})})).status,200);
        const result=await(await fetch(base+'/get-bank-details',{headers:headers(owner)})).json();
        assert.equal(result.data.bankName,'Admin Updated');assert.equal(result.data.IBAN,payload.IBAN);assert.equal(result.data.accountNumber,payload.accountNumber);
        assert.equal(await UserBankInfo.count({where:{userId:owner.id}}),1);
      }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    });
    await t.test('payroll finalization competes safely with deletion and retains prior audit entries',async()=>{
      const PayrollPeriod=require('../models/payrollPeriod')(db,DataTypes);
      const EmployeePayroll=require('../models/employeePayroll')(db,DataTypes);
      const controller=load('controllers/payrollController.js',{
        '../models':{PayrollPeriod,EmployeePayroll,User,sequelize:db,PayrollAdjustment:{}},
        sequelize:Sequelize,'../utils/payrollService':{},
      });
      const period=await PayrollPeriod.create({name:'Synthetic finalization',start_date:'2026-01-01',end_date:'2026-01-31',payroll_type:'monthly',status:'reviewed',created_by:old.id,audit_log:[{action:'Synthetic review'}]});
      const row=await EmployeePayroll.create({payroll_period_id:period.id,employee_id:old.id,gross_salary:'100.00',total_deductions:'0.00',net_salary:'100.00',snapshot:{synthetic:true},status:'reviewed'});
      const req={params:{id:period.id},user:{id:old.id,fullName:'Synthetic Admin'}};
      const approved=response();await controller.approvePayrollPeriod(req,approved);assert.equal(approved.code,200);
      const finalized=await PayrollPeriod.findByPk(period.id,{attributes:{include:['audit_log']}});assert.equal(finalized.audit_log.length,2);assert.equal(finalized.audit_log[0].action,'Synthetic review');
      const a=response(),b=response();await Promise.all([controller.payPayrollPeriod(req,a),controller.deletePayrollPeriod(req,b)]);
      assert.equal(a.code,200);assert.equal(b.code,409);assert.ok(await EmployeePayroll.findByPk(row.id));
      const paid=await PayrollPeriod.findByPk(period.id,{attributes:{include:['audit_log']}});assert.equal(paid.audit_log.length,3);
      const competing=await PayrollPeriod.create({name:'Synthetic contention',start_date:'2026-02-01',end_date:'2026-02-28',payroll_type:'monthly',status:'reviewed',created_by:old.id});
      const child=await EmployeePayroll.create({payroll_period_id:competing.id,employee_id:old.id,gross_salary:'100',total_deductions:'0',net_salary:'100',snapshot:{synthetic:true},status:'reviewed'});
      const ca=response(),cb=response(),cr={params:{id:competing.id},user:{id:old.id}};
      await Promise.all([controller.approvePayrollPeriod(cr,ca),controller.deletePayrollPeriod(cr,cb)]);
      if(ca.code===200){assert.equal(cb.code,409);assert.ok(await EmployeePayroll.findByPk(child.id));}
      else{assert.equal(ca.code,404);assert.equal(cb.code,200);assert.equal(await PayrollPeriod.findByPk(competing.id),null);}
      const clientController=load('controllers/clientController.js',{
        bcryptjs:require('bcryptjs'),crypto:require('node:crypto'),sequelize:Sequelize,
        '../models':{User,EmployeePayroll},'express-validator':require('express-validator'),
        nodemailer:{createTransport:()=>({})},'../utils/pagination':{},'../config/runtimeSafety':require('../config/runtimeSafety'),
      });
      const former=await User.create({fullName:'Former employee client',email:'former@example.invalid',role:'employee',status:'active'});
      const retained=await EmployeePayroll.create({payroll_period_id:period.id,employee_id:former.id,gross_salary:'100',total_deductions:'0',net_salary:'100',snapshot:{synthetic:true},status:'paid',locked:true});
      await former.update({role:'client'});
      const denial=response();await clientController.deleteClient({params:{id:former.id},user:{role:'admin',id:old.id}},denial);
      assert.equal(denial.code,409);assert.ok(await User.findByPk(former.id));assert.ok(await EmployeePayroll.findByPk(retained.id));
      const ordinary=await User.create({fullName:'Ordinary client',email:'ordinary@example.invalid',role:'client',status:'active'});
      const deletion=response();await clientController.deleteClient({params:{id:ordinary.id},user:{role:'admin',id:old.id}},deletion);
      assert.equal(deletion.code,200);assert.equal(await User.findByPk(ordinary.id),null);
    });
    await t.test('rollback preserves baseline rows; re-upgrade reinstates enforcement',async()=>{
      for(const migration of [...additions].reverse())await migration.down(qi,Sequelize);
      const columns=await qi.describeTable('users');assert.equal(columns.sessionVersion,undefined);
      const baseline=await BaselineUser.findByPk(old.id);assert.ok(baseline);
      for(const migration of additions)await migration.up(qi,Sequelize);
      await db.query("UPDATE users SET status='inactive' WHERE id=?",{replacements:[old.id]});
      const [[row]]=await db.query('SELECT sessionVersion FROM users WHERE id=?',{replacements:[old.id]});assert.equal(row.sessionVersion,1);
    });
  } finally {
    if(db)await db.close();await admin.close();
  }
});
