const assert=require('node:assert/strict'),{randomUUID}=require('crypto'),{Sequelize}=require('sequelize');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{
 const api='http://127.0.0.1:13481',ui='http://127.0.0.1:13480';
 const {schema}=await(await fetch(api+'/__fixture')).json();assert.match(schema,/^hrm_browser_\d+$/);
 const db=new Sequelize(schema,'root','',{host:'127.0.0.1',port:13479,dialect:'mysql',logging:false});
 const browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
 try{
  const p=await browser.newPage();p.setDefaultTimeout(15000);await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await p.goto(ui+'/login');await p.locator('#email').fill('admin@example.invalid');await p.locator('#password').fill('Synthetic-local-123');await p.getByRole('button',{name:/sign in/i}).click();await p.waitForURL('**/admin/dashboard');
  const token=await p.evaluate(()=>localStorage.getItem('token')),headers={Authorization:'Bearer '+token},url=id=>api+'/api/organization/employee/'+id+'/official-managers';
  const get=async(id,before)=>{const r=await p.request.get(url(id)+(before?'?before='+before:''),{headers});assert.equal(r.status(),200,await r.text());return(await r.json()).data;};
  const post=(id,managerIds,version,extra={})=>p.request.post(url(id),{headers,data:{commandKey:randomUUID(),expectedVersion:version,managerIds,reason:'Synthetic reporting decision',...extra}});
  const [[primaryBefore]]=await db.query('SELECT COUNT(*) total FROM organization_assignments');
  assert.equal((await get(2)).assignment,null);assert.equal((await post(2,[2],0)).status(),400);assert.equal((await post(2,[3,3],0)).status(),400);assert.equal((await post(2,[4],0)).status(),400);
  const key=randomUUID(),batch=await Promise.all([post(2,[3,5],0,{commandKey:key}),post(2,[5,3],0,{commandKey:key})]);for(const r of batch)assert.equal(r.status(),200,await r.text());
  assert.deepEqual((await get(2)).assignment.managerIds,[3,5]);assert.equal((await post(2,[3],0)).status(),409);assert.equal((await post(2,[3],1,{commandKey:key})).status(),409);
  assert.equal((await post(3,[8],0)).status(),200);assert.equal((await post(8,[2],0)).status(),409);
  const hierarchy=(await get(2)).hierarchy;assert.deepEqual(hierarchy.map(n=>n.accountId).sort((a,b)=>a-b),[3,5,8]);assert.equal(hierarchy.find(n=>n.accountId===8).configured,false);assert.deepEqual(hierarchy.find(n=>n.accountId===3).managerIds,[8]);
  const reciprocal=await Promise.all([post(11,[14],0),post(14,[11],0)]);assert.deepEqual(reciprocal.map(r=>r.status()).sort(),[200,409]);
  await p.goto(ui+'/admin/employees/2/organization');await p.getByRole('link',{name:'Official reporting managers'}).click();await p.getByText('Official set version 1',{exact:true}).waitFor();
  await p.getByRole('button',{name:'Remove manager 5',exact:true}).click();await p.getByLabel('Reason',{exact:true}).fill('Synthetic browser correction');
  let dropped=0;await p.route('**/api/organization/employee/2/official-managers',async r=>{if(r.request().method()==='POST'&&dropped<2){dropped++;await r.fetch();await r.abort();}else await r.continue();});
  await p.getByRole('button',{name:'Save official managers',exact:true}).click();await p.getByRole('button',{name:'Retry retained change',exact:true}).waitFor();assert.equal(dropped,2);
  await p.reload();await p.getByRole('button',{name:'Retry retained change',exact:true}).click();await p.getByText('Saved earlier; no duplicate history added.').waitFor();assert.equal((await get(2)).history.length,2);
  assert.deepEqual((await get(2)).assignment.managerIds,[3]);
  let version=2;for(let i=0;i<26;i++){const r=await post(2,i%2?[3]:[3,5],version,{reason:'Synthetic history '+i});assert.equal(r.status(),200,await r.text());version++;}
  const first=await get(2);assert.equal(first.history.length,25);assert.equal(first.hasEarlierHistory,true);assert.equal((await get(2,first.history.at(-1).version)).history.length,3);
  await p.reload();await p.getByRole('button',{name:'Earlier history',exact:true}).click();await p.getByText('Synthetic browser correction',{exact:true}).waitFor();
  const [[primaryAfter]]=await db.query('SELECT COUNT(*) total FROM organization_assignments');assert.equal(primaryBefore.total,primaryAfter.total);
  const [[links]]=await db.query('SELECT COUNT(*) total FROM official_manager_links WHERE employeeId=2');assert.equal(Number(links.total),1);
  const denied=await p.request.get(url(2));assert.equal(denied.status(),401);
  const login=await p.request.post(api+'/api/auth/login',{data:{email:'employee@example.invalid',password:'Synthetic-local-123'}});const auth=await login.json();const employeeToken=auth.token||auth.data?.token;assert.ok(employeeToken,'Employee login token');assert.equal((await p.request.get(url(2),{headers:{Authorization:'Bearer '+employeeToken}})).status(),403);
  await assert.rejects(db.query('DELETE FROM users WHERE id=3'),/foreign key constraint/i);
  console.log('PASS explicit multiple managers, no primary backfill, self/duplicate/client rejection, CAS/actor-bound command replay, reciprocal cycle serialization, actual organization entry, uncertain-save retained retry, 28-version paged history, current-link FK retention and employee denial.');
 }finally{await browser.close();await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
