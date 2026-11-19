const router=require('express').Router(),{isAdmin}=require('../middleware/authMiddleware'),c=require('../controllers/designationController')(require('../models'));
router.use(isAdmin);router.use((req,res,next)=>{res.setHeader('Cache-Control','private, no-store');next();});router.get('/',c.list);router.get('/:designationId',c.read);router.post('/commands',c.command);module.exports=router;
