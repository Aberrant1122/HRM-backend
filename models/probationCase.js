module.exports=(sequelize,D)=>sequelize.define('ProbationCase',{
  employeeId:{type:D.INTEGER,allowNull:false,unique:true},createdBy:{type:D.INTEGER,allowNull:false},
  startDate:{type:D.DATEONLY,allowNull:false},endDate:{type:D.DATEONLY,allowNull:false},evaluationDate:{type:D.DATEONLY,allowNull:true},
  status:{type:D.STRING(20),allowNull:false,defaultValue:'active'},decisionDate:{type:D.DATEONLY,allowNull:true},version:{type:D.INTEGER,allowNull:false,defaultValue:1}
},{tableName:'probation_cases'});
