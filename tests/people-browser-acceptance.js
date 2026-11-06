const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');

test('account cards use global explicit scope, real departments and visible failure states', {timeout:180000},async()=>{
  assert.equal(process.env.HRM_DISPOSABLE_MYSQL,'1');
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
  const browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),api=context.request;
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    return url.hostname==='127.0.0.1'&&['13380','13381','13382'].includes(url.port)?route.continue():route.abort();
  });
  const page=await context.newPage();page.setDefaultTimeout(60000);
  const base='http://127.0.0.1:13381/api';
  try{
    let fixture;
    for(let i=0;;i++){try{fixture=await(await api.get('http://127.0.0.1:13381/__fixture')).json();break;}catch(error){if(i>=119)throw error;await new Promise(r=>setTimeout(r,250));}}
    await page.goto('http://127.0.0.1:13380/login');
    await page.locator('#email').fill('admin@example.invalid');await page.locator('#password').fill('Synthetic-local-123');
    await page.getByRole('button',{name:/sign in/i}).click();await page.waitForURL('**/admin/dashboard');
    const token=await page.evaluate(()=>localStorage.getItem('token')),headers={Authorization:`Bearer ${token}`};
    const summaryResponse=await api.get(base+'/employee/account-summary',{headers});assert.equal(summaryResponse.status(),200);
    assert.equal(summaryResponse.headers()['cache-control'],'private, no-store');
    const summary=(await summaryResponse.json()).data;
    assert.equal(summary.scope.basis,'login-account-role');assert.equal(summary.scope.pagination,'all-pages');
    assert.equal(summary.counts.total,27);assert.equal(summary.counts.active,10);assert.equal(summary.counts.inactive,9);assert.equal(summary.counts.suspended,8);
    const departments=(await(await api.get(base+'/departments',{headers})).json()).data;
    assert.equal(summary.departments.activeConfigurations,departments.length);assert.ok(departments.length>4);
    const pageOne=(await(await api.get(base+'/employee/all?page=1&limit=10',{headers})).json()).data;
    assert.notEqual(pageOne.filter(row=>row.status==='active').length,summary.counts.active);
    for(const role of ['employee','manager','client']){
      const login=await api.post(base+'/auth/login',{data:{email:role+'@example.invalid',password:'Synthetic-local-123'}});
      const credential=(await login.json()).token;
      assert.equal((await api.get(base+'/employee/account-summary',{headers:{Authorization:`Bearer ${credential}`}})).status(),403);
    }
    await page.goto('http://127.0.0.1:13380/admin/employees');
    const card=label=>page.getByText(label,{exact:true}).locator('..').locator('..');
    await card('Employee-role accounts').getByText('27',{exact:true}).waitFor();
    assert.equal(await page.getByText('On Leave',{exact:true}).count(),0);
    await card('Configured departments').getByText(String(departments.length),{exact:true}).waitFor();
    await card('Active accounts').getByText('10',{exact:true}).waitFor();
    await card('Inactive accounts').getByText('9',{exact:true}).waitFor();
    const firstCounts=await card('Active accounts').innerText();
    await page.getByRole('button',{name:'Next',exact:true}).click();await card('Active accounts').getByText('10',{exact:true}).waitFor();
    assert.equal(await card('Active accounts').innerText(),firstCounts);
    await page.getByRole('button',{name:'Previous',exact:true}).click();
    const row=page.getByRole('row').filter({hasText:'Synthetic Employee'});await row.waitFor();
    await row.getByRole('button').click();await page.getByRole('menuitem',{name:'Deactivate Employee',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'Deactivate Employee',exact:true}).click();
    await card('Active accounts').getByText('9',{exact:true}).waitFor();await card('Inactive accounts').getByText('10',{exact:true}).waitFor();
    await card('Employee-role accounts').getByText('27',{exact:true}).waitFor();assert.match(await row.innerText(),/inactive/i);
    if(process.env.HRM_ACCEPTANCE_OUTPUT_DIR)await page.screenshot({path:path.join(process.env.HRM_ACCEPTANCE_OUTPUT_DIR,'HRM-people-account-metrics.png')});
    await page.route('**/api/employee/account-summary',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({success:false,message:'Synthetic unavailable'})}));
    await page.reload();await card('Active accounts').getByText('Unavailable',{exact:true}).waitFor();
    console.log('Verified global account scope across pagination, configured department count, deactivation reconciliation, non-admin denial and unavailable-state rendering.');
  }finally{await browser.close();}
});
