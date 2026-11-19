const assert = require("node:assert/strict");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE);
(async () => {
  const browser = await chromium.launch({headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe"});
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);
    await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
    const ui = "http://127.0.0.1:13480";
    const api = "http://127.0.0.1:13481/api/auth/employee-imports";
    await page.goto(ui + "/login");
    await page.locator("#email").fill("admin@example.invalid");
    await page.locator("#password").fill("Synthetic-local-123");
    await page.getByRole("button", {name: /sign in/i}).click();
    await page.waitForURL("**/admin/dashboard");
    await page.goto(ui + "/admin/employees/add");
    await page.getByRole("link", {name: "Add employees in bulk"}).click();
    const email = "bulk" + Date.now() + "@example.invalid";
    await page.locator("#employees").fill("New Employee\t" + email + "\nExisting\tadmin@example.invalid\nInvalid\tbroken\nDuplicate\t" + email);
    await page.getByRole("button", {name: "Invite employees"}).click();
    await page.getByText("created · invitation sent").waitFor();
    assert.equal(await page.getByRole("cell", {name: "duplicate", exact: true}).count(), 2);
    await page.reload();
    await page.getByRole("cell", {name: "invalid", exact: true}).first().waitFor();
    const headers = {authorization: "Bearer " + await page.evaluate(() => localStorage.getItem("token"))};
    const history = await (await page.request.get(api, {headers})).json();
    const batch = history.find(b => b.rows[0].email === email);
    const replay = await page.request.post(api, {headers, data: {id: batch.id}});
    assert.deepEqual((await replay.json()).rows, batch.rows);
    assert.equal((await page.request.post(api, {headers, data: {id: batch.id, rows: [{fullName:"Other", email}]}})).status(), 409);
    assert.equal((await page.request.get(api)).status(), 401);
    console.log("PASS real Chrome, production UI, MySQL migrations and API: mixed import, duplicate, invalid, retained history, replay, changed-key rejection and anonymous denial.");
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
