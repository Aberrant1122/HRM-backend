module.exports = {
  async up(q,D) {
    await q.addColumn("offboarding_items","assetIdentifier",{type:D.STRING(100),allowNull:true});
    await q.addIndex("offboarding_items",["caseId","assetIdentifier"],{unique:true,name:"offboarding_case_asset_identifier"});
  },
  async down(q) {
    const [[row]]=await q.sequelize.query("SELECT COUNT(*) AS total FROM offboarding_items WHERE assetIdentifier IS NOT NULL");
    if(Number(row.total))throw Error("Retained asset identifiers exist. Roll forward.");
    const indexes=await q.showIndex("offboarding_items");
    if(!indexes.some(index=>index.fields.length===1&&index.fields[0].attribute==="caseId"))
      await q.addIndex("offboarding_items",["caseId"],{name:"offboarding_items_case_restore"});
    await q.removeIndex("offboarding_items","offboarding_case_asset_identifier");
    await q.removeColumn("offboarding_items","assetIdentifier");
  }
};
