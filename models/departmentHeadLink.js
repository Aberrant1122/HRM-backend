module.exports=(s,D)=>s.define('DepartmentHeadLink',{departmentId:{type:D.INTEGER,allowNull:false},headId:{type:D.INTEGER,allowNull:false}},{tableName:'department_head_links',timestamps:false});
