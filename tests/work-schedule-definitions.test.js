const {test}=require('node:test'),assert=require('node:assert/strict'),normalize=require('../utils/workScheduleDefinition');
test('explicit schedule labels and dated exception validation without default weekdays or pay decisions',()=>{
 const shift={name:' Overnight ',timeZone:'Asia/Karachi',archived:false,start:'22:00',end:'06:00',endsNextDay:true};assert.equal(normalize('shift',shift).name,'Overnight');assert.equal(normalize('shift',{...shift,start:'00:00',end:'00:00'}).endsNextDay,true);
 const calendar={name:'Explicit calendar',timeZone:'UTC',archived:false,weekdays:[5,1,3],exceptions:[{date:'2032-02-29',working:false,label:'Leap exception'}]};assert.deepEqual(normalize('calendar',calendar).weekdays,[1,3,5]);assert.deepEqual(normalize('calendar',{...calendar,weekdays:[]}).weekdays,[]);
 for(const value of [{...shift,endsNextDay:false},{...shift,start:'24:00'},{...shift,start:'06:00',end:'22:00'},{...shift,timeZone:'Unknown/Nowhere'},{...shift,paid:true}])assert.throws(()=>normalize('shift',value),e=>e.status===400);
 for(const value of [{...calendar,weekdays:[1,1]},{...calendar,weekdays:[7]},{...calendar,exceptions:[{date:'2031-02-29',working:false,label:'Bad date'}]},{...calendar,exceptions:[calendar.exceptions[0],calendar.exceptions[0]]}])assert.throws(()=>normalize('calendar',value),e=>e.status===400);
});
