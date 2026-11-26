const { test } = require('node:test'), assert = require('node:assert/strict');
for(const timezoneId of ['America/Los_Angeles','Asia/Tokyo'])test('recorded/missing/conflicting report and stale date response '+timezoneId,{timeout:90000},async()=>{
  assert.equal(process.env.HRM_DISPOSABLE_MYSQL,'1');
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE), browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId});
  await context.route('**/*',route=>{const u=new URL(route.request().url());return u.hostname==='127.0.0.1'&&['13380','13381','13382'].includes(u.port)?route.continue():route.abort();});
  const page=await context.newPage();page.setDefaultTimeout(25000);
  try{
    for(let attempt=0;;attempt++){try{const r=await context.request.get('http://127.0.0.1:13381/__fixture');if(r.ok())break;throw Error('Fixture not ready');}catch(error){if(attempt>=59)throw error;await new Promise(resolve=>setTimeout(resolve,250));}}
    await page.goto('http://127.0.0.1:13380/login');await page.locator('#email').fill('admin@example.invalid');await page.locator('#password').fill('Synthetic-local-123');await page.getByRole('button',{name:/sign in/i}).click();await page.waitForURL('**/admin/dashboard');
    await page.goto('http://127.0.0.1:13380/admin/attendance');await page.locator('input[type=date]').fill('2026-01-01');
    await page.locator('tbody tr').filter({hasText:'employee@example.invalid'}).getByText('conflict',{exact:true}).waitFor();
    assert.ok(await page.getByText('Jan 1',{exact:true}).count());assert.ok(await page.getByText('Thu',{exact:true}).count());
    let entered, release;const held=new Promise(resolve=>entered=resolve), gate=new Promise(resolve=>release=resolve);
    await page.route('**/api/attendance/today-all-employees?date=2026-01-02',async route=>{const response=await route.fetch();entered();await gate;await route.fulfill({response});});
    await page.locator('input[type=date]').fill('2026-01-02');await held;await page.locator('input[type=date]').fill('2026-01-03');
    await page.getByText('Jan 3',{exact:true}).first().waitFor();release();await page.waitForTimeout(150);
    assert.equal(await page.getByText('Jan 2',{exact:true}).count(),0);assert.ok(await page.getByText('missing',{exact:true}).count());
    assert.equal(await page.getByRole('cell',{name:'absent',exact:true}).count(),0);
  }finally{await context.close();await browser.close();}
});
