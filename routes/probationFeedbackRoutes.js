const router=require('express').Router(),{isAdmin}=require('../middleware/authMiddleware'),c=require('../controllers/probationFeedbackController')(require('../models'));
router.use((req,res,next)=>{res.setHeader('Cache-Control','private, no-store');next();});
router.get('/assigned',c.mine);router.get('/assigned/:caseId',c.read);router.post('/assigned/:caseId/feedback',c.feedback);
router.use(isAdmin);router.get('/accounts',c.accounts);router.get('/case/:caseId',c.assignmentRead);router.post('/case/:caseId/assignments',c.assign);
module.exports=router;
