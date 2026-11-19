const assert=require("node:assert/strict"),{randomUUID}=require("node:crypto"),{chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{
 const ui="http://127.0.0.1:13480",api="http://127.0.0.1:13481/api",browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
 try{
  async function login(role){
   const p=await browser.newPage();p.setDefaultTimeout(15000);await p.route("**/*",r=>new URL(r.request().url()).hostname==="127.0.0.1"?r.continue():r.abort());
   await p.goto(ui+"/login");await p.locator("#email").fill(role+"@example.invalid");await p.locator("#password").fill("Synthetic-local-123");await p.getByRole("button",{name:/sign in/i}).click();await p.waitForURL("**/"+role+"/dashboard");return p;
  }
  const admin=await login("admin"),headers={Authorization:"Bearer "+await admin.evaluate(()=>localStorage.getItem("token"))},title="Synthetic overdue "+Date.now();
  const create=await admin.request.post(api+"/hr-tasks/commands",{headers,data:{action:"create",commandKey:randomUUID(),expectedVersion:0,title,description:"Synthetic verification",assigneeId:2,departmentId:null,dueDate:"2026-11-10",reason:"Create test task"}});
  assert.equal(create.status(),200,await create.text());const task=(await create.json()).data.task;
  await admin.goto(ui+"/admin/hr-tasks");await admin.getByRole("button",{name:"Open HR task "+task.id,exact:true}).click();
  const form=admin.getByRole("form",{name:"Send overdue notice"});await form.getByLabel("Overdue review date").fill("2026-11-10");assert.equal(await form.getByRole("button",{name:"Send in-app notice"}).isDisabled(),true);
  await form.getByLabel("Overdue review date").fill("2026-11-11");await form.getByRole("button",{name:"Send in-app notice"}).click();await form.getByText("Notice delivered to Synthetic Employee").waitFor();
  const employee=await login("employee");await employee.goto(ui+"/hr-tasks");const row=employee.getByRole("article").filter({hasText:title});
  await row.getByRole("button",{name:"Mark notice read"}).click();await row.getByText("Read",{exact:true}).waitFor();await employee.reload();await row.getByText("Read",{exact:true}).waitFor();
  const endpoint=api+"/hr-tasks/notices",body={id:randomUUID(),expectedVersion:task.version,taskId:task.id,asOf:"2026-11-11"};
  assert.equal((await admin.request.post(endpoint,{headers,data:body})).status(),409);
  assert.equal((await admin.request.post(endpoint,{headers,data:{...body,asOf:"2026-11-10"}})).status(),409);
  const own=await(await admin.request.get(endpoint,{headers})).json();assert.equal(own.data.rows.length,0);
  const eh={Authorization:"Bearer "+await employee.evaluate(()=>localStorage.getItem("token"))};
  assert.equal((await employee.request.post(endpoint,{headers:eh,data:body})).status(),403);
  const personal=await(await employee.request.get(endpoint,{headers:eh})).json();assert.equal((await admin.request.post(endpoint+"/"+personal.data.rows[0].id+"/read",{headers,data:{}})).status(),404);
  console.log("PASS actual HR task notice sender, private assignee inbox and read state, duplicate and due-date boundary, sender authorization and cross-account isolation.");
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
