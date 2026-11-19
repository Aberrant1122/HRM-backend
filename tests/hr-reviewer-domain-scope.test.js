const test=require('node:test'),assert=require('node:assert/strict'),scope=require('../middleware/hrDomainScope');
function allowed(method,path){let pass=false,status;scope({method,path,user:{role:'hr'}},{status(n){status=n;return this;},json(){return this;}},()=>{pass=true;});return{pass,status};}
test('HR reviewer exception admits only exact assigned-reviewer transport routes',()=>{
 for(const path of ['/performance/reviewer','/performance/reviewer/','/performance/reviewer/evaluation/12','/performance/reviewer/evaluation/12/'])assert.equal(allowed('GET',path).pass,true);
 assert.equal(allowed('POST','/performance/reviewer/evaluation/12/feedback').pass,true);
 for(const [method,path]of [['GET','/performance/forms'],['GET','/performance/employee/2'],['GET','/performance/evaluation/12'],['POST','/performance/employee/2/commands'],['POST','/performance/reviewer'],['DELETE','/performance/reviewer/evaluation/12'],['GET','/performance/reviewer/evaluation/12/feedback'],['GET','/performance/reviewer-extra'],['POST','/performance/reviewer/evaluation/12/feedback/extra'],['GET','/organization'],['GET','/payroll']])assert.deepEqual(allowed(method,path),{pass:false,status:403},method+' '+path);
});
