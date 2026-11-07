'use strict';
module.exports={async up(q,S){await q.addColumn('leave_policies','rules',{type:S.JSON,allowNull:true});},async down(q){const [[r]]=await q.sequelize.query('SELECT COUNT(*) total FROM leave_policies WHERE rules IS NOT NULL');if(Number(r.total))throw Error('Refusing to remove configured leave-year rules; roll forward');await q.removeColumn('leave_policies','rules');}};
