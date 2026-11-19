const assert=require('node:assert/strict'),{randomUUID}=require('crypto'),{chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{
 const api='http://127.0.0.1:13481/api',ui='http://127.0.0.1:13480',browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
 try{
  const p=await browser.newPage();p.setDefaultTimeout(15000);await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await p.goto(ui+'/login');await p.locator('#email').fill('admin@example.invalid');await p.locator('#password').fill('Synthetic-local-123');await p.getByRole('button',{name:/sign in/i}).click();await p.waitForURL('**/admin/dashboard');
  const headers={Authorization:'Bearer '+await p.evaluate(()=>localStorage.getItem('token'))},post=(path,b)=>p.request.post(api+path,{headers,data:{commandKey:randomUUID(),reason:'Synthetic official reviewer source',...b}}),read=async path=>{const r=await p.request.get(api+path,{headers});assert.equal(r.status(),200,await r.text());return(await r.json()).data;};
  const org='/organization/employee/2/official-managers',commands='/performance/employee/2/commands';
  assert.equal((await post(org,{expectedVersion:0,managerIds:[3,5]})).status(),200);
  const form=(await(await post('/performance/forms',{name:'Synthetic official review',questions:['Recorded response']})).json()).data.record;
  const create={action:'create',expectedVersion:0,formId:form.id,cycle:'custom',periodStart:'2032-01-01',periodEnd:'2032-01-31',dueDate:'2032-02-01',reviewerId:3};
  assert.equal((await post(commands,create)).status(),409);assert.equal((await post(commands,{...create,reviewerId:1,reportingSetVersion:1})).status(),409);
  await p.goto(ui+'/admin/employees/2/performance');const schedule=p.getByRole('form',{name:'Schedule evaluation'});
  await schedule.getByLabel('Evaluation form',{exact:true}).selectOption(String(form.id));await schedule.getByLabel('Cadence',{exact:true}).selectOption('custom');
  for(const [name,value]of [['Period start','2032-01-01'],['Period end','2032-01-31'],['Evaluation due date','2032-02-01']])await schedule.getByLabel(name,{exact:true}).fill(value);
  await schedule.getByLabel('Designated reviewer',{exact:true}).selectOption('3');await schedule.getByLabel('Schedule reason',{exact:true}).fill('Synthetic browser official assignment');await schedule.getByRole('button',{name:'Schedule evaluation',exact:true}).click();
  await p.getByText('Official manager #3 selected from reporting set version 1.',{exact:true}).waitFor();
  const list=await read('/performance/employee/2'),id=list.rows[0].id;let detail=await read('/performance/evaluation/'+id);assert.equal(detail.evaluation.reviewerId,3);assert.deepEqual(detail.history[0].details.officialReportingAssignment,{employeeId:2,managerId:3,reportingSetVersion:1,managerIds:[3,5]});
  assert.equal((await post(org,{expectedVersion:1,managerIds:[1,5]})).status(),200);detail=await read('/performance/evaluation/'+id);assert.equal(detail.evaluation.reviewerId,3,'Reporting change must not silently reassign evaluation');
  const reschedule={action:'reschedule',evaluationId:id,expectedVersion:1,cycle:'custom',periodStart:'2032-01-01',periodEnd:'2032-01-31',dueDate:'2032-02-01',reviewerId:1};
  assert.equal((await post(commands,{...reschedule,reportingSetVersion:1})).status(),409);assert.equal((await post(commands,{...reschedule,reviewerId:3,reportingSetVersion:2})).status(),409);
  const key=randomUUID(),assigned=await post(commands,{...reschedule,reportingSetVersion:2,commandKey:key});assert.equal(assigned.status(),200,await assigned.text());assert.equal((await(await post(commands,{...reschedule,reportingSetVersion:2,commandKey:key})).json()).replayed,true);
  const login=await p.request.post(api+'/auth/login',{data:{email:'manager@example.invalid',password:'Synthetic-local-123'}}),managerToken=(await login.json()).token;
  assert.equal((await p.request.get(api+'/performance/reviewer/evaluation/'+id,{headers:{Authorization:'Bearer '+managerToken}})).status(),404);
  detail=await read('/performance/evaluation/'+id);assert.equal(detail.history.length,2);assert.equal(detail.history[0].details.officialReportingAssignment.reportingSetVersion,2);assert.equal(detail.history[1].details.officialReportingAssignment.reportingSetVersion,1);
  console.log('PASS actual official-manager choice and retained source attribution, nonmember/missing/stale source rejection, no automatic reviewer change, explicit reassignment/replay, prior reporting snapshot retained and former reviewer denied.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
