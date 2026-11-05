const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const jwt = require('jsonwebtoken');
const { load } = require('./helpers/controller');

test('normal frontend invitation action reaches protected backend; public registration stays denied', {
  skip: !process.env.FRONTEND_CHECKOUT && 'Set FRONTEND_CHECKOUT to the frontend checkout',
}, async () => {
  const checkout = path.resolve(process.env.FRONTEND_CHECKOUT);
  const ts = require(path.join(checkout,'node_modules/typescript'));
  const secret='synthetic-invitation-key';
  const users=new Map([[1,{id:1,role:'admin',status:'active',sessionVersion:0}], [2,{id:2,role:'employee',status:'active',sessionVersion:0}]]);
  let mails=0,profiles=0,creates=0;
  const models={
    User:{findByPk:async id=>users.get(id),findOne:async()=>null,
      create:async values=>{creates++;return {id:3,...values};},
      sequelize:{transaction:async()=>({commit:async()=>{},rollback:async()=>{}})}},
    UserInfo:{create:async()=>{profiles++;}},
  };
  const middleware=load('middleware/authMiddleware.js',{'../models':models,'../config/jwtSecret':secret,jsonwebtoken:jwt});
  const controller=load('controllers/authController.js',{
    bcryptjs:require('bcryptjs'),jsonwebtoken:jwt,crypto:require('node:crypto'),sequelize:require('sequelize'),
    '../models':models,'express-validator':require('express-validator'),
    nodemailer:{createTransport:()=>({sendMail:async message=>{mails++;assert.ok(message.html.includes('href="http://localhost:3000/"'));assert.equal(message.html.includes("human-resource-management-production"),false);}})},
    '../config/jwtSecret':secret,'../middleware/authMiddleware':middleware,
  });
  const router=load('routes/authRoutes.js',{express,'../controllers/authController':controller});
  const app=express();app.use(express.json());app.use('/api/auth',router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try {
    const base=`http://127.0.0.1:${server.address().port}/api`;
    let token=jwt.sign({id:1,role:'admin',sessionVersion:0},secret);
    const module={exports:{}};
    const compiled=ts.transpileModule(fs.readFileSync(path.join(checkout,'lib/actions/employee.actions.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    vm.runInNewContext(compiled,{module,exports:module.exports,fetch,console,
      process:{env:{NEXT_PUBLIC_BACKEND_URL:base}},
      require:name=>{assert.equal(name,'@/lib/auth/token');return {getAuthToken:()=>token};},
    });
    const result=await module.exports.inviteEmployee({fullName:'Synthetic Invite',email:'invite@example.invalid',role:'employee',department:'development'});
    assert.equal(result.userId,3);assert.equal(creates,1);assert.equal(profiles,1);assert.equal(mails,1);
    token=jwt.sign({id:2,role:'employee',sessionVersion:0},secret);
    await assert.rejects(()=>module.exports.inviteEmployee({fullName:'Denied',email:'denied@example.invalid',role:'employee'}),/Admin/);
    const denied=await fetch(`${base}/auth/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'admin'})});
    assert.equal(denied.status,401);assert.equal(creates,1);assert.equal(mails,1);
  } finally {
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
});
