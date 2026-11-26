'use strict';
module.exports=function productionMailOptions(env=process.env){
  if(env.MAIL_TRANSPORT==='gmail-api')return require('../utils/gmailApiTransport').createGmailApiTransport({clientId:env.GMAIL_CLIENT_ID,clientSecret:env.GMAIL_CLIENT_SECRET,refreshToken:env.GMAIL_REFRESH_TOKEN,sender:env.EMAIL_USER});
  if(env.MAIL_TRANSPORT&&env.MAIL_TRANSPORT!=='smtp')throw new Error('Unsupported production mail transport');
  return {service:env.EMAIL_SERVICE||'gmail',auth:{user:env.EMAIL_USER||'',pass:env.EMAIL_PASS||''}};
};
