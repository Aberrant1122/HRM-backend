const assert=require("node:assert/strict"),{randomUUID}=require("node:crypto"),{chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{
 const ui="http://127.0.0.1:13694",api="http://127.0.0.1:13695/api",browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
 try{
  const page=await browser.newPage();page.setDefaultTimeout(15000);await page.route("**/*",r=>new URL(r.request().url()).hostname==="127.0.0.1"?r.continue():r.abort());
  async function token(role){return(await(await page.request.post(api+"/auth/login",{data:{email:role+"@example.invalid",password:"Synthetic-local-123"}})).json()).token;}
  const admin={Authorization:"Bearer "+await token("admin")},employee={Authorization:"Bearer "+await token("employee")},manager={Authorization:"Bearer "+await token("manager")};
  const changes=async h=>(await(await page.request.get(api+"/policies/changes",{headers:h})).json()).data;
  async function cmd(body){const r=await page.request.post(api+"/policies/commands",{headers:admin,data:{...body,commandKey:randomUUID(),reason:"Synthetic policy change verification"}});assert.equal(r.status(),200,await r.text());return(await r.json()).data;}
  const first=await cmd({action:"create",expectedVersion:0,kind:"policy",title:"Synthetic first policy",content:"Initial synthetic content"});
  const publish=await cmd({action:"publish",documentId:first.document.id,expectedVersion:first.document.version,revisionId:first.revision.id,recipientIds:[2],mandatory:true});
  assert.equal((await changes(employee)).total,0);
  const second=await cmd({action:"revise",documentId:first.document.id,expectedVersion:publish.document.version,title:"Synthetic updated policy",content:"Updated terms"});
  assert.equal((await changes(employee)).total,0);
  await cmd({action:"publish",documentId:first.document.id,expectedVersion:second.document.version,revisionId:second.revision.id,recipientIds:[2],mandatory:true});
  assert.equal((await changes(manager)).total,0);assert.equal((await changes(employee)).total,1);
  await page.goto(ui+"/login");await page.locator("#email").fill("employee@example.invalid");await page.locator("#password").fill("Synthetic-local-123");await page.getByRole("button",{name:/sign in/i}).click();
  await page.waitForURL("**/employee/dashboard");await page.getByRole("link",{name:"Policy updates (1)"}).click();
  const revision=page.getByRole("region",{name:"Assigned policy revision"});await revision.getByRole("heading",{name:"Synthetic updated policy · revision 2"}).waitFor();assert.equal((await changes(employee)).total,1);
  await revision.getByRole("button",{name:"I have read this revision"}).click();await revision.getByRole("button",{name:"I acknowledge this revision"}).waitFor();
  await page.waitForFunction(()=>document.body.innerText.includes("Acknowledged: Not acknowledged") && document.querySelector("button:disabled")!==null);
  assert.equal((await changes(employee)).total,0);console.log("PASS policy publication to assigned recipient, dashboard notice, exact deep link, read clears notice and acknowledgement stays separate.");
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
