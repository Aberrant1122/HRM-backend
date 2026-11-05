const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');

test('synthetic browser employee creation/deactivation and real HTTP/storage authorization', {timeout:180000},async()=>{
  assert.equal(process.env.HRM_DISPOSABLE_MYSQL,'1');
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
  const browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US',timezoneId:'America/Los_Angeles'});
  // Browser resources are confined to the three explicit local fixtures.
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    return url.hostname==='127.0.0.1'&&['13380','13381','13382'].includes(url.port)?route.continue():route.abort();
  });
  const page=await context.newPage();page.setDefaultTimeout(60000);
  const base='http://127.0.0.1:13381/api';
  const api=context.request;
  try{
    let fixture;
    for(let attempt=0;;attempt++){
      try{fixture=await (await api.get('http://127.0.0.1:13381/__fixture')).json();break;}
      catch(error){if(attempt>=119)throw error;await new Promise(resolve=>setTimeout(resolve,250));}
    }
    await page.goto('http://127.0.0.1:13380/login');
    await page.locator('#email').fill('admin@example.invalid');await page.locator('#password').fill('Synthetic-local-123');
    await page.getByRole('button',{name:/sign in/i}).click();await page.waitForURL('**/admin/dashboard');
    await page.goto('http://127.0.0.1:13380/admin/employees/add');
    await page.locator('#fullName').fill('Synthetic Browser Employee');
    const email=`browser${Date.now()}@example.invalid`;
    for(const [id,value] of Object.entries({email,contactNumber:'0000000000',cnic:'00000-0000099-0',dob:'2000-01-01',position:'Synthetic Tester',startDate:'2026-01-01',salary:'1800'}))await page.locator('#'+id).fill(value);
    await page.getByRole('combobox').nth(0).click();await page.getByRole('option',{name:/^development$/i}).click();
    await page.getByRole('combobox').nth(1).click();await page.getByRole('option',{name:/^permanent$/i}).click();
    await page.locator('input[type=file]').setInputFiles({name:'synthetic-offer.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic fixture document')});
    const inviteResponse=page.waitForResponse(response=>response.url()===base+'/auth/invite-employee'&&response.request().method()==='POST');
    await page.getByRole('button',{name:'Add Employee',exact:true}).click();
    const response=await inviteResponse;assert.equal(response.status(),201);const created=await response.json();
    await page.getByRole('heading',{name:/Employee Added Successfully/}).waitFor();
    if(process.env.HRM_ACCEPTANCE_OUTPUT_DIR)await page.screenshot({path:path.join(process.env.HRM_ACCEPTANCE_OUTPUT_DIR,'HRM-browser-created.png')});
    const adminToken=await page.evaluate(()=>localStorage.getItem('token'));
    const headers={Authorization:`Bearer ${adminToken}`};
    let profile=(await (await api.get(`${base}/employee/${created.userId}/user-info`,{headers})).json()).data;
    assert.equal(profile.personalInfo.attachments.length,1);
    const attachment=profile.personalInfo.attachments[0].filename;
    const status=await api.post(base+'/auth/set-password',{data:{token:created.resetToken,newPassword:'Synthetic-local-123',confirmPassword:'Synthetic-local-123'}});assert.equal(status.status(),200);
    async function login(email){const response=await api.post(base+'/auth/login',{data:{email,password:'Synthetic-local-123'}});assert.equal(response.status(),200);return (await response.json()).token;}
    const employeeToken=await login('employee@example.invalid'),createdToken=await login(email),managerToken=await login('manager@example.invalid');
    const otherHeaders={Authorization:`Bearer ${employeeToken}`};
    const before=await (await api.get('http://127.0.0.1:13381/__fixture')).json();assert.equal(before.storageWrites,1);
    for(const endpoint of [`employee/${created.userId}/attachments`,`employee/${created.userId}/profile-picture`]){
      const field=endpoint.endsWith('profile-picture')?'profilePicture':'attachments';
      const denied=await api.post(`${base}/${endpoint}`,{headers:otherHeaders,multipart:{[field]:{name:'denied.txt',mimeType:'text/plain',buffer:Buffer.from('must never reach storage')}}});
      assert.equal(denied.status(),403);
    }
    for(const endpoint of [`employee/${created.userId}/get-bank-details`,`employee/${created.userId}/download-attachment/${attachment}`])assert.equal((await api.get(`${base}/${endpoint}`,{headers:otherHeaders})).status(),403);
    assert.equal((await api.delete(`${base}/employee/${created.userId}/attachments/${attachment}`,{headers:otherHeaders})).status(),403);
    const after=await (await api.get('http://127.0.0.1:13381/__fixture')).json();assert.equal(after.storageWrites,before.storageWrites);assert.equal(after.objects,before.objects);
    const publicProfile=(await (await api.get(`${base}/employee/${created.userId}/user-info`,{headers:otherHeaders})).json()).data.personalInfo;
    for(const field of ['salary','cnic','dob','address','attachments'])assert.equal(publicProfile[field],undefined);
    const own=await api.get(`${base}/employee/${created.userId}/download-attachment/${attachment}`,{headers:{Authorization:`Bearer ${createdToken}`},maxRedirects:0});assert.equal(own.status(),302);
    assert.equal(new URL(own.headers().location).hostname,'127.0.0.1');
    // Actual SDK deletion reaches only the local object sink and updates MySQL.
    assert.equal((await api.delete(`${base}/employee/${created.userId}/attachments/${attachment}`,{headers:{Authorization:`Bearer ${createdToken}`}})).status(),200);
    assert.equal((await (await api.get('http://127.0.0.1:13381/__fixture')).json()).objects,0);
    await page.goto(`http://127.0.0.1:13380/admin/employees/${created.userId}`);
    await page.getByRole('button',{name:'Deactivate Employee',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'Deactivate Employee',exact:true}).click();
    await page.waitForURL('**/admin/employees');
    const row=page.getByRole('row').filter({hasText:'Synthetic Browser Employee'});await row.waitFor();
    assert.match(await row.innerText(),/inactive/i);
    assert.match(await row.innerText(),/1\/1\/2026/,'Entered January 1 must not shift to December 31');
    if(process.env.HRM_ACCEPTANCE_OUTPUT_DIR)await page.screenshot({path:path.join(process.env.HRM_ACCEPTANCE_OUTPUT_DIR,'HRM-browser-deactivated.png')});
    assert.equal((await api.get(`${base}/employee/${created.userId}/get-bank-details`,{headers:{Authorization:`Bearer ${createdToken}`}})).status(),401);
    for(const role of ['employee','manager'])assert.equal((await api.patch(`${base}/employee/${fixture.ids.manager}/role`,{headers,data:{role}})).status(),200);
    assert.equal((await api.get(`${base}/employee/${fixture.ids.manager}/get-bank-details`,{headers:{Authorization:`Bearer ${managerToken}`}})).status(),401);
    assert.ok(await login('manager@example.invalid'));
    console.log('Verified browser add/deactivate, private profile fields, cross-user multipart denial with zero sink writes, own document lifecycle, manager role-cycle revocation.');
  }finally{await browser.close();}
});
