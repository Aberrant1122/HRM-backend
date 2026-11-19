const router=require('express').Router(),{isAdmin}=require('../middleware/authMiddleware'),c=require('../controllers/employeeRecommendationController')(require('../models'));
router.use((req,res,next)=>{res.setHeader('Cache-Control','private, no-store');next();});router.use(isAdmin);
router.get('/employee/:employeeId',c.list);router.post('/employee/:employeeId/commands',c.command);router.get('/recommendation/:recommendationId',c.read);module.exports=router;
