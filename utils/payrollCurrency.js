const crypto=require('crypto');
const subjects={profile:{model:'PayrollProfile',table:'payroll_profiles',field:'profileId'},period:{model:'PayrollPeriod',table:'payroll_periods',field:'periodId'},row:{model:'EmployeePayroll',table:'employee_payrolls',field:'rowId'}};
const sql=(kind,alias)=>{if(!subjects[kind]||!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(alias))throw Error('Invalid currency source');return "COALESCE("+alias+".currency,(SELECT currencyScope.currency FROM payroll_currency_events currencyScope WHERE currencyScope.subjectKind='"+kind+"' AND currencyScope.subjectId="+alias+'.id ORDER BY currencyScope.version DESC LIMIT 1))';};
const fingerprint=record=>crypto.createHash('sha256').update(JSON.stringify(record.toJSON())).digest('hex');
async function resolve(models,kind,id,transaction,lock=false){const spec=subjects[kind];if(!spec)throw Object.assign(Error('Invalid currency source'),{code:400});const record=await models[spec.model].findByPk(id,{transaction,...(lock&&{lock:transaction.LOCK.UPDATE})});if(!record)throw Object.assign(Error('Payroll currency source unavailable'),{code:404});const event=await models.PayrollCurrencyEvent.findOne({where:{subjectKind:kind,subjectId:id},order:[['version','DESC']],transaction,...(lock&&{lock:transaction.LOCK.UPDATE})});return{record,event,currency:record.currency??event?.currency??null,fingerprint:fingerprint(record)};}
async function requirePkr(models,kind,id,transaction){const result=await resolve(models,kind,id,transaction,true);if(result.currency!=='PKR')throw Object.assign(Error('Record explicit PKR provenance for the '+kind+' before creating or calculating payroll; historical currency remains unclassified'),{code:409});return result;}
async function attachRowCurrencies(models,rows){
 const historical=rows.filter(r=>!r.currency).map(r=>r.id);
 if(!historical.length)return;
 const events=await models.PayrollCurrencyEvent.findAll({where:{subjectKind:'row',subjectId:{[require('sequelize').Op.in]:historical}},attributes:['subjectId','currency'],order:[['version','ASC']],raw:true});
 const mapped=new Map(events.map(e=>[e.subjectId,e.currency]));
 for(const row of rows)if(!row.currency)row.setDataValue('currency',mapped.get(row.id) || null);
}
module.exports={attachRowCurrencies,subjects,sql,fingerprint,resolve,requirePkr};
