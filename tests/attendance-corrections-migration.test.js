const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');const {Sequelize}=require('sequelize');const execute=require('node:util').promisify(require('node:child_process').execFile);
test('actual CLI populated50-to51 correction upgrade preserves raw facts and additive down/re-up',{timeout:180000},async()=>{
  assert.equal(process.env.HRM_DISPOSABLE_MYSQL,'1');assert.equal(process.env.HRM_TEST_MYSQL_PORT,'13379');
  const opts={host:'127.0.0.1',port:13379,dialect:'mysql',logging:false},admin=new Sequelize('mysql','root','',opts);let db;
  try{
    const schema='hrm_correction_upgrade_'+Date.now();await admin.query('CREATE DATABASE `'+schema+'`');db=new Sequelize(schema,'root','',opts);
    const env={...process.env,NODE_ENV:'test',DATABASE_URL:'',DB_URL:'',TEST_DB_HOST:'127.0.0.1',TEST_DB_PORT:'13379',TEST_DB_NAME:schema,TEST_DB_USER:'root',TEST_DB_PASSWORD:''},cli=require.resolve('sequelize-cli/lib/sequelize');
    const run=(command='db:migrate',to)=>execute(process.execPath,[cli,command,'--env','test','--config',path.join(__dirname,'../config/config.js'),...(to?['--to',to]:[])],{cwd:path.join(__dirname,'..'),env,timeout:60000,maxBuffer:2*1024*1024});
    await run('db:migrate','20261107000000-attendance-command-recovery.js');
    await db.query("INSERT INTO users(fullName,email,role,status,createdAt,updatedAt) VALUES('Synthetic legacy correction','legacy-correction@example.invalid','employee','active',NOW(),NOW())");
    const [[user]]=await db.query("SELECT id FROM users WHERE email='legacy-correction@example.invalid'");
    await db.query("ALTER TABLE attendances MODIFY COLUMN status ENUM('present','absent','leave','half-day') NULL DEFAULT NULL");
    for(const status of ['present','leave'])await db.query("INSERT INTO attendances(userId,date,clockIn,status,createdAt,updatedAt) VALUES(?, '2026-01-01','2026-01-01 08:00:00',?,NOW(),NOW())",{replacements:[user.id,status]});
    await db.query("INSERT INTO attendances(userId,date,clockIn,status,createdAt,updatedAt) VALUES(?, '2026-01-01','2026-01-01 08:00:00',NULL,NOW(),NOW())",{replacements:[user.id]});
    const [before]=await db.query('SELECT * FROM attendances ORDER BY id');assert.equal((await db.getQueryInterface().describeTable('attendances')).clockIn.allowNull,false);
    await run();const [after]=await db.query('SELECT * FROM attendances ORDER BY id');assert.deepEqual(after,before);
    assert.equal((await db.getQueryInterface().describeTable('attendances')).clockIn.allowNull,true);
    const [[grants]]=await db.query('SELECT COUNT(*) AS n FROM attendance_correction_grants');assert.equal(Number(grants.n),0);
    for(const status of ['absent','on-leave'])await db.query("INSERT INTO attendances(userId,date,clockIn,status,createdAt,updatedAt) VALUES(?, '2026-01-02',NULL,?,NOW(),NOW())",{replacements:[user.id,status]});
    assert.match((await run()).stdout,/No migrations were executed/);
    const [meta]=await db.query('SELECT name FROM SequelizeMeta');assert.equal(meta.length,51);
    await run('db:migrate:undo');assert.equal((await db.getQueryInterface().describeTable('attendances')).clockIn.allowNull,true);
    const [retained]=await db.query('SELECT status,clockIn FROM attendances WHERE clockIn IS NULL ORDER BY id');assert.deepEqual(retained.map(r=>r.status),['absent','on-leave']);
    await run();const [[count]]=await db.query('SELECT COUNT(*) AS n FROM attendances');assert.equal(Number(count.n),5);
    const [[unknown]]=await db.query('SELECT COUNT(*) AS n FROM attendances WHERE status IS NULL');assert.equal(Number(unknown.n),1);
    console.log('Synthetic correction upgrade',schema,'metadata51; legacy and nullable/status facts retained; grants default empty');
  }finally{if(db)await db.close();await admin.close();}
});
