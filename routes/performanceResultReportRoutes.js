const router=require('express').Router(),c=require('../controllers/performanceResultReportController')(require('../models'));
router.use((req,res,next)=>{res.setHeader('Cache-Control','private, no-store');next();});
router.use(require('../middleware/authMiddleware').isAdmin);
router.get('/',c.list);router.get('/:evaluationId',c.detail);
module.exports=router;
