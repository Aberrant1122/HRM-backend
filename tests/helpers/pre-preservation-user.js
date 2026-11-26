// Historical CLI fixtures exercise schemas frozen before migration71.
module.exports=(sequelize,DataTypes)=>{const model=require('../../models/user')(sequelize,DataTypes);model.removeAttribute('retainedEmployeeMembership');return model;};
