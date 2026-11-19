const router=require('express').Router(),{isAdmin}=require('../middleware/authMiddleware'),c=require('../controllers/probationController');
router.use(isAdmin);router.use((req,res,next)=>{res.setHeader('Cache-Control','private, no-store');next();});
router.get('/',c.list);router.get('/sources',c.sources);router.get('/employee/:employeeId',c.read);router.post('/employee/:employeeId/commands',c.command);
module.exports=router;
