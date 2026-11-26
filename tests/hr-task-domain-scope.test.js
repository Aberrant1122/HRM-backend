const test=require('node:test'),assert=require('node:assert/strict'),scope=require('../middleware/hrDomainScope');
const probe=(method,path)=>{let pass=false,status;scope({method,path,user:{role:'hr'}},{status(n){status=n;return this;},json(){return this;}},()=>{pass=true;});return{pass,status};};
test('HR task exception is limited to own tasks, granted review and private receipt transports',()=>{
 for(const path of ['/hr-tasks/access','/hr-tasks/mine','/hr-tasks/mine/12','/hr-tasks/review','/hr-tasks/review/12','/hr-tasks/notices'])assert.equal(probe('GET',path).pass,true);
 for(const path of ['/hr-tasks/mine/commands','/hr-tasks/review/commands','/hr-tasks/notices/12345678-1234-4123-8123-123456789abc/read'])assert.equal(probe('POST',path).pass,true);
 for(const [method,path]of [['GET','/hr-tasks'],['GET','/hr-tasks/12'],['GET','/hr-tasks/12/deadlines'],['POST','/hr-tasks/commands'],['POST','/hr-tasks/notices'],['POST','/hr-tasks/approval-permissions/commands'],['GET','/hr-tasks/approval-permissions/3'],['GET','/hr-tasks/approval-accounts'],['POST','/hr-tasks/mine/12'],['GET','/hr-tasks/mine/12/extra'],['GET','/organization/department-structures'],['GET','/payroll']])assert.deepEqual(probe(method,path),{pass:false,status:403},method+' '+path);
});
