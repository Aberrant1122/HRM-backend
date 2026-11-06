const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {Sequelize,DataTypes}=require('sequelize');
const {load,response}=require('./helpers/controller');
test('QA02: provenance and every guarded employee-history path survive client conversion/deletion',{timeout:120000},async t=>{
  assert.equal(process.env.HRM_DISPOSABLE_MYSQL,'1');assert.equal(process.env.HRM_TEST_MYSQL_PORT,'13379');
  const options={host:'127.0.0.1',port:13379,dialect:'mysql',logging:false,pool:{max:8,min:0}};
  const admin=new Sequelize('mysql','root',process.env.HRM_TEST_MYSQL_PASSWORD||'',options);let db;
  const schema='hrm_retention_'+Date.now();
  try{
    const [[runtime]]=await admin.query('SELECT VERSION() AS version');assert.match(runtime.version,/^9\./);
    await admin.query('CREATE DATABASE `'+schema+'`');db=new Sequelize(schema,'root',process.env.HRM_TEST_MYSQL_PASSWORD||'',options);const qi=db.getQueryInterface();
    console.log('Synthetic schema:',schema,'MySQL:',runtime.version,'Node:',process.version);
    const migration=require('../migrations/20261106010000-retain-employee-provenance');
    for(const name of fs.readdirSync(path.join(__dirname,'../migrations')).filter(name=>name.endsWith('.js')&&name!=='20261106010000-retain-employee-provenance.js').sort())await require('../migrations/'+name).up(qi,Sequelize);
    const models={};for(const name of ['attendance','leaveType','leaveRequest','payrollProfile','payrollPeriod','employeePayroll','dailyWorkRecord','userBankInfo','userInfo','project','tasks']){const model=require('../models/'+name)(db,DataTypes);models[model.name]=model;}
    let n=0;
    async function raw(role='client'){
      const email=`synthetic-${n++}@example.invalid`;
      await db.query("INSERT INTO users(fullName,email,role,status,createdAt,updatedAt) VALUES('Synthetic retention',:email,:role,'active',NOW(),NOW())",{replacements:{email,role}});
      const [[row]]=await db.query('SELECT id FROM users WHERE email=:email',{replacements:{email}});return row.id;
    }
    const actor=await raw('admin');const type=await models.LeaveType.create({name:'Synthetic leave',annual_quota:20});
    const period=await models.PayrollPeriod.create({name:'Synthetic retention',start_date:'2026-01-01',end_date:'2026-01-31',payroll_type:'monthly',status:'draft',created_by:actor});
    const project=await models.Project.create({name:'Synthetic retention project',managerId:actor});
    const task=await models.Task.create({title:'Synthetic retained task',createdBy:actor,assigneeId:actor,projectId:project.id});
    async function child(kind,id){
      if(kind==='attendance')return models.Attendance.create({userId:id,date:'2026-01-01',clockIn:'2026-01-01T08:00:00Z',status:'present'});
      if(kind==='leave')return models.LeaveRequest.create({userId:id,leaveTypeId:type.id,startDate:'2026-01-01',endDate:'2026-01-01',totalDays:1,status:'approved',reason:'Synthetic approved leave'});
      if(kind==='payrollProfile')return models.PayrollProfile.create({employee_id:id,salary_type:'monthly',base_salary:'100'});
      if(kind==='payroll')return models.EmployeePayroll.create({employee_id:id,payroll_period_id:period.id,gross_salary:'100',total_deductions:'0',net_salary:'100',snapshot:{synthetic:true},status:'paid',locked:true});
      if(kind==='work'){
        const attendance=await child('attendance',id);return models.DailyWorkRecord.create({userId:id,attendanceId:attendance.id,taskId:task.id,taskStatus:'completed',date:'2026-01-01',workNote:'Synthetic retained work'});
      }
      if(kind==='bank')return models.UserBankInfo.create({userId:id,bankName:'Synthetic bank',accountTitle:'Synthetic retention',accountNumber:String(id).padStart(8,'0'),IBAN:'PK00TEST'+String(id).padStart(16,'0')});
    }
    const kinds=['attendance','leave','payrollProfile','payroll','work','bank'],legacy=[];
    for(const kind of kinds){const id=await raw();legacy.push({kind,id,record:await child(kind,id)});}
    const plain=await raw();await models.UserInfo.create({userId:plain,companyName:'Genuine ordinary client'});
    await t.test('migration backfills known legacy history and current employees, preserves sessions, rerun/down is non-contracting',async()=>{
      const current=await raw('employee');const [[before]]=await db.query('SELECT sessionVersion FROM users WHERE id=?',{replacements:[current]});
      const migrator='hist_'+Date.now();
      await admin.query(`CREATE USER '${migrator}'@'127.0.0.1' IDENTIFIED BY 'synthetic-migration-only'`);
      await admin.query(`GRANT SELECT, UPDATE, ALTER, TRIGGER ON \`${schema}\`.users TO '${migrator}'@'127.0.0.1'`);
      for(const table of ['attendances','leave_requests','payroll_profiles','employee_payrolls','daily_work_records','userBankInfo'])await admin.query(`GRANT SELECT ON \`${schema}\`.\`${table}\` TO '${migrator}'@'127.0.0.1'`);
      const scoped=new Sequelize(schema,migrator,'synthetic-migration-only',options);
      try{
        await migration.up(scoped.getQueryInterface(),Sequelize);
        const [grants]=await scoped.query('SHOW GRANTS FOR CURRENT_USER');assert.equal(JSON.stringify(grants).includes('SUPER'),false);
      }finally{await scoped.close();} // Keep the local trigger definer; never drop a live definer.
      await migration.up(qi,Sequelize);await migration.down(qi);await migration.up(qi,Sequelize);
      const [rows]=await db.query('SELECT id,hasEmployeeHistory FROM users');const flags=new Map(rows.map(row=>[row.id,Number(row.hasEmployeeHistory)]));
      for(const row of legacy)assert.equal(flags.get(row.id),1,row.kind);assert.equal(flags.get(plain),0);assert.equal(flags.get(current),1);
      const [[after]]=await db.query('SELECT sessionVersion FROM users WHERE id=?',{replacements:[current]});assert.equal(after.sessionVersion,before.sessionVersion);
    });
    const User=require('../models/user')(db,DataTypes);models.User=User;
    const controller=load('controllers/clientController.js',{
      bcryptjs:require('bcryptjs'),crypto:require('node:crypto'),sequelize:Sequelize,'../models':models,
      'express-validator':require('express-validator'),nodemailer:{createTransport:()=>({})},'../utils/pagination':{},'../config/runtimeSafety':require('../config/runtimeSafety'),
    });
    const employees=load('controllers/employeeController.js',{
      '../middleware/employeeAccess':require('../middleware/employeeAccess'),'../models':models,sequelize:Sequelize,
      'express-validator':require('express-validator'),path, '../utils/pagination':{},
    });
    async function remove(id){const res=response();await controller.deleteClient({params:{id},user:{id:actor,role:'admin'}},res);return res;}
    await t.test('each legacy history-only client and each new client financial/history path is retained without employee_payrolls',async()=>{
      for(const {kind,id,record} of legacy){assert.equal((await remove(id)).code,409,kind);assert.ok(await User.findByPk(id));assert.ok(await record.constructor.findByPk(record.id));}
      for(const kind of kinds){
        const id=await raw(),record=await child(kind,id);assert.equal((await User.findByPk(id)).hasEmployeeHistory,false);
        assert.equal((await remove(id)).code,409,kind);assert.ok(await record.constructor.findByPk(record.id));
      }
    });
    await t.test('ordinary client with UserInfo remains deletable; new employee provenance survives raw/bulk/stale clear and role cycles',async()=>{
      assert.equal((await remove(plain)).code,200);assert.equal(await User.findByPk(plain),null);assert.equal(await models.UserInfo.count({where:{userId:plain}}),0);
      const employee=await User.create({fullName:'Synthetic former',email:'former-only-profile@example.invalid',role:'employee',status:'active'});
      await models.UserInfo.create({userId:employee.id,position:'Recorded employment profile'});
      await db.query("UPDATE users SET role='client',hasEmployeeHistory=0 WHERE id=?",{replacements:[employee.id]});
      await User.update({hasEmployeeHistory:false},{where:{id:employee.id},hooks:false});
      assert.equal((await User.findByPk(employee.id)).hasEmployeeHistory,true);assert.equal((await remove(employee.id)).code,409);
      const ordinary=await raw();await db.query("UPDATE users SET role='employee' WHERE id=?",{replacements:[ordinary]});
      await db.query("UPDATE users SET role='client',hasEmployeeHistory=0 WHERE id=?",{replacements:[ordinary]});assert.equal((await remove(ordinary)).code,409);
    });
    await t.test('concurrent conversion/delete cannot erase former employee history; child insert/delete ordering is safe',async()=>{
      for(let i=0;i<8;i++){
        const employee=await User.create({fullName:'Concurrent former',email:`race-${i}@example.invalid`,role:'employee',status:'active'});
        const row=await child(i%2?'leave':'attendance',employee.id),conversion=response();
        const [_,deletion]=await Promise.all([employees.updateEmployeeRole({params:{userId:employee.id},body:{role:'client'},user:{id:actor,role:'admin'}},conversion),remove(employee.id)]);
        assert.equal(conversion.code,200);assert.ok([404,409].includes(deletion.code));assert.ok(await User.findByPk(employee.id));assert.ok(await row.constructor.findByPk(row.id));
        assert.equal((await remove(employee.id)).code,409);
      }
      const id=await raw();let record,insertError;
      const [deletion]=await Promise.all([remove(id),child('leave',id).then(row=>{record=row;}).catch(error=>{insertError=error;})]);
      if(record){assert.equal(deletion.code,409);assert.ok(await User.findByPk(id));assert.ok(await models.LeaveRequest.findByPk(record.id));}
      else{assert.equal(deletion.code,200);assert.equal(insertError.name,'SequelizeForeignKeyConstraintError');}
    });
  }finally{if(db)await db.close();await admin.close();}
});
