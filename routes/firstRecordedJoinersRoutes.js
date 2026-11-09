const router=require('express').Router();
router.use((req,res,next)=>{res.setHeader('Cache-Control','private, no-store');next();});
router.use(require('../middleware/authMiddleware').isAdmin);
router.get('/',require('../controllers/firstRecordedJoinersController')(require('../models')));
module.exports=router;
