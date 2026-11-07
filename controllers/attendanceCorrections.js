const crypto = require('node:crypto');
const { Op } = require('sequelize');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (status,message) => Object.assign(Error(message),{status});
const integer = value => { if(!['number','string'].includes(typeof value)||!/^[1-9]\d*$/.test(String(value))||!Number.isSafeInteger(Number(value)))throw fail(400,'Invalid correction identifier/version');return Number(value); };
const date = value => {if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number(value.slice(0,4))<1000||isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw fail(400,'Invalid recorded date');return value;};
const record = row => ({id:row.id,userId:row.userId,date:row.date,status:row.status,clockIn:row.clockIn?new Date(row.clockIn).toISOString():null,clockOut:row.clockOut?new Date(row.clockOut).toISOString():null,totalHours:row.totalHours,updatedAt:new Date(row.updatedAt).toISOString()});
const canonicalRecords = rows => JSON.stringify(rows.map(row=>Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]]))));
const proposed = value => {
  if(!value||Array.isArray(value)||Object.keys(value).some(k=>!['status','clockIn','clockOut'].includes(k))||!['present','absent','leave','on-leave','half-day'].includes(value.status))throw fail(400,'Invalid proposed attendance facts');
  const instant = v => {if(v===null||v==='')return null;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)||isNaN(Date.parse(v)))throw fail(400,'Clock timestamps require an explicit timezone offset');date(v.slice(0,10));return new Date(v).toISOString();};
  const result={status:value.status,clockIn:instant(value.clockIn),clockOut:instant(value.clockOut)};
  if(result.clockOut&&(!result.clockIn||result.clockOut<result.clockIn))throw fail(400,'Clock-out cannot precede clock-in');return result;
};
module.exports = models => {
  const {sequelize:db,User,Attendance,AttendanceCorrection:Draft,AttendanceCorrectionEvent:Event,AttendanceCommand:Command,AttendanceCorrectionGrant:Grant}=models;
  const snapshot = async (draft,transaction,beforeVersion) => {
    const events=await Event.findAll({where:{correctionId:draft.id,...(beforeVersion?{version:{[Op.lt]:beforeVersion}}:{})},order:[['version','DESC']],limit:100,transaction});
    const employee=await User.findByPk(draft.employeeId,{attributes:['id','fullName','email'],transaction});
    return {...draft.toJSON(),employee,events,hasEarlierHistory:events.length>0&&events[events.length-1].version>1};
  };
  const command = async(req,res)=>{
    try{
      const body=req.body||{},allowed=['commandKey','action','employeeId','correctionId','expectedVersion','workDate','attendanceId','proposed','reason'];
      if(Object.keys(body).some(k=>!allowed.includes(k))||typeof body.commandKey!=='string'||!uuid.test(body.commandKey)||!['create','edit','submit','reopen','cancel','apply'].includes(body.action))throw fail(400,'Invalid correction command');
      const employeeId=integer(body.employeeId),create=body.action==='create',correctionId=create?null:integer(body.correctionId);
      const version=create?0:integer(body.expectedVersion);
      if(create&&(body.expectedVersion!==0||body.correctionId!=null))throw fail(400,'New correction requires version zero');
      if(typeof body.reason!=='string'||body.reason.trim().length<3||body.reason.length>2000)throw fail(400,'A correction reason is required');
      const editing=create||body.action==='edit';
      if(!editing&&['workDate','attendanceId','proposed'].some(k=>body[k]!==undefined))throw fail(400,'State transitions cannot also edit facts');
      const fields=editing?{workDate:date(body.workDate),attendanceId:body.attendanceId==null||body.attendanceId===''?null:integer(body.attendanceId),proposed:proposed(body.proposed)}:{};
      const payload={actorId:req.user.id,action:body.action,employeeId,correctionId,expectedVersion:version,...fields,reason:body.reason.trim()};
      const digest=crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'),commandKey=body.commandKey.toLowerCase();let result;
      await db.transaction({isolationLevel:'READ COMMITTED'},async transaction=>{
        const users=await User.findAll({where:{id:{[Op.in]:[req.user.id,employeeId]}},order:[['id','ASC']],lock:transaction.LOCK.UPDATE,transaction});
        const actor=users.find(u=>u.id===req.user.id),employee=users.find(u=>u.id===employeeId);
        if(!actor||actor.role!==req.user.role||actor.status!=='active'||Number(actor.sessionVersion)!==Number(req.user.sessionVersion??0))throw fail(401,'Session revoked');
        if(body.action==='apply'){
          const grant=await Grant.findByPk(req.user.id,{transaction,lock:transaction.LOCK.UPDATE});if(!grant?.active)throw fail(403,'Dedicated attendance correction permission required');
        }else if(actor.role!=='admin')throw fail(403,'Only admins may draft corrections');
        if(!employee||employee.role!=='employee'&&!employee.hasEmployeeHistory&&!await Attendance.findOne({where:{userId:employeeId},transaction}))throw fail(404,'Employee/recorded attendance account not found');
        const prior=await Command.findByPk(commandKey,{lock:transaction.LOCK.UPDATE,transaction});
        if(prior){if(prior.userId!==req.user.id||prior.digest!==digest)throw fail(409,'Command key is already bound');result=prior.response;return;}
        let draft=create?null:await Draft.findByPk(correctionId,{lock:transaction.LOCK.UPDATE,transaction});
        if(!create&&(!draft||draft.employeeId!==employeeId))throw fail(404,'Correction not found');
        if(draft&&draft.version!==version)throw fail(409,'Correction changed. Reload before editing.');
        if(draft?.state==='applied')throw fail(409,'Applied correction is retained. Create a new correction.');
        const before=draft?draft.toJSON():null,now=new Date();
        if(editing){
          if(draft&&draft.state!=='draft')throw fail(409,'Reopen the correction before editing');
          const rows=await Attendance.findAll({where:{userId:employeeId,date:fields.workDate},order:[['id','ASC']],lock:transaction.LOCK.UPDATE,transaction});
          if(fields.attendanceId&&!rows.some(r=>r.id===fields.attendanceId)||!fields.attendanceId&&rows.length)throw fail(409,'Select the existing attendance record explicitly');
          const values={employeeId,...fields,baseline:rows.map(record),state:'draft',version:version+1,updatedAt:now};
          if(draft)await draft.update(values,{transaction});else draft=await Draft.create({...values,createdBy:req.user.id,createdAt:now},{transaction});
        }else if(body.action==='apply'){
          if(draft.state!=='submitted')throw fail(409,'Submit the correction for review before applying');
          const rows=await Attendance.findAll({where:{userId:employeeId,date:draft.workDate},order:[['id','ASC']],lock:transaction.LOCK.UPDATE,transaction});
          if(canonicalRecords(rows.map(record))!==canonicalRecords(draft.baseline))throw fail(409,'Attendance changed since this draft. Reopen and review a new baseline.');
          let attendance=draft.attendanceId?rows.find(row=>row.id===draft.attendanceId):null;
          if(!attendance&&rows.length)throw fail(409,'Attendance record must be selected explicitly');
          const original=attendance?record(attendance):null;
          const clocksChanged=!original||original.clockIn!==draft.proposed.clockIn||original.clockOut!==draft.proposed.clockOut;
          const totalHours=clocksChanged?(draft.proposed.clockIn&&draft.proposed.clockOut?(Date.parse(draft.proposed.clockOut)-Date.parse(draft.proposed.clockIn))/3600000:null):attendance.totalHours;
          const facts={...draft.proposed,totalHours};
          if(attendance)await attendance.update(facts,{transaction});else attendance=await Attendance.create({userId:employeeId,date:draft.workDate,...facts},{transaction});
          await attendance.reload({transaction});
          await draft.update({state:'applied',attendanceId:attendance.id,appliedRecord:record(attendance),version:version+1,updatedAt:now},{transaction});
        }else{
          const next={submit:'submitted',reopen:'draft',cancel:'cancelled'}[body.action];
          if(body.action==='submit'&&draft.state!=='draft'||body.action==='reopen'&&draft.state==='draft'||body.action==='cancel'&&draft.state==='cancelled')throw fail(409,'Invalid correction transition');
          if(body.action==='submit'){
            const rows=await Attendance.findAll({where:{userId:employeeId,date:draft.workDate},order:[['id','ASC']],lock:transaction.LOCK.UPDATE,transaction});
            if(canonicalRecords(rows.map(record))!==canonicalRecords(draft.baseline))throw fail(409,'Attendance changed since this draft. Edit and review a new baseline.');
          }
          await draft.update({state:next,version:version+1,updatedAt:now},{transaction});
        }
        await Event.create({correctionId:draft.id,actorId:req.user.id,version:draft.version,action:body.action,reason:payload.reason,before,after:draft.toJSON(),createdAt:now},{transaction});
        result=JSON.parse(JSON.stringify(await snapshot(draft,transaction)));
        await Command.create({commandKey,userId:req.user.id,digest,response:result,createdAt:now},{transaction});
      });
      res.json(result);
    }catch(error){res.status(error.status||503).json({message:error.status?error.message:'Correction outcome is unconfirmed. Retry the same command.'});}
  };
  const list=async(req,res)=>{
    try{
      const q=req.query||{};if(Object.keys(q).some(k=>!['employeeId','date','state','page','limit'].includes(k)))throw fail(400,'Invalid correction filter');
      const where={};if(q.employeeId!==undefined)where.employeeId=integer(q.employeeId);if(q.date!==undefined)where.workDate=date(q.date);
      if(q.state!==undefined){if(!['draft','submitted','cancelled','applied'].includes(q.state))throw fail(400,'Invalid correction state');where.state=q.state;}
      const page=q.page!==undefined?integer(q.page):1,limit=q.limit!==undefined?integer(q.limit):20;if(page>1000000||limit>100)throw fail(400,'Invalid correction page');
      const result=await db.transaction({isolationLevel:'REPEATABLE READ',readOnly:true},async transaction=>{
        const drafts=await Draft.findAndCountAll({where,order:[['id','DESC']],offset:(page-1)*limit,limit,transaction});
        const users=await User.findAll({where:{id:{[Op.in]:drafts.rows.map(d=>d.employeeId)}},attributes:['id','fullName','email'],transaction});
        return {count:drafts.count,rows:drafts.rows.map(d=>({...d.toJSON(),employee:users.find(u=>u.id===d.employeeId)}))};
      });res.json({data:result.rows,pagination:{currentPage:page,totalPages:Math.ceil(result.count/limit),totalItems:result.count}});
    }catch(error){res.status(error.status||503).json({message:error.status?error.message:'Corrections unavailable'});}
  };
  const detail=async(req,res)=>{
    try{if(Object.keys(req.query||{}).some(k=>k!=='beforeVersion'))throw fail(400,'Invalid history cursor');const id=integer(req.params.id),cursor=req.query?.beforeVersion?integer(req.query.beforeVersion):null;const result=await db.transaction({isolationLevel:'REPEATABLE READ',readOnly:true},async transaction=>{const draft=await Draft.findByPk(id,{transaction});if(!draft)throw fail(404,'Correction not found');return snapshot(draft,transaction,cursor);});res.json(result);}
    catch(error){res.status(error.status||503).json({message:error.status?error.message:'Correction unavailable'});}
  };
  const source=async(req,res)=>{
    try{
      if(Object.keys(req.query||{}).some(k=>!['employeeId','date'].includes(k)))throw fail(400,'Invalid source filter');
      const id=integer(req.query.employeeId),workDate=date(req.query.date);
      const result=await db.transaction({isolationLevel:'REPEATABLE READ',readOnly:true},async transaction=>{
        const employee=await User.findByPk(id,{attributes:['id','fullName','email','role','hasEmployeeHistory'],transaction});
        if(!employee||employee.role!=='employee'&&!employee.hasEmployeeHistory&&!await Attendance.findOne({where:{userId:id},transaction}))throw fail(404,'Employee/recorded attendance account not found');
        const rows=await Attendance.findAll({where:{userId:id,date:workDate},order:[['id','ASC']],transaction});return {employee:{id:employee.id,fullName:employee.fullName,email:employee.email},workDate,records:rows.map(record)};
      });res.json(result);
    }catch(error){res.status(error.status||503).json({message:error.status?error.message:'Source attendance unavailable'});}
  };
  return {command,list,detail,source};
};
