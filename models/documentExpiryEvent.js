module.exports=(s,D)=>s.define("DocumentExpiryEvent",{
  commandKey:{type:D.UUID,primaryKey:true},revisionId:{type:D.INTEGER,allowNull:false},version:{type:D.INTEGER,allowNull:false},
  actorId:{type:D.INTEGER,allowNull:false},reason:{type:D.STRING(600),allowNull:false},expiryDate:D.DATEONLY,reminderDate:D.DATEONLY
},{tableName:"document_expiry_events"});
