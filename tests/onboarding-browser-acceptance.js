const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto'),path=require('node:path');
test('direct employee manual onboarding: normal UI, denials, conflicts and lost-response retry',{timeout:180000},async()=>{
  assert.equal(process.env.HRM_DISPOSABLE_MYSQL,'1');
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
  const browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
  const context=await browser.newContext({viewport:{width:1440,height:1100},locale:'en-US',timezoneId:'America/Los_Angeles'}),api=context.request;
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());return url.hostname==='127.0.0.1'&&['13380','13381','13382'].includes(url.port)?route.continue():route.abort();
  });
  const page=await context.newPage();page.setDefaultTimeout(60000);const base='http://127.0.0.1:13381/api';
  try{
    let fixture;
    for(let i=0;;i++){try{fixture=await(await api.get('http://127.0.0.1:13381/__fixture')).json();break;}
      catch(error){if(i>=119)throw error;await new Promise(resolve=>setTimeout(resolve,250));}}
    await page.goto('http://127.0.0.1:13380/login');await page.locator('#email').fill('admin@example.invalid');await page.locator('#password').fill('Synthetic-local-123');
    await page.getByRole('button',{name:/sign in/i}).click();await page.waitForURL('**/admin/dashboard');
    const headers={Authorization:`Bearer ${await page.evaluate(()=>localStorage.getItem('token'))}`};
    await page.goto('http://127.0.0.1:13380/admin/employees/add');
    const email='manual-onboarding-'+Date.now()+'@example.invalid';await page.locator('#fullName').fill('Synthetic Direct Onboarding');
    for(const [id,value] of Object.entries({email,contactNumber:'0000000000',cnic:'00000-'+String(Date.now()%10000000).padStart(7,'0')+'-0',dob:'2000-01-01',position:'Synthetic Tester',startDate:'2026-01-01',salary:'1800'}))await page.locator('#'+id).fill(value);
    await page.getByRole('combobox').nth(0).click();await page.getByRole('option',{name:/^development$/i}).click();
    await page.getByRole('combobox').nth(1).click();await page.getByRole('option',{name:/^permanent$/i}).click();
    const invite=page.waitForResponse(response=>response.url()===base+'/auth/invite-employee'&&response.request().method()==='POST');
    await page.getByRole('button',{name:'Add Employee',exact:true}).click();const invited=await invite;
    assert.equal(invited.status(),201,await invited.text());const created=await invited.json();
    await page.getByRole('heading',{name:/Employee Added Successfully/}).waitFor();
    const endpoint=base+'/onboarding/employee/'+created.userId;
    const read=async()=>{const res=await api.get(endpoint,{headers});assert.equal(res.status(),200);return (await res.json()).data;};
    const before=(await(await api.get(base+'/employee/'+created.userId+'/user-info',{headers})).json()).data;
    assert.equal(before.status,'inactive');assert.equal((await read()).onboarding,null);
    await page.getByRole('link',{name:'Onboarding',exact:true}).click();await page.waitForURL('**/admin/onboarding');
    await page.getByLabel('Find employee for onboarding').fill(email);await page.getByRole('button',{name:'Search employees',exact:true}).click();
    await page.getByRole('link',{name:'Open checklist',exact:true}).click();
    await page.getByRole('button',{name:'Start manual checklist',exact:true}).click();
    await page.getByText('Checklist: open',{exact:true}).waitFor();
    await page.getByLabel('Item title',{exact:true}).fill('Verify employee details');await page.getByRole('button',{name:'Assign to me',exact:true}).click();
    await page.getByLabel('Due date (optional)',{exact:true}).fill('2026-12-02');await page.getByRole('button',{name:'Save change',exact:true}).click();
    let first=page.getByRole('region',{name:'Verify employee details',exact:true});await first.waitFor();assert.match(await first.innerText(),/Synthetic Admin/);
    await page.getByLabel('Item title',{exact:true}).fill('Desk orientation');await page.getByLabel('Responsible account ID (optional)',{exact:true}).fill(String(fixture.ids.employee));
    await page.getByRole('button',{name:'Save change',exact:true}).click();const second=page.getByRole('region',{name:'Desk orientation',exact:true});await second.waitFor();
    const current=await read();assert.equal(current.onboarding.version,3);assert.equal(current.history.length,3);
    for(const role of ['employee','manager','client']){
      const login=await api.post(base+'/auth/login',{data:{email:role+'@example.invalid',password:'Synthetic-local-123'}}),token=(await login.json()).token;
      const other={Authorization:`Bearer ${token}`};assert.equal((await api.get(endpoint,{headers:other})).status(),403);
      assert.equal((await api.post(endpoint+'/commands',{headers:other,data:{action:'create',expectedVersion:0,commandKey:crypto.randomUUID()}})).status(),403);
    }
    // A different admin tab edits first. The stale UI must stop, reload and require review.
    const edited=await api.post(endpoint+'/commands',{headers,data:{action:'edit_item',expectedVersion:3,commandKey:crypto.randomUUID(),itemId:current.items[0].id,title:'Verify employee details',responsibleId:fixture.ids.admin,dueDate:'2026-12-03',reason:'Updated date from another tab'}});
    assert.equal(edited.status(),200);
    await first.getByRole('button',{name:'Complete item',exact:true}).click();await page.getByLabel('Reason',{exact:true}).fill('Verified identity data');
    await page.getByRole('button',{name:'Save change',exact:true}).click();await page.getByRole('alert').filter({hasText:'Checklist changed'}).waitFor();
    assert.equal((await read()).onboarding.version,4);
    // First commit succeeds but its response is lost; same UUID is retained through reload.
    let sentKey,lost=false;
    const drop=async route=>{
      const input=route.request().postDataJSON();
      if(input.action==='complete_item'&&!lost){lost=true;sentKey=input.commandKey;const committed=await route.fetch();assert.equal(committed.status(),200);await route.abort('failed');}
      else await route.continue();
    };
    await page.route('**/api/onboarding/employee/*/commands',drop);
    await page.getByRole('button',{name:'Save change',exact:true}).click();await page.getByRole('button',{name:'Retry same change',exact:true}).waitFor();
    await page.getByRole('alert').filter({hasText:'The save outcome is uncertain'}).waitFor();
    assert.equal((await read()).onboarding.version,5);
    await page.reload();await page.getByRole('button',{name:'Retry same change',exact:true}).waitFor();
    const replayRequest=page.waitForRequest(request=>request.url()===endpoint+'/commands');
    await page.getByRole('button',{name:'Retry same change',exact:true}).click();assert.equal((await replayRequest).postDataJSON().commandKey,sentKey);
    await page.getByText('Saved earlier; no duplicate history was added.',{exact:true}).waitFor();
    assert.equal((await read()).history.length,5);await page.unroute('**/api/onboarding/employee/*/commands',drop);
    await second.getByRole('button',{name:'Waive item',exact:true}).click();await page.getByLabel('Reason',{exact:true}).fill('Orientation already completed externally');
    await page.getByRole('button',{name:'Save change',exact:true}).click();await second.getByText(/Status: waived/).waitFor();
    await page.getByRole('button',{name:'Complete checklist',exact:true}).click();await page.getByLabel('Reason',{exact:true}).fill('All manual steps reviewed');
    await page.getByRole('button',{name:'Save change',exact:true}).click();await page.getByText('Checklist: completed',{exact:true}).waitFor();
    const after=(await(await api.get(base+'/employee/'+created.userId+'/user-info',{headers})).json()).data;
    assert.equal(after.status,'inactive');assert.deepEqual(after.personalInfo,before.personalInfo);
    assert.equal((await read()).history.length,7);
    if(process.env.HRM_ACCEPTANCE_OUTPUT_DIR)await page.screenshot({path:path.join(process.env.HRM_ACCEPTANCE_OUTPUT_DIR,'HRM-manual-onboarding.png'),fullPage:true});
    await page.getByRole('button',{name:'Reopen checklist',exact:true}).click();await page.getByLabel('Reason',{exact:true}).fill('Follow-up manual review');
    await page.getByRole('button',{name:'Save change',exact:true}).click();await page.getByText('Checklist: open',{exact:true}).waitFor();
    assert.equal((await read()).history.length,8);assert.ok((await read()).history.some(event=>event.details.reason==='All manual steps reviewed'));
    assert.equal((await api.delete(base+'/employee/'+created.userId,{headers})).status(),200);
    assert.equal((await read()).history.length,8);assert.equal((await read()).items.length,2);
    assert.equal((await api.patch(base+'/employee/'+created.userId+'/role',{headers,data:{role:'client'}})).status(),200);
    assert.equal((await api.delete(base+'/clients/'+created.userId,{headers})).status(),409);
    assert.equal((await read()).history.length,8);assert.equal((await read()).employee.role,'client');
    console.log('Verified normal direct employee invitation/inactive status, manual item assignment/due dates, assigned-user and manager/client denials, stale-tab conflict, committed-response loss/reload/same-key replay, attributed completion/waiver/reopen, unchanged profile/activation and retained history after deactivation.');
  }finally{await page.unrouteAll({behavior:'ignoreErrors'});await browser.close();}
});
