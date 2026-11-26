const test=require('node:test'),assert=require('node:assert/strict'),scope=require('../middleware/hrDomainScope');
test('HR decision routes allow only exact scoped operations, preserving administration denial',()=>{
 const call=(method,path)=>{let next=false,status;scope({method,path,user:{role:'hr'}},{status(n){status=n;return this;},json(){return this;}},()=>{next=true;});return{next,status};};
 for(const [method,path] of [['GET','/probation-decisions/access'],['GET','/probation-decisions/employee/2'],['POST','/probation-decisions/employee/2/commands']])assert.equal(call(method,path).next,true);
 for(const [method,path] of [['GET','/probation-decisions/accounts'],['GET','/probation-decisions/permissions/3/2'],['POST','/probation-decisions/permissions/commands'],['GET','/probation-decisions/employee/0'],['GET','/probation-decisions/employee/2/extra'],['DELETE','/probation-decisions/employee/2'],['GET','/probation'],['POST','/probation/employee/2/commands'],['GET','/payroll']])assert.deepEqual(call(method,path),{next:false,status:403},method+' '+path);
});
