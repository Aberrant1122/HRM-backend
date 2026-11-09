'use strict';
// Read-only pre-DDL check. Never imports models, syncs, seeds or migrates.
const {validateEnv}=require('./seedStagingSynthetic');
function validateInputs(e,config){
 const {schema,namespace}=validateEnv(e),url=new URL(e.DATABASE_URL);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e.STAGING_EXPECTED_DB_SERVER_UUID||'')||decodeURIComponent(url.username)!=='hrm_staging'||config?.dialect!=='mysql'||config.use_env_variable!=='DATABASE_URL'||config.url||config.host||config.database||config.username||config.password||config.replication||config.dialectOptions?.ssl||e.DB_SSL&&e.DB_SSL!=='false')throw Error('Staging pre-DDL verification refused: effective configuration');
 return{schema,namespace,user:'hrm_staging',serverUuid:e.STAGING_EXPECTED_DB_SERVER_UUID.toLowerCase(),migrationNames:require('fs').readdirSync(require('path').join(__dirname,'../migrations')).filter(f=>f.endsWith('.js'))};
}
async function inspectDatabase(db,expected){
 const [[actual]]=await db.query('SELECT DATABASE() name, CURRENT_USER() account, @@server_uuid serverUuid, @@hostname hostname, @@partial_revokes partialRevokes');
 if(actual.name!==expected.schema||String(actual.account).split('@')[0]!==expected.user||String(actual.serverUuid).toLowerCase()!==expected.serverUuid)throw Error('Staging pre-DDL verification refused: effective database identity');
 const [rows]=await db.query('SHOW GRANTS FOR CURRENT_USER');
 if(!rows.length)throw Error('Staging pre-DDL verification refused: missing grants');
 const literal=expected.schema.replaceAll('`','``'),quoted='`'+(Number(actual.partialRevokes)===1?literal:literal.replaceAll('_','\\_').replaceAll('%','\\%'))+'`.*';let schemaGrant=false;
 for(const row of rows){const grant=String(Object.values(row)[0]);const parts=/^GRANT (.+) ON (.+) TO /i.exec(grant);if(!parts||/WITH GRANT OPTION/i.test(grant))throw Error('Staging pre-DDL verification refused: unsupported or delegable grants');if(parts[2]===quoted){schemaGrant=true;continue;}if(parts[2]==='*.*'&&parts[1]==='USAGE')continue;throw Error('Staging pre-DDL verification refused: grants exceed synthetic schema');}
 if(!schemaGrant)throw Error('Staging pre-DDL verification refused: no schema grant');
 // An empty fresh schema is expected. Existing schemas need known CLI metadata and only namespace-bound seed users.
 const [tables]=await db.query('SELECT TABLE_NAME name FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE()');
 if(tables.length&&!tables.some(t=>String(t.name).toLowerCase()==='sequelizemeta'))throw Error('Staging pre-DDL verification refused: nonempty untracked schema');
 if(tables.length){const [meta]=await db.query('SELECT name FROM SequelizeMeta');if(meta.some(r=>!expected.migrationNames.includes(r.name))||new Set(meta.map(r=>r.name)).size!==meta.length)throw Error('Staging pre-DDL verification refused: unknown migration metadata');}
 if(tables.some(t=>t.name==='users')){const [users]=await db.query('SELECT email,role FROM users');const roles=['admin','employee','manager','client','hr'];if(users.some(u=>!roles.includes(u.role)||u.email!==u.role+'.'+expected.namespace+'@example.invalid'))throw Error('Staging pre-DDL verification refused: non-seed accounts');}
 return{databaseMatched:true,accountMatched:true,serverUuidMatched:true,schemaScopedGrants:true,existingTableCount:tables.length,readOnly:true};
}
async function preflight(e,config,Sequelize){
 const expected=validateInputs(e,config),db=new Sequelize(e.DATABASE_URL,{...config,logging:false,pool:{max:1,min:0,acquire:10000,idle:1000},dialectOptions:{connectTimeout:10000}});
 try{return await inspectDatabase(db,expected);}finally{await db.close();}
}
if(require.main===module){(async()=>{validateEnv(process.env);const config=require('../config/config').production;const result=await preflight(process.env,config,require('sequelize').Sequelize);console.log(JSON.stringify(result));})().catch(()=>{console.error('Staging pre-DDL verification refused or failed; no migration ran. Verify isolated service/volume binding, effective database identity and scoped grants without logging credentials.');process.exitCode=1;});}
module.exports={validateInputs,inspectDatabase,preflight};

