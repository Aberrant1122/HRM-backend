function today(now,timeZone){return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
function dueDate(endDate,leadDays){const date=new Date(endDate+'T00:00:00.000Z');date.setUTCDate(date.getUTCDate()-leadDays);return date.toISOString().slice(0,10);}
function validZone(value){try{return typeof value==='string'&&value.length<=100&&!!new Intl.DateTimeFormat('en-CA',{timeZone:value}).resolvedOptions().timeZone;}catch{return false;}}
module.exports={today,dueDate,validZone};
