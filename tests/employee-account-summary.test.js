const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load,response}=require('./helpers/controller');

test('global account buckets reconcile without inferring workforce or leave',async()=>{
  const controller=load('controllers/employeeAccountSummaryController.js',{'../models':{
    User:{count:async options=>{
      assert.deepEqual(options.where[require('sequelize').Op.or],[{role:'employee'},{role:'hr',retainedEmployeeMembership:true}]);assert.equal(options.group[0],'status');assert.equal(options.limit,undefined);
      return [{status:'active',count:'15'},{status:'inactive',count:2},{status:'suspended',count:3},{status:'legacy',count:1}];
    }},
    Department:{count:async options=>{assert.equal(options.where.isActive,true);return 7;}},
  }});
  const res=response();await controller.getEmployeeAccountSummary({},res);
  assert.equal(res.code,200);assert.equal(res.body.data.counts.total,21);
  assert.equal(res.body.data.counts.active,15);assert.equal(res.body.data.counts.inactive,2);
  assert.equal(res.body.data.counts.suspended,3);assert.equal(res.body.data.counts.unknown,1);
  assert.match(res.body.data.scope.basis,/audited employee-to-HR/);assert.equal(res.body.data.scope.pagination,'all-pages');
  assert.equal(res.body.data.departments.activeConfigurations,7);
  assert.equal(res.headers['Cache-Control'],'private, no-store');
  assert.equal(res.body.data.onLeave,undefined);
});

test('failed aggregates remain unavailable rather than being reported as zero',async()=>{
  const controller=load('controllers/employeeAccountSummaryController.js',{'../models':{
    User:{count:async()=>{throw Error('Synthetic database error');}},Department:{count:async()=>0},
  }});
  const res=response();await controller.getEmployeeAccountSummary({},res);
  assert.equal(res.code,500);assert.equal(res.body.success,false);assert.equal(res.body.data,undefined);
});
