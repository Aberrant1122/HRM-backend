const {chromium}=require(process.env.PLAYWRIGHT_MODULE),assert=require("node:assert/strict"),{randomUUID}=require("crypto");
(async()=>{
 const api="http://127.0.0.1:13695/api",ui="http://127.0.0.1:13694";
 assert.match((await(await fetch("http://127.0.0.1:13695/__fixture")).json()).schema,/^hrm_browser_\d+$/);
 const browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
 try{const p=await browser.newPage();p.setDefaultTimeout(12000);await p.route("**/*",r=>new URL(r.request().url()).hostname==="127.0.0.1"?r.continue():r.abort());await p.goto(ui+"/login");await p.locator("#email").fill("admin@example.invalid");await p.locator("#password").fill("Synthetic-local-123");await p.getByRole("button",{name:/sign in/i}).click();await p.waitForURL("**/admin/dashboard");
 const headers={Authorization:"Bearer "+await p.evaluate(()=>localStorage.getItem("token"))};
 const post=(path,body)=>p.request.post(api+path,{headers,data:{reason:"Synthetic changes",commandKey:randomUUID(),...body}});
 async function get(path){const r=await p.request.get(api+path,{headers});assert.equal(r.status(),200,await r.text());return (await r.json()).data;}
 async function ok(r){assert.equal(r.status(),200,await r.text());}
 const path="/probation-decisions/employee/2/plan",report="/probation-decisions/upcoming?from=2032-02-29&to=2032-02-29";
 await ok(await post("/probation/employee/2/commands",{action:"create",expectedVersion:0,startDate:"2032-01-01",endDate:"2032-03-31",evaluationDate:null}));
 const payload={expectedDate:"2032-02-29",expectedVersion:0,caseVersion:1};
 assert.equal((await post(path,payload)).status(),403);assert.equal(Number((await get(report)).coverage.unscheduled),1);
 await ok(await post("/probation-decisions/permissions/commands",{userId:1,employeeId:2,active:true,expectedVersion:0}));
 await p.goto(ui+"/probation-decisions/2");await p.getByLabel("Expected confirmation date").fill("2032-02-29");await p.getByLabel("Change reason",{exact:true}).fill("Synthetic UI plan");await p.getByRole("button",{name:"Save confirmation plan"}).click();await p.getByText("Plan saved",{exact:true}).waitFor().catch(async e=>{console.error(await p.locator("main").innerText());throw e});
 assert.equal((await get(report)).rows[0].expectedDate,"2032-02-29");assert.equal((await get(report.replaceAll("02-29","03-31"))).rows.length,0);
 await p.goto(ui+"/admin/probation-coverage-report");await p.getByLabel("Upcoming from").fill("2032-02-29");await p.getByLabel("Upcoming through").fill("2032-02-29");await p.getByRole("button",{name:"Run upcoming confirmations"}).click();await p.getByText("Synthetic Employee · 2032-02-29",{exact:true}).waitFor();
 assert.equal((await post(path,{...payload,expectedDate:"2032-03-01"})).status(),409);
 const edit={...payload,expectedVersion:1,expectedDate:"2032-03-01",commandKey:randomUUID()};await ok(await post(path,edit));await ok(await post(path,edit));
 await ok(await post("/probation-decisions/employee/2/commands",{action:"confirm",expectedVersion:1,decisionDate:"2032-03-02"}));assert.equal(Number((await get(report)).coverage.closed),1);
 console.log("PASS actual scoped planning, unplanned coverage, exact leap-day inclusive window, no expiry inference, UI report, stale write rejection, replay and closed-case exclusion.");
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
