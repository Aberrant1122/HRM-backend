const {civil}=require('./leaveCharging'),cache=new Map();
const clock=/^([01]\d|2[0-3]):[0-5]\d$/;
function instant(date,time,zone){
 if(!civil(date)||!clock.test(time))return{state:'invalid',instant:null};const key=[date,time,zone].join('|');if(cache.has(key))return cache.get(key);
 let format;try{format=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});}catch{return{state:'invalid',instant:null};}
 const base=Date.parse(date+'T'+time+':00Z'),matches=[];
 // Do not guess at DST folds/gaps. Unsupported historical sub-quarter-hour offsets also require review.
 for(let offset=-14*60;offset<=14*60;offset+=15){const candidate=base-offset*60000,parts=Object.fromEntries(format.formatToParts(candidate).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));if(parts.year.padStart(4,'0')+'-'+parts.month+'-'+parts.day===date&&parts.hour+':'+parts.minute===time&&parts.second==='00')matches.push(candidate);}
 const out={state:matches.length===1?'unique':matches.length>1?'ambiguous':'nonexistent-or-unsupported',instant:matches.length===1?matches[0]:null};if(cache.size>5000)cache.clear();cache.set(key,out);return out;
}
function storedUtc(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}[ T]([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z?$/.test(value)||!civil(value.slice(0,10)))return null;const n=Date.parse(value.replace(' ','T').replace(/Z?$/,'Z'));return Number.isFinite(n)?n:null;}
module.exports={instant,storedUtc};
