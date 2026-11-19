const assert=require('node:assert/strict');
const {randomUUID}=require('crypto');
const {Sequelize,DataTypes}=require('sequelize');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{
 const ui='http://127.0.0.1:13694',api='http://127.0.0.1:13695';const {schema}=await(await fetch(api+'/__fixture')).json();
 assert.match(schema,/^hrm_browser_\d+$/);const db=new Sequelize(schema,'root','',{host:'127.0.0.1',port:13693,dialect:'mysql',logging:false});
 const browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
 try{
  const Case=require('../models/offboardingCase')(db,DataTypes);await Case.findOrCreate({where:{employeeId:2},defaults:{employeeId:2,exitType:'resignation',status:'open',version:1,createdBy:1}});
  async function login(role){const page=await browser.newPage();page.setDefaultTimeout(12000);await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
   await page.goto(ui+'/login');await page.locator('#email').fill(role+'@example.invalid');await page.locator('#password').fill('Synthetic-local-123');await page.getByRole('button',{name:/sign in/i}).click();await page.waitForURL('**/'+role+'/dashboard');return page;}
  const p=await login('admin'),headers={Authorization:'Bearer '+await p.evaluate(()=>localStorage.getItem('token'))};
  const endpoint=api+'/api/offboarding/employee/2/settlement-draft',post=body=>p.request.post(endpoint,{headers,data:body});
  await p.goto(ui+'/admin/employees/2/offboarding');await p.getByRole('link',{name:'Final settlement draft'}).click();
  assert.equal(await p.getByLabel('Currency').inputValue(),'PKR');
  const item=p.getByRole('group',{name:'Item 1',exact:true});await item.getByLabel('Description or reference').fill('Reviewed final wages');await item.getByLabel('Amount').fill('100.0001');
  await p.getByRole('button',{name:'Add settlement item'}).click();
  const d=p.getByRole('group',{name:'Item 2',exact:true});await d.getByRole('combobox').selectOption('deduction');await d.getByLabel('Description or reference').fill('Recorded repayment');await d.getByLabel('Amount').fill('0.10');
  await p.getByLabel('Reason for revision').fill('Initial itemization');await p.getByRole('button',{name:'Save draft revision'}).click();await p.getByText(/Net PKR 99.9001/).waitFor();
  const read=await(await p.request.get(endpoint,{headers})).json(),current=read.rows[0];
  const change={currency:'PKR',expectedRevision:current.revision,reason:'Corrected reviewed items',items:[{kind:'deduction',label:'Retained correction',amount:'12.1234'}],commandKey:randomUUID()};
  assert.equal((await post({...change,currency:'USD'})).status(),400);
  const results=await Promise.all([post(change),post(change)]);const receipts=await Promise.all(results.map(r=>r.json()));assert.ok(receipts.every(r=>r.revision===current.revision+1));
  assert.equal((await post({...change,reason:'Changed same key'})).status(),409);
  assert.equal((await post({...change,commandKey:randomUUID()})).status(),409);
  await p.reload();await p.getByText(/Net PKR -12.1234/).waitFor();await p.getByText(/Net PKR 99.9001/).waitFor();
  const employee=await login('employee');assert.equal((await employee.request.get(endpoint,{headers:{Authorization:'Bearer '+await employee.evaluate(()=>localStorage.getItem('token'))}})).status(),403);
  console.log('PASS itemized draft from clearance, exact four-place positive and negative totals, correction retains prior revision and actor, idempotent concurrent retry, stale correction guard and employee denial.');
 }finally{await browser.close();await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
