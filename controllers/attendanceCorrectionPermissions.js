const crypto=require('node:crypto');const {Op}=require('sequelize');
const fail=(status,message)=>Object.assign(Error(message),{status});
module.exports=models=>{
  const {sequelize:db,User,AttendanceCorrectionGrant:Grant,AttendanceCorrectionGrantEvent:Event,AttendanceCommand:Command}=models;
  const access=async(req,res)=>{try{const grant=await Grant.findByPk(req.user.id);res.json({canDraft:req.user.role==='admin',canApply:!!grant?.active});}catch(_){res.status(503).json({message:'Correction access unavailable'});}};
  const read=async(req,res,next)=>{try{if(req.user.role==='admin'||(await Grant.findByPk(req.user.id))?.active)return next();res.status(403).json({message:'Attendance correction access denied'});}catch(_){res.status(503).json({message:'Correction access unavailable'});}};
  const command=async(req,res)=>{
    try{
      const b=req.body||{};
      if(Object.keys(b).some(k=>!['commandKey','userId','expectedVersion','active','reason'].includes(k))||typeof b.commandKey!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.commandKey)||!Number.isSafeInteger(b.userId)||b.userId<1||!Number.isSafeInteger(b.expectedVersion)||b.expectedVersion<0||typeof b.active!=='boolean'||typeof b.reason!=='string'||b.reason.trim().length<3||b.reason.length>500)throw fail(400,'Invalid permission command');
      const payload={actorId:req.user.id,userId:b.userId,expectedVersion:b.expectedVersion,active:b.active,reason:b.reason.trim()},digest=crypto.createHash('sha256').update('attendance.corrections.apply:'+JSON.stringify(payload)).digest('hex'),key=b.commandKey.toLowerCase();let result;
      await db.transaction({isolationLevel:'READ COMMITTED'},async transaction=>{
        const users=await User.findAll({where:{id:{[Op.in]:[req.user.id,b.userId]}},order:[['id','ASC']],transaction,lock:transaction.LOCK.UPDATE});
        const actor=users.find(u=>u.id===req.user.id),target=users.find(u=>u.id===b.userId);
        if(!actor||actor.role!=='admin'||req.user.role!=='admin'||actor.status!=='active'||Number(actor.sessionVersion)!==Number(req.user.sessionVersion??0))throw fail(401,'Session revoked');
        if(!target)throw fail(404,'Account not found');
        const prior=await Command.findByPk(key,{transaction,lock:transaction.LOCK.UPDATE});
        if(prior){if(prior.userId!==req.user.id||prior.digest!==digest)throw fail(409,'Command key is already bound');result=prior.response;return;}
        let grant=await Grant.findByPk(b.userId,{transaction,lock:transaction.LOCK.UPDATE});
        if((grant?.version||0)!==b.expectedVersion)throw fail(409,'Permission changed. Reload before editing.');
        if(b.active&&target.status!=='active')throw fail(409,'Only an active account may receive this permission');
        const now=new Date(),values={userId:b.userId,active:b.active,version:b.expectedVersion+1,grantedBy:req.user.id,updatedAt:now};
        if(grant)await grant.update(values,{transaction});else grant=await Grant.create(values,{transaction});
        await Event.create({userId:b.userId,actorId:req.user.id,version:values.version,active:b.active,reason:payload.reason,createdAt:now},{transaction});
        result=JSON.parse(JSON.stringify(grant.toJSON()));await Command.create({commandKey:key,userId:req.user.id,digest,response:result,createdAt:now},{transaction});
      });res.json(result);
    }catch(error){res.status(error.status||503).json({message:error.status?error.message:'Permission outcome is unconfirmed. Retry the same command.'});}
  };
  const accounts=async(req,res)=>{
    try{
      const q=req.query||{};if(Object.keys(q).some(k=>!['search','page'].includes(k))||q.search!==undefined&&(typeof q.search!=='string'||q.search.length>100)||q.page!==undefined&&(typeof q.page!=='string'||!/^[1-9]\d*$/.test(q.page)||Number(q.page)>1000000))throw fail(400,'Invalid account search');
      const page=Number(q.page||1),{fn,col,where}=require('sequelize');const predicate=q.search?{[Op.or]:['fullName','email'].map(field=>where(fn('LOCATE',q.search,col(field)),{[Op.gt]:0}))}:{};
      const result=await db.transaction({isolationLevel:'REPEATABLE READ',readOnly:true},async transaction=>{
        const users=await User.findAndCountAll({where:predicate,attributes:['id','fullName','email','role','status'],order:[['id','ASC']],limit:20,offset:(page-1)*20,transaction});
        const grants=await Grant.findAll({where:{userId:{[Op.in]:users.rows.map(u=>u.id)}},transaction});
        return {data:users.rows.map(u=>({...u.toJSON(),permission:grants.find(g=>g.userId===u.id)?.toJSON()||{active:false,version:0}})),pagination:{currentPage:page,totalPages:Math.ceil(users.count/20),totalItems:users.count}};
      });res.json(result);
    }catch(error){res.status(error.status||503).json({message:error.status?error.message:'Permission accounts unavailable'});}
  };
  const history=async(req,res)=>{
    try{if(!/^[1-9]\d*$/.test(req.params.id)||Number(req.params.id)>Number.MAX_SAFE_INTEGER||Object.keys(req.query||{}).some(k=>k!=='beforeVersion')||req.query?.beforeVersion!==undefined&&(typeof req.query.beforeVersion!=='string'||!/^[1-9]\d*$/.test(req.query.beforeVersion)||Number(req.query.beforeVersion)>Number.MAX_SAFE_INTEGER))throw fail(400,'Invalid account/history cursor');const rows=await Event.findAll({where:{userId:Number(req.params.id),...(req.query?.beforeVersion?{version:{[Op.lt]:Number(req.query.beforeVersion)}}:{})},order:[['version','DESC']],limit:100});res.json({events:rows,hasEarlierHistory:rows.length>0&&rows[rows.length-1].version>1});}
    catch(error){res.status(error.status||503).json({message:error.status?error.message:'Permission history unavailable'});}
  };
  return {access,read,command,accounts,history};
};
