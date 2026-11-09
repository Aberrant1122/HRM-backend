const router=require('express').Router(),c=require('../controllers/employmentRecordController')(require('../models'));
router.use((req,res,next)=>{res.setHeader('Cache-Control','private, no-store');next();});
router.get('/access',c.access);router.get('/options',c.options);router.get('/summary',c.summary);
router.get('/permissions/:userId/:employeeId',c.grantRead);router.post('/permissions/commands',c.grantCommand);
router.get('/employee/:employeeId',c.employeeRead);router.get('/period/:periodId',c.periodRead);router.post('/commands',c.command);
module.exports=router;
