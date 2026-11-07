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
  for(const [role,name] of [['admin','Admin'],['employee','Employee'],['manager','Manager'],['client','Client']]){
    const user=await models.User.create({fullName:'Synthetic '+name,email:role+'@example.invalid',password:'Synthetic-local-123',role,status:'active'});
    await models.UserInfo.create({userId:user.id,department:'development',position:'Synthetic',cnic:`00000-000000${user.id}-0`,salary:1234,contactNumber:'0000000000',startDate:'2026-01-01T00:00:00.000Z'});
    ids[role]=user.id;
  }
  await models.Department.findOrCreate({where:{name:'development'},defaults:{description:'Synthetic test department',isActive:true}});
  if(process.env.HRM_PEOPLE_FIXTURES==='1'){
    for(let i=0;i<26;i++){
      const user=await models.User.create({fullName:i===22?'Zz Literal 100%_\\':'Zz Pagination '+String(i).padStart(2,'0'),email:`pagination${i}@example.invalid`,role:'employee',status:['active','inactive','suspended'][i%3]});
      if(i>=24)await models.UserInfo.create({userId:user.id,department:i===24?'legacy-satellite':'synthetic-research',position:'Synthetic Directory'});
    }
    await models.Department.create({name:'synthetic-research',isActive:true});
    await models.Department.create({name:'synthetic-closed',isActive:false});
  }
  if(process.env.HRM_DASHBOARD_FIXTURES==='1'){
    const other=[];
    for(const n of [1,2,3])other.push(await models.User.findOne({where:{email:`pagination${n}@example.invalid`}}));
    if(other.some(user=>!user))throw Error('Dashboard fixtures require People fixtures');
    const day='2026-01-01';
    await models.Attendance.bulkCreate([
      {userId:ids.employee,date:day,status:'present'}, {userId:ids.employee,date:day,status:'present'},
      {userId:ids.employee,date:day,status:'absent'}, {userId:other[0].id,date:day,status:'absent'},
      {userId:other[1].id,date:day,status:'leave'}, {userId:other[2].id,date:day,status:'half-day'},
      ...['admin','manager','client'].map(role=>({userId:ids[role],date:day,status:'present'})),
    ].map(row=>({...row,clockIn:day+'T08:00:00.000Z'})));
    const type=await models.LeaveType.create({name:'Synthetic dashboard leave',annual_quota:20});
    const record=(userId,status,startDate=day,endDate=day,leaveMode='full-day')=>({userId,status,startDate,endDate,leaveTypeId:type.id,totalDays:leaveMode==='half-day'?0.5:1,leaveMode,reason:'Synthetic fixture'});
    await models.LeaveRequest.bulkCreate([
      record(ids.employee,'approved'),record(ids.employee,'approved','2025-12-31',day),
      record(other[1].id,'approved',day,day,'half-day'), record(other[0].id,'approved','2025-12-01','2025-12-02'),
      record(ids.employee,'pending'), record(other[0].id,'pending','2027-01-01','2027-01-01'),record(other[2].id,'rejected'),
      ...['admin','manager','client'].map(role=>record(ids[role],'approved')),
    ]);
  }
  const objects=new Map();let storageWrites=0;
  if(process.env.HRM_ATTENDANCE_FIXTURES==='1'){
    const user=await models.User.create({fullName:'Synthetic Facts Employee',email:'facts@example.invalid',password:'Synthetic-local-123',role:'employee',status:'active'});
    for(const status of ['present','leave'])await models.Attendance.create({userId:ids.employee,date:'2026-01-01',clockIn:'2026-01-01T08:00:00Z',status,totalHours:1.999});
    await models.Attendance.create({userId:user.id,date:'2026-01-01',clockIn:'2026-01-01T08:00:00Z',status:'leave',totalHours:1.999});
  }
  // Protocol sink exercises actual AWS SDK/Multer HTTP writes, not S3 IAM/signature enforcement.
  const storage=http.createServer(async(req,res)=>{
    const key=new URL(req.url,'http://127.0.0.1:13382').pathname;
    if(req.method==='PUT'){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      let body=Buffer.concat(chunks);
      if(String(req.headers['content-encoding']||'').includes('aws-chunked')){
        const decoded=[];let offset=0;
        while(offset<body.length){const end=body.indexOf('\r\n',offset);const size=parseInt(body.subarray(offset,end).toString().split(';')[0],16);if(!size)break;offset=end+2;decoded.push(body.subarray(offset,offset+size));offset+=size+2;}
        body=Buffer.concat(decoded);
      }
      objects.set(key,body);storageWrites++;res.setHeader('ETag','"synthetic-etag"');res.end();
    }else if(req.method==='GET'&&objects.has(key))res.end(objects.get(key));
    else if(req.method==='DELETE'){objects.delete(key);res.statusCode=204;res.end();}
    else{res.statusCode=404;res.end();}
  });
  await new Promise(resolve=>storage.listen(13382,'127.0.0.1',resolve));
  const app=express();app.use(require('cors')({origin:'http://127.0.0.1:13380'}));app.use(express.json());
  app.get('/__fixture',(_,res)=>res.json({schema,ids,storageWrites,objects:objects.size,socketUsers:[...io.sockets.sockets.values()].map(socket=>socket.data.userId)}));
  app.post('/__shutdown',(_,res)=>{res.on('finish',()=>setImmediate(close));res.sendStatus(200);});
  const {authenticate,isAdmin}=require('../middleware/authMiddleware');
  app.post('/__fixture/notify',authenticate,isAdmin,async(req,res)=>{
    const delivered=await require('../utils/realtimeAccess').emitToUser(io,req.body.userId,'notification',{message:'synthetic-test-message'});
    res.json({delivered});
  });
  app.use('/api',require('../routes'));
  app.use((err,req,res,next)=>{console.error('Synthetic request failed:',err.message);res.status(500).json({message:err.message});});
  const server=http.createServer(app);
  const io=require('socket.io')(server,{cors:{origin:'http://127.0.0.1:13380'}});
  require('../utils/realtimeAccess').configureRealtimeAccess(io);app.set('io',io);
  server.listen(13381,'127.0.0.1',()=>console.log('SYNTHETIC_ACCEPTANCE_READY'));
  async function close(){io.close();server.closeAllConnections();server.close();storage.closeAllConnections();storage.close();await sequelize.close();process.exit(0);}
  process.on('SIGINT',close);process.on('SIGTERM',close);
})().catch(error=>{console.error(error);process.exit(1);});
