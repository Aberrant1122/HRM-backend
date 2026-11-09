'use strict';
const PRODUCTION_ENVIRONMENT='87199464-2ada-411a-a6f3-592b9b488134',PROJECT='d3d9642a-87b1-4fcb-b2ac-6b619ea0ca1d';
function validateEnv(e){
 const deny=()=>{throw Error('Synthetic staging bootstrap refused: target or safety inputs do not match');};
 if(e.APP_ENV!=='staging'||e.NODE_ENV!=='production'||e.MAIL_MODE!=='capture'||e.BACKGROUND_JOBS_ENABLED!=='false'||e.STARTUP_SCHEMA_REPAIR_ENABLED!=='false'||e.STAGING_SEED_CONFIRM!=='synthetic-only'||e.RAILWAY_PROJECT_ID!==PROJECT||!e.RAILWAY_ENVIRONMENT_ID||e.RAILWAY_ENVIRONMENT_ID===PRODUCTION_ENVIRONMENT||e.RAILWAY_ENVIRONMENT_ID!==e.STAGING_EXPECTED_ENVIRONMENT_ID||!e.STAGING_EXPECTED_ENVIRONMENT_ID.match(/^[0-9a-f-]{36}$/i)||e.STAGING_EXPECTED_DB_NAME!=='hrm_staging_synthetic'||!/^[-a-z0-9]+\.railway\.internal$/i.test(e.STAGING_EXPECTED_DB_HOST||'')||e.DB_URL||e.EMAIL_USER||e.EMAIL_PASS||typeof e.STAGING_QA_PASSWORD!=='string'||e.STAGING_QA_PASSWORD.length<24||typeof e.JWT_SECRET_KEY!=='string'||e.JWT_SECRET_KEY.length<32||!/^[a-z0-9-]{3,32}$/.test(e.STAGING_SEED_NAMESPACE||''))deny();
 let url;try{url=new URL(e.DATABASE_URL);}catch{deny();}
 if(url.protocol!=='mysql:'||url.search||url.hash||url.hostname!==e.STAGING_EXPECTED_DB_HOST||decodeURIComponent(url.pathname.slice(1))!==e.STAGING_EXPECTED_DB_NAME||!url.username||!url.password)deny();
 return{schema:e.STAGING_EXPECTED_DB_NAME,namespace:e.STAGING_SEED_NAMESPACE};
}
async function seed(m,e){const {schema,namespace}=validateEnv(e),[[target]]=await m.sequelize.query('SELECT DATABASE() name');if(target.name!==schema)throw Error('Synthetic staging bootstrap refused: database identity mismatch');
 const roles=['admin','employee','manager','client','hr'],emails=roles.map(role=>role+'.'+namespace+'@example.invalid');
 await m.sequelize.transaction(async transaction=>{const existing=await m.User.findAll({attributes:['id','email','role'],transaction});if(existing.some(u=>!emails.includes(u.email)||roles[emails.indexOf(u.email)]!==u.role))throw Error('Synthetic staging bootstrap refused: database contains non-seed accounts');for(const role of roles){const email=role+'.'+namespace+'@example.invalid';if(existing.some(u=>u.email===email))continue;const user=await m.User.create({fullName:'Synthetic staging '+role,email,password:e.STAGING_QA_PASSWORD,role,status:'active'},{transaction});if(role==='employee')await m.UserInfo.create({userId:user.id},{transaction});}});
 return{accounts:roles.length,syntheticOnly:true,permissionGrantsCreated:0};
}
if(require.main===module){(async()=>{validateEnv(process.env);if(process.argv.includes('--validate-only')){console.log('Synthetic staging target and safety inputs validated; no database access');return;}const m=require('../models');try{const result=await seed(m,process.env);console.log(JSON.stringify(result));}finally{await m.sequelize.close();}})().catch(()=>{console.error('Synthetic staging bootstrap refused or failed; review target and safety inputs without logging credentials');process.exitCode=1;});}
module.exports={validateEnv,seed};
