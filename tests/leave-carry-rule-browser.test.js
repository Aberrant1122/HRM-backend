const assert=require('node:assert/strict');
const {randomUUID}=require('crypto');
const {Sequelize,DataTypes}=require('sequelize');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{
 const api='http://127.0.0.1:13695',ui='http://127.0.0.1:13694';
 const {schema}=await(await fetch(api+'/__fixture')).json();assert.match(schema,/^hrm_browser_\d+$/);
 const db=new Sequelize(schema,'root','',{host:'127.0.0.1',port:13693,dialect:'mysql',logging:false});
 const browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
 try {
  const Type=require('../models/leaveType')(db,DataTypes),Policy=require('../models/leavePolicy')(db,DataTypes),Assignment=require('../models/leavePolicyAssignment')(db,DataTypes);
  const type=await Type.create({name:'Synthetic annual '+Date.now(),status:'active',annual_quota:10});
  const saved={actorId:1,reason:'Fixture configuration',payloadHash:'0'.repeat(64)};
  const policy=await Policy.create({...saved,name:'Synthetic contract leave',rules:{resetMonthDay:'04-01',crossYearRule:'split',countingBasis:'calendar-days'},allowances:{[type.id]:10.5},commandKey:randomUUID()});
  const v=await Assignment.max('version',{where:{userId:2}});await Assignment.create({...saved,userId:2,version:(v||0)+1,policyId:policy.id,commandKey:randomUUID()});
  async function login(role){const p=await browser.newPage();p.setDefaultTimeout(15000);await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await p.goto(ui+'/login');await p.locator('#email').fill(role+'@example.invalid');await p.locator('#password').fill('Synthetic-local-123');await p.getByRole('button',{name:/sign in/i}).click();await p.waitForURL('**/'+role+'/dashboard');return p;}
  const p=await login('admin'),headers={Authorization:'Bearer '+await p.evaluate(()=>localStorage.getItem('token'))},endpoint=api+'/api/leaves/carry-forward/2/'+type.id+'?target=2027-04-01';
  const get=async()=>{const response=await p.request.get(endpoint,{headers});assert.equal(response.status(),200,await response.text());return response.json();};
  const initial=await get();assert.equal(initial.sourceRemaining,10.5);assert.equal(initial.preview,null);
  await p.goto(ui+'/admin/employees/2');await p.getByRole('link',{name:'Carry-forward rule for '+type.name}).click();
  await p.getByLabel('Receiving leave period start').fill('2027-04-01');await p.getByRole('button',{name:'Open period'}).click();
  await p.getByRole('combobox').selectOption('capped');await p.getByLabel('Maximum days').fill('4.5');await p.getByLabel('Expiry date (optional)').fill('2027-06-30');await p.getByLabel('Reason',{exact:true}).fill('Reviewed category rule');await p.getByRole('button',{name:'Save rule revision'}).click();
  await p.getByText(/Projected carry: 4.5 days/).waitFor();
  const command={policyId:policy.id,expectedRevision:1,mode:'uncapped',cap:null,expiry:null,reason:'Reviewed full unused allowance',commandKey:randomUUID()};
  const post=b=>p.request.post(endpoint,{headers,data:b});
  const both=await Promise.all([post(command),post(command)]);for(const r of both)assert.equal(r.status(),200,await r.text());
  assert.equal((await get()).preview,10.5);
  assert.equal((await post({...command,commandKey:randomUUID()})).status(),409);
  assert.equal((await post({...command,expectedRevision:2,mode:'none',commandKey:randomUUID()})).status(),200);
  const final=await get();assert.equal(final.rows.length,3);assert.equal(final.preview,0);assert.equal(final.sourceRemaining,10.5);
  const wrong=await p.request.get(endpoint.replace('04-01','04-02'),{headers});assert.equal(wrong.status(),409);
  const emp=await login('employee');const eh={Authorization:'Bearer '+await emp.evaluate(()=>localStorage.getItem('token'))};assert.equal((await emp.request.get(endpoint,{headers:eh})).status(),403);
  console.log('PASS employee-profile entry, policy-year boundary, capped/uncapped/disabled previews, retained revisions and expiry, stale and duplicate protection, unchanged balances and private access.');
 }finally{await browser.close();await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
