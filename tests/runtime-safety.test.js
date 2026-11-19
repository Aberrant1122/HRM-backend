const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/controller');

test('staging defaults disable automatic jobs/schema repair and capture mail without network delivery', async () => {
  const config = load('config/runtimeSafety.js', {}, { APP_ENV:'staging' });
  assert.equal(config.backgroundJobsEnabled,false);
  assert.equal(config.startupSchemaRepairEnabled,false);
  const transport = require('nodemailer').createTransport(config.mailOptions());
  const result = await transport.sendMail({to:'synthetic@example.invalid',subject:'Synthetic',text:'No external mail'});
  assert.equal(JSON.parse(result.message).to[0].address,'synthetic@example.invalid');
});

test('staging rejects external SMTP/provider modes and provider credentials', () => {
  for (const env of [
    {MAIL_MODE:'gmail'},
    {MAIL_MODE:'smtp-sink',SMTP_HOST:'smtp.gmail.com'},
    {MAIL_MODE:'smtp-sink',SMTP_HOST:'mailpit.railway.internal',EMAIL_PASS:'synthetic-provider-secret'},
  ]) assert.throws(()=>load('config/runtimeSafety.js',{}, {APP_ENV:'staging',...env}).mailOptions());
  const config=load('config/runtimeSafety.js',{}, {APP_ENV:'staging',MAIL_MODE:'smtp-sink',SMTP_HOST:'127.0.0.1'});
  assert.equal(config.mailOptions().host,'127.0.0.1');assert.equal(config.mailOptions().auth,undefined);
});

test('existing non-staging defaults remain; explicit job/schema flags are strictly parsed', () => {
  const config=load('config/runtimeSafety.js',{});
  assert.equal(config.backgroundJobsEnabled,true);assert.equal(config.startupSchemaRepairEnabled,true);
  assert.equal(config.mailOptions().service,'gmail');
  assert.throws(()=>load('config/runtimeSafety.js',{}, {BACKGROUND_JOBS_ENABLED:'yes'}));
});
