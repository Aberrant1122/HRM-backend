const assert=require("node:assert/strict"),{Sequelize,DataTypes}=require("sequelize"),{chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{
 const ui="http://127.0.0.1:13480",api="http://127.0.0.1:13481/api",browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});let db;
 try{
  const p=await browser.newPage();p.setDefaultTimeout(15000);await p.route("**/*",r=>new URL(r.request().url()).hostname==="127.0.0.1"?r.continue():r.abort());
  const {schema}=await(await p.request.get("http://127.0.0.1:13481/__fixture")).json();assert.match(schema,/^hrm_browser_\d+$/);
  db=new Sequelize(schema,"root","",{host:"127.0.0.1",port:13479,dialect:"mysql",logging:false});
  const Period=require("../models/payrollPeriod")(db,DataTypes),Row=require("../models/employeePayroll")(db,DataTypes);
  const period=await Period.create({name:"Synthetic overtime "+Date.now(),start_date:"2026-01-01",end_date:"2026-01-31",payroll_type:"monthly",status:"draft",created_by:1});
  for(let i=0;i<26;i++){
   const snapshot=i===0?{overtimeHours:"0.125",overtimePay:"12.34",totalWorkedHours:"124.125"}:i===1?{overtimeHours:0}:i===2?{overtimeHours:"bad"}:i===3?{overtimeHours:-2}:i===4?{}:{overtimeHours:0.25,overtimePay:"10"};
   await Row.create({payroll_period_id:period.id,employee_id:i+2,gross_salary:"100",total_deductions:"10",net_salary:"90",status:"draft",snapshot});
  }
  await p.goto(ui+"/login");await p.locator("#email").fill("admin@example.invalid");await p.locator("#password").fill("Synthetic-local-123");await p.getByRole("button",{name:/sign in/i}).click();await p.waitForURL("**/admin/dashboard");
  await p.goto(ui+"/admin/payroll-record-report/periods/"+period.id);await p.getByRole("link",{name:"Recorded overtime and additional hours"}).click();
  await p.getByText("Recorded overtime hours · 5.375",{exact:true}).waitFor();await p.getByText("22 with overtime · 23 with recorded hours · 3 missing or invalid · 26 payroll records").waitFor();
  await p.getByRole("button",{name:"More overtime records"}).click();await p.getByRole("cell",{name:"124.125",exact:true}).waitFor();assert.equal(await p.locator("tbody tr").count(),26);
  const token=(await(await p.request.post(api+"/auth/login",{data:{email:"employee@example.invalid",password:"Synthetic-local-123"}})).json()).token;
  assert.equal((await p.request.get(api+"/payroll-record-report/periods/"+period.id+"/overtime",{headers:{Authorization:"Bearer "+token}})).status(),403);
  console.log("PASS 26 rows across pages: fractional hours, source zero, missing, malformed and negative excluded from sums, worked/pay facts, unauthorised denial.");
 }finally{if(db)await db.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
