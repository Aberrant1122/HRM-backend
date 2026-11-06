const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {load}=require('./helpers/controller');
test('admin attendance reports deny employee/manager/client while self-service routes remain available',async()=>{
  const middleware=load('middleware/authMiddleware.js',{'../models':{User:{}},'../config/jwtSecret':'synthetic-attendance-key',jsonwebtoken:require('jsonwebtoken')});
  const handler=(req,res)=>res.json({success:true});
  const controller=new Proxy({}, {get:()=>handler});
  const router=load('routes/attendanceRoutes.js',{
    express,'../controllers/attendanceController':controller,'../middleware/authMiddleware':middleware,
    '../middleware/upload':{uploadTaskDeliverables:{array:()=>(req,res,next)=>next()}},
  });
  const app=express();app.use((req,res,next)=>{req.user={id:1,role:req.headers['x-synthetic-role']};next();});app.use(router);
  const server=await new Promise(resolve=>{const value=app.listen(0,'127.0.0.1',()=>resolve(value));});
  try{
    for(const role of ['employee','manager','client','admin'])for(const endpoint of ['/all','/today-all-employees','/today','/history']){
      const response=await fetch('http://127.0.0.1:'+server.address().port+endpoint,{headers:{'x-synthetic-role':role}});
      assert.equal(response.status,['/all','/today-all-employees'].includes(endpoint)&&role!=='admin'?403:200,role+endpoint);
    }
  }finally{await new Promise(resolve=>server.close(resolve));}
});
