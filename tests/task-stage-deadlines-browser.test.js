const assert=require('node:assert/strict'),{randomUUID}=require('crypto'),{chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{
 const ui='http://127.0.0.1:13694',api='http://127.0.0.1:13695/api/hr-tasks',browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
 try{
  async function login(role){
   const p=await browser.newPage();p.setDefaultTimeout(15000);await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
   await p.goto(ui+'/login');await p.locator('#email').fill(role+'@example.invalid');await p.locator('#password').fill('Synthetic-local-123');await p.getByRole('button',{name:/sign in/i}).click();await p.waitForURL('**/'+role+'/dashboard');return {p,h:{Authorization:'Bearer '+await p.evaluate(()=>localStorage.getItem('token'))}};
  }
  const admin=await login('admin'),employee=await login('employee'),manager=await login('manager');
  const post=(path,data,h=admin.h)=>admin.p.request.post(api+path,{headers:h,data});
  const ok=async r=>{assert.equal(r.status(),200,await r.text());return (await r.json()).data;};
  const create=async payload=>(await ok(await post('/commands',{action:'create',commandKey:randomUUID(),expectedVersion:0,reason:'Synthetic stage acceptance',title:'Synthetic stages '+Date.now(),description:'Synthetic task',assigneeId:2,departmentId:null,dueDate:null,...payload}))).task;
  const task=await create({dueDate:'2020-01-01'}),overdue=async(date,id)=>(await ok(await admin.p.request.get(api+'/?overdue=1&asOf='+date,{headers:admin.h}))).rows.some(r=>r.id===id);
  assert.equal(await overdue('2032-04-06',task.id),false);
  const dashboardUrl=api.replace('/hr-tasks','/dashboard/hr-tasks');
  const dashboardBefore=await ok(await admin.p.request.get(dashboardUrl,{headers:admin.h}));assert.ok(dashboardBefore.counts.undated>=1);assert.equal(dashboardBefore.rows.find(r=>r.id===task.id).submissionDueDate,null);
  const notice=(asOf,target,overrides={})=>({id:randomUUID(),taskId:task.id,expectedVersion:task.version,expectedDeadlineVersion:0,asOf,...(target&&{approvalRecipientId:target}),...overrides});
  assert.equal((await post('/notices',notice('2032-04-06'))).status(),409);
  await admin.p.goto(ui+'/admin/hr-tasks');await admin.p.getByRole('button',{name:'Open HR task '+task.id,exact:true}).click();
  const stage=admin.p.getByRole('region',{name:'Stage deadlines'});await stage.getByLabel('Submission deadline').fill('2032-04-01');await stage.getByLabel('Approval deadline').fill('2032-04-05');await stage.getByLabel('Reason for stage dates').fill('Explicit independent dates');
  await stage.getByRole('button',{name:'Save stage deadlines'}).click();await stage.getByText(/Explicit independent dates/).waitFor();
  assert.equal(await overdue('2032-04-01',task.id),false);assert.equal(await overdue('2032-04-02',task.id),true);
  await ok(await post('/notices',notice('2032-04-02',null,{expectedDeadlineVersion:1})));
  const dashboardAfter=await ok(await admin.p.request.get(dashboardUrl,{headers:admin.h}));assert.equal(dashboardAfter.counts.undated,dashboardBefore.counts.undated-1);assert.equal(dashboardAfter.rows.find(r=>r.id===task.id).approvalDueDate,'2032-04-05');
  const submit={action:'submit',taskId:task.id,expectedVersion:1,reason:'Ready for review',commandKey:randomUUID()};
  await ok(await post('/mine/commands',submit,employee.h));assert.equal(await overdue('2032-04-05',task.id),false);assert.equal(await overdue('2032-04-06',task.id),true);
  const grant=(version,active)=>post('/approval-permissions/commands',{userId:3,expectedVersion:version,active,reason:'Synthetic independent approver',commandKey:randomUUID()});
  const approval=(id,day='2032-04-06')=>notice(day,id,{expectedVersion:2,expectedDeadlineVersion:1});
  assert.equal((await post('/notices',approval(3))).status(),409);await ok(await grant(0,true));assert.equal((await post('/notices',approval(2))).status(),409);
  await admin.p.reload();await admin.p.getByRole('button',{name:'Open HR task '+task.id,exact:true}).click();const form=admin.p.getByRole('form',{name:'Send overdue notice'});
  await form.getByLabel('Find approval recipient').fill('Synthetic Manager');await form.getByRole('button',{name:'Search approval recipient'}).click();await form.getByRole('combobox',{name:'Approval recipient',exact:true}).selectOption('3');
  await form.getByLabel('Overdue review date').fill('2032-04-06');await form.getByRole('button',{name:'Send in-app notice'}).click();await form.getByText('Approval notice delivered').waitFor();
  const notices=await ok(await manager.p.request.get(api+'/notices',{headers:manager.h}));assert.ok(notices.rows.some(n=>n.taskId===task.id&&n.stage==='approval'&&n.dueDate==='2032-04-05'));
  await ok(await grant(1,false));assert.equal((await post('/notices',approval(3,'2032-04-07'))).status(),409);await ok(await grant(2,true));
  const edit={taskVersion:2,expectedVersion:1,submissionDueDate:'2032-04-01',approvalDueDate:'2032-04-07',reason:'Extended review',commandKey:randomUUID()};
  const replays=await Promise.all([post('/'+task.id+'/deadlines',edit),post('/'+task.id+'/deadlines',edit)]);assert.equal((await ok(replays[0])).version,(await ok(replays[1])).version);
  assert.equal((await post('/'+task.id+'/deadlines',{...edit,commandKey:randomUUID()})).status(),409);
  const approved=await post('/review/commands',{action:'approve',taskId:task.id,expectedVersion:2,reason:'Independent approval still works',commandKey:randomUUID()},manager.h);assert.equal(approved.status(),200,await approved.text());
  assert.equal(await overdue('2032-04-10',task.id),false);
  const explicit=await create({submissionDueDate:'2032-05-01',approvalDueDate:'2032-05-03'});assert.equal(explicit.submissionDueDate,'2032-05-01');assert.equal(explicit.approvalDueDate,'2032-05-03');
  console.log('PASS unclassified legacy dates, two explicit deadlines, stage-specific boundaries, recipient selection, grant revocation and self exclusion, pending stage revision with unchanged submission, concurrent retry and final approval.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
