const {test}=require('node:test'),assert=require('node:assert/strict'),due=require('../utils/attendanceClockDue');
const date='2036-02-02',run={payload:{from:date,through:date,voided:false,rules:{attendanceRequired:true},overrides:[],alerts:{enabled:true,recipientIds:[1],checkInGraceMinutes:5,checkOutGraceMinutes:10,skipManualOverrides:true,skipApprovedLeave:true}}};
const sources={assignments:[{id:1,version:1,assignment:{from:'2000-01-01',through:null,voided:false,shift:{id:1,version:1,definition:{start:'09:00',end:'17:00',endsNextDay:false}},calendar:{id:2,version:1,definition:{timeZone:'UTC',weekdays:[0,1,2,3,4,5,6],exceptions:[]}}}}],attendance:[],leaves:[]};
test('clock notices become due only at configured boundary and resolved punches withdraw them',()=>{
 assert.deepEqual(due(run,sources,date+'T09:04:59Z'),[]);assert.equal(due(run,sources,date+'T09:05:00Z')[0].kind,'missed-in');
 const open={...sources,attendance:[{date,status:'present',clockInRaw:date+' 09:00:00',clockOutRaw:null}]};
 assert.deepEqual(due(run,open,date+'T17:09:59Z'),[]);assert.equal(due(run,open,date+'T17:10:00Z')[0].kind,'missed-out');assert.deepEqual(due(run,{...open,attendance:[{...open.attendance[0],clockOutRaw:date+' 17:00:00'}]},date+'T18:00:00Z'),[]);
});
test('withdrawn configuration, nonworking dates, manual choices and conflicting facts suppress notices without writes',()=>{
 const before=JSON.stringify({run,sources});const at=date+'T23:00:00Z';
 assert.deepEqual(due({payload:{...run.payload,voided:true}},sources,at),[]);
 assert.deepEqual(due({payload:{...run.payload,rules:{attendanceRequired:false}}},sources,at),[]);
 assert.deepEqual(due({payload:{...run.payload,overrides:[{date,reason:'Explicit manual review'}]}},sources,at),[]);
 assert.deepEqual(due(run,{...sources,attendance:[{date,status:'present'},{date,status:'present'}]},at),[]);
 assert.deepEqual(due(run,{...sources,attendance:[{date,status:'absent'}]},at),[]);
 assert.equal(JSON.stringify({run,sources}),before);
});
