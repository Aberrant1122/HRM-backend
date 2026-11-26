const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),cors=require('cors');
const policy=require('../config/corsPolicy');
test('production CORS policy permits configured keyed preflight without widening origins',async()=>{
  const origin='https://approved.example.invalid';let blocked=0;
  const app=express();app.use(cors(policy({FRONTEND_URL:origin},()=>blocked++)));app.post('/command',(req,res)=>res.json({ok:true}));app.use((error,req,res,next)=>res.status(error.statusCode||500).json({message:error.message}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),url='http://127.0.0.1:'+server.address().port+'/command';
  try{
    const allowed=await fetch(url,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type,idempotency-key'}});
    assert.equal(allowed.status,204);assert.equal(allowed.headers.get('access-control-allow-origin'),origin);assert.equal(allowed.headers.get('access-control-allow-credentials'),'true');
    const headers=allowed.headers.get('access-control-allow-headers').toLowerCase().split(',').map(s=>s.trim());for(const name of ['authorization','content-type','idempotency-key'])assert.ok(headers.includes(name));
    const denied=await fetch(url,{method:'OPTIONS',headers:{Origin:'https://unapproved.example.invalid','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type,idempotency-key'}});
    assert.equal(denied.status,403);assert.equal(denied.headers.get('access-control-allow-origin'),null);assert.equal(blocked,1);
    assert.equal((await fetch(url,{method:'POST'})).status,200); // Preserve non-browser clients without Origin.
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test('production origin list retains exact existing defaults and rejects lookalike/null origins',()=>{
  const options=policy({});for(const origin of ['http://localhost:3000','http://127.0.0.1:3000','http://localhost:3001','http://127.0.0.1:3001','https://human-resource-management-production-eeeb.up.railway.app','https://human-resource-management-production-b7d0.up.railway.app'])options.origin(origin,(error,allowed)=>{assert.equal(error,null);assert.equal(allowed,true);});
  for(const origin of ['null','http://localhost:13380','https://approved.example.invalid.attacker.invalid'])options.origin(origin,error=>assert.equal(error.statusCode,403));
});
