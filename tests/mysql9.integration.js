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
        await require(path.join(__dirname,'../migrations',file)).up(qi,Sequelize);
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
    const LeaveRequest=require('../models/leaveRequest')(db,DataTypes);
    const LeaveType=require('../models/leaveType')(db,DataTypes);
    await t.test('existing baseline password still logs in after upgrade and returns a valid session',async()=>{
      const jwt=require('jsonwebtoken'),secret='synthetic-upgrade-login';
      const middleware=load('middleware/authMiddleware.js',{'../models':{User},'../config/jwtSecret':secret,jsonwebtoken:jwt});
      const auth=load('controllers/authController.js',{
        bcryptjs:require('bcryptjs'),jsonwebtoken:jwt,crypto:require('node:crypto'),sequelize:Sequelize,
        '../models':{User},'express-validator':require('express-validator'),
        nodemailer:{createTransport:()=>({sendMail:async()=>assert.fail('Unexpected external mail')})},
        '../config/jwtSecret':secret,'../middleware/authMiddleware':middleware,
      });
      const res=response();await auth.login({body:{email:old.email,password:'legacy-password'}},res);
      assert.equal(res.code,200);assert.equal(jwt.verify(res.body.token,secret).sessionVersion,0);
      let accepted=false;await middleware.authenticate({headers:{authorization:`Bearer ${res.body.token}`},query:{}},response(),()=>{accepted=true;});
      assert.ok(accepted);
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
