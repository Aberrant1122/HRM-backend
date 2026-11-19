const assert=require("node:assert/strict"),{Sequelize,DataTypes}=require("sequelize"),{chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{
 const ui="http://127.0.0.1:13480",api="http://127.0.0.1:13481/api",browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});let db;
 try{
  const p=await browser.newPage();p.setDefaultTimeout(15000);await p.route("**/*",r=>new URL(r.request().url()).hostname==="127.0.0.1"?r.continue():r.abort());
  const {schema}=await(await p.request.get("http://127.0.0.1:13481/__fixture")).json();assert.match(schema,/^hrm_browser_\d+$/);
  db=new Sequelize(schema,"root","",{host:"127.0.0.1",port:13479,dialect:"mysql",logging:false});
  const Period=require("../models/payrollPeriod")(db,DataTypes),Row=require("../models/employeePayroll")(db,DataTypes);
  const periods=[];for(const [start,end] of [["2026-01-01","2026-01-31"],["2026-02-01","2026-02-28"],["2026-03-01","2026-03-31"]])periods.push(await Period.create({name:"Synthetic "+end,start_date:start,end_date:end,payroll_type:"monthly",status:"paid",created_by:1}));
  const insert=(employee,period,status)=>Row.create({payroll_period_id:period.id,employee_id:employee,gross_salary:"100.01",total_deductions:"10.01",net_salary:"90.00",status,locked:status==="paid",snapshot:{}});
  for(let i=0;i<26;i++)await insert(i+2,periods[0],"paid");await insert(2,periods[1],"paid");await insert(3,periods[1],"approved");await insert(2,periods[2],"paid");
  await p.goto(ui+"/login");await p.locator("#email").fill("admin@example.invalid");await p.locator("#password").fill("Synthetic-local-123");await p.getByRole("button",{name:/sign in/i}).click();await p.waitForURL("**/admin/dashboard");
  await p.goto(ui+"/admin/payroll-record-report");await p.getByRole("link",{name:"Employee and workforce payroll expenditure"}).click();
  await p.getByLabel("Period ending from").fill("2026-01-31");await p.getByLabel("Period ending through").fill("2026-02-28");await p.getByRole("button",{name:"Run expenditure report"}).click();
  await p.getByText("26 employees · 2 periods · 27 paid records · 1 records with another status").waitFor();await p.getByText(/Paid gross PKR 2700\.27/).waitFor();
  await p.getByRole("button",{name:"More employee costs"}).click();await p.getByRole("cell",{name:"PKR 200.02",exact:true}).waitFor();assert.equal(await p.locator("tbody tr").count(),26);
  await p.getByLabel("Period ending through").fill("2026-04-02");await p.getByLabel("Period ending from").fill("2026-04-01");await p.getByRole("button",{name:"Run expenditure report"}).click();await p.getByText(/0 employees · 0 periods · 0 paid records/).waitFor();
  const token=(await(await p.request.post(api+"/auth/login",{data:{email:"employee@example.invalid",password:"Synthetic-local-123"}})).json()).token;
  assert.equal((await p.request.get(api+"/payroll-record-report/expenditure?from=2026-01-01&to=2026-02-28",{headers:{Authorization:"Bearer "+token}})).status(),403);
  console.log("PASS real Chrome/MySQL: paid-only source, inclusive period-end range, across-period employee grouping and exact company totals, paging, empty range, role denial.");
 }finally{if(db)await db.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
