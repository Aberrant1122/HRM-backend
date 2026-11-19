const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE);
(async () => {
  const browser = await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(35000);
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.goto('http://127.0.0.1:13480/login');
    await page.locator('#email').fill('admin@example.invalid');
    await page.locator('#password').fill('Synthetic-local-123');
    await page.getByRole('button',{name:/sign in/i}).click();
    await page.waitForURL('**/admin/dashboard');
    await page.goto('http://127.0.0.1:13480/admin/employees/2/performance');
    await page.getByRole('link',{name:'Warnings and performance actions'}).click();
    const form=page.getByRole('form',{name:'Create record'});
    await form.getByLabel('Record title').fill('Synthetic written warning');
    await form.getByLabel('Reason for action').fill('Synthetic repeated absence');
    await form.getByLabel('Action taken').fill('Scheduled attendance review');
    await form.getByLabel('Record type').selectOption('warning');
    await form.getByLabel('Action date').fill('2026-11-16');
    await form.getByLabel('Creation reason').fill('Synthetic test record');
    await form.getByRole('button',{name:'Create record'}).click();
    await page.getByRole('heading',{name:'Synthetic written warning'}).waitFor();
    const edit=page.getByRole('form',{name:'Change record'});
    await edit.getByLabel('Change',{exact:true}).selectOption('close');
    await edit.getByLabel('Closure date').fill('2026-11-17');
    await edit.getByLabel('Administrative closure note').fill('Follow-up complete');
    await edit.getByLabel('Change reason').fill('Reviewed by admin');
    await edit.getByRole('button',{name:'Save change'}).click();
    await page.getByText(/Status: closed .*version 2/).waitFor();
    await page.getByText(/Version 2 .*close/).waitFor();
    console.log('PASS real local browser: admin login, employee profile navigation, record warning, close, retained actor/version history.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});