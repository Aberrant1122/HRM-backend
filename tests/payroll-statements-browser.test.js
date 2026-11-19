const assert=require("node:assert/strict"),{Sequelize,DataTypes}=require("sequelize"),{chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{
 const ui="http://127.0.0.1:13694",api="http://127.0.0.1:13695/api",browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});let db;
 try{
  const p=await browser.newPage();p.setDefaultTimeout(15000);await p.route("**/*",r=>new URL(r.request().url()).hostname==="127.0.0.1"?r.continue():r.abort());
  const {schema}=await(await p.request.get("http://127.0.0.1:13695/__fixture")).json();assert.match(schema,/^hrm_browser_\d+$/);
  db=new Sequelize(schema,"root","",{host:"127.0.0.1",port:13693,dialect:"mysql",logging:false});
  const Period=require("../models/payrollPeriod")(db,DataTypes),Row=require("../models/employeePayroll")(db,DataTypes);
  const period=await Period.create({name:"Synthetic January "+Date.now(),start_date:"2026-01-01",end_date:"2026-01-31",payroll_type:"monthly",status:"approved",created_by:1});
  const other=await Period.create({name:"Synthetic February "+Date.now(),start_date:"2026-02-01",end_date:"2026-02-28",payroll_type:"monthly",status:"draft",created_by:1});
  for(let i=0;i<26;i++)await Row.create({payroll_period_id:period.id,employee_id:i+2,gross_salary:"100.01",total_deductions:"10.00",net_salary:"90.01",status:i===0?"paid":"draft",locked:i===0,snapshot:{}});
  const rows=await Row.findAll({where:{payroll_period_id:period.id},order:[["id","ASC"]],raw:true});const before=JSON.stringify(rows);
  await p.goto(ui+"/login");await p.locator("#email").fill("admin@example.invalid");await p.locator("#password").fill("Synthetic-local-123");await p.getByRole("button",{name:/sign in/i}).click();await p.waitForURL("**/admin/dashboard");
  await p.goto(ui+"/admin/payroll-record-report");await p.getByLabel("From date").fill("2026-01-01");await p.getByLabel("Through date").fill("2026-01-31");await p.getByRole("button",{name:"Run payroll record report"}).click();
  await p.getByRole("link",{name:period.name+" (#"+period.id+")"}).click();await p.getByRole("cell",{name:"2500.25",exact:true}).waitFor();await p.getByRole("button",{name:"More payroll rows"}).click();
  await p.getByRole("link",{name:"Open payslip for Synthetic Employee",exact:true}).click();await p.getByRole("heading",{name:"Payslip",exact:true}).waitFor();
  const slip=p.locator("#employee-payslip");await slip.getByText("90.01",{exact:true}).waitFor();await slip.getByText("Payroll status · paid").waitFor();
  await p.emulateMedia({media:"print"});assert.equal(await p.getByRole("button",{name:"Print payslip"}).count(),0);assert.ok((await p.pdf()).length>1000);await p.emulateMedia({media:"screen"});
  const headers={Authorization:"Bearer "+await p.evaluate(()=>localStorage.getItem("token"))};
  const url=api+"/payroll-record-report/periods/";
  assert.equal((await p.request.get(url+other.id+"/payslips/"+rows[0].id,{headers})).status(),404);
  const token=(await(await p.request.post(api+"/auth/login",{data:{email:"employee@example.invalid",password:"Synthetic-local-123"}})).json()).token;
  assert.equal((await p.request.get(url+period.id+"/payslips/"+rows[0].id,{headers:{Authorization:"Bearer "+token}})).status(),403);
  assert.equal(JSON.stringify(await Row.findAll({where:{payroll_period_id:period.id},order:[["id","ASC"]],raw:true})),before);
  console.log("PASS 26 retained payroll rows, normal report-to-payslip navigation, exact monetary totals, print PDF, period and role isolation and no payroll writes.");
 }finally{if(db)await db.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
