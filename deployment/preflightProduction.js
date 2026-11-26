'use strict';
const fs=require('node:fs'),path=require('node:path');
const PROJECT='d3d9642a-87b1-4fcb-b2ac-6b619ea0ca1d',ENVIRONMENT='87199464-2ada-411a-a6f3-592b9b488134',UUID='6ba87512-c7be-11f0-98ca-a2aafdf338e3';
function validateEnvironment(env){
  if(env.RAILWAY_PROJECT_ID!==PROJECT||env.RAILWAY_ENVIRONMENT_ID!==ENVIRONMENT||env.NODE_ENV!=='production'||env.STARTUP_SCHEMA_REPAIR_ENABLED!=='false'||!['true','false'].includes(env.BACKGROUND_JOBS_ENABLED))throw Error('Invalid production deployment binding');
  const secret=env.JWT_SECRET_KEY||env.JWT_SECRET;
  if(!secret||secret==='your_secret_key')throw Error('Missing production signing configuration');
}
async function inspect(connection,env){
  validateEnvironment(env);
  const [[target]]=await connection.query('SELECT DATABASE() schemaName,@@server_uuid serverUUID,@@log_bin logBin,@@read_only readOnly,@@super_read_only superReadOnly');
  if(target.schemaName!=='railway'||target.serverUUID!==UUID||Number(target.logBin)!==0)throw Error('Wrong production database target');
  if(Number(target.readOnly)!==0||Number(target.superReadOnly)!==0)throw Error('Production database is not migration-writable');
  const [rows]=await connection.query('SELECT name FROM SequelizeMeta ORDER BY name');
  const names=rows.map(r=>r.name).sort(),expected=fs.readdirSync(path.resolve(__dirname,'../migrations')).filter(n=>n.endsWith('.js')).sort();
  const baseline=expected.filter(n=>n<'20261105000000');
  if(expected.length!==107||baseline.length!==45||![45,107].includes(names.length)||JSON.stringify(names)!==JSON.stringify(names.length===45?baseline:expected))throw Error('Unexpected production migration state; inspect partial upgrades before retry');
  if(names.length===45&&env.BACKGROUND_JOBS_ENABLED!=='false')throw Error('Background writers must remain disabled for first upgrade');
  return {schemaName:target.schemaName,serverUUID:target.serverUUID,migrations:names.length,guard:'read-only production binding verified'};
}
async function main(){
  validateEnvironment(process.env);
  const mysql=require('mysql2/promise'),url=process.env.DATABASE_URL||process.env.DB_URL;
  const connection=await mysql.createConnection(url||{host:process.env.DB_HOST||process.env.MYSQLHOST,port:Number(process.env.DB_PORT||process.env.MYSQLPORT||3306),user:process.env.DB_USER||process.env.MYSQLUSER,password:process.env.DB_PASSWORD||process.env.MYSQLPASSWORD,database:process.env.DB_NAME||process.env.MYSQLDATABASE});
  try{console.log(JSON.stringify(await inspect(connection,process.env)));}finally{await connection.end();}
}
module.exports={validateEnvironment,inspect};
if(require.main===module)main().catch(()=>{console.error('Production preflight refused deployment; inspect target, runtime flags and migration metadata before retry');process.exitCode=1;});
