const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express'),jwt=require('jsonwebtoken'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {load}=require('./helpers/controller');

test('actual request logger omits JWT/search/reset sentinels for successful and denied query-token downloads',async()=>{
  const logs=[],secret='synthetic-qa-log-secret';
  const accounts={1:{id:1,role:'employee',status:'active',sessionVersion:0},2:{id:2,role:'admin',status:'active',sessionVersion:0}};
  const {authenticate}=load('middleware/authMiddleware.js',{'../models':{User:{findByPk:async id=>accounts[id]}},'../config/jwtSecret':secret,jsonwebtoken:jwt});
  const app=express();app.use(require('../middleware/requestLogger')({info:line=>logs.push(line)}));
  app.get('/employee/:userId/download',authenticate,require('../middleware/employeeAccess').requireEmployeeAccess,(req,res)=>res.type('text/plain').send('Synthetic own download'));
  const server=await new Promise(resolve=>{const value=app.listen(0,'127.0.0.1',()=>resolve(value));});
  try{
    const base='http://127.0.0.1:'+server.address().port;
    const tokens=[1,2].map(id=>jwt.sign({...accounts[id],jti:'QA01_SENTINEL_PAYLOAD'},secret));
    for(const [id,token,status] of [[1,tokens[0],200],[99,tokens[0],403],[99,tokens[1],200],[1,'QA01_SENTINEL_INVALID_JWT',401]]){
      const r=await fetch(`${base}/employee/${id}/download?token=${encodeURIComponent(token)}&search=QA01_SENTINEL_SEARCH&resetToken=QA01_SENTINEL_RESET`);
      assert.equal(r.status,status);if(status===200)assert.equal(await r.text(),'Synthetic own download');
    }
    const output=logs.join('\n');for(const sentinel of [...tokens,'QA01_SENTINEL','token=','search=','resetToken=','?'])assert.equal(output.includes(sentinel),false,sentinel);
    assert.equal(logs.length,4);assert.ok(logs.every(line=>/^GET \/employee\/\d+\/download$/.test(line)));
    assert.match(fs.readFileSync(path.join(__dirname,'../server.js'),'utf8'),/require\('\.\/middleware\/requestLogger'\)\(logger\)/);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('actual frontend profile action omits sensitive request/error payloads from diagnostics on success and failure',{
  skip:!process.env.FRONTEND_CHECKOUT&&'Set FRONTEND_CHECKOUT',
},async()=>{
  const checkout=path.resolve(process.env.FRONTEND_CHECKOUT),ts=require(path.join(checkout,'node_modules/typescript'));
  const source=ts.transpileModule(fs.readFileSync(path.join(checkout,'lib/actions/employee.actions.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const module={exports:{}},logs=[],sentinel='QA03_PRIVATE_PROFILE_SENTINEL';let status=200,request;
  vm.runInNewContext(source,{module,exports:module.exports,process:{env:{NEXT_PUBLIC_BACKEND_URL:'http://127.0.0.1:13381/api'}},
    URLSearchParams,console:Object.fromEntries(['log','warn','error'].map(name=>[name,(...args)=>logs.push(JSON.stringify(args))])),
    require:name=>{if(name==='@/lib/auth/token')return{getAuthToken:()=> 'synthetic-only'};throw Error('Unexpected import '+name);},
    fetch:async(url,options)=>{request={url,options};return{ok:status===200,status,headers:{get:()=>status===502?'text/plain':'application/json'},json:async()=>status===200?{success:true}:{message:sentinel,errors:[{field:'address',message:sentinel}]},text:async()=>sentinel};},
  });
  for(status of [200,400,502]){
    const promise=module.exports.updateEmployee(1,{address:sentinel,contactNumber:sentinel,dob:'2000-01-01'});
    if(status===200)assert.equal((await promise).success,true);else await assert.rejects(promise);
    assert.equal(JSON.parse(request.options.body).address,sentinel);
  }
  assert.equal(logs.join('\n').includes(sentinel),false);assert.equal(logs.length,0);
});
