const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');

test('QA04/05: storage exceptions and delayed onboarding responses stay scoped across navigation/admin changes',{timeout:240000},async t=>{
  assert.equal(process.env.HRM_DISPOSABLE_MYSQL,'1');
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
  const browser=await chromium.launch({headless:true,executablePath:process.env.HRM_CHROME_PATH});
  const context=await browser.newContext({viewport:{width:1440,height:1100}}),api=context.request;
  await context.addInitScript(()=>{
    const original={getItem:Storage.prototype.getItem,setItem:Storage.prototype.setItem,removeItem:Storage.prototype.removeItem};
    window.__retryFault=original.getItem.call(sessionStorage,'synthetic-retry-fault')||'';window.__retryWrites=[];
    for(const method of ['getItem','setItem','removeItem'])Storage.prototype[method]=function(...args){
      if(String(args[0]).startsWith('manual-onboarding:')){
        if(method==='setItem')window.__retryWrites.push(JSON.parse(args[1]));
        if(window.__retryFault===method)throw new DOMException('Synthetic storage exception',method==='setItem'?'QuotaExceededError':'SecurityError');
      }
      return original[method].apply(this,args);
    };
  });
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());return url.hostname==='127.0.0.1'&&['13380','13381','13382'].includes(url.port)?route.continue():route.abort();
  });
  const page=await context.newPage();page.setDefaultTimeout(45000);
  const ui='http://127.0.0.1:13380',base='http://127.0.0.1:13381/api',releases=[];let fixture,headers,A,B,Aname,Bname,Aemail,promoted=false;
  const commands=[];page.on('request',request=>{if(request.method()==='POST'&&/\/onboarding\/employee\/\d+\/commands$/.test(request.url()))commands.push({url:request.url(),body:request.postDataJSON()});});
  const endpoint=id=>base+'/onboarding/employee/'+id,path=id=>'/admin/employees/'+id+'/onboarding',key=(actor,id)=>'manual-onboarding:'+actor+':'+id;
  async function read(id){const response=await api.get(endpoint(id),{headers});assert.equal(response.status(),200);return(await response.json()).data;}
  async function change(id,action,extra={}){const state=await read(id);const body={commandKey:crypto.randomUUID(),action,expectedVersion:state.onboarding?.version??0,...extra};const response=await api.post(endpoint(id)+'/commands',{headers,data:body});assert.equal(response.status(),200,await response.text());return(await response.json()).data;}
  async function login(email){await page.goto(ui+'/login');await page.locator('#email').fill(email);await page.locator('#password').fill('Synthetic-local-123');await page.getByRole('button',{name:/sign in/i}).click();await page.waitForURL('**/admin/dashboard');}
  async function fault(value){await page.evaluate(value=>{window.__retryFault=value;sessionStorage.setItem('synthetic-retry-fault',value);},value);}
  async function frame(){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
  async function visible(id,name){await page.waitForURL('**'+path(id));await page.getByText(name,{exact:true}).waitFor();await page.getByLabel('Item title',{exact:true}).waitFor();}
  async function stored(actor,id){return page.evaluate(key=>{const raw=sessionStorage.getItem(key);return raw?JSON.parse(raw):null;},key(actor,id));}
  async function delayed(match,override){
    let release,readyResolve,doneResolve;const gate=new Promise(resolve=>{release=resolve;}),ready=new Promise(resolve=>{readyResolve=resolve;}),done=new Promise(resolve=>{doneResolve=resolve;});
    releases.push(release);let taken=false;
    const handler=async route=>{
      if(taken||!match(route.request()))return route.continue();taken=true;
      try{
        const response=await route.fetch(),body=await response.body();readyResolve({command:route.request().method()==='POST'?route.request().postDataJSON():null});
        await gate;
        try{await route.fulfill(override?{status:override,contentType:'application/json',body:JSON.stringify({message:'Synthetic A reload failure'})}:{response,body});}catch{/* Navigation may cancel a fetch; the server result is already known. */}
      }finally{doneResolve();}
    };
    await page.route('**/api/onboarding/employee/**',handler);
    return{ready,release,async finish(){release();await done;await page.unroute('**/api/onboarding/employee/**',handler);await frame();}};
  }
  async function prepareHistory(pendingB=false,historyHint=false){
    await page.goto(ui+path(B));await visible(B,Bname);
    let retainedB;
    if(pendingB){
      const abort=route=>route.abort('failed');await page.route(endpoint(B)+'/commands',abort);
      await page.getByLabel('Item title',{exact:true}).fill('Retained B original change');await page.getByRole('button',{name:'Save change',exact:true}).click();
      await page.getByRole('alert').filter({hasText:'The save outcome is uncertain'}).waitFor();retainedB=await stored(fixture.ids.admin,B);await page.unroute(endpoint(B)+'/commands',abort);
    }
    let hint;
    if(historyHint){hint=async route=>{const response=await route.fetch(),body=await response.json();body.data.hasEarlierHistory=true;await route.fulfill({response,body:JSON.stringify(body)});};await page.route(endpoint(A),hint);}
    await page.getByRole('link',{name:'Onboarding',exact:true}).last().click();await page.waitForURL('**/admin/onboarding');
    await page.getByLabel('Find employee for onboarding').fill(Aemail);await page.getByRole('button',{name:'Search employees',exact:true}).click();
    await page.locator('a[href="'+path(A)+'"]').click();await visible(A,Aname);
    if(hint)await page.unroute(endpoint(A),hint);
    return retainedB;
  }
  async function backB(){await page.evaluate(()=>history.go(-2));await visible(B,Bname);}
  try{
    for(let i=0;;i++){try{fixture=await(await api.get('http://127.0.0.1:13381/__fixture')).json();break;}catch(error){if(i>=119)throw error;await new Promise(resolve=>setTimeout(resolve,250));}}
    await login('admin@example.invalid');headers={Authorization:'Bearer '+await page.evaluate(()=>localStorage.getItem('token'))};
    A=fixture.ids.employee;const other=(await(await api.get(base+'/employee/all?search=pagination0%40example.invalid',{headers})).json()).data[0];B=other.id;
    const employee=await read(A);Aname=employee.employee.fullName;Aemail=employee.employee.email;Bname=other.fullName;
    for(const [id,title]of[[A,'Employee A existing item'],[B,'Employee B existing item']]){const state=await read(id);if(!state.onboarding)await change(id,'create');if(!(await read(id)).items.some(item=>item.title===title))await change(id,'add_item',{title});}
    await t.test('set/get/remove failures recover without a fresh retry identity or accidental dispatch',async()=>{
      await page.goto(ui+path(A));await visible(A,Aname);await fault('setItem');
      const before=commands.length;await page.getByLabel('Item title',{exact:true}).fill('Storage failure exact command');await page.getByRole('button',{name:'Save change',exact:true}).click();
      await page.getByRole('alert').filter({hasText:'Retry storage could not save'}).waitFor();assert.equal(commands.length,before);
      assert.equal(await page.getByRole('button',{name:'Retry same change',exact:true}).isEnabled(),true);
      const attempted=await page.evaluate(()=>window.__retryWrites.at(-1).commandKey);
      await fault('');await page.getByRole('button',{name:'Retry same change',exact:true}).click();await page.getByText('Checklist saved. Account access and employment status are unchanged.',{exact:true}).waitFor();
      assert.equal(commands.at(-1).body.commandKey,attempted);
      await page.getByLabel('Item title',{exact:true}).fill('Cleanup failure exact command');await fault('removeItem');await page.getByRole('button',{name:'Save change',exact:true}).click();
      await page.getByRole('alert').filter({hasText:'Retry cleanup failed'}).waitFor();const pending=await stored(fixture.ids.admin,A),count=(await read(A)).history.length;
      assert.equal(await page.getByRole('button',{name:'Retry same change',exact:true}).isEnabled(),true);
      await fault('');await page.getByRole('button',{name:'Retry same change',exact:true}).click();await page.getByText('Saved earlier; no duplicate history was added.',{exact:true}).waitFor();
      assert.equal(commands.at(-1).body.commandKey,pending.commandKey);assert.equal((await read(A)).history.length,count);assert.equal(await stored(fixture.ids.admin,A),null);
      await fault('getItem');await page.reload();await page.getByRole('alert').filter({hasText:'Retry storage cannot be read'}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Save change',exact:true}).isDisabled(),true);
      await fault('');await page.getByRole('button',{name:'Check retry storage',exact:true}).click();await page.getByLabel('Item title',{exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Save change',exact:true}).isEnabled(),true);
    });
    await t.test('late committed A save cannot replace B or reset its editor; A keeps the same retry on return',async()=>{
      await prepareHistory();const hold=await delayed(request=>request.url()===endpoint(A)+'/commands'&&request.method()==='POST');
      await page.getByLabel('Item title',{exact:true}).fill('A delayed committed change');await page.getByRole('button',{name:'Save change',exact:true}).click();const sent=await hold.ready;
      await backB();assert.equal(await page.getByLabel('Item title',{exact:true}).inputValue(),'');await page.getByLabel('Item title',{exact:true}).fill('Unsent B editor draft');
      await hold.finish();assert.equal(await page.getByText(Aname,{exact:true}).count(),0);assert.equal(await page.getByLabel('Item title',{exact:true}).inputValue(),'Unsent B editor draft');
      assert.equal((await stored(fixture.ids.admin,A)).commandKey,sent.command.commandKey);
      await page.evaluate(()=>history.go(2));await page.waitForURL('**'+path(A));await page.getByRole('button',{name:'Retry same change',exact:true}).waitFor();
      const count=(await read(A)).history.length;await page.getByRole('button',{name:'Retry same change',exact:true}).click();await page.getByText('Saved earlier; no duplicate history was added.',{exact:true}).waitFor();
      assert.equal(commands.at(-1).body.commandKey,sent.command.commandKey);assert.equal((await read(A)).history.length,count);
    });
    await t.test('late A reload failure leaves B pending identity, error and controls untouched',async()=>{
      const pendingB=await prepareHistory(true);const hold=await delayed(request=>request.url()===endpoint(A)&&request.method()==='GET',500);
      await page.getByRole('button',{name:'Reload checklist',exact:true}).click();await hold.ready;await backB();await page.getByRole('button',{name:'Retry same change',exact:true}).waitFor();
      await hold.finish();assert.equal(await page.getByText('Synthetic A reload failure',{exact:false}).count(),0);assert.equal((await stored(fixture.ids.admin,B)).commandKey,pendingB.commandKey);
      assert.equal(await page.getByRole('button',{name:'Retry same change',exact:true}).isEnabled(),true);
      await page.getByRole('button',{name:'Retry same change',exact:true}).click();await page.getByText('Checklist saved. Account access and employment status are unchanged.',{exact:true}).waitFor();
      assert.equal(commands.at(-1).body.commandKey,pendingB.commandKey);
    });
    await t.test('late A earlier-history response cannot merge A data into B',async()=>{
      // Only availability is injected to reach this client branch; case/history reads remain real MySQL.
      await prepareHistory(false,true);const hold=await delayed(request=>new URL(request.url()).pathname.endsWith('/employee/'+A)&&new URL(request.url()).searchParams.has('before'));
      await page.getByRole('button',{name:'Load earlier history',exact:true}).click();await hold.ready;await backB();
      await page.getByLabel('Item title',{exact:true}).fill('B history-safe editor draft');await hold.finish();
      assert.equal(await page.getByText(Aname,{exact:true}).count(),0);assert.equal(await page.getByLabel('Item title',{exact:true}).inputValue(),'B history-safe editor draft');
      assert.equal(await page.getByRole('region',{name:'Employee A existing item',exact:true}).count(),0);
    });
    await t.test('changed admin ignores old save/finally and retains both identities under their own keys',async()=>{
      assert.equal((await api.patch(base+'/employee/'+fixture.ids.manager+'/role',{headers,data:{role:'admin'}})).status(),200);
      promoted=true;
      await page.goto(ui+path(A));await visible(A,Aname);const old=await delayed(request=>request.url()===endpoint(A)+'/commands'&&request.method()==='POST');
      await page.getByLabel('Item title',{exact:true}).fill('Original admin delayed save');await page.getByRole('button',{name:'Save change',exact:true}).click();const original=await old.ready;
      await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForURL('**/login');
      await page.locator('#email').fill('manager@example.invalid');await page.locator('#password').fill('Synthetic-local-123');await page.getByRole('button',{name:/sign in/i}).click();await page.waitForURL('**/admin/dashboard');
      await page.getByRole('link',{name:'Onboarding',exact:true}).click();await page.getByLabel('Find employee for onboarding').fill(other.email);await page.getByRole('button',{name:'Search employees',exact:true}).click();await page.getByRole('link',{name:'Open checklist',exact:true}).click();await visible(B,Bname);
      assert.equal(await page.getByRole('button',{name:'Retry same change',exact:true}).count(),0);
      const newer=await delayed(request=>request.url()===endpoint(B)+'/commands'&&request.method()==='POST');
      await page.getByLabel('Item title',{exact:true}).fill('New admin scoped change');await page.getByRole('button',{name:'Save change',exact:true}).click();const fresh=await newer.ready;
      await old.finish();assert.equal(await page.getByText(Aname,{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Retry same change',exact:true}).isDisabled(),true);
      assert.equal((await stored(fixture.ids.admin,A)).commandKey,original.command.commandKey);assert.equal((await stored(fixture.ids.manager,B)).commandKey,fresh.command.commandKey);
      await newer.finish();await page.getByText('Checklist saved. Account access and employment status are unchanged.',{exact:true}).waitFor();
      assert.equal((await read(B)).history[0].actorId,fixture.ids.manager);assert.equal(await stored(fixture.ids.manager,B),null);
    });
  }finally{
    for(const release of releases)release();await page.unrouteAll({behavior:'ignoreErrors'});
    if(promoted)assert.equal((await api.patch(base+'/employee/'+fixture.ids.manager+'/role',{headers,data:{role:'manager'}})).status(),200);
    await browser.close();
  }
});
