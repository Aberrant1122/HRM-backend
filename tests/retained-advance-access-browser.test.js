const assert=require('node:assert/strict');
const {randomUUID}=require('crypto');
const {Sequelize,DataTypes}=require('sequelize');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{
 const ui='http://127.0.0.1:13694',api='http://127.0.0.1:13695',endpoint=api+'/api/payroll/advances/2';
 const {schema}=await(await fetch(api+'/__fixture')).json();assert.match(schema,/^hrm_browser_\d+$/);
 const db=new Sequelize(schema,'root','',{host:'127.0.0.1',port:13693,dialect:'mysql',logging:false});
 const browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
 try{
  const Period=require('../models/employmentPeriod')(db,DataTypes);
  await Period.create({employeeId:2,startDate:'2026-01-01',endDate:null,version:1,voided:false,createdBy:1});
  const p=await browser.newPage();p.setDefaultTimeout(12000);await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await p.goto(ui+'/login');await p.locator('#email').fill('admin@example.invalid');await p.locator('#password').fill('Synthetic-local-123');await p.getByRole('button',{name:/sign in/i}).click();await p.waitForURL('**/admin/dashboard');
  const headers={Authorization:'Bearer '+await p.evaluate(()=>localStorage.getItem('token'))},principal={kind:'loan',amount:'100',currency:'PKR',effectiveDate:'2026-11-01',reference:'Synthetic QA11 loan',commandKey:randomUUID()};
  const post=(url,body)=>p.request.post(url,{headers,data:body});
  const created=await post(endpoint,principal);assert.equal(created.status(),200,await created.text());const accountId=(await created.json()).id;
  const payment={...principal,kind:'repayment',amount:'50',accountId,reference:'Before role change',commandKey:randomUUID()};
  assert.equal((await post(endpoint,payment)).status(),200);
  const read=async()=>{const r=await p.request.get(endpoint,{headers});assert.equal(r.status(),200,await r.text());return (await r.json()).rows.find(x=>x.id===accountId);};
  const original=await read();assert.equal(original.balance,'50.0000');
  const [[user]]=await db.query('SELECT sessionVersion FROM users WHERE id=2');
  const changed=await post(api+'/api/employee-documents/roles/commands',{action:'changeRole',userId:2,targetRole:'hr',employmentAsOf:'2026-11-16',expectedSessionVersion:user.sessionVersion,reason:'Preserve employed payroll membership',commandKey:randomUUID()});
  assert.equal(changed.status(),200,await changed.text());const [[target]]=await db.query('SELECT role,retainedEmployeeMembership FROM users WHERE id=2');assert.equal(target.role,'hr');assert.equal(target.retainedEmployeeMembership,1);
  assert.deepEqual(await read(),original);
  await p.goto(ui+'/admin/payroll/advances');await p.getByLabel('Find employee').fill('Synthetic Employee');await p.getByRole('button',{name:'Search employee'}).click();await p.getByRole('combobox',{name:'Employee',exact:true}).selectOption('2');
  const row=p.getByRole('article').filter({hasText:principal.reference});await row.getByText(/Outstanding PKR 50.0000/).waitFor();
  await row.getByRole('button',{name:/Record repayment/}).click();await p.getByLabel('Amount',{exact:true}).fill('10');await p.getByLabel('Effective date').fill('2026-11-16');await p.getByLabel('Reference or reason').fill('After HR transition');
  await p.getByRole('button',{name:'Record repayment',exact:true}).click();await row.getByText(/Outstanding PKR 40.0000/).waitFor();
  assert.equal((await post(endpoint.replace('/2','/3'),principal)).status(),404);
  // A noncohort account with genuinely retained principal may repay; it cannot obtain a new advance.
  const [historicalId]=await db.query("INSERT INTO payroll_advance_entries(employeeId,actorId,kind,currency,amount,effectiveDate,reference,commandKey,payloadHash,createdAt) VALUES(3,1,'loan','PKR',5,'2026-11-01','Legacy manager loan',?,REPEAT('0',64),NOW())",{replacements:[randomUUID()]});
  const retained=endpoint.replace('/2','/3');assert.equal((await post(retained,{...principal,commandKey:randomUUID()})).status(),409);
  assert.equal((await post(retained,{...payment,amount:'1',accountId:historicalId,commandKey:randomUUID()})).status(),200);
  console.log('PASS actual employee-to-HR transition with valid employment, identical retained loan/repayment, payroll discovery and browser repayment, unsupported new principal denied, history-only repayment allowed.');
 }finally{await browser.close();await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
