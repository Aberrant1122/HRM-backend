const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const path=require('node:path');
const jwt=require('jsonwebtoken');
const {Server}=require('socket.io');
const {load}=require('./helpers/controller');

test('real sockets authenticate, isolate rooms and reject revoked sessions before outbound delivery',{
  skip:!process.env.FRONTEND_CHECKOUT&&'Set FRONTEND_CHECKOUT for the Socket.IO client dependency',timeout:15000,
},async()=>{
  const {io:client}=require(path.join(process.env.FRONTEND_CHECKOUT,'node_modules/socket.io-client'));
  const accounts=new Map([1,2].map(id=>[id,{id,role:'employee',status:'active',sessionVersion:0}]));
  const secret='synthetic-realtime-signing-key';
  const auth=load('middleware/authMiddleware.js',{
    jsonwebtoken:jwt,'../config/jwtSecret':secret,'../models':{User:{findByPk:async id=>accounts.get(id)}},
  });
  const {configureRealtimeAccess,emitToUser}=load('utils/realtimeAccess.js',{'../middleware/authMiddleware':auth});
  const server=http.createServer(),io=new Server(server);configureRealtimeAccess(io);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}`,clients=[];
  const token=(id,version=0)=>jwt.sign({id,role:'employee',sessionVersion:version},secret);
  async function connect(authToken,accepted=true){
    const socket=client(url,{auth:{token:authToken},transports:['websocket'],reconnection:false,forceNew:true});clients.push(socket);
    await new Promise((resolve,reject)=>{
      socket.once('connect',()=>accepted?resolve():reject(Error('Unauthorized connection accepted')));
      socket.once('connect_error',error=>accepted?reject(error):resolve());
    });
    return socket;
  }
  try{
    await connect(undefined,false);await connect('malformed',false);
    const a=await connect(token(1)),b=await connect(token(2));
    const acknowledgement=await new Promise(resolve=>a.emit('join',2,resolve));assert.equal(acknowledgement.ok,false);
    assert.equal((await io.in('user_2').fetchSockets()).length,1);
    let wrongTargetMessages=0;a.on('notification',()=>wrongTargetMessages++);
    const received=new Promise(resolve=>b.once('notification',resolve));
    assert.equal(await emitToUser(io,2,'notification',{synthetic:'private'}),1);
    assert.equal((await received).synthetic,'private');assert.equal(wrongTargetMessages,0);
    let revokedMessages=0;b.on('notification',()=>revokedMessages++);
    const disconnected=new Promise(resolve=>b.once('disconnect',resolve));accounts.get(2).status='inactive';
    assert.equal(await emitToUser(io,2,'notification',{synthetic:'must not deliver'}),0);
    await disconnected;assert.equal(revokedMessages,0);
    accounts.get(2).status='active';accounts.get(2).sessionVersion=1;
    await connect(token(2),false);
    const fresh=await connect(token(2,1));
    accounts.get(2).role='manager';accounts.get(2).sessionVersion=2;
    const changedRoleDisconnect=new Promise(resolve=>fresh.once('disconnect',resolve));
    assert.equal(await emitToUser(io,2,'new_message',{synthetic:'must not deliver'}),0);await changedRoleDisconnect;
    accounts.get(2).role='employee';accounts.get(2).sessionVersion=3;
    await connect(token(2,1),false);await connect(token(2,3));
  }finally{
    clients.forEach(socket=>socket.close());await new Promise(resolve=>io.close(resolve));
    if(server.listening)await new Promise(resolve=>server.close(resolve));
  }
});
