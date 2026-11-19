const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const ui = 'http://127.0.0.1:13694';
const api = 'http://127.0.0.1:13695';
(async () => {
  const { schema } = await (await fetch(api + '/__fixture')).json();
  assert.match(schema, /^hrm_browser_\d+$/);
  const db = new Sequelize(schema, 'root', '', { host: '127.0.0.1', port: 13693, dialect: 'mysql', logging: false });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.HRM_CHROME_PATH });
  try {
    async function login(role) {
      const page = await browser.newPage();
      await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
      await page.goto(ui + '/login');
      await page.locator('#email').fill(role + '@example.invalid');
      await page.locator('#password').fill('Synthetic-local-123');
      await page.getByRole('button', { name: /sign in/i }).click();
      await page.waitForURL('**/' + role + '/dashboard');
      return { page, headers: { Authorization: 'Bearer ' + await page.evaluate(() => localStorage.getItem('token')) } };
    }
    const admin = await login('admin'), employee = await login('employee');
    for (const kind of ['onboarding', 'offboarding']) {
      const exit = kind === 'offboarding', title = 'Synthetic ' + kind + ' orientation ' + Date.now();
      const [caseId] = await db.query('INSERT INTO ' + kind + '_cases (employeeId,status,version,createdBy,createdAt,updatedAt' + (exit ? ',exitType' : '') + ") VALUES(2,'open',1,1,NOW(),NOW()" + (exit ? ",'resignation'" : '') + ') ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)');
      const [itemId] = await db.query('INSERT INTO ' + kind + '_items (caseId,title,responsibleId,dueDate,status,createdAt,updatedAt' + (exit ? ',kind' : '') + ") VALUES(?,?,2,'2027-01-05','pending',NOW(),NOW()" + (exit ? ",'clearance'" : '') + ')', { replacements: [caseId, title] });
      const url = api + '/api/hr-tasks/checklist/' + kind + '/' + itemId;
      const data = { caseVersion: 1, assigneeId: 2 };
      const post = (headers, body) => admin.page.request.post(url, { headers, data: body });
      assert.equal((await post(employee.headers, data)).status(), 403);
      assert.equal((await post(admin.headers, { ...data, caseVersion: 2 })).status(), 409);
      assert.equal((await post(admin.headers, { ...data, assigneeId: 3 })).status(), 409);
      await admin.page.goto(ui + '/admin/employees/2/' + kind);
      const item = admin.page.getByRole('region', { name: title });
      await item.getByLabel('Task submission deadline').fill('2027-01-06');
      await item.getByLabel('Task approval deadline').fill('2027-01-09');
      await item.getByRole('button', { name: 'Assign HR task to responsible person' }).click();
      await item.getByText(/Linked HR task #/).waitFor();
      const replays = await Promise.all([post(admin.headers, data), post(admin.headers, data)]);
      const receipts = await Promise.all(replays.map(r => r.json()));
      assert.ok(receipts.every(r => r.data.created === false && r.data.taskId === receipts[0].data.taskId));
      const taskId = receipts[0].data.taskId;
      const detail = (await (await admin.page.request.get(api + '/api/hr-tasks/' + taskId, { headers: admin.headers })).json()).data;
      assert.equal(detail.task.submissionDueDate,'2027-01-06');assert.equal(detail.task.approvalDueDate,'2027-01-09');assert.equal(detail.task.dueDate,'2027-01-05');
      assert.deepEqual(detail.history[0].details.source, { kind, caseId, itemId, employeeId: 2, caseVersion: 1 });
      assert.equal(detail.history.length, 1);
      await employee.page.goto(ui + '/hr-tasks');
      await employee.page.getByRole('region', { name: 'Available HR tasks' }).getByText(title, { exact: false }).first().waitFor();
    }
    console.log('PASS both real checklist pages, active recipient inbox, source history, stale/mismatched assignments, employee denial and repeat-safe task creation.');
  } finally { await browser.close(); await db.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
