'use strict';
function createGmailApiTransport(options){
  const {clientId,clientSecret,refreshToken,sender,fetchImpl=globalThis.fetch,timeoutMs=15000,maxMessageBytes=20*1024*1024}=options;
  if(!clientId||!clientSecret||!refreshToken||!sender||typeof fetchImpl!=='function')throw new Error('Gmail HTTPS configuration is incomplete');
  let cached=null,pending=null;
  function failure(code){const error=new Error('Gmail HTTPS delivery failed');error.code=code;return error;}
  async function request(url,init){try{return await fetchImpl(url,{...init,redirect:'error',signal:AbortSignal.timeout(timeoutMs)});}catch{throw failure('EMAIL_NETWORK');}}
  async function token(){
    if(cached&&cached.expires>Date.now()+60000)return cached.value;
    if(pending)return pending;
    pending=(async()=>{const response=await request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'}).toString()});
      if(!response.ok)throw failure('EMAIL_AUTH');
      let data;try{data=await response.json();}catch{throw failure('EMAIL_AUTH');}
      if(typeof data.access_token!=='string'||!data.access_token||!Number.isFinite(Number(data.expires_in))||Number(data.expires_in)<120)throw failure('EMAIL_AUTH');
      const identity=await request('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+data.access_token}});
      if(!identity.ok)throw failure('EMAIL_IDENTITY');
      let profile;try{profile=await identity.json();}catch{throw failure('EMAIL_IDENTITY');}
      if(profile.email_verified!==true||String(profile.email||'').toLowerCase()!==sender.toLowerCase())throw failure('EMAIL_IDENTITY');
      cached={value:data.access_token,expires:Date.now()+Math.min(Number(data.expires_in),86400)*1000};return cached.value;
    })();try{return await pending;}finally{pending=null;}
  }
  return {name:'gmail-https',version:'1.0.0',
    verify(callback){const result=token().then(()=>true);if(typeof callback==='function'){result.then(value=>callback(null,value),callback);return;}return result;},
    send(mail,callback){(async()=>{
      // Fill only missing From for existing invitation/welcome callers before MIME serialization.
      if(mail.data.from===undefined&&!mail.message.getHeader('From'))mail.message.setHeader('From',sender);
      if(String(mail.message.getEnvelope().from||'').toLowerCase()!==sender.toLowerCase())throw failure('EMAIL_SENDER');
      const access=await token();mail.message.keepBcc=true;
      const stream=mail.message.createReadStream(),chunks=[];let bytes=0;
      for await(const chunk of stream){const buffer=Buffer.from(chunk);bytes+=buffer.length;if(bytes>maxMessageBytes){stream.destroy();throw failure('EMAIL_TOO_LARGE');}chunks.push(buffer);}
      const response=await request('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify({raw:Buffer.concat(chunks).toString('base64url')})});
      if(!response.ok){if(response.status===401)cached=null;throw failure('EMAIL_DELIVERY');}
      let data;try{data=await response.json();}catch{throw failure('EMAIL_DELIVERY');}
      if(typeof data.id!=='string'||!data.id)throw failure('EMAIL_DELIVERY');
      const envelope=mail.message.getEnvelope();return {messageId:mail.message.messageId(),envelope,accepted:envelope.to,rejected:[],response:'Gmail HTTPS accepted'};
    })().then(info=>callback(null,info),callback);}
  };
}
module.exports={createGmailApiTransport};
