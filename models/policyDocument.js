module.exports=(s,D)=>s.define('PolicyDocument',{kind:{type:D.STRING(20),allowNull:false},version:{type:D.INTEGER,allowNull:false}},{tableName:'policy_documents'});
