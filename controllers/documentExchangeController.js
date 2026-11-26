const {Validator} = require("sequelize");
module.exports = ({sequelize, DocumentExchange: Exchange, User}, access) => {
  const fail = (code, message) => {throw Object.assign(Error(message), {code});};
  const text = (value, max) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
  const uuid = value => typeof value === "string" && Validator.isUUID(value, 4);
  async function list(req, res) {
    try {
      const status = req.query.status || "pending", page = Number(req.query.page || 1);
      if (!["pending","closed"].includes(status) || !Number.isSafeInteger(page) || page < 1 || page > 1000000) fail(400, "Invalid status or page");
      const result = await sequelize.transaction({isolationLevel:"REPEATABLE READ"}, async transaction => {
        await access.actor(req, transaction);
        const {Op} = require("sequelize");
        const {rows, count} = await Exchange.findAndCountAll({where:{resolvedAt: status === "pending" ? null : {[Op.ne]:null}},
          limit:25, offset:(page-1)*25, order:[["createdAt","DESC"],["id","DESC"]], transaction});
        const owners = await User.findAll({where:{id:[...new Set(rows.map(r=>r.employeeId))]},attributes:["id","fullName"],transaction});
        const names = new Map(owners.map(u=>[u.id,u.fullName]));
        return {total:count, rows:rows.map(r=>({...r.toJSON(), employeeName:names.get(r.employeeId)}))};
      });
      res.json({data:result});
    } catch(e) {return access.error(res,e);}
  }
  async function command(req,res) {
    try {
      const {action, commandKey, employeeId, direction, title, dueDate, id, note} = req.body;
      if (!uuid(commandKey)) fail(400,"A valid command identifier is required");
      const record = await sequelize.transaction(async transaction => {
        if (action === "create") {
          if (!Number.isSafeInteger(employeeId) || employeeId <= 0 || !["send","receive"].includes(direction) || !text(title,180) ||
              (dueDate != null && (typeof dueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(dueDate)) || new Date(dueDate).toISOString().slice(0,10)!==dueDate))) fail(400,"Check employee, direction, document name and due date");
          const users = await access.actor(req,transaction,employeeId);
          if (!["admin","hr","employee","manager"].includes(users.get(employeeId)?.role)) fail(400,"Choose an internal employee");
          const fields={createdBy:req.user.id,employeeId,direction,title:title.trim(),dueDate:dueDate??null};
          const prior=await Exchange.findByPk(commandKey,{transaction});
          if(prior) {
            if(Object.keys(fields).some(k=>fields[k]!==prior[k])) fail(409,"This command is bound to different content");
            return prior;
          }
          return Exchange.create({id:commandKey,...fields},{transaction});
        }
        await access.actor(req,transaction);
        if (!["fulfill","cancel"].includes(action) || !uuid(id) || !text(note,240)) fail(400,"Choose a record and enter a completion or cancellation note");
        const item=await Exchange.findByPk(id,{transaction,lock:transaction.LOCK.UPDATE});
        if(!item)fail(404,"Record unavailable");
        if(item.resolvedAt){
          if(item.resolutionKey===commandKey && item.resolvedBy===req.user.id && item.resolution===action && item.note===note.trim())return item;
          fail(409,"The document exchange has already been closed");
        }
        return item.update({resolvedBy:req.user.id,resolvedAt:new Date(),resolution:action,note:note.trim(),resolutionKey:commandKey},{transaction});
      });
      res.json({data:record});
    } catch(e){return access.error(res,e);}
  }
  return {list,command};
};
