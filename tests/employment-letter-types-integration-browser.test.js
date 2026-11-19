const assert=require("node:assert/strict");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{
 const ui="http://127.0.0.1:13480", browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
 try{
  const p=await browser.newPage();p.setDefaultTimeout(15000);
  await p.route("**/*",r=>new URL(r.request().url()).hostname==="127.0.0.1"?r.continue():r.abort());
  await p.goto(ui+"/login");await p.locator("#email").fill("admin@example.invalid");await p.locator("#password").fill("Synthetic-local-123");await p.getByRole("button",{name:/sign in/i}).click();await p.waitForURL("**/admin/dashboard");
  const paths=[
    ["onboarding","Draft appointment letter","appointment"],["onboarding","Draft employment contract","employment_contract"],
    ["probation","Draft confirmation letter","probation_confirmation"],["probation","Draft salary revision letter","salary_revision"],["probation","Draft designation revision letter","designation_revision"]
  ];
  for(const [path,label,kind] of paths){
    await p.goto(ui+"/admin/employees/2/"+path);await p.getByRole("link",{name:label,exact:true}).click();
    const form=p.getByRole("form",{name:"Create letter template",exact:true});
    await form.getByLabel("New template name",{exact:true}).fill("Synthetic "+kind);
    assert.equal(await form.getByLabel("New template kind",{exact:true}).inputValue(),kind);
    await form.getByLabel("New template text",{exact:true}).fill("For {{employee_name}} on {{document_date}}.");
    await form.getByLabel("Creation reason",{exact:true}).fill("Synthetic verification");
    await form.getByRole("button",{name:"Create letter template",exact:true}).click();
    const generate=p.getByRole("form",{name:"Generate employee draft",exact:true});
    await generate.getByLabel("Draft title",{exact:true}).fill("Synthetic "+kind+" draft");
    await generate.getByLabel("Document date",{exact:true}).fill("2026-11-16");
    await generate.getByLabel("Generation reason",{exact:true}).fill("Synthetic explicit draft request");
    await generate.getByRole("button",{name:"Generate retained draft",exact:true}).click();
    const selected=p.getByRole("region",{name:"Selected employee draft",exact:true});
    await selected.getByRole("heading",{name:"Draft — not issued: Synthetic "+kind+" draft · version 1",exact:true}).waitFor();
    assert.match(await selected.locator("pre").first().textContent(),/For Synthetic Employee on 2026-11-16/);
  }
  console.log("PASS all five employee-scoped onboarding/probation entries generate the chosen letter with retained employee and date.");
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
