const { test } = require('node:test'), assert = require('node:assert/strict');
for(const [email, losses] of [['employee@example.invalid',1],['facts@example.invalid',2]])test('production UI storage failure and checkout response losses=' + losses, { timeout: 180000 }, async () => {
  assert.equal(process.env.HRM_DISPOSABLE_MYSQL, '1');
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({ headless: true, executablePath: process.env.HRM_CHROME_PATH });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Los_Angeles' });
  await context.route('**/*', route => { const u = new URL(route.request().url()); return u.hostname === '127.0.0.1' && ['13380', '13381', '13382'].includes(u.port) ? route.continue() : route.abort(); });
  await context.addInitScript(() => {
    window.__blockAttendanceStorage = !sessionStorage.getItem('synthetic-storage-probe-done');
    const original = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...args) { if (window.__blockAttendanceStorage && args[0] === 'hrm-attendance-retry') throw Error('Synthetic retry storage unavailable'); return original.apply(this, args); };
  });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  let inRequests = 0; page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/attendance/clock-in')) inRequests++; });
  try {
    for(let attempt=0;;attempt++){try{const r=await context.request.get('http://127.0.0.1:13381/__fixture');if(r.ok())break;throw Error('Fixture not ready');}catch(error){if(attempt>=59)throw error;await new Promise(resolve=>setTimeout(resolve,250));}}
    await page.goto('http://127.0.0.1:13380/login');
    await page.locator('#email').fill(email); await page.locator('#password').fill('Synthetic-local-123');
    await page.getByRole('button', { name: /sign in/i }).click(); await page.waitForURL('**/employee/dashboard');
    await page.goto('http://127.0.0.1:13380/employee/attendance');
    await page.getByRole('button', { name: 'Check in to start your work day' }).click();
    await page.getByText('Synthetic retry storage unavailable', { exact: true }).waitFor(); assert.equal(inRequests, 0);
    await page.evaluate(() => { window.__blockAttendanceStorage = false; sessionStorage.setItem('synthetic-storage-probe-done','1'); });
    await page.getByRole('button', { name: 'Check in to start your work day' }).click();
    await page.getByRole('button', { name: 'Check out and end your work day' }).waitFor();
    const fixtureBefore = await (await context.request.get('http://127.0.0.1:13381/__fixture')).json();
    const keys = []; let committed;
    await page.route('**/api/attendance/clock-out', async route => {
      keys.push(route.request().headers()['idempotency-key']);
      const response = await route.fetch(); assert.equal(response.status(), 200);
      committed = await response.json();
      if (keys.length <= losses) await route.abort('failed'); else await route.fulfill({ response });
    });
    await page.getByRole('button', { name: 'Check out and end your work day' }).click();
    await page.locator('#workNote').fill('Synthetic saved work note');
    await page.locator('#deliverables').setInputFiles({ name: 'synthetic.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic retry evidence') });
    await page.getByRole('dialog').getByRole('button', { name: 'Check Out', exact: true }).click();
    if(losses===2){
      await page.getByText('Attendance confirmation pending',{exact:true}).waitFor();
      await page.reload();
      const replay = page.waitForResponse(response=>response.url().endsWith('/attendance/clock-out')&&response.status()===200);
      await page.getByRole('button',{name:'Retry saved attendance change'}).click();
      await replay;
      await page.getByRole('button',{name:'Retry saved attendance change'}).waitFor({state:'hidden'});
    }
    await page.getByRole('button', { name: 'Already checked out for today' }).waitFor();
    assert.equal(keys.length, losses+1); assert.ok(keys[0]); assert.ok(keys.every(key=>key===keys[0])); assert.equal(committed.dailyWorkRecord.workNote, 'Synthetic saved work note');
    const fixtureAfter = await (await context.request.get('http://127.0.0.1:13381/__fixture')).json();
    assert.equal(fixtureAfter.storageWrites - fixtureBefore.storageWrites, 1); assert.equal(fixtureAfter.objects - fixtureBefore.objects, 1);
    assert.equal(await page.getByText('Check-out failed', { exact: true }).count(), 0);
    await page.reload(); await page.evaluate(() => { window.__blockAttendanceStorage = false; });
    await page.getByRole('button', { name: 'Already checked out for today' }).waitFor();
    const token = await page.evaluate(() => localStorage.getItem('token'));
    const signed = await context.request.get('http://127.0.0.1:13381/api' + committed.dailyWorkRecord.deliverables[0].url, { headers: { Authorization: 'Bearer ' + token } });
    assert.equal(signed.status(), 200); const { url } = await signed.json(); assert.match(url, /^http:\/\/127\.0\.0\.1:13382\//);
    const object = await context.request.get(url); assert.equal(await object.text(), 'Synthetic retry evidence');
  } finally { await context.close(); await browser.close(); }
});
