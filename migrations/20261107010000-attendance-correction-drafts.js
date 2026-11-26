module.exports = {
  async up(q, S) {
    const columns=await q.describeTable('attendances');
    if(!/^DATETIME$/i.test(columns.clockIn.type))throw Error('Review unexpected clockIn type');
    const [[status]]=await q.sequelize.query("SELECT COLUMN_TYPE AS definition FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='attendances' AND COLUMN_NAME='status'");
    if(!/^enum\(/i.test(status.definition))throw Error('Review unexpected attendance status type');
    const values=[...status.definition.matchAll(/'((?:[^']|'')*)'/g)].map(match=>match[1].replace(/''/g,"'"));
    if(!values.length||values.some(value=>!['present','absent','leave','half-day','on-leave'].includes(value)))throw Error('Review custom attendance status labels before migration');
    if(!columns.clockIn.allowNull&&columns.clockIn.defaultValue!=null)throw Error('Review unexpected clockIn default before migration');
    if(!columns.clockIn.allowNull)await q.changeColumn('attendances','clockIn',{type:S.DATE,allowNull:true});
    if(!values.includes('on-leave'))await q.changeColumn('attendances','status',{type:S.ENUM(...values,'on-leave'),allowNull:columns.status.allowNull,defaultValue:columns.status.defaultValue});
    const reference = table => ({ type: S.INTEGER, allowNull: false, references: { model: table, key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT' });
    await q.createTable('attendance_corrections', {
      id: { type: S.INTEGER, autoIncrement: true, primaryKey: true },
      employeeId: reference('users'), attendanceId: { ...reference('attendances'), allowNull: true },
      workDate: { type: S.DATEONLY, allowNull: false },
      state: { type: S.STRING(16), allowNull: false }, version: { type: S.INTEGER, allowNull: false },
      baseline: { type: S.JSON, allowNull: false }, proposed: { type: S.JSON, allowNull: false },
      appliedRecord: {type:S.JSON,allowNull:true},
      createdBy: reference('users'), createdAt: { type: S.DATE, allowNull: false }, updatedAt: { type: S.DATE, allowNull: false },
    });
    await q.addIndex('attendance_corrections', ['employeeId', 'workDate']);
    await q.createTable('attendance_correction_events', {
      id: { type: S.INTEGER, autoIncrement: true, primaryKey: true }, correctionId: reference('attendance_corrections'),
      actorId: reference('users'), version: { type: S.INTEGER, allowNull: false }, action: { type: S.STRING(16), allowNull: false },
      reason: { type: S.STRING(2000), allowNull: false }, before: { type: S.JSON, allowNull: true }, after: { type: S.JSON, allowNull: false }, createdAt: { type: S.DATE, allowNull: false },
    });
    await q.addIndex('attendance_correction_events', ['correctionId', 'version'], { unique: true });
    await q.createTable('attendance_correction_grants',{
      userId:{...reference('users'),primaryKey:true},active:{type:S.BOOLEAN,allowNull:false},version:{type:S.INTEGER,allowNull:false},
      grantedBy:reference('users'),updatedAt:{type:S.DATE,allowNull:false},
    });
    await q.createTable('attendance_correction_grant_events',{
      id:{type:S.INTEGER,primaryKey:true,autoIncrement:true},userId:reference('users'),actorId:reference('users'),
      version:{type:S.INTEGER,allowNull:false},active:{type:S.BOOLEAN,allowNull:false},reason:{type:S.STRING(500),allowNull:false},createdAt:{type:S.DATE,allowNull:false},
    });
    await q.addIndex('attendance_correction_grant_events',['userId','version'],{unique:true});
  },
  async down(q) {
    for(const table of ['attendance_corrections','attendance_correction_grant_events','attendance_correction_grants']){
      const [[row]]=await q.sequelize.query('SELECT COUNT(*) AS n FROM `'+table+'`');if(Number(row.n))throw Error('Correction/permission history must be retained');
    }
    // Nullable clock-in and additive stored status labels never contract on down.
    await q.dropTable('attendance_correction_grant_events');await q.dropTable('attendance_correction_grants');
    await q.dropTable('attendance_correction_events'); await q.dropTable('attendance_corrections');
  },
};
