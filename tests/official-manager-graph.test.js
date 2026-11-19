const test=require('node:test'),assert=require('node:assert/strict');
const validate=require('../utils/officialManagerGraph');
test('multiple managers may share an ancestor without forming a cycle',()=>{
 assert.doesNotThrow(()=>validate([{employeeId:2,managerIds:[4]},{employeeId:3,managerIds:[4]}],1,[2,3]));
});
test('a cycle through either official manager is rejected',()=>{
 assert.throws(()=>validate([{employeeId:2,managerIds:[4]},{employeeId:3,managerIds:[5]},{employeeId:5,managerIds:[1]}],1,[2,3]),e=>e.code===409);
});
test('replacing a set can remove the old cyclic edge',()=>{
 assert.doesNotThrow(()=>validate([{employeeId:1,managerIds:[2]},{employeeId:2,managerIds:[1]}],1,[]));
});
test('an unrelated existing cycle does not block an independent correction',()=>{
 assert.doesNotThrow(()=>validate([{employeeId:8,managerIds:[9]},{employeeId:9,managerIds:[8]}],1,[2]));
});
test('a long chain is checked without recursive stack overflow',()=>{
 const rows=Array.from({length:5000},(_,i)=>({employeeId:i+2,managerIds:i===4999?[]:[i+3]}));
 assert.doesNotThrow(()=>validate(rows,1,[2]));rows[4999].managerIds=[1];
 assert.throws(()=>validate(rows,1,[2]),e=>e.code===409);
});
test('malformed retained relationships fail closed',()=>{
 assert.throws(()=>validate([{employeeId:2,managerIds:'[3]'}],1,[2]),e=>e.code===503);
});
