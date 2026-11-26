const assert=require('node:assert/strict'),{randomUUID}=require('crypto'),{chromium}=require(process.env.PLAYWRIGHT_MODULE);
const {Sequelize}=require('sequelize');
(async()=>{
 const api='http://127.0.0.1:13695',ui='http://127.0.0.1:13694';const {schema,ids}=await(await fetch(api+'/__fixture')).json();assert.match(schema,/^hrm_browser_\d+$/);assert.ok(ids.oldRow1,'Start disposable fixture with HRM_PRE_CURRENCY_FIXTURES=1');
 const db=new Sequelize(schema,'root','',{host:'127.0.0.1',port:13693,dialect:'mysql',logging:false}),browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
 try{
  const p=await browser.newPage();p.setDefaultTimeout(15000);await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await p.goto(ui+'/login');await p.locator('#email').fill('admin@example.invalid');await p.locator('#password').fill('Synthetic-local-123');await p.getByRole('button',{name:/sign in/i}).click();await p.waitForURL('**/admin/dashboard');
  const headers={Authorization:'Bearer '+await p.evaluate(()=>localStorage.getItem('token'))},post=(path,body)=>p.request.post(api+'/api/'+path,{headers,data:body});
  async function read(path){const r=await p.request.get(api+'/api/'+path,{headers});assert.equal(r.status(),200,await r.text());return r.json();}
  const meta=(kind,id)=>'payroll-record-report/currency/'+kind+'/'+id;
  const report=()=>read('payroll-record-report/expenditure?from=2032-01-01&to=2032-12-31');
  const generate={name:'Synthetic new PKR period',startDate:'2032-03-01',endDate:'2032-03-28',payrollType:'monthly'};
  assert.equal((await post('payroll/periods',{...generate,currency:'EUR'})).status(),400);
  const missing=await post('payroll/periods',generate); assert.equal(missing.status(),409,await missing.text());
  for(const [kind,id] of [['profile',ids.oldProfile],['period',ids.oldPeriod0],['row',ids.oldRow0]])assert.equal((await read(meta(kind,id))).data.currency,null);
  assert.deepEqual((await report()).summary.totals.map(t=>[t.currency,t.gross,Number(t.payrollRows)]),[[null,null,2]]);
  await p.goto(ui+'/admin/payroll-record-report/periods/'+ids.oldPeriod0+'/payslips/'+ids.oldRow0);
  await p.getByText('Currency unclassified.').waitFor();await p.getByRole('link',{name:'Payroll row currency'}).click();
  await p.getByLabel('Documented currency code').fill('GBP');await p.getByLabel('Evidence or correction reason').fill('Historical issued register');await p.getByRole('button',{name:'Save currency classification'}).click();await p.getByText('Currency classification recorded').waitFor();
  async function classify(kind,id,currency){const current=(await read(meta(kind,id))).data,body={kind,id,currency,expectedVersion:current.version,sourceFingerprint:current.sourceFingerprint,reason:'Synthetic documentation',commandKey:randomUUID()};
   const r=await post('payroll-record-report/currency/commands',body);assert.equal(r.status(),200,await r.text());assert.equal((await(await post('payroll-record-report/currency/commands',body)).json()).replayed,true);return body;}
  await classify('profile',ids.oldProfile,'PKR');
  const created=await post('payroll/periods',generate);assert.equal(created.status(),201,await created.text());
  const period=(await created.json()).data.payrollPeriod;assert.equal(period.currency,'PKR');
  const newRow=(await read('payroll/period/'+period.id)).data.payrolls[0];assert.equal(newRow.currency,'PKR');
  // Mark a synthetic row paid solely to challenge the report grouping.
  await db.query("UPDATE employee_payrolls SET gross_salary=100.30,total_deductions=10.00,net_salary=90.30,status='paid',locked=1 WHERE id = ?",{replacements:[newRow.id]});
  const x=await report();assert.equal(x.summary.employees,1);assert.deepEqual(x.summary.totals.map(t=>[t.currency,t.gross]),[[null,null],['GBP','20.11'],['PKR','100.30']]);assert.equal(x.rows[0].totals.length,3);
  await p.goto(ui+'/admin/payroll-record-report/expenditure');await p.getByLabel('Period ending from').fill('2032-01-01');await p.getByLabel('Period ending through').fill('2032-12-31');await p.getByRole('button',{name:'Run expenditure report'}).click();await p.getByText(/Paid gross GBP 20.11/).waitFor();await p.getByText(/Paid gross PKR 100.30/).waitFor();
  const oldStatement=await read('payroll-record-report/periods/'+ids.oldPeriod0);assert.equal(oldStatement.groups[0].currency,'GBP');assert.equal(oldStatement.groups[0].gross,'20.11');
  await p.goto(ui+'/admin/payroll-record-report/periods/'+ids.oldPeriod0+'/payslips/'+ids.oldRow0);await p.getByText('Currency GBP.').waitFor();
  const [[retained]]=await db.query('SELECT currency,gross_salary,net_salary FROM employee_payrolls WHERE id = ?',{replacements:[ids.oldRow0]});assert.deepEqual(retained,{currency:null,gross_salary:'20.11',net_salary:'19.11'});
  await assert.rejects(db.query("UPDATE employee_payrolls SET currency='PKR' WHERE id = ?",{replacements:[ids.oldRow0]}),/immutable/);
  console.log('PASS populated migration, historical unclassified rows, attributed GBP classification without mutation, PKR-only generation, independent per-currency paid-gross totals, UI report and printed-source payslip.');
 }finally{await browser.close();await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
