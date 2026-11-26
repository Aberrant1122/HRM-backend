const {test}=require('node:test'),assert=require('node:assert/strict');
test('browser profile caller and password mismatch omit confidential sentinels',{timeout:180000},async()=>{
  assert.equal(process.env.HRM_DISPOSABLE_MYSQL,'1');
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
  const browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),api=context.request;
  const allow=route=>{const url=new URL(route.request().url());return url.hostname==='127.0.0.1'&&['13380','13381','13382'].includes(url.port)?route.continue():route.abort();};
  await context.route('**/*',allow);
  const logs=[],pending=[];
  function capture(page){page.on('console',message=>{logs.push(message.text());pending.push(Promise.all(message.args().map(arg=>arg.jsonValue().catch(()=>null))).then(args=>logs.push(JSON.stringify(args))));});}
  const page=await context.newPage();capture(page);page.setDefaultTimeout(60000);
  const sentinel='QA03_BROWSER_PRIVATE_ADDRESS_SENTINEL',base='http://127.0.0.1:13381/api';
  try{
    let fixture;for(let i=0;;i++){try{fixture=await(await api.get('http://127.0.0.1:13381/__fixture')).json();break;}catch(error){if(i>=119)throw error;await new Promise(resolve=>setTimeout(resolve,250));}}
    await page.goto('http://127.0.0.1:13380/login');await page.locator('#email').fill('admin@example.invalid');await page.locator('#password').fill('Synthetic-local-123');
    await page.getByRole('button',{name:/sign in/i}).click();await page.waitForURL('**/admin/dashboard');
    await page.goto('http://127.0.0.1:13380/admin/employees/'+fixture.ids.employee);
    await page.getByRole('button',{name:'Edit Details',exact:true}).click();await page.locator('#address').fill(sentinel);
    const saved=page.waitForResponse(response=>response.url()===base+'/employee/'+fixture.ids.employee+'/profile'&&response.request().method()==='PUT');
    await page.getByRole('button',{name:'Save Changes',exact:true}).click();const response=await saved;assert.equal(response.status(),200);
    await page.getByText(sentinel,{exact:true}).waitFor();
    await page.getByRole('button',{name:'Edit Details',exact:true}).click();await page.locator('#address').fill(sentinel+'_FAILURE');
    const failure=route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:sentinel+'_FAILURE'})});
    await page.route('**/api/employee/*/profile',failure);await page.getByRole('button',{name:'Save Changes',exact:true}).click();
    await page.locator('[data-sonner-toast]').getByText(sentinel+'_FAILURE',{exact:true}).waitFor();await page.unroute('**/api/employee/*/profile',failure);
    const auth=await browser.newContext();await auth.route('**/*',allow);const passwordPage=await auth.newPage();capture(passwordPage);
    await passwordPage.route('**/api/auth/validate-invite?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({fullName:'Synthetic invite',email:'invite@example.invalid',role:'employee',companyName:'Synthetic'})}));
    await passwordPage.goto('http://127.0.0.1:13380/set-password?token=QA03_BROWSER_TOKEN_SENTINEL');
    await passwordPage.locator('#newPassword').fill('QA03_Password_SENTINEL_Aa1!');await passwordPage.locator('#confirmPassword').fill('QA03_Different_SENTINEL_Aa1!');
    await passwordPage.getByRole('button',{name:'Complete Setup',exact:true}).click();
    await passwordPage.getByText('Passwords do not match. Please make sure both passwords are identical.',{exact:true}).first().waitFor();
    await Promise.all(pending);
    for(const value of [sentinel,'QA03_BROWSER_TOKEN_SENTINEL','QA03_Password_SENTINEL','QA03_Different_SENTINEL'])assert.equal(logs.join('\n').includes(value),false,value);
    await auth.close();
    console.log('Real browser console/argument capture omits private profile values on successful and failed UI saves and token/password values on password mismatch. Profile request behavior and validation messages remain functional.');
  }finally{await page.unrouteAll({behavior:'ignoreErrors'});await browser.close();}
});
