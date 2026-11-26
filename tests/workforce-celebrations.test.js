const test=require('node:test'),assert=require('node:assert/strict'),{report}=require('../utils/workforceCelebrations');
const person=(id,dob='2000-02-29')=>({employeeId:id,fullName:'Synthetic '+id,profileCount:1,dob}),period=(id,startDate,endDate=null,more={})=>({id,employeeId:id,startDate,endDate,version:1,voided:false,...more});
test('birthday Feb29 observes Feb28 in nonleap century and actual Feb29 in leap century',()=>{
 assert.equal(report([person(1,'1800-02-29')],[period(1,'1890-01-01')],'birthdays','1900-02-28','1900-02-28').events.length,0,'Invalid source day excluded');
 assert.equal(report([person(1,'1896-02-29')],[period(1,'1890-01-01')],'birthdays','1900-02-28','1900-02-28').events[0].eventDate,'1900-02-28');
 assert.equal(report([person(1,'1996-02-29')],[period(1,'1990-01-01')],'birthdays','2000-02-28','2000-02-29').events[0].eventDate,'2000-02-29');
});
test('inclusive rollover includes both dates without leaking birth year',()=>{
 const r=report([person(1,'1990-12-31'),person(2,'2001-01-01')],[period(1,'2020-01-01'),period(2,'2020-01-01')],'birthdays','2032-12-31','2033-01-01');assert.deepEqual(r.events.map(e=>e.eventDate),['2032-12-31','2033-01-01']);assert.ok(!JSON.stringify(r.events).includes('1990'));
});
test('a rehire gap restarts current uninterrupted service while adjacent records continue it',()=>{
 const a=person(1),records=[period(1,'2010-01-01','2018-12-31'),period(2,'2020-01-01',null,{employeeId:1})];
 let r=report([a],records,'anniversaries','2033-12-31','2034-01-01');assert.equal(r.events[0].completedYears,14);assert.equal(r.events[0].serviceStart,'2020-01-01');
 records.push(period(3,'2019-01-01','2019-12-31',{employeeId:1}));r=report([a],records,'anniversaries','2033-12-31','2034-01-01');assert.equal(r.events[0].serviceStart,'2010-01-01');assert.equal(r.events[0].periodRecords,3);
});
test('work February29 anniversaries are leap-only and require a completed year',()=>{
 const people=[person(1)],records=[period(1,'2020-02-29')];assert.equal(report(people,records,'anniversaries','2033-02-28','2033-03-01').events.length,0);assert.equal(report(people,records,'anniversaries','2032-02-29','2032-02-29').events[0].completedYears,12);assert.equal(report(people,records,'anniversaries','2020-02-29','2020-02-29').events.length,0);
});
test('overlapping service is disclosed for anniversaries; birthday people remain deduplicated',()=>{
 const people=[person(1)],records=[period(1,'2020-01-01'),period(2,'2021-01-01',null,{employeeId:1})];const a=report(people,records,'anniversaries','2032-01-01','2032-12-31');assert.equal(a.events.length,0);assert.equal(a.coverage.ambiguousServicePeople,1);assert.equal(report(people,records,'birthdays','2032-01-01','2032-12-31').events.length,1);
});
test('event date service end is inclusive; known end before birthday excludes it',()=>{
 const people=[person(1,'2000-01-02')];assert.equal(report(people,[period(1,'2020-01-01','2033-01-02')],'birthdays','2033-01-01','2033-01-02').events.length,1);const r=report(people,[period(1,'2020-01-01','2033-01-01')],'birthdays','2033-01-01','2033-01-02');assert.equal(r.events.length,0);assert.equal(r.coverage.excludedAfterRecordedEnd,1);
});
