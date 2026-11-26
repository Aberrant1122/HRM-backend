const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');

test('admin account dashboard uses explicit dates and distinct scoped records without false zeros',{timeout:180000},async()=>{
  assert.equal(process.env.HRM_DISPOSABLE_MYSQL,'1');
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
  const browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
  const context=await browser.newContext({viewport:{width:1440,height:1100},timezoneId:'America/Los_Angeles'}),api=context.request;
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    return url.hostname==='127.0.0.1'&&['13380','13381','13382'].includes(url.port)?route.continue():route.abort();
  });
  const page=await context.newPage();page.setDefaultTimeout(60000);
  const base='http://127.0.0.1:13381/api';
  try{
    for(let i=0;;i++){try{assert.equal((await api.get('http://127.0.0.1:13381/__fixture')).status(),200);break;}
      catch(error){if(i>=119)throw error;await new Promise(resolve=>setTimeout(resolve,250));}}
    await page.goto('http://127.0.0.1:13380/login');await page.locator('#email').fill('admin@example.invalid');
    await page.locator('#password').fill('Synthetic-local-123');await page.getByRole('button',{name:/sign in/i}).click();
    await page.waitForURL('**/admin/dashboard');
    const token=await page.evaluate(()=>localStorage.getItem('token')),headers={Authorization:`Bearer ${token}`};
    const endpoint=base+'/dashboard/account-activity';
    for(const query of ['', '?date=2026-02-30','?date[]=2026-01-01','?date=2026-1-1'])assert.equal((await api.get(endpoint+query,{headers})).status(),400);
    const response=await api.get(endpoint+'?date=2026-01-01',{headers});assert.equal(response.status(),200,await response.text());
    assert.equal(response.headers()['cache-control'],'private, no-store');const result=(await response.json()).data;
    assert.equal(result.date,'2026-01-01');assert.equal(result.scope.accountStatuses,'all');
    assert.equal(result.attendance.accountsWithRecords,4);
    assert.deepEqual(result.attendance.distinctAccountsByRecordedStatus,{present:1,absent:2,'half-day':1,leave:1,'on-leave':0,unknown:0});
    assert.equal(result.approvedLeaveAccounts,2);assert.equal(result.pendingLeaveRequests,2);
    const empty=(await(await api.get(endpoint+'?date=2026-01-02',{headers})).json()).data;
    assert.equal(empty.attendance.accountsWithRecords,0);assert.equal(empty.approvedLeaveAccounts,0);assert.equal(empty.pendingLeaveRequests,2);
    for(const role of ['employee','manager','client']){
      const login=await api.post(base+'/auth/login',{data:{email:role+'@example.invalid',password:'Synthetic-local-123'}});
      assert.equal((await api.get(endpoint+'?date=2026-01-01',{headers:{Authorization:`Bearer ${(await login.json()).token}`}})).status(),403);
    }
    const card=label=>page.getByText(label,{exact:true}).locator('..').locator('..');
    await card('Employee-role accounts').getByText('27',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Report date').inputValue(),'');
    assert.equal(await page.getByText('Performance',{exact:true}).count(),0);
    assert.equal(await page.getByText('Present Today',{exact:true}).count(),0);
    await page.getByLabel('Report date').fill('2026-01-01');await page.getByRole('button',{name:'Load activity',exact:true}).click();
    const results=page.getByRole('region',{name:'Activity results'});await results.getByText('Recorded activity for 2026-01-01',{exact:true}).waitFor();
    await results.getByText('Accounts with attendance records',{exact:true}).locator('..').getByText('4',{exact:true}).waitFor();
    await results.getByText('Accounts with approved leave',{exact:true}).locator('..').getByText('2',{exact:true}).waitFor();
    assert.match(await results.innerText(),/conflicting records/);
    assert.equal(await page.getByRole('link',{name:'View Attendance Records',exact:true}).getAttribute('href'),'/admin/attendance');
    assert.equal(await page.getByText('Quick actions',{exact:true}).locator('..').locator('..').getByRole('link',{name:'Add Employee',exact:true}).getAttribute('href'),'/admin/employees/add');
    if(process.env.HRM_ACCEPTANCE_OUTPUT_DIR)await page.screenshot({path:path.join(process.env.HRM_ACCEPTANCE_OUTPUT_DIR,'HRM-account-dashboard.png'),fullPage:true});
    const failure=route=>route.fulfill({status:500,contentType:'application/json',body:'{"success":false}'});
    await page.route('**/api/dashboard/account-activity?*',failure);await page.getByRole('button',{name:'Load activity',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Activity unavailable'}).waitFor();assert.equal(await results.count(),0);
    await page.unroute('**/api/dashboard/account-activity?*',failure);await page.getByRole('button',{name:'Retry activity',exact:true}).click();await results.waitFor();
    await page.route('**/api/employee/account-summary',failure);await page.reload();
    await card('Employee-role accounts').getByText('Unavailable',{exact:true}).waitFor();
    await page.unroute('**/api/employee/account-summary',failure);await page.getByRole('button',{name:'Retry account summary',exact:true}).click();
    await card('Employee-role accounts').getByText('27',{exact:true}).waitFor();
    console.log('Verified explicit-date distinct attendance/leave counts, overlap/duplicate and cross-role controls, inactive/suspended inclusion, half-day handling, pending all-dates, authorization, empty dates, links and independent failure/retry.');
  }finally{await browser.close();}
});
