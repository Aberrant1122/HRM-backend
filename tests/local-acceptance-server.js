// Synthetic-only loopback fixture. Does not load the production server or its cron/schema repair.
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const express=require('express');
const {Sequelize,DataTypes}=require('sequelize');

if(process.env.HRM_DISPOSABLE_MYSQL!=='1'||process.env.HRM_TEST_MYSQL_PORT!=='13379')throw Error('Dedicated disposable MySQL required');
if(process.env.APP_ENV!=='staging')throw Error('Staging capture mode required');
for(const name of ['DATABASE_URL','DB_URL','EMAIL_USER','EMAIL_PASS'])if(process.env[name])throw Error(`Remove ${name} from synthetic fixture environment`);
if(process.env.MAIL_MODE!=='capture')throw Error('Mail capture required');
if(process.env.AWS_S3_ENDPOINT!=='http://127.0.0.1:13382'||process.env.AWS_S3_BUCKET!=='synthetic-only')throw Error('Loopback synthetic object sink required');
if(process.env.AWS_ACCESS_KEY_ID!=='synthetic-access'||process.env.AWS_SECRET_ACCESS_KEY!=='synthetic-secret')throw Error('Use synthetic fixture storage keys only');
if(process.env.JWT_SECRET_KEY!=='synthetic-acceptance-signing-secret')throw Error('Use the synthetic fixture signing key only');
const opts={dialect:'mysql',host:'127.0.0.1',port:13379,logging:false};

(async()=>{
  const admin=new Sequelize('mysql','root',process.env.HRM_TEST_MYSQL_PASSWORD||'',opts);
  for(let attempt=0;;attempt++){
    try{await admin.authenticate();break;}
    catch(error){if(attempt>=39)throw error;await new Promise(resolve=>setTimeout(resolve,250));}
  }
  const schema='hrm_browser_'+Date.now();await admin.query('CREATE DATABASE `'+schema+'`');await admin.close();
  const sequelize=new Sequelize(schema,'root',process.env.HRM_TEST_MYSQL_PASSWORD||'',opts);
  const qi=sequelize.getQueryInterface();
  for(const file of fs.readdirSync(path.join(__dirname,'../migrations')).filter(f=>f.endsWith('.js')).sort())await require('../migrations/'+file).up(qi,Sequelize);
  const models={sequelize,Sequelize};
  for(const file of fs.readdirSync(path.join(__dirname,'../models')).filter(f=>f.endsWith('.js')&&f!=='index.js')){
    const model=require('../models/'+file)(sequelize,DataTypes);models[model.name]=model;
  }
  for(const model of Object.values(models))if(model.associate)model.associate(models);
  // Route modules use real models against the explicit disposable connection.
  require.cache[require.resolve('../models')]={id:require.resolve('../models'),filename:require.resolve('../models'),loaded:true,exports:models};
  const ids={};
  for(const [role,name] of [['admin','Admin'],['employee','Employee'],['manager','Manager']]){
    const user=await models.User.create({fullName:'Synthetic '+name,email:role+'@example.invalid',password:'Synthetic-local-123',role,status:'active'});
    await models.UserInfo.create({userId:user.id,department:'development',position:'Synthetic',cnic:`00000-000000${user.id}-0`,salary:1234,contactNumber:'0000000000'});
    ids[role]=user.id;
  }
  await models.Department.findOrCreate({where:{name:'development'},defaults:{description:'Synthetic test department',isActive:true}});
  const objects=new Map();let storageWrites=0;
  // Protocol sink exercises actual AWS SDK/Multer HTTP writes, not S3 IAM/signature enforcement.
  const storage=http.createServer(async(req,res)=>{
    const key=new URL(req.url,'http://127.0.0.1:13382').pathname;
    if(req.method==='PUT'){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      objects.set(key,Buffer.concat(chunks));storageWrites++;res.setHeader('ETag','"synthetic-etag"');res.end();
    }else if(req.method==='GET'&&objects.has(key))res.end(objects.get(key));
    else if(req.method==='DELETE'){objects.delete(key);res.statusCode=204;res.end();}
    else{res.statusCode=404;res.end();}
  });
  await new Promise(resolve=>storage.listen(13382,'127.0.0.1',resolve));
  const app=express();app.use(require('cors')({origin:'http://127.0.0.1:13380'}));app.use(express.json());
  app.get('/__fixture',(_,res)=>res.json({schema,ids,storageWrites,objects:objects.size}));
  app.post('/__shutdown',(_,res)=>{res.on('finish',()=>setImmediate(close));res.sendStatus(200);});
  app.use('/api',require('../routes'));
  app.use((err,req,res,next)=>{console.error('Synthetic request failed:',err.message);res.status(500).json({message:err.message});});
  const server=app.listen(13381,'127.0.0.1',()=>console.log('SYNTHETIC_ACCEPTANCE_READY'));
  async function close(){server.closeAllConnections();server.close();storage.closeAllConnections();storage.close();await sequelize.close();process.exit(0);}
  process.on('SIGINT',close);process.on('SIGTERM',close);
})().catch(error=>{console.error(error);process.exit(1);});
