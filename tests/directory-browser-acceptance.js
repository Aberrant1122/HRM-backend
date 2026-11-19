const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');

test('directory searches every page with reconciled filters, literal text and recoverable failures',{timeout:180000},async()=>{
  assert.equal(process.env.HRM_DISPOSABLE_MYSQL,'1');
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
  const browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US',timezoneId:'America/Los_Angeles'}),api=context.request;
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    return url.hostname==='127.0.0.1'&&['13380','13381','13382'].includes(url.port)?route.continue():route.abort();
  });
  const page=await context.newPage();page.setDefaultTimeout(60000);
  const base='http://127.0.0.1:13381/api';
  try{
    for(let i=0;;i++){
      try{const ready=await api.get('http://127.0.0.1:13381/__fixture');assert.equal(ready.status(),200);break;}
      catch(error){if(i>=119)throw error;await new Promise(resolve=>setTimeout(resolve,250));}
    }
    await page.goto('http://127.0.0.1:13380/login');
    await page.locator('#email').fill('admin@example.invalid');await page.locator('#password').fill('Synthetic-local-123');
    await page.getByRole('button',{name:/sign in/i}).click();await page.waitForURL('**/admin/dashboard');
    const token=await page.evaluate(()=>localStorage.getItem('token')),headers={Authorization:`Bearer ${token}`};
    async function list(params={},auth=headers){
      const r=await api.get(base+'/employee/all?'+new URLSearchParams(params),{headers:auth});
      assert.equal(r.status(),200,await r.text());return r.json();
    }
    const summary=(await(await api.get(base+'/employee/account-summary',{headers})).json()).data;
    const all=await list({limit:100});assert.equal(all.pagination.totalItems,27);
    const later=await list({search:'pagination25@example.invalid'});
    assert.equal(later.data.length,1);assert.equal(later.pagination.totalItems,1);
    assert.equal(later.data[0].userInfo.department,'synthetic-research');
    assert.equal((await list({search:'legacy-satellite'})).data[0].email,'pagination24@example.invalid');
    assert.equal((await list({search:'  PAGINATION25@EXAMPLE.INVALID  '})).pagination.totalItems,1);
    assert.equal((await list({search:'100%_\\'})).pagination.totalItems,1);
    assert.equal((await list({search:'manager@example.invalid'})).pagination.totalItems,0);
    assert.equal((await list({search:'no-such-account'})).pagination.totalItems,0);
    const seen=new Set();
    for(let p=1;p<=3;p++)for(const user of (await list({page:p,limit:10})).data){assert.ok(!seen.has(user.id));seen.add(user.id);}
    assert.equal(seen.size,27);
    const combined=await list({search:'Pagination',status:'suspended',limit:100});
    assert.ok(combined.data.length>0);assert.ok(combined.data.every(user=>user.status==='suspended'));
    assert.equal(combined.data.length,combined.pagination.totalItems);
    assert.equal((await list({department:'synthetic-research',includeUserInfo:false})).pagination.totalItems,1);
    assert.equal((await list({limit:1000})).pagination.totalItems,27); // Existing project-assignment caller remains compatible.
    assert.equal((await list({search:'Synthetic Directory'})).pagination.totalItems,2);
    for(const query of ['page=0','page[]=1','limit=1001','status=former','search[]=x','search='+('x'.repeat(101)),'includeUserInfo=maybe']){
      assert.equal((await api.get(base+'/employee/all?'+query,{headers})).status(),400,query);
    }
    const login=await api.post(base+'/auth/login',{data:{email:'manager@example.invalid',password:'Synthetic-local-123'}});
    const publicRows=await list({search:'development'},{Authorization:`Bearer ${(await login.json()).token}`});
    assert.ok(publicRows.data.length>0);
    for(const user of publicRows.data)for(const key of ['cnic','salary','dob','address','attachments'])assert.equal(key in user.userInfo,false,key);
    await page.goto('http://127.0.0.1:13380/admin/employees');
    const search=page.getByLabel('Search all accounts'),status=page.getByLabel('Account status');
    const card=label=>page.getByText(label,{exact:true}).locator('..').locator('..');
    await page.getByText('27 matching accounts',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Next',exact:true}).click();
    await page.getByText('Page 2 of 3',{exact:true}).waitFor();
    await search.fill('Pagination');await page.getByRole('button',{name:'Search directory',exact:true}).click();
    await page.getByText('Page 1 of 3',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByText('Page 2 of 3',{exact:true}).waitFor();
    await search.fill('pagination25@example.invalid');await page.getByRole('button',{name:'Search directory',exact:true}).click();
    await page.getByRole('row').filter({hasText:'pagination25@example.invalid'}).waitFor();
    await page.getByText('1 matching accounts · Search: pagination25@example.invalid',{exact:true}).waitFor();
    await card('Employee-role accounts').getByText('27',{exact:true}).waitFor();
    await search.fill('no-such-account');await page.getByRole('button',{name:'Search directory',exact:true}).click();
    await page.getByText('No matching accounts. Change or clear the filters.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Clear filters',exact:true}).click();await page.getByText('27 matching accounts',{exact:true}).waitFor();
    await search.fill('pagination0@example.invalid');await status.selectOption('active');await page.getByRole('button',{name:'Search directory',exact:true}).click();
    const row=page.getByRole('row').filter({hasText:'pagination0@example.invalid'});await row.waitFor();
    await row.getByRole('button').click();await page.getByRole('menuitem',{name:'Deactivate Employee',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'Deactivate Employee',exact:true}).click();
    await page.getByText('No matching accounts. Change or clear the filters.',{exact:true}).waitFor();
    await card('Active accounts').getByText(String(summary.counts.active-1),{exact:true}).waitFor();
    await card('Employee-role accounts').getByText('27',{exact:true}).waitFor();
    await status.selectOption('inactive');await page.getByRole('button',{name:'Search directory',exact:true}).click();await row.waitFor();
    assert.match(await row.innerText(),/inactive/i);
    if(process.env.HRM_ACCEPTANCE_OUTPUT_DIR)await page.screenshot({path:path.join(process.env.HRM_ACCEPTANCE_OUTPUT_DIR,'HRM-directory-filters.png')});
    const failure=route=>route.fulfill({status:500,contentType:'application/json',body:'{"message":"Synthetic unavailable"}'});
    await page.route('**/api/employee/all?*',failure);await page.getByRole('button',{name:'Search directory',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Failed to load employees'}).waitFor();
    assert.equal(await page.getByRole('row').filter({hasText:'pagination0@example.invalid'}).count(),0);
    await page.unroute('**/api/employee/all?*',failure);await page.getByRole('button',{name:'Retry directory',exact:true}).click();await row.waitFor();
    await page.goto('http://127.0.0.1:13380/admin/employees/profiles');
    await page.getByText('27 matching accounts',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Next profiles',exact:true}).click();await page.getByText('Page 2 of 3',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Next profiles',exact:true}).click();await page.getByText('Page 3 of 3',{exact:true}).waitFor();
    const profileSearch=page.getByLabel('Search all profiles');
    await profileSearch.fill('pagination25@example.invalid');await page.getByRole('button',{name:'Search profiles',exact:true}).click();
    await page.getByText('1 matching accounts · Search: pagination25@example.invalid',{exact:true}).waitFor();
    await page.getByRole('heading',{name:'Zz Pagination 25',exact:true}).waitFor();
    await profileSearch.fill('Synthetic Directory');await page.getByRole('button',{name:'Search profiles',exact:true}).click();
    await page.getByText('2 matching accounts · Search: Synthetic Directory',{exact:true}).waitFor();
    await profileSearch.fill('employee@example.invalid');await page.getByRole('button',{name:'Search profiles',exact:true}).click();
    await page.getByRole('heading',{name:'Synthetic Employee',exact:true}).waitFor();
    await page.getByText('1/1/2026',{exact:true}).waitFor();await page.getByText('0000000000',{exact:true}).waitFor();
    if(process.env.HRM_ACCEPTANCE_OUTPUT_DIR)await page.screenshot({path:path.join(process.env.HRM_ACCEPTANCE_OUTPUT_DIR,'HRM-profile-directory.png')});
    const unknown={...later,data:[{...later.data[0],status:'legacy-unrecognized'}]};
    const unknownHandler=route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(unknown)});
    await page.route('**/api/employee/all?*',unknownHandler);await page.reload();await page.getByText('unknown',{exact:true}).waitFor();
    assert.equal(await page.getByText('inactive',{exact:true}).count(),0);
    await page.unroute('**/api/employee/all?*',unknownHandler);
    console.log('Verified global search, literal metacharacters, sparse profiles, combined status/department filters, pagination/reset, retained deactivation, privacy, validation and retry.');
    console.log('Profile grid: all three pages, cross-page/position search, literal join date in America/Los_Angeles, contactNumber rendering and explicit unknown status verified.');
  }finally{await browser.close();}
});
