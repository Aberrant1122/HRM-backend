const {test}=require('node:test'),assert=require('node:assert/strict');
test('native browser preflights real cross-origin keyed JSON/multipart and blocks an unapproved origin',{timeout:120000},async()=>{
  assert.equal(process.env.HRM_DISPOSABLE_MYSQL,'1');const {chromium}=require(process.env.PLAYWRIGHT_MODULE),browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
  // Deliberately no Playwright routing/interception: Chrome enforces native CORS.
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.setDefaultTimeout(30000);
  try{
    for(let i=0;;i++){try{if((await context.request.get('http://127.0.0.1:13381/__fixture')).ok())break;throw Error('Fixture not ready');}catch(error){if(i>59)throw error;await new Promise(r=>setTimeout(r,250));}}
    await page.goto('http://127.0.0.1:13380/login');await page.locator('#email').fill('employee@example.invalid');await page.locator('#password').fill('Synthetic-local-123');await page.getByRole('button',{name:/sign in/i}).click();await page.waitForURL('**/employee/dashboard');
    await page.goto('http://127.0.0.1:13380/employee/attendance');await page.getByRole('button',{name:'Check in to start your work day',exact:true}).click();await page.getByRole('button',{name:'Check out and end your work day',exact:true}).waitFor();
    await page.getByRole('button',{name:'Check out and end your work day',exact:true}).click();await page.locator('#workNote').fill('Synthetic native CORS acceptance');await page.locator('#deliverables').setInputFiles({name:'synthetic.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic CORS evidence')});await page.getByRole('dialog').getByRole('button',{name:'Check Out',exact:true}).click();await page.getByRole('button',{name:'Already checked out for today',exact:true}).waitFor();
    const fixture=await (await context.request.get('http://127.0.0.1:13381/__fixture')).json();assert.equal(fixture.commandRequests,2);assert.equal(fixture.storageWrites,1);assert.equal(fixture.objects,1);
    for(const path of ['/api/attendance/clock-in','/api/attendance/clock-out'])assert.ok(fixture.preflights.some(p=>p.path===path&&p.origin==='http://127.0.0.1:13380'&&p.headers.toLowerCase().includes('idempotency-key')),path+' native preflight missing');
    const deniedPage=await context.newPage();await deniedPage.goto('http://localhost:13380/login');
    const outcome=await deniedPage.evaluate(async()=>{try{await fetch('http://127.0.0.1:13381/api/attendance/clock-in',{method:'POST',headers:{Authorization:'Bearer synthetic-unapproved','Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:'{}'});return 'unexpectedly readable';}catch(_){return 'blocked';}});assert.equal(outcome,'blocked');
    const after=await (await context.request.get('http://127.0.0.1:13381/__fixture')).json();assert.equal(after.commandRequests,2);assert.ok(after.preflights.some(p=>p.origin==='http://localhost:13380'));
  }finally{await context.close();await browser.close();}
});
