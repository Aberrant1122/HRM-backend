const crypto=require('crypto'),{QueryTypes}=require('sequelize'),proof=require('../utils/documentSignature'),storage=require('../utils/handbookStorage');
module.exports=(m,c)=>{
 const router=require('express').Router(),select=(sql,replacements,t)=>m.sequelize.query(sql,{replacements,transaction:t,type:QueryTypes.SELECT});
 const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
 async function revision(id,t){const r=await m.EmployeeDocumentRevision.findByPk(id,{transaction:t});if(!r)fail(404,'Document revision unavailable');return r;}
 async function integrity(r){const bytes=await storage.get(r.attachment.key);return bytes.length===r.attachment.size&&crypto.createHash('sha256').update(bytes).digest('hex')===r.attachment.sha256;}
 function action(fn){return async(req,res)=>{try{const data=await m.sequelize.transaction(async t=>{await c.actor(req,t);return fn(req,t);});res.json({data});}catch(e){c.error(res,e);}};}
 router.get('/keys',action(async(req,t)=>select('SELECT id,fingerprint,createdAt,revokedAt FROM document_signing_keys WHERE ownerId = ? ORDER BY createdAt DESC',[req.user.id],t)));
 router.post('/keys',action(async(req,t)=>{
  let parsed;try{parsed=proof.publicKey(req.body.publicKey);}catch(e){fail(400,e.message);}
  const [prior]=await select('SELECT id,fingerprint,revokedAt FROM document_signing_keys WHERE ownerId = ? AND fingerprint = ?',[req.user.id,parsed.fingerprint],t);if(prior)return prior;
  const id=crypto.randomUUID();await m.sequelize.query('INSERT INTO document_signing_keys (id,ownerId,publicKey,fingerprint) VALUES (?,?,?,?)',{transaction:t,replacements:[id,req.user.id,JSON.stringify(parsed.jwk),parsed.fingerprint]});return {id,fingerprint:parsed.fingerprint,revokedAt:null};
 }));
 router.get('/registry',action(async(req,t)=>{
  if(req.user.role!=='admin')fail(403,'Administrator trust configuration required');
  return select('SELECT k.id,k.ownerId,u.fullName,k.fingerprint,k.revokedAt,(SELECT e.active FROM document_key_trust_events e WHERE e.keyId=k.id ORDER BY e.id DESC LIMIT 1) trusted FROM document_signing_keys k JOIN users u ON u.id=k.ownerId ORDER BY k.createdAt DESC',[],t);
 }));
 router.post('/keys/:keyId/trust',action(async(req,t)=>{
  if(req.user.role!=='admin')fail(403,'Administrator trust configuration required');
  if(typeof req.body.active!=='boolean'||typeof req.body.reason!=='string'||!req.body.reason.trim()||req.body.reason.length>500)fail(400,'Explicit trust decision and reason required');
  const [key]=await select('SELECT * FROM document_signing_keys WHERE id = ? FOR UPDATE',[req.params.keyId],t);if(!key||key.revokedAt)fail(409,'Active signing key required');
  const [last]=await select('SELECT id,active FROM document_key_trust_events WHERE keyId = ? ORDER BY id DESC LIMIT 1',[key.id],t);
  if(last&&Boolean(last.active)===req.body.active)return {id:last.id,active:req.body.active};
  await m.sequelize.query('INSERT INTO document_key_trust_events (keyId,actorId,active,reason) VALUES (?,?,?,?)',{transaction:t,replacements:[key.id,req.user.id,req.body.active,req.body.reason.trim()]});
  return (await select('SELECT id,active FROM document_key_trust_events WHERE keyId = ? ORDER BY id DESC LIMIT 1',[key.id],t))[0];
 })); router.post('/keys/:keyId/revoke',action(async(req,t)=>{
  const [key]=await select('SELECT * FROM document_signing_keys WHERE id = ? AND ownerId = ? FOR UPDATE',[req.params.keyId,req.user.id],t);if(!key)fail(404,'Own signing key unavailable');
  await m.sequelize.query('UPDATE document_signing_keys SET revokedAt=COALESCE(revokedAt,CURRENT_TIMESTAMP(3)) WHERE id = ?',{transaction:t,replacements:[key.id]});return {revoked:true};
 }));
 async function signing(req,t){
  const r=await revision(c.id(req.params.revisionId),t),keyId=req.method==='GET'?req.query.keyId:req.body.keyId;
  const [key]=await select('SELECT * FROM document_signing_keys WHERE id = ? AND ownerId = ? FOR UPDATE',[String(keyId||''),req.user.id],t);
  if(!key||key.revokedAt)fail(403,'An active signing key owned by your account is required');
  const [trust]=await select('SELECT id,active FROM document_key_trust_events WHERE keyId = ? ORDER BY id DESC LIMIT 1',[key.id],t);if(!trust?.active)fail(403,'Administrator must explicitly trust this signing key');key.trustEventId=trust.id;
  if(!await integrity(r))fail(409,'Document file integrity check failed');
  return {r,key,payload:proof.payload(r,key,req.user.id)};
 }
 router.get('/revisions/:revisionId/challenge',action(async(req,t)=>{
  const s=await signing(req,t);return {payload:s.payload,keyId:s.key.id,publicKey:s.key.publicKey};
 }));
 router.post('/revisions/:revisionId/sign',action(async(req,t)=>{
  const s=await signing(req,t);if(req.body.payload!==s.payload||!proof.valid(s.key.publicKey,s.payload,req.body.signature))fail(400,'Signature does not verify for this exact revision and signer');
  const [prior]=await select('SELECT id FROM document_revision_signatures WHERE revisionId = ? AND keyId = ?',[s.r.id,s.key.id],t);if(prior)return {...prior,replayed:true};
  const actor=await m.User.findByPk(req.user.id,{transaction:t});await m.sequelize.query('INSERT INTO document_revision_signatures (revisionId,keyId,trustEventId,signerId,signerName,payload,signature) VALUES (?,?,?,?,?,?,?)',{transaction:t,replacements:[s.r.id,s.key.id,s.key.trustEventId,req.user.id,actor.fullName,s.payload,req.body.signature]});
  return (await select('SELECT id FROM document_revision_signatures WHERE revisionId = ? AND keyId = ?',[s.r.id,s.key.id],t))[0];
 }));
 router.get('/revisions/:revisionId',action(async(req,t)=>{
  const r=await revision(c.id(req.params.revisionId),t),before=req.query.before===undefined?2147483648:c.id(req.query.before);
  const rows=await select('SELECT s.*,t.actorId AS trustConfiguredBy,t.createdAt AS trustConfiguredAt,t.reason AS trustReason,t.active AS trustedAtSigning,k.publicKey,k.fingerprint,k.revokedAt,(SELECT e.active FROM document_key_trust_events e WHERE e.keyId=k.id ORDER BY e.id DESC LIMIT 1) currentlyTrusted FROM document_revision_signatures s JOIN document_signing_keys k ON k.id=s.keyId JOIN document_key_trust_events t ON t.id=s.trustEventId AND t.keyId=s.keyId WHERE s.revisionId = ? AND s.id < ? ORDER BY s.id DESC LIMIT 51',[r.id,before],t),fileValid=await integrity(r);
  return {fileValid,rows:rows.slice(0,50).map(row=>({...row,signatureValid:Boolean(row.trustedAtSigning)&&row.payload===proof.payload(r,{id:row.keyId,fingerprint:row.fingerprint,trustEventId:row.trustEventId},row.signerId)&&proof.valid(row.publicKey,row.payload,row.signature)})),hasMore:rows.length>50};
 }));return router;
};
