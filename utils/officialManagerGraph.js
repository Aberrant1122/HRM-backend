// Validate the proposed explicit graph independently of legacy primary references.
module.exports=function validateOfficialManagerGraph(rows,employeeId,managerIds){
 const graph=new Map(rows.map(row=>[Number(row.employeeId),row.managerIds]));
 graph.set(employeeId,managerIds);
 const done=new Set(),visiting=new Set();
 // Iterative DFS avoids stack exhaustion for long reporting chains.
 const stack=[{id:employeeId,exit:false}];let visited=0;
 while(stack.length){const {id,exit}=stack.pop();if(exit){visiting.delete(id);done.add(id);continue;}
  if(visiting.has(id))throw Object.assign(Error('Official reporting relationships would create a cycle'),{code:409});
  if(done.has(id))continue;if(++visited>10000)throw Object.assign(Error('Reporting graph exceeds the supported review limit'),{code:409});
  visiting.add(id);stack.push({id,exit:true});const parents=graph.get(id)||[];
  if(!Array.isArray(parents)||parents.some(n=>!Number.isSafeInteger(n)||n<=0))throw Object.assign(Error('Recorded reporting graph requires review'),{code:503});
  for(const parent of parents)stack.push({id:parent,exit:false});
 }
};
