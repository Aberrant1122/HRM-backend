const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
const assert=require("node:assert/strict");
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});try{
 const p=await browser.newPage();await p.route("**/*",r=>new URL(r.request().url()).hostname==="127.0.0.1"?r.continue():r.abort());await p.goto("http://127.0.0.1:13694/login");
 await p.locator("#email").fill("employee@example.invalid");await p.locator("#password").fill("Synthetic-local-123");await p.getByRole("button",{name:/sign in/i}).click();
 await p.waitForURL("**/employee/dashboard");await p.goto("http://127.0.0.1:13694/my-documents");const row=p.locator("section").filter({hasText:"version 2"});await row.getByRole("button",{name:"Acknowledge this version"}).click();await row.getByText(/^Acknowledged /).waitFor();await p.reload();const retained=p.locator("section").filter({hasText:"version 2"});await retained.getByText(/^Acknowledged /).waitFor();const downloaded=p.waitForEvent("download");await retained.getByRole("button",{name:"Download PDF"}).click();assert.match((await downloaded).suggestedFilename(),/revision-\d+\.pdf$/);console.log("PASS Chrome: recipient inbox, specific version, explicit acknowledgement, retained receipt and authenticated download.");
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
