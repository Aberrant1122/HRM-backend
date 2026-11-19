const { createHash } = require("crypto");
const { Validator } = require("sequelize");
const { EmployeeImport, User, sequelize } = require("../models");
const { createInvitedAccount, sendInvitation } = require("./authController");

function inputRow(row) {
  if (!row || typeof row.fullName !== "string" || typeof row.email !== "string") {
    return {fullName: "", email: "", status: "invalid"};
  }
  const fullName = row.fullName.trim();
  const email = row.email.trim().toLowerCase();
  const valid = fullName.length > 0 && fullName.length <= 255 &&
    email.length <= 254 && Validator.isEmail(email);
  return {fullName: fullName.slice(0, 255), email: email.slice(0, 254), status: valid ? "pending" : "invalid"};
}

async function processRow(req, id, index) {
  const invitation = await sequelize.transaction(async transaction => {
    const batch = await EmployeeImport.findByPk(id, {transaction, lock: transaction.LOCK.UPDATE});
    const rows = batch.rows.slice();
    const row = rows[index];
    if (row.status !== "pending") return;
    const fields = {fullName: row.fullName, email: row.email, role: "employee"};
    let created;
    if (await User.findOne({where: {email: row.email}, transaction})) {
      rows[index] = {...row, status: "duplicate"};
    } else {
      created = await createInvitedAccount(fields, transaction);
      rows[index] = {...row, userId: created.newUser.id, status: "created", delivery: "unconfirmed"};
    }
    await batch.update({rows}, {transaction});
    return created && {fields, token: created.resetToken};
  });
  if (!invitation) return;
  let delivery;
  try {
    await sendInvitation(req, invitation.fields, invitation.token);
    delivery = "sent";
  } catch {
    delivery = "failed";
  }
  await sequelize.transaction(async transaction => {
    const batch = await EmployeeImport.findByPk(id, {transaction, lock: transaction.LOCK.UPDATE});
    const rows = batch.rows.slice();
    rows[index] = {...rows[index], delivery};
    await batch.update({rows}, {transaction});
  });
}

exports.history = async (req, res, next) => {
  try {
    res.json(await EmployeeImport.findAll({where: {actorId: req.user.id}, attributes: ["id", "createdAt", "rows"], order: [["createdAt", "DESC"]], limit: 20}));
  } catch (error) { next(error); }
};

exports.submit = async (req, res, next) => {
  try {
    const {id, rows} = req.body;
    if (typeof id !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)) {
      return res.status(400).json({message: "A valid import ID is required."});
    }
    let batch;
    if (rows !== undefined) {
      if (!Array.isArray(rows) || !rows.length || rows.length > 50) return res.status(400).json({message: "Submit 1 to 50 employees."});
      const entries = rows.map(inputRow);
      const digest = createHash("sha256").update(JSON.stringify(entries)).digest("hex");
      [batch] = await EmployeeImport.findOrCreate({where: {id}, defaults: {actorId: req.user.id, digest, rows: entries}});
      if (batch.actorId !== req.user.id) return res.sendStatus(404);
      if (batch.digest !== digest) return res.status(409).json({message: "This import ID already has different rows."});
    } else {
      batch = await EmployeeImport.findOne({where: {id, actorId: req.user.id}});
      if (!batch) return res.sendStatus(404);
    }
    for (let i = 0; i < batch.rows.length; i++) {
      if (batch.rows[i].status === "pending") await processRow(req, id, i);
    }
    await batch.reload();
    res.json({id, rows: batch.rows, createdAt: batch.createdAt});
  } catch (error) { next(error); }
};
