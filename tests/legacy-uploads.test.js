const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const {randomUUID}=require('node:crypto');
const {load}=require('./helpers/controller');
const access=require('../middleware/employeeAccess');

test('legacy employee bytes are private through static aliases and still available to their owner',async()=>{
  const directory=path.join(__dirname,'../uploads/employees');fs.mkdirSync(directory,{recursive:true});
  const filename='synthetic-'+randomUUID()+'.txt',file=path.join(directory,filename);
  fs.writeFileSync(file,'Synthetic confidential legacy document',{flag:'wx'});
  const controller=load('controllers/employeeController.js',{
    '../middleware/employeeAccess':access,
    '../models':{User:{findByPk:async()=>({id:2})},UserInfo:{findOne:async()=>({attachments:[{filename,path:'/uploads/employees/'+filename,originalName:'synthetic.txt',mimetype:'text/plain'}]})}},
    sequelize:{Op:{}},'express-validator':{},path,'../utils/pagination':{},fs,
  });
  const app=express();
  app.use('/uploads',require('../middleware/legacyUploads'),express.static(path.join(__dirname,'../uploads')));
  app.get('/api/employee/:userId/download-attachment/:attachmentId',(req,res,next)=>{req.user={id:Number(req.headers['x-synthetic-user']),role:'employee'};next();},access.requireEmployeeAccess,controller.downloadEmployeeAttachment);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    for(const prefix of ['employees','EMPLOYEES','%65mployees','employees%20','employees.','EMPLOY~1','employees%3A%3A%24INDEX_ALLOCATION']){
      assert.equal((await fetch(`${base}/uploads/${prefix}/${filename}`)).status,404,prefix);
    }
    const endpoint=`${base}/api/employee/2/download-attachment/${filename}`;
    const own=await fetch(endpoint,{headers:{'x-synthetic-user':'2'}});assert.equal(own.status,200);assert.equal(await own.text(),'Synthetic confidential legacy document');
    assert.equal((await fetch(endpoint,{headers:{'x-synthetic-user':'3'}})).status,403);
  }finally{
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.unlinkSync(file);
  }
});
