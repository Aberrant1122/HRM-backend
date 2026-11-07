// Scope historical rehearsals when independent modules add backdated filenames.
// The CLI runs copied real migration source, never stub migrations.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
module.exports=function isolatedMigrations(source,names){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hrm-migration-source-'));
  for(const name of names){if(path.basename(name)!==name||!name.endsWith('.js'))throw Error('Invalid migration filename');fs.copyFileSync(path.join(source,name),path.join(directory,name));}
  return {directory,close(){for(const name of names)fs.unlinkSync(path.join(directory,name));fs.rmdirSync(directory);}};
};
