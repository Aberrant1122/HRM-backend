const assert=require("node:assert/strict"),{randomUUID}=require("node:crypto");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{
 const ui="http://127.0.0.1:13480",api="http://127.0.0.1:13481/api",browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
 try{
  const p=await browser.newPage();p.setDefaultTimeout(15000);
  await p.route("**/*",r=>new URL(r.request().url()).hostname==="127.0.0.1"?r.continue():r.abort());
  await p.goto(ui+"/login");await p.locator("#email").fill("admin@example.invalid");await p.locator("#password").fill("Synthetic-local-123");await p.getByRole("button",{name:/sign in/i}).click();await p.waitForURL("**/admin/dashboard");
  await p.goto(ui+"/admin/hr-tasks");await p.getByRole("link",{name:"My recurring HR reminders"}).click();
  const title="Synthetic reminder "+Date.now();await p.getByLabel("Reminder title").fill(title);
  await p.getByLabel("First occurrence").fill("2028-02-27");await p.getByLabel("Repeat every (days)").fill("2");
  await p.getByLabel("Last occurrence on or before (optional)").fill("2028-03-02");
  await p.getByRole("button",{name:"Create recurring reminder"}).click();
  const row=p.getByRole("article").filter({hasText:title});await row.waitFor();
  await p.getByLabel("Reminder view").selectOption("due");
  for(const [day,due] of [["2028-02-26",false],["2028-02-27",true],["2028-02-28",false],["2028-02-29",true],["2028-03-02",true],["2028-03-04",false]]){
    await p.getByLabel("Reminder date").fill(day);if(due)await row.waitFor();else await p.getByText("No matching reminders.").waitFor();
  }
  await p.getByLabel("Reminder view").selectOption("all");await row.getByRole("button",{name:"Stop recurrence"}).click();
  await row.getByLabel("Reason to stop").fill("Synthetic stop");await row.getByRole("button",{name:"Confirm stop"}).click();await row.getByText("Stopped · Synthetic stop").waitFor();
  await p.reload();await p.getByLabel("Reminder view").selectOption("all");await row.getByText("Stopped · Synthetic stop").waitFor();
  const headers={Authorization:"Bearer "+await p.evaluate(()=>localStorage.getItem("token"))},endpoint=api+"/hr-tasks/reminders";
  const body={id:randomUUID(),action:"create",title:"Replay",firstDate:"2026-11-17",endDate:null,intervalDays:7};
  for(let i=0;i<2;i++)assert.equal((await p.request.post(endpoint,{headers,data:body})).status(),200);
  assert.equal((await p.request.post(endpoint,{headers,data:{...body,title:"Changed"}})).status(),409);
  const login=await p.request.post(api+"/auth/login",{data:{email:"employee@example.invalid",password:"Synthetic-local-123"}});
  assert.equal((await p.request.get(endpoint,{headers:{Authorization:"Bearer "+(await login.json()).token}})).status(),403);
  console.log("PASS real Chrome/MySQL: recurring reminder dates including leap day and inclusive end, stop persistence, replay, conflicts and employee denial.");
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
