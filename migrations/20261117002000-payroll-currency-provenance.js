'use strict';
const subjects={profile:'payroll_profiles',period:'payroll_periods',row:'employee_payrolls'};
module.exports={async up(q,D){
 for(const table of Object.values(subjects))await q.addColumn(table,'currency',{type:D.STRING(3),allowNull:true});
 const fk=table=>({type:D.INTEGER,allowNull:true,references:{model:table,key:'id'},onDelete:'RESTRICT',onUpdate:'RESTRICT'});
 await q.createTable('payroll_currency_events',{id:{type:D.INTEGER,primaryKey:true,autoIncrement:true},subjectKind:{type:D.STRING(10),allowNull:false},subjectId:{type:D.INTEGER,allowNull:false},profileId:fk('payroll_profiles'),periodId:fk('payroll_periods'),rowId:fk('employee_payrolls'),version:{type:D.INTEGER,allowNull:false},currency:{type:D.STRING(3),allowNull:true},actorId:{type:D.INTEGER,allowNull:false,references:{model:'users',key:'id'},onDelete:'RESTRICT'},commandKey:{type:D.STRING(36),allowNull:false,unique:true},payloadHash:{type:D.STRING(64),allowNull:false},details:{type:D.JSON,allowNull:false},createdAt:{type:D.DATE,allowNull:false},updatedAt:{type:D.DATE,allowNull:false}});
 await q.addIndex('payroll_currency_events',['subjectKind','subjectId','version'],{unique:true,name:'payroll_currency_subject_version'});
 await q.sequelize.query("ALTER TABLE payroll_currency_events ADD CONSTRAINT payroll_currency_subject_check CHECK ((subjectKind='profile' AND profileId IS NOT NULL AND profileId=subjectId AND periodId IS NULL AND rowId IS NULL) OR (subjectKind='period' AND periodId IS NOT NULL AND periodId=subjectId AND profileId IS NULL AND rowId IS NULL) OR (subjectKind='row' AND rowId IS NOT NULL AND rowId=subjectId AND profileId IS NULL AND periodId IS NULL))");
 await q.sequelize.query("ALTER TABLE payroll_currency_events ADD CONSTRAINT payroll_currency_value_check CHECK (currency IS NULL OR CHAR_LENGTH(currency)=3)");
 for(const [kind,table]of Object.entries(subjects)){
  await q.sequelize.query("ALTER TABLE "+table+" ALTER COLUMN currency SET DEFAULT 'PKR'");
  await q.sequelize.query("CREATE TRIGGER payroll_currency_"+kind+"_insert BEFORE INSERT ON "+table+" FOR EACH ROW BEGIN IF NEW.currency IS NULL OR NEW.currency<>'PKR' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='New payroll records must explicitly record PKR'; END IF; END");
  await q.sequelize.query("CREATE TRIGGER payroll_currency_"+kind+"_immutable BEFORE UPDATE ON "+table+" FOR EACH ROW BEGIN IF NOT(NEW.currency <=> OLD.currency) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retained currency is immutable; record separate provenance'; END IF; END");
 }
},async down(q){
 const [[events]]=await q.sequelize.query('SELECT COUNT(*) n FROM payroll_currency_events');if(Number(events.n))throw Error('Retained currency provenance exists; roll forward');for(const table of Object.values(subjects)){const [[r]]=await q.sequelize.query('SELECT COUNT(*) n FROM '+table+' WHERE currency IS NOT NULL');if(Number(r.n))throw Error('Retained recorded currency exists; roll forward');}
 for(const kind of Object.keys(subjects))for(const suffix of ['insert','immutable'])await q.sequelize.query('DROP TRIGGER IF EXISTS payroll_currency_'+kind+'_'+suffix);await q.dropTable('payroll_currency_events');for(const table of Object.values(subjects))await q.removeColumn(table,'currency');
}};
