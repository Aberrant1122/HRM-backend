const assert=require('node:assert/strict');
const {randomUUID}=require('crypto');
const {Sequelize,DataTypes}=require('sequelize');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{
 const ui='http://127.0.0.1:13480',api='http://127.0.0.1:13481';
 const {schema}=await(await fetch(api+'/__fixture')).json();assert.match(schema,/^hrm_browser_\d+$/);
 const db=new Sequelize(schema,'root','',{host:'127.0.0.1',port:13479,dialect:'mysql',logging:false});
 const browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
 try{
  const Period=require('../models/payrollPeriod')(db,DataTypes),Row=require('../models/employeePayroll')(db,DataTypes);
  const period=await Period.create({name:'Synthetic components '+Date.now(),start_date:'2026-11-01',end_date:'2026-11-30',payroll_type:'monthly',status:'draft',created_by:1});
  const row=await Row.create({payroll_period_id:period.id,employee_id:2,gross_salary:'100.01',total_deductions:'10.00',net_salary:'90.01',status:'draft',locked:false,snapshot:{}});
  const originalRow=(await row.reload()).toJSON();
  async function login(role){
   const p=await browser.newPage();p.setDefaultTimeout(15000);
   await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
   await p.goto(ui+'/login');await p.locator('#email').fill(role+'@example.invalid');await p.locator('#password').fill('Synthetic-local-123');
   await p.getByRole('button',{name:/sign in/i}).click();await p.waitForURL('**/'+role+'/dashboard');return p;
  }
  const p=await login('admin'),headers={Authorization:'Bearer '+await p.evaluate(()=>localStorage.getItem('token'))},endpoint=api+'/api/payroll/components/'+row.id;
  await p.goto(ui+'/admin/payroll/'+period.id);
  await p.getByRole('row').filter({hasText:'Synthetic Employee'}).getByRole('button').last().click();await p.getByRole('menuitem',{name:'Component records'}).click();
  const read=await p.request.get(endpoint,{headers}); assert.equal(read.status(),200,await read.text()); await p.waitForURL('**/admin/payroll/components/'+row.id);
  await p.getByRole('combobox').selectOption('commission');await p.getByLabel('Amount').fill('12.1201');assert.equal(await p.getByLabel('Currency').inputValue(),'PKR');
  await p.getByLabel('Source reference or reason').fill('Approved sales register');await p.getByRole('button',{name:'Record component',exact:true}).click();
  await p.getByText('PKR 12.1201 · Approved sales register').waitFor();
  const post=data=>p.request.post(endpoint,{headers,data});
  for(const kind of ['bonus','allowance','deduction']) {
   const entry={kind,amount:'10.125',currency:'PKR',reference:'Synthetic '+kind,commandKey:randomUUID()};
   assert.equal((await post({...entry,currency:'USD'})).status(),400);
   const attempts=await Promise.all([post(entry),post(entry)]);for(const r of attempts)assert.equal(r.status(),200,await r.text());
   const ids=await Promise.all(attempts.map(async r=>(await r.json()).id));assert.equal(ids[0],ids[1]);
   assert.equal((await post({...entry,amount:'99'})).status(),409);
  }
  await p.reload();await p.getByText('PKR 10.1250 · Synthetic allowance').waitFor();await p.getByText('PKR 10.1250 · Synthetic bonus').waitFor();
  const before=await Row.findByPk(row.id);assert.equal(before.net_salary,'90.01');assert.deepEqual(before.toJSON(),originalRow);
  await period.update({status:'approved'});
  const blocked=await post({kind:'bonus',amount:'1',currency:'PKR',reference:'Frozen period',commandKey:randomUUID()});assert.equal(blocked.status(),409);
  await p.reload();await p.getByText('Finalized payroll is read-only.').waitFor();assert.equal(await p.getByRole('article').count(),4);
  const emp=await login('employee');assert.equal((await emp.request.get(endpoint,{headers:{Authorization:'Bearer '+await emp.evaluate(()=>localStorage.getItem('token'))}})).status(),403);
  console.log('PASS payroll-row entry point, four distinct component types, currency and provenance, retained readback, concurrent duplicate, unchanged payroll, finalized period freeze, employee denial.');
 }finally{await browser.close();await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
