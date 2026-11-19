const {civil}=require('./leaveCharging');
const day=s=>Date.parse(s+'T00:00:00Z')/86400000;
module.exports=function measure(rows,config){
 const {from,to,asOf,denominator,numerator,source}=config;
 if(source!=='recorded-employment-ends'||!['distinct-people','episodes'].includes(numerator)||!['opening-closing-mean','daily-mean'].includes(denominator)||![from,to,asOf].every(civil)||from>to||to>=asOf)throw Error('Select source, numerator, denominator, and a completed reporting window before the as-of date');
 const start=day(from),end=day(to),days=end-start+1;
 if(days>3660)throw Error('Choose a window of at most 3660 days');
 const periods=rows.filter(r=>!r.voided&&civil(r.startDate)&&(r.endDate===null||civil(r.endDate)&&r.endDate>=r.startDate));
 const ended=periods.filter(r=>r.endDate!==null&&r.endDate>=from&&r.endDate<=to);
 const byPerson=new Map();
 for(const row of periods){
   const left=Math.max(day(row.startDate),start),right=Math.min(row.endDate===null?end:day(row.endDate),end);
   if(left>right)continue;
   if(!byPerson.has(row.employeeId))byPerson.set(row.employeeId,[]);
   byPerson.get(row.employeeId).push([left,right]);
 }
 let opening=0,closing=0,personDays=0;
 for(const spans of byPerson.values()){
   spans.sort((a,b)=>a[0]-b[0]);
   let merged=null;
   const consume=span=>{personDays+=span[1]-span[0]+1;if(span[0]===start)opening++;if(span[1]===end)closing++;};
   for(const span of spans){
     if(!merged){merged=[...span];continue;}
     if(span[0]<=merged[1]+1)merged[1]=Math.max(merged[1],span[1]);
     else{consume(merged);merged=[...span];}
   }
   if(merged)consume(merged);
 }
 const people=new Set(ended.map(r=>r.employeeId)).size;
 const count=numerator==='episodes'?ended.length:people;
 const divisor=denominator==='daily-mean'?days:2;
 const base=denominator==='daily-mean'?personDays:opening+closing;
 return {config,opening,closing,days,personDays,averageHeadcount:base/divisor,endedEpisodes:ended.length,endedPeople:people,numeratorCount:count,percentage:base===0?null:Math.round(count*divisor*1000000/base)/10000,zeroDenominator:base===0,validEpisodes:periods.length,excludedVoided:rows.filter(r=>r.voided).length,invalidEpisodes:rows.filter(r=>!r.voided).length-periods.length};
};
