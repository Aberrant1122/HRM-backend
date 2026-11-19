const assert=require("node:assert/strict"),{Sequelize,DataTypes}=require("sequelize"),{chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{
 const ui="http://127.0.0.1:13694",api="http://127.0.0.1:13695/api",browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
 let db;
 try{
  const p=await browser.newPage();p.setDefaultTimeout(15000);await p.route("**/*",r=>new URL(r.request().url()).hostname==="127.0.0.1"?r.continue():r.abort());
  const {schema}=await(await p.request.get("http://127.0.0.1:13695/__fixture")).json();assert.match(schema,/^hrm_browser_\d+$/);
  db=new Sequelize(schema,"root","",{host:"127.0.0.1",port:13693,dialect:"mysql",logging:false});
  const Profile=require("../models/payrollProfile")(db,DataTypes);
  const sample=Array.from({length:28},(_,i)=>({employee_id:i+2,salary_type:i<26?"hourly":"daily",base_salary:i===0?"12345678.90":String(100+i)+".10",overtime_eligible:i%2===0,overtime_rate:"12.30",tax_percentage:i%2===0?"2.25":null}));
  for(const row of sample)await Profile.findOrCreate({where:{employee_id:row.employee_id},defaults:row});const prefix=JSON.stringify(await Profile.findAll({order:[["id","ASC"]],raw:true}));
  await p.goto(ui+"/login");await p.locator("#email").fill("admin@example.invalid");await p.locator("#password").fill("Synthetic-local-123");await p.getByRole("button",{name:/sign in/i}).click();await p.waitForURL("**/admin/dashboard");
  await p.goto(ui+"/admin/payroll-record-report");await p.getByRole("link",{name:"Salary and compensation summary"}).click();
  await p.getByText("hourly · 26 profiles · 13 overtime eligible").waitFor();await p.getByText("daily · 2 profiles · 1 overtime eligible").waitFor();
  await p.getByRole("combobox").selectOption("hourly");await p.getByText("daily · 2 profiles · 1 overtime eligible").waitFor({state:"hidden"});
  await p.getByRole("button",{name:"More payroll profiles"}).click();await p.getByRole("cell",{name:"12345678.90",exact:true}).waitFor();assert.equal(await p.locator("tbody tr").count(),26);
  const token=(await(await p.request.post(api+"/auth/login",{data:{email:"employee@example.invalid",password:"Synthetic-local-123"}})).json()).token;
  assert.equal((await p.request.get(api+"/payroll-record-report/compensation",{headers:{Authorization:"Bearer "+token}})).status(),403);
  assert.equal(JSON.stringify(await Profile.findAll({order:[["id","ASC"]],raw:true})),prefix);
  console.log("PASS normal report navigation, 28 profiles, basis groups and pagination, exact decimal rates, restricted access and unchanged DB rows.");
 }finally{if(db)await db.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
