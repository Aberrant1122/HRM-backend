const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {test}=require("node:test");
test("explicit private revision sharing and authenticated acknowledgement",async()=>{
 const app="http://127.0.0.1:13695",fixture=await(await fetch(app+"/__fixture")).json();assert.match(fixture.schema,/^hrm_browser_\d+$/);
 const base=app+"/api/employee-documents",recipient=fixture.ids.employee;
 async function login(role){const r=await fetch(app+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:role+"@example.invalid",password:"Synthetic-local-123"})});assert.equal(r.status,200);return (await r.json()).token;}
 const admin=await login("admin"),employee=await login("employee"),other=await login("manager");
 const call=(path,token,body)=>fetch(base+path,{method:body?"POST":"GET",headers:{...(token&&{Authorization:"Bearer "+token}),"Content-Type":"application/json"},...(body&&{body:JSON.stringify(body)})});
 async function data(r){assert.equal(r.status,200,await r.clone().text());return (await r.json()).data;}
 async function upload(doc,bytes){const form=new FormData();const body={employeeId:recipient,action:doc?"revise":"create",commandKey:crypto.randomUUID(),expectedVersion:doc?1:0,title:"Private synthetic",description:"Recovery sample",reason:"Document revision test",...(doc&&{documentId:doc})};form.append("command",JSON.stringify(body));form.append("file",new Blob([bytes],{type:"application/pdf"}),"synthetic.pdf");return data(await fetch(base+"/uploads",{method:"POST",headers:{Authorization:"Bearer "+admin},body:form}));}
 const firstBytes="%PDF-1.4\nFirst\n%%EOF",first=await upload(null,firstBytes),id=first.currentRevision.id;
 const mine="/deliveries/mine",staff="/deliveries/staff/"+id;
 assert.equal((await call(mine,null)).status,401);assert.equal((await data(await call(mine,employee))).rows.length,0);
 assert.equal((await call(staff+"/share",employee,{recipientId:recipient})).status,403);
 assert.equal((await call(staff+"/share",admin,{recipientId:fixture.ids.manager})).status,409);
 await data(await call(staff+"/share",admin,{recipientId:recipient}));
 const second=await upload(first.document.id,"%PDF-1.4\nSecond\n%%EOF"),next=second.currentRevision.id;
 assert.deepEqual((await data(await call(mine,employee))).rows.map(x=>x.revisionId),[id]);
 assert.equal((await call(mine+"/"+next+"/download",employee)).status,404);
 assert.equal((await call(mine+"/"+id+"/download",other)).status,404);
 assert.equal((await call(mine+"/"+id+"/acknowledge",other,{})).status,404);
 const f=await call(mine+"/"+id+"/download",employee);assert.equal(f.status,200);assert.equal(f.headers.get("cache-control"),"private, no-store");assert.equal(await f.text(),firstBytes);
 const receipts=await Promise.all([1,2].map(async()=>data(await call(mine+"/"+id+"/acknowledge",employee,{}))));
 assert.deepEqual(receipts[0],receipts[1]);assert.equal(receipts[0].recipientId,recipient);assert.ok(receipts[0].acknowledgedAt);
 const evidence=await data(await call(staff,admin));assert.equal(evidence.acknowledgedAt,receipts[0].acknowledgedAt);
 const newer=await data(await call("/deliveries/staff/"+next+"/share",admin,{recipientId:recipient}));assert.equal(newer.acknowledgedAt,null);
 assert.equal((await call("/revisions/"+next+"/download",employee)).status,403);
});
