const {Op}=require('sequelize'),dates=require('./probationReminderDates');
async function processRule(m,id,now=new Date()){
 return m.sequelize.transaction({isolationLevel:'READ COMMITTED'},async t=>{
  const initial=await m.ProbationReminderRule.findByPk(id,{transaction:t});if(!initial?.enabled)return 0;const initialCase=await m.ProbationCase.findByPk(initial.caseId,{transaction:t});if(!initialCase)return 0;
  const users=new Map();for(const uid of [...new Set([initialCase.employeeId,...initial.recipientIds])].sort((a,b)=>a-b))users.set(uid,await m.User.findByPk(uid,{transaction:t,lock:t.LOCK.UPDATE}));
  const c=await m.ProbationCase.findByPk(initial.caseId,{transaction:t,lock:t.LOCK.UPDATE}),rule=await m.ProbationReminderRule.findByPk(id,{transaction:t,lock:t.LOCK.UPDATE});if(!rule?.enabled||rule.version!==initial.version||c.status!=='active')return 0;
  const dueDate=dates.dueDate(c.endDate,rule.leadDays);if(dates.today(now,rule.timeZone)<dueDate)return 0;let generated=0;
  for(const recipientId of rule.recipientIds){const u=users.get(recipientId);if(u?.role!=='hr'||u.status!=='active')continue;const where={ruleId:rule.id,ruleVersion:rule.version,endDate:c.endDate,recipientId};if(await m.ProbationReminderNotice.findOne({where,transaction:t}))continue;await m.ProbationReminderNotice.create({...where,caseId:c.id,dueDate,timeZone:rule.timeZone,details:{employeeId:c.employeeId,employeeName:users.get(c.employeeId)?.fullName||'Employee account',leadDays:rule.leadDays}},{transaction:t});generated++;}return generated;
 });
}
async function run(m,now=new Date(),recipientId){let cursor=0,total=0;for(;;){const rows=await m.ProbationReminderRule.findAll({where:{enabled:true,id:{[Op.gt]:cursor}},order:[['id','ASC']],limit:100});if(!rows.length)return total;for(const rule of rows){cursor=rule.id;if(recipientId&&!rule.recipientIds.includes(recipientId))continue;total+=await processRule(m,rule.id,now);}}}
module.exports={run,processRule};
