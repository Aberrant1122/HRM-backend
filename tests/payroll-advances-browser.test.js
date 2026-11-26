const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const ui = 'http://127.0.0.1:13694';
const endpoint = 'http://127.0.0.1:13695/api/payroll/advances/2';
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.HRM_CHROME_PATH});
  try {
    async function login(role) {
      const p=await browser.newPage(); p.setDefaultTimeout(12000);
      await p.route('**/*',r=>new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
      await p.goto(ui+'/login');await p.locator('#email').fill(role+'@example.invalid');await p.locator('#password').fill('Synthetic-local-123');
      await p.getByRole('button',{name:/sign in/i}).click();await p.waitForURL('**/'+role+'/dashboard');return p;
    }
    const page=await login('admin'),headers={Authorization:'Bearer '+await page.evaluate(()=>localStorage.getItem('token'))};
    const post=body=>page.request.post(endpoint,{headers,data:body});
    await page.goto(ui+'/admin/payroll');await page.getByRole('link',{name:'Salary advances and loans'}).click();
    await page.getByLabel('Find employee').fill('Synthetic Employee');await page.getByRole('button',{name:'Search employee'}).click();
    await page.getByRole('combobox',{name:'Employee',exact:true}).selectOption('2');
    const loaded = await page.request.get(endpoint,{headers}); assert.equal(loaded.status(),200,await loaded.text());
    const reference='Advance '+Date.now();
    await page.getByLabel('Amount',{exact:true}).fill('10.125');assert.equal(await page.getByLabel('Currency').inputValue(),'PKR');
    await page.getByLabel('Effective date').fill('2026-11-01');await page.getByLabel('Reference or reason').fill(reference);
    await page.getByRole('button',{name:'Record entry',exact:true}).click();
    const row=page.getByRole('article').filter({hasText:reference});await row.getByText(/Outstanding PKR 10.1250/).waitFor();
    await row.getByRole('button',{name:/Record repayment/}).click();
    await page.getByLabel('Amount',{exact:true}).fill('2.12');await page.getByLabel('Effective date').fill('2026-11-02');await page.getByLabel('Reference or reason').fill('Payment receipt');
    await page.getByRole('button',{name:'Record repayment',exact:true}).click();await row.getByText(/Outstanding PKR 8.0050/).waitFor();
    const loan={kind:'loan',amount:'100.0001',currency:'PKR',effectiveDate:'2026-11-01',reference:'Synthetic loan',commandKey:randomUUID()};
    assert.equal((await post({...loan,currency:'USD'})).status(),400);
    const created=await post(loan);assert.equal(created.status(),200,await created.text());const accountId=(await created.json()).id;
    assert.equal((await(await post(loan)).json()).replayed,true);
    assert.equal((await post({...loan,amount:'20'})).status(),409);
    const repayment={...loan,kind:'repayment',accountId,amount:'75',commandKey:randomUUID()};
    assert.equal((await post({...repayment,currency:'USD'})).status(),409);
    assert.equal((await post({...repayment,effectiveDate:'2026-10-31'})).status(),409);
    const attempts=await Promise.all([post(repayment),post({...repayment,commandKey:randomUUID()})]);
    assert.deepEqual(attempts.map(r=>r.status()).sort(),[200,409]);
    const result=(await(await page.request.get(endpoint,{headers})).json()).rows.find(r=>r.id===accountId);
    assert.equal(result.balance,'25.0001');assert.equal(result.repayments.length,1);
    const {Sequelize}=require('sequelize'),{schema}=await(await fetch('http://127.0.0.1:13695/__fixture')).json();
    assert.match(schema,/^hrm_browser_\d+$/);
    const db=new Sequelize(schema,'root','',{host:'127.0.0.1',port:13693,dialect:'mysql',logging:false});
    try {
      const [recordId]=await db.query("INSERT INTO payroll_advance_entries(employeeId,actorId,kind,currency,amount,effectiveDate,reference,commandKey,payloadHash,createdAt) VALUES(2,1,'loan','GBP',10,'2026-01-01','Historical synthetic loan',?,REPEAT('0',64),NOW())",{replacements:[randomUUID()]});
      const historical={...repayment,accountId:recordId,amount:'1',commandKey:randomUUID(),currency:'GBP'};
      assert.equal((await post(historical)).status(),200);
      assert.equal((await post({...historical,commandKey:randomUUID(),currency:'PKR'})).status(),409);
    } finally {await db.close();}
    const employee=await login('employee'),eh={Authorization:'Bearer '+await employee.evaluate(()=>localStorage.getItem('token'))};
    assert.equal((await employee.request.get(endpoint,{headers:eh})).status(),403);
    assert.equal((await employee.request.post(endpoint,{headers:eh,data:loan})).status(),403);
    console.log('PASS actual payroll UI, principal and repayments, decimal balances, currency/date guards, idempotent replay, simultaneous overpayment protection and authorization.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
