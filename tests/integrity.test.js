const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { load, response } = require('./helpers/controller');

test('caller-selected registration roles require authentication and admin before creation', () => {
  const routes=[];const authenticated=()=>{},admin=()=>{},validate=()=>{},create=()=>{};
  load('routes/authRoutes.js',{
    express:{Router:()=>({post:(url,...handlers)=>routes.push({url,handlers}),get:()=>{},use:()=>{}})},
    '../controllers/authController':{isAuthenticated:authenticated,isAdmin:admin,validateRegister:validate,register:create},
  });
  const route=routes.find(r=>r.url==='/register');
  assert.deepEqual(route.handlers,[authenticated,admin,validate,create]);
});

test('account model hashes password changes without assigning a stale session counter', async () => {
  const { Sequelize, DataTypes } = require('sequelize');
  const sequelize = new Sequelize('synthetic', 'synthetic', 'synthetic', {dialect:'mysql',logging:false});
  const User = require('../models/user')(sequelize,DataTypes);
  for (const field of ['role','status','password','fullName']) {
    const user = User.build({id:1,fullName:'Synthetic',email:'test@example.invalid',role:'employee',status:'active',sessionVersion:4}, {isNewRecord:false});
    for (const initialField of user.changed() || []) user.changed(initialField, false);
    user.set(field, {role:'manager',status:'inactive',password:'synthetic-password',fullName:'Renamed'}[field]);
    await User.runHooks('beforeUpdate',user,{});
    assert.equal(user.sessionVersion,4);
    if (field === 'password') assert.equal(await user.comparePassword('synthetic-password'), true);
  }
  await sequelize.close();
});

test('missing JWT secret fails closed and session migration has reversible schema operations', async () => {
  assert.throws(()=>load('config/jwtSecret.js',{}),/must be configured/);
  const calls=[];
  const migration=require('../migrations/20261105000000-add-session-version');
  await migration.up({addColumn:async(...args)=>calls.push(args)},{INTEGER:'INTEGER'});
  await migration.down({removeColumn:async(...args)=>calls.push(args)});
  assert.equal(calls[0][0],'users');assert.equal(calls[0][1],'sessionVersion');
  assert.equal(calls[0][2].defaultValue,0);assert.equal(calls[0][2].allowNull,false);
  assert.deepEqual(calls[1],['users','sessionVersion']);
});

test('signed sessions honor current status, role, version and deleted accounts', async () => {
  let account = {id:1,role:'employee',status:'active',sessionVersion:0};
  const secret = 'synthetic-test-key';
  const { authenticate } = load('middleware/authMiddleware.js', {
    jsonwebtoken: jwt, '../config/jwtSecret': secret,
    '../models': { User: { findByPk: async () => account } },
  });
  const token = jwt.sign({id:1,role:'employee'}, secret);
  async function check(expected) {
    const res = response(); let called = false;
    await authenticate({ headers: {authorization:`Bearer ${token}`}, query:{} }, res, () => { called = true; });
    assert.equal(called, expected);
    assert.equal(res.code, expected ? 200 : 401);
  }
  await check(true); // Legacy tokens remain valid only at version zero.
  account.status = 'inactive'; await check(false);
  account.status = 'active'; account.role = 'admin'; await check(false);
  account.role = 'employee'; account.sessionVersion = 1; await check(false);
  account = null; await check(false);
});

test('deactivation retains records and changes only account status', async () => {
  let saved = false; let committed = false;
  const transaction = {commit:async()=>{committed=true;}, rollback:async()=>assert.fail()};
  const user = {id:2, role:'employee',status:'active',save:async opts=>{assert.equal(opts.transaction,transaction);saved=true;},destroy:()=>assert.fail('Employee history deleted')};
  const controller = load('controllers/employeeController.js', {
    '../middleware/employeeAccess': require('../middleware/employeeAccess'),
    '../models': { User: {findByPk:async()=>user,sequelize:{transaction:async()=>transaction}}, UserInfo:{},UserBankInfo:{} },
    sequelize:{Op:{}},'express-validator':{},path:{},'../utils/pagination':{},
  });
  const res = response(); await controller.deactivateUser({params:{userId:2},user:{id:1}},res);
  assert.equal(res.code,200); assert.ok(saved && committed); assert.equal(user.status,'inactive');
});

