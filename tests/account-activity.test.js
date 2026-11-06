const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load,response}=require('./helpers/controller');

test('account activity rejects missing, structured and invalid calendar dates before querying',async()=>{
  const controller=load('controllers/accountActivityController.js',{'../models':{},sequelize:{Op:{}}});
  for(const date of [undefined,['2026-01-01'],'2026-02-30','2026-1-01','0000-01-01','2026-01-01T00:00:00Z']){
    const res=response();await controller.getAccountActivity({query:{date}},res);assert.equal(res.code,400);
  }
});

test('account activity keeps explicit date, account scope and distinct record status groups without leaking failures',async()=>{
  const calls=[],Op={lte:Symbol(),gte:Symbol()};
  let fail=false;
  const controller=load('controllers/accountActivityController.js',{
    '../models':{User:{},Attendance:{count:async options=>{calls.push(options);if(fail)throw Error('private-database-detail');return options.group?[{status:'present',count:2},{status:'legacy',count:1}]:3;}},
      LeaveRequest:{count:async options=>{calls.push(options);return options.distinct?1:4;}}},sequelize:{Op},
  });
  const res=response();await controller.getAccountActivity({query:{date:'2024-02-29'}},res);
  assert.equal(res.headers['Cache-Control'],'private, no-store');
  assert.equal(res.body.data.date,'2024-02-29');assert.equal(res.body.data.scope.accountStatuses,'all');
  assert.equal(res.body.data.attendance.distinctAccountsByRecordedStatus.legacy,1);
  assert.equal(res.body.data.approvedLeaveAccounts,1);assert.equal(res.body.data.pendingLeaveRequests,4);
  for(const options of calls){assert.equal(options.include[0].where.role,'employee');assert.equal(options.include[0].required,true);}
  assert.equal(calls[2].where.startDate[Op.lte],'2024-02-29');assert.equal(calls[2].col,'userId');
  assert.equal(calls[3].where.startDate,undefined);
  fail=true;const failed=response();await controller.getAccountActivity({query:{date:'2026-01-01'}},failed);
  assert.equal(failed.code,500);assert.equal(JSON.stringify(failed.body).includes('private-database-detail'),false);
});
