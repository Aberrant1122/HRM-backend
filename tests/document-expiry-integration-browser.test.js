const assert=require("node:assert/strict"),{randomUUID}=require("node:crypto");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{
 const ui="http://127.0.0.1:13480",api="http://127.0.0.1:13481/api",browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
 try{
  const p=await browser.newPage();p.setDefaultTimeout(15000);
  await p.route("**/*",r=>new URL(r.request().url()).hostname==="127.0.0.1"?r.continue():r.abort());
  await p.goto(ui+"/login");await p.locator("#email").fill("admin@example.invalid");await p.locator("#password").fill("Synthetic-local-123");await p.getByRole("button",{name:/sign in/i}).click();await p.waitForURL("**/admin/dashboard");
  const headers={Authorization:"Bearer "+await p.evaluate(()=>localStorage.getItem("token"))},docs=api+"/employee-documents/",title="Synthetic dated document "+Date.now();
  const upload=async body=>{
    const r=await p.request.post(docs+"uploads",{headers,multipart:{file:{name:"sample.pdf",mimeType:"application/pdf",buffer:Buffer.from("%PDF-1.4\nSynthetic\n%%EOF\n")},command:JSON.stringify({...body,title,description:"Synthetic retained file",employeeId:2,commandKey:randomUUID(),reason:"Synthetic verification"})}});
    assert.equal(r.status(),200,await r.text());return (await r.json()).data;
  };
  const doc=await upload({action:"create",expectedVersion:0});
  await p.goto(ui+"/employee-documents");await p.getByRole("button",{name:"Open document",exact:true}).first().click();
  const expiry=p.getByRole("region",{name:"Document expiry",exact:true});
  await expiry.getByLabel("Expiry date").fill("2026-12-01");
  await expiry.getByLabel("Reminder date").fill("2026-11-18");
  await expiry.getByLabel("Reminder change reason").fill("Recorded explicit due dates");
  await expiry.getByRole("button",{name:"Save expiry reminder"}).click();
  await expiry.getByText("Expires 2026-12-01 · reminder 2026-11-18").waitFor();
  await p.getByRole("link",{name:"Document expiry reminders"}).click();
  const date=p.getByLabel("Show reminders due by"),load=p.getByRole("button",{name:"Load reminders"});
  await date.fill("2026-11-17");await load.click();await p.getByText("No due reminders.").waitFor();
  await date.fill("2026-11-18");await load.click();await p.getByRole("heading",{name:title+" · version 1"}).waitFor();
  await upload({action:"revise",documentId:doc.document.id,expectedVersion:1});
  await load.click();await p.getByText("No due reminders.").waitFor();
  const login=await p.request.post(api+"/auth/login",{data:{email:"employee@example.invalid",password:"Synthetic-local-123"}});
  assert.equal((await p.request.get(docs+"expiry?asOf=2026-12-01",{headers:{Authorization:"Bearer "+(await login.json()).token}})).status(),403);
  console.log("PASS current-revision dates, inclusive reminder boundary, exclusion after PDF supersession and employee denial via real Chrome/MySQL.");
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