test('finalized payroll deletion denied under the same period lock as transitions', async () => {
  let status = 'paid', child = null, destroyed = false;
  const tx = {LOCK:{UPDATE:'UPDATE'}};
  const controller = load('controllers/payrollController.js', {
    '../models': {
      PayrollPeriod:{findByPk:async(id,opts)=>{assert.equal(opts.lock,'UPDATE'); assert.equal(opts.transaction,tx);return {status,destroy:async()=>{destroyed=true;}};}},
      EmployeePayroll:{findOne:async()=>child}, PayrollAdjustment:{},
      sequelize:{transaction:async fn=>fn(tx)},
    }, sequelize:{Op:{or:Symbol('or'),in:Symbol('in')}}, '../utils/payrollService':{},
  });
  for (const state of ['approved','paid']) {
    status=state; const res=response();await controller.deletePayrollPeriod({params:{id:1}},res);
    assert.equal(res.code,409);assert.equal(destroyed,false);
  }
  status='draft';child={locked:true};let res=response();await controller.deletePayrollPeriod({params:{id:1}},res);assert.equal(res.code,409);
  child=null;res=response();await controller.deletePayrollPeriod({params:{id:1}},res);assert.equal(res.code,200);assert.equal(destroyed,true);
});

test('competing approvals recheck remaining quota after acquiring employee lock', async () => {
  // Model transaction serialization; actual MySQL isolation still needs staging verification.
  let queue = Promise.resolve(), used=0;
  const tx = {LOCK:{UPDATE:'UPDATE'}};
  const requests = Object.fromEntries([1,2].map(id=>[id,{userId:3,leaveTypeId:1,status:'pending',totalDays:3,
    update:async function(values,opts){assert.equal(opts.transaction,tx);Object.assign(this,values);used+=3;},
  }]));
  const controller = load('controllers/leaveController.js', {
    '../models': {
      LeaveRequest:{
        findByPk:async id=>requests[id],
        sum:async(field,opts)=>{assert.equal(opts.transaction,tx);return used;},
        sequelize:{transaction:fn=>{const job=queue.then(()=>fn(tx));queue=job.catch(()=>{});return job;}},
      },
      User:{findByPk:async(id,opts)=>{assert.equal(id,3);assert.equal(opts.lock,'UPDATE');return {id};}},
      LeaveType:{findByPk:async()=>({status:'active',annual_quota:5})},
    }, sequelize:{Op:{gte:Symbol('gte'),lte:Symbol('lte')}},'../utils/pagination':{},
  });
  const a=response(),b=response();
  await Promise.all([controller.approveLeave({params:{id:1},user:{id:9}},a),controller.approveLeave({params:{id:2},user:{id:9}},b)]);
  assert.equal(a.code,200);assert.equal(b.code,409);assert.equal(used,3);assert.equal(requests[2].status,'pending');
});

for (const first of ['approveLeave', 'rejectLeave']) {
  test(`${first} wins once when approval and rejection compete`, async () => {
    let queue=Promise.resolve(), writes=0, committed=0;
    const tx={LOCK:{UPDATE:'UPDATE'}}, locks=[];
    const request={userId:3,leaveTypeId:1,status:'pending',totalDays:1,
      async update(values,opts){assert.equal(opts.transaction,tx);writes++;Object.assign(this,values);},
    };
    const controller=load('controllers/leaveController.js',{
      '../models':{
        User:{findByPk:async(id,opts)=>{locks.push('user');assert.equal(opts.lock,'UPDATE');return {id};}},
        LeaveRequest:{findByPk:async(id,opts)=>{if(opts){locks.push('request');assert.equal(opts.lock,'UPDATE');}return request;},
          sequelize:{transaction:fn=>{const job=queue.then(async()=>{const result=await fn(tx);committed++;return result;});queue=job.catch(()=>{});return job;}},
        },
        LeaveType:{findByPk:async()=>({status:'active',annual_quota:0})},
      },sequelize:{Op:{}},'../utils/pagination':{},
    });
    const second=first==='approveLeave'?'rejectLeave':'approveLeave';
    const a=response(),b=response();
    const req={params:{id:1},user:{id:9},body:{rejectionReason:'Synthetic rejection'}};
    await Promise.all([controller[first](req,a),controller[second](req,b)]);
    assert.equal(a.code,200);assert.equal(b.code,400);assert.equal(writes,1);assert.equal(committed,2);
    assert.equal(request.status,first==='approveLeave'?'approved':'rejected');
    assert.deepEqual(locks,['user','request','user','request']);
  });
}
