const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {load}=require('./helpers/controller');

function boot(config,env){
  let args;
  function Sequelize(...values){args=values;this.authenticate=async()=>{};}
  const models=load('models/index.js',{
    fs:{readdirSync:()=>[]},path,sequelize:Sequelize,process:{env,exit:()=>assert.fail('Unexpected startup failure')},
    '../config/config.js':{production:config},
  });
  return {models,args};
}

test('application model boot resolves CLI-style URL variables and keeps field configuration fallback',()=>{
  const url='mysql://fixture@127.0.0.1:13379/synthetic';
  const resolved=boot({dialect:'mysql',use_env_variable:'DATABASE_URL'},{NODE_ENV:'production',DATABASE_URL:url});
  assert.equal(resolved.args[0],url);assert.equal(resolved.args.length,2);
  const fields=boot({dialect:'mysql',database:'synthetic',username:'fixture',password:'',host:'127.0.0.1',port:13379},{NODE_ENV:'production'});
  assert.equal(fields.args[0],'synthetic');assert.equal(fields.args[1],'fixture');assert.equal(fields.args[3].port,13379);
  assert.throws(()=>boot({dialect:'mysql',use_env_variable:'DATABASE_URL'},{NODE_ENV:'production'}),/URL variable DATABASE_URL is missing/);
});

test('DATABASE_URL and DB_URL aliases select the same variable for CLI and app in every environment',()=>{
  for(const variable of ['DATABASE_URL','DB_URL']){
    const config=load('config/config.js',{fs:{existsSync:()=>false},path},{NODE_ENV:'production',[variable]:'mysql://fixture@127.0.0.1:13379/synthetic'});
    for(const env of ['development','test','production'])assert.equal(config[env].use_env_variable,variable);
  }
});
