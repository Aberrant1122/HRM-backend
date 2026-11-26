const router=require('express').Router(),{isAdmin}=require('../middleware/authMiddleware'),c=require('../controllers/leaveCategoryDraftController')(require('../models'));
router.use((req,res,next)=>{res.setHeader('Cache-Control','private, no-store');next();});router.use(isAdmin);router.get('/',c.list);router.get('/:categoryId',c.read);router.post('/commands',c.command);module.exports=router;
