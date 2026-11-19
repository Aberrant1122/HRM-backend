const assert=require("node:assert/strict"),{randomUUID}=require("crypto");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{
 const ui="http://127.0.0.1:13480",api="http://127.0.0.1:13481/api",browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
 try{
  const p=await browser.newPage();p.setDefaultTimeout(15000);
  await p.route("**/*",r=>new URL(r.request().url()).hostname==="127.0.0.1"?r.continue():r.abort());
  await p.goto(ui+"/login");await p.locator("#email").fill("admin@example.invalid");await p.locator("#password").fill("Synthetic-local-123");await p.getByRole("button",{name:/sign in/i}).click();await p.waitForURL("**/admin/dashboard");
  await p.goto(ui+"/admin/employees/2");
  const section=p.getByRole("region",{name:"Employee record archive"});
  await section.getByLabel("Archive or restore reason").fill("Synthetic retained archive reason");
  await section.getByRole("button",{name:"Archive record",exact:true}).click();
  await section.getByText("Record status · Archived").waitFor();
  await section.getByRole("link",{name:"Archived records"}).click();
  await p.getByRole("heading",{name:"Archived employee records"}).waitFor();await p.locator("article a").filter({hasText:"Synthetic Employee"}).click();
  await section.getByLabel("Archive or restore reason").fill("Synthetic retained restore reason");
  await section.getByRole("button",{name:"Restore record"}).click();await section.getByText("Record status · Unarchived").waitFor();
  await p.reload();await section.getByText(/Restored · .*Synthetic retained restore reason/).waitFor();
  await section.getByText(/Archived · .*Synthetic retained archive reason/).waitFor();
  const headers={Authorization:"Bearer "+await p.evaluate(()=>localStorage.getItem("token"))},path=api+"/employee/2/archive";
  const latest=await(await p.request.get(path,{headers})).json();
  const body={commandKey:randomUUID(),expectedVersion:latest.version,archived:true,reason:"Check archive command replay"};
  for(let i=0;i<2;i++)assert.equal((await p.request.post(path,{headers,data:body})).status(),200);
  assert.equal((await p.request.post(path,{headers,data:{...body,reason:"Changed"}})).status(),409);
  assert.equal((await p.request.post(path,{headers,data:{...body,commandKey:randomUUID()}})).status(),409);
  const login=await p.request.post(api+"/auth/login",{data:{email:"employee@example.invalid",password:"Synthetic-local-123"}});
  assert.equal(login.status(),200);
  const employee={Authorization:"Bearer "+(await login.json()).token};
  assert.equal((await p.request.get(path,{headers:employee})).status(),403);
  console.log("PASS employee profile archive/restore; register, retained actor/reasons after reload, same-key retry, stale conflict, preserved employee login, non-admin denial.");
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
