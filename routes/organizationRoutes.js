const router=require('express').Router(),{isAdmin}=require('../middleware/authMiddleware'),c=require('../controllers/organizationController');
router.use(isAdmin);router.use((req,res,next)=>{res.setHeader('Cache-Control','private, no-store');next();});
router.get('/',c.directory);router.get('/options',c.options);router.get('/employee/:employeeId',c.read);router.post('/employee/:employeeId/commands',c.command);module.exports=router;
