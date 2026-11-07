const router=require('express').Router(),{isAdmin}=require('../middleware/authMiddleware'),c=require('../controllers/performanceController')(require('../models'));
router.use((req,res,next)=>{res.setHeader('Cache-Control','private, no-store');next();});
router.get('/reviewer',c.reviewerList);
router.get('/reviewer/evaluation/:evaluationId',c.reviewerRead);
router.post('/reviewer/evaluation/:evaluationId/feedback',c.reviewerFeedback);
router.use(isAdmin);router.get('/forms',c.forms);router.post('/forms',c.createForm);router.get('/employee/:employeeId',c.list);router.post('/employee/:employeeId/commands',c.command);router.get('/evaluation/:evaluationId',c.read);module.exports=router;
