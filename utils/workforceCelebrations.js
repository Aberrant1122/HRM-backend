const civil=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&s>='1000-01-01'&&s<='9999-12-31'&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const day=s=>Date.parse(s+'T00:00:00Z')/86400000,leap=y=>y%4===0&&(y%100!==0||y%400===0),covers=(p,d)=>p.startDate<=d&&(!p.endDate||p.endDate>=d);
function spans(periods){const ordered=[...periods].sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.id-b.id),rows=[];let ambiguous=false;for(const p of ordered){const last=rows.at(-1);if(last&&(!last.endDate||p.startDate<=last.endDate)){ambiguous=true;continue;}if(last&&last.endDate&&day(p.startDate)===day(last.endDate)+1){last.endDate=p.endDate;last.periodRecords++;}else rows.push({startDate:p.startDate,endDate:p.endDate,periodRecords:1});}return{rows,ambiguous};}
function report(accounts,periods,kind,asOf,through){
 const byPerson=new Map(),coverage={accountRecords:accounts.length,validPeriodRecords:0,voidedPeriodRecords:0,invalidPeriodRecords:0,recordedActivePeople:0,accountsWithoutValidPeriods:0,missingBirthdayPeople:0,ambiguousBirthdayProfiles:0,invalidOrFutureBirthdayPeople:0,ambiguousServicePeople:0,excludedAfterRecordedEnd:0,leapOnlyAnniversaryYearsSkipped:0},events=[];
 for(const p of periods){if(p.voided){coverage.voidedPeriodRecords++;continue;}if(!Number.isInteger(Number(p.version))||Number(p.version)<1||!civil(p.startDate)||p.endDate!==null&&(!civil(p.endDate)||p.endDate<p.startDate)){coverage.invalidPeriodRecords++;continue;}coverage.validPeriodRecords++;if(!byPerson.has(p.employeeId))byPerson.set(p.employeeId,[]);byPerson.get(p.employeeId).push(p);}
 for(const person of accounts){const service=byPerson.get(person.employeeId)||[];if(!service.length)coverage.accountsWithoutValidPeriods++;if(!service.some(p=>covers(p,asOf)))continue;coverage.recordedActivePeople++;
  let sourceDate,span;
  if(kind==='birthdays'){if(Number(person.profileCount)>1){coverage.ambiguousBirthdayProfiles++;continue;}if(!person.dob){coverage.missingBirthdayPeople++;continue;}if(!civil(person.dob)||person.dob>asOf){coverage.invalidOrFutureBirthdayPeople++;continue;}sourceDate=person.dob;}
  else {const grouped=spans(service);if(grouped.ambiguous){coverage.ambiguousServicePeople++;continue;}span=grouped.rows.find(p=>covers(p,asOf));if(!span)continue;sourceDate=span.startDate;}
  for(let year=Number(asOf.slice(0,4));year<=Number(through.slice(0,4));year++){
   const monthDay=sourceDate.slice(5);let observed=monthDay;if(monthDay==='02-29'&&!leap(year)){if(kind==='anniversaries'){coverage.leapOnlyAnniversaryYearsSkipped++;continue;}observed='02-28';}
   const eventDate=String(year).padStart(4,'0')+'-'+observed,completedYears=year-Number(sourceDate.slice(0,4));if(eventDate<asOf||eventDate>through||kind==='anniversaries'&&completedYears<1)continue;
   if(kind==='birthdays'?!service.some(p=>covers(p,eventDate)):!covers(span,eventDate)){coverage.excludedAfterRecordedEnd++;continue;}
   events.push({employeeId:person.employeeId,fullName:person.fullName,eventDate,recordedMonthDay:monthDay,observedDifferently:monthDay!==observed,...(kind==='anniversaries'&&{serviceStart:sourceDate,serviceEnd:span.endDate,periodRecords:span.periodRecords,completedYears})});
  }
 }
 events.sort((a,b)=>a.eventDate.localeCompare(b.eventDate)||a.employeeId-b.employeeId);return{coverage,events,people:new Set(events.map(e=>e.employeeId)).size};
}
module.exports={civil,day,spans,report};
