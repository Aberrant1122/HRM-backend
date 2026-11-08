const router=require('express').Router(),{isAdmin}=require('../middleware/authMiddleware'),models=require('../models'),c=require('../controllers/hrTaskController')(models),p=require('../controllers/hrTaskParticipation')(models);
router.use((req,res,next)=>{res.setHeader('Cache-Control','private, no-store');next();});
router.get('/access',p.access);router.get('/mine',p.mineList);router.get('/mine/:taskId',p.mineRead);router.post('/mine/commands',p.submit);
router.get('/review',p.reviewList);router.get('/review/:taskId',p.reviewRead);router.post('/review/commands',p.approve);
router.use(isAdmin);router.get('/approval-permissions/:userId',p.permissionRead);router.post('/approval-permissions/commands',p.permissionCommand);
router.get('/',c.list);router.get('/:taskId',c.read);router.post('/commands',c.command);module.exports=router;
