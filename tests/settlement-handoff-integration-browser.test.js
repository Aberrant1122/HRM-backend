const assert=require('node:assert/strict');
const {randomUUID}=require('crypto');
const {Sequelize,DataTypes}=require('sequelize');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{
 const api='http://127.0.0.1:13481',ui='http://127.0.0.1:13480';
 const {schema}=await(await fetch(api+'/__fixture')).json();assert.match(schema,/^hrm_browser_\d+$/);
 const db=new Sequelize(schema,'root','',{host:'127.0.0.1',port:13479,dialect:'mysql',logging:false});
 const browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
 try{
  const Case=require('../models/offboardingCase')(db,DataTypes), Item=require('../models/offboardingItem')(db,DataTypes);
  const [c]=await Case.findOrCreate({where:{employeeId:2},defaults:{employeeId:2,exitType:'resignation',status:'open',version:1,createdBy:1}});
  await Item.findOrCreate({where:{caseId:c.id,title:'Return synthetic asset'},defaults:{caseId:c.id,title:'Return synthetic asset',kind:'asset_return',status:'pending'}});
  await db.query("UPDATE users SET role='admin' WHERE id=3");
  async function login(name,role){
    const p=await browser.newPage();p.setDefaultTimeout(12000);
    await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    await p.goto(ui+'/login');await p.locator('#email').fill(name+'@example.invalid');await p.locator('#password').fill('Synthetic-local-123');await p.getByRole('button',{name:/sign in/i}).click();await p.waitForURL('**/'+role+'/dashboard');
    return {p,headers:{Authorization:'Bearer '+await p.evaluate(()=>localStorage.getItem('token'))}};
  }
  const sender=await login('admin','admin'),receiver=await login('manager','admin'),employee=await login('employee','employee'),url=api+'/api/offboarding/employee/2/settlement';
  const read=await sender.p.request.get(url,{headers:sender.headers});assert.equal(read.status(),200,await read.text());
  const current=await read.json();
  const input={action:'assign',expectedSequence:current.sequence,caseVersion:c.version,recipientId:3,note:'Review outstanding clearance',commandKey:randomUUID()};
  const send=(h,data)=>sender.p.request.post(url,{headers:h,data});
  assert.equal((await send(employee.headers,input)).status(),403);
  assert.equal((await send(sender.headers,{...input,recipientId:2})).status(),409);
  assert.equal((await send(sender.headers,{...input,caseVersion:90})).status(),409);
  await sender.p.goto(ui+'/admin/employees/2/offboarding');
  const form=sender.p.getByRole('region',{name:'Final settlement handoff'});
  await form.getByLabel('Find payroll administrator').fill('Synthetic Manager');await form.getByRole('button',{name:'Search payroll administrator'}).click();
  await form.getByRole('combobox',{name:'Payroll administrator',exact:true}).selectOption('3');
  await form.getByLabel('Handoff or receipt note').fill(input.note);await form.getByRole('button',{name:'Send settlement handoff'}).click();
  await form.getByText('Assigned to Synthetic Manager').first().waitFor();
  const got=(await(await sender.p.request.get(url,{headers:sender.headers})).json());assert.equal(got.rows[0].pendingItems,1);
  const ack={...input,action:'receive',expectedSequence:got.sequence,commandKey:randomUUID(),note:'Received for payroll review'};
  assert.equal((await send(sender.headers,ack)).status(),403);
  await receiver.p.goto(ui+'/admin/payroll');await receiver.p.getByRole('link',{name:'My settlement handoffs'}).click();await receiver.p.getByRole('link',{name:'Synthetic Employee'}).click();
  const dest=receiver.p.getByRole('region',{name:'Final settlement handoff'});await dest.getByLabel('Handoff or receipt note').fill(ack.note);await dest.getByRole('button',{name:'Acknowledge receipt'}).click();
  await dest.getByText('Received by Synthetic Manager').first().waitFor();await receiver.p.goto(ui+'/admin/payroll/settlement-handoffs');await receiver.p.getByText('No settlement handoffs awaiting receipt.').waitFor();
  const latest=await(await sender.p.request.get(url,{headers:sender.headers})).json();
  const again={...input,expectedSequence:latest.sequence,commandKey:randomUUID(),note:'Second clearance review'};
  const retry=await Promise.all([send(sender.headers,again),send(sender.headers,again)]);const receipts=await Promise.all(retry.map(r=>r.json()));assert.ok(receipts[0].id);assert.equal(receipts[0].id,receipts[1].id);
  console.log('PASS offboarding assignment, active authorized recipient, stale case protection, recorded clearance snapshot, recipient-only acknowledgment, inbox and idempotent replay.');
 }finally{await browser.close();await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
