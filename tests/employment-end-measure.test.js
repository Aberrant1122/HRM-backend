const assert=require('node:assert/strict'),{test}=require('node:test'),measure=require('../utils/employmentEndMeasure');
const config={source:'recorded-employment-ends',numerator:'distinct-people',denominator:'daily-mean',from:'2032-01-01',to:'2032-01-10',asOf:'2032-01-11'};
const period=(employeeId,startDate,endDate,voided=false)=>({employeeId,startDate,endDate,voided});
test('union headcount and separately selectable numerator/denominator',()=>{
 const rows=[period(1,'2032-01-01','2032-01-02'),period(1,'2032-01-04','2032-01-05'),period(1,'2032-01-01','2032-01-02'),period(2,'2031-01-01',null),period(3,'2032-01-01','2032-01-10',true)];
 const x=measure(rows,config);assert.equal(x.personDays,14);assert.equal(x.opening,2);assert.equal(x.closing,1);assert.equal(x.endedPeople,1);assert.equal(x.endedEpisodes,3);assert.equal(x.percentage,71.4286);
 assert.equal(measure(rows,{...config,denominator:'opening-closing-mean'}).percentage,66.6667);
 assert.equal(measure(rows,{...config,numerator:'episodes'}).percentage,214.2857);
 assert.equal(measure([],config).percentage,null);
 assert.throws(()=>measure(rows,{...config,asOf:'2032-01-10'}));assert.throws(()=>measure(rows,{...config,numerator:''}));
});
test('leap-day coverage and invalid episode isolation',()=>{
 const x=measure([period(1,'2032-02-29','2032-02-29'),period(2,'bad',null)],{...config,from:'2032-02-28',to:'2032-03-01',asOf:'2032-03-02'});
 assert.equal(x.personDays,1);assert.equal(x.days,3);assert.equal(x.invalidEpisodes,1);assert.equal(x.percentage,300);
});
