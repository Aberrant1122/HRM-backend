const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const {execFile,spawn}=require('node:child_process');
const {Sequelize}=require('sequelize');

test('synthetic logical backup restores table hashes, CLI metadata and working revocation trigger', {timeout:60000},async()=>{
  assert.equal(process.env.HRM_DISPOSABLE_MYSQL,'1');assert.equal(process.env.HRM_TEST_MYSQL_PORT,'13379');
  const source=process.env.HRM_TEST_RECOVERY_SOURCE;
  assert.match(source,/^hrm_slice2_upgrade_\d+_cli$/,'Only the explicit synthetic CLI fixture may be exported');
  const target=source+'_restore_'+Date.now();assert.ok(target.length<=64);
  const work=path.resolve(process.env.HRM_RECOVERY_WORK_DIR);fs.mkdirSync(work,{recursive:true});
  const backup=path.join(work,target+'.sql');
  const options={host:'127.0.0.1',port:13379,dialect:'mysql',logging:false};
  const password=process.env.HRM_TEST_MYSQL_PASSWORD||'';
  const original=new Sequelize(source,'root',password,options);
  const restored=new Sequelize(target,'root',password,options);
  const admin=new Sequelize('mysql','root',password,options);
  const common=['--no-defaults','--host=127.0.0.1','--port=13379','--user=root'];
  const env={...process.env,MYSQL_PWD:password};
  const started=Date.now();
  try{
    async function digest(connection){
      const tables=await connection.getQueryInterface().showAllTables(),result={};
      for(const table of tables){
        const [rows]=await connection.query('SELECT * FROM `'+table.replace(/`/g,'``')+'`');
        const canonical=rows.map(row=>JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a],[b])=>a.localeCompare(b))))).sort().join('\n');
        result[table]={rows:rows.length,sha256:crypto.createHash('sha256').update(canonical).digest('hex')};
      }
      return result;
    }
    const before=await digest(original);
    await promisify(execFile)(path.join(process.env.MYSQL9_BIN,'mysqldump.exe'),[...common,'--single-transaction','--skip-lock-tables','--routines','--events','--triggers','--set-gtid-purged=OFF','--result-file='+backup,source],{env,timeout:30000});
    await admin.query('CREATE DATABASE `'+target+'`');
    await new Promise((resolve,reject)=>{
      const child=spawn(path.join(process.env.MYSQL9_BIN,'mysql.exe'),[...common,'--database='+target],{env,stdio:['pipe','ignore','pipe']});
      let errors='';child.stderr.on('data',data=>{errors+=data;});child.on('error',reject);
      child.on('close',code=>code===0?resolve():reject(Error('Synthetic import failed: '+errors)));
      fs.createReadStream(backup).pipe(child.stdin);
    });
    assert.deepEqual(await digest(restored),before);
    const [metadata]=await restored.query('SELECT name FROM SequelizeMeta ORDER BY name');assert.ok(metadata.length>40);
    const [[account]]=await restored.query("SELECT id,sessionVersion FROM users WHERE email='cli@example.invalid'");
    await restored.query("UPDATE users SET status='inactive' WHERE id=?",{replacements:[account.id]});
    const [[revoked]]=await restored.query('SELECT sessionVersion FROM users WHERE id=?',{replacements:[account.id]});
    assert.equal(revoked.sessionVersion,account.sessionVersion+1);
    console.log(JSON.stringify({syntheticOnly:true,source,target,tables:Object.keys(before).length,migrations:metadata.length,backupBytes:fs.statSync(backup).size,backupSha256:crypto.createHash('sha256').update(fs.readFileSync(backup)).digest('hex'),elapsedMs:Date.now()-started}));
  }finally{await Promise.all([original.close(),restored.close(),admin.close()]);}
});
