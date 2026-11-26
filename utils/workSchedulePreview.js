const {civil}=require('./leaveCharging');
module.exports=(rows,date)=>{
 if(!civil(date))throw Object.assign(Error('Explicit civil date required'),{status:400});
 const covering=rows.filter(row=>!row.assignment.voided&&row.assignment.from<=date&&(row.assignment.through===null||row.assignment.through>=date));
 if(covering.length>1)throw Object.assign(Error('Overlapping retained schedule assignments require reconciliation'),{status:409});
 if(!covering.length)return{date,state:'unassigned',basis:'No nonvoid recorded schedule assignment covers this date. This is not an attendance or employment decision.'};
 const row=covering[0],{shift,calendar}=row.assignment,exception=calendar.definition.exceptions.find(e=>e.date===date),working=exception?exception.working:calendar.definition.weekdays.includes(new Date(date+'T12:00:00Z').getUTCDay());
 return{date,state:working?'configured-working':'configured-nonworking',assignmentId:row.id,assignmentVersion:row.version,timeZone:calendar.definition.timeZone,calendar,shift,exception:exception||null,basis:exception?'Pinned calendar dated exception':'Pinned calendar working weekdays',limitations:'Configured local date and clock labels only. No eligibility, punches, lateness, absence, paid leave, elapsed/DST hours, overtime or payroll is calculated.'};
};
