const {test}=require('node:test'),assert=require('node:assert/strict'),c=require('../utils/leaveCharging');
const rules={resetMonthDay:'03-01',crossYearRule:'split',countingBasis:'working-days',workingDays:[1,2,3,4,5],holidays:['2028-02-28']};
test('explicit working calendar, leap dates, half days and cross-year attribution',()=>{
 assert.equal(c.configured({resetMonthDay:'01-01',crossYearRule:'split'}),false);
 assert.equal(c.units('2028-02-25','2028-02-29','full-day',rules),2);
 assert.equal(c.units('2028-02-28','2028-02-28','half-day',rules),0);
 assert.equal(c.units('2028-02-29','2028-02-29','half-day',rules),0.5);
 assert.deepEqual(c.segments('2028-02-27','2028-03-02','full-day',rules).map(x=>x.units),[1,2]);
 assert.deepEqual(c.segments('2028-02-27','2028-03-02','full-day',{...rules,crossYearRule:'start-period'}).map(x=>x.units),[3]);
 assert.equal(c.units('2028-02-25','2028-02-29','full-day',{resetMonthDay:'03-01',crossYearRule:'split',countingBasis:'calendar-days'}),5);
 for(const bad of [{...rules,workingDays:[]},{...rules,workingDays:[1,1]},{...rules,holidays:['2027-02-29']},{...rules,holidays:undefined},{...rules,countingBasis:'calendar-days'}])assert.equal(c.valid(bad),false);
 assert.throws(()=>c.units('2028-02-30','2028-03-01','full-day',rules));
});
