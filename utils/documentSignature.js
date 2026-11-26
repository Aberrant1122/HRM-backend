const crypto=require('crypto');
function publicKey(value){
 if(!value||Object.keys(value).some(k=>!['kty','crv','x','y'].includes(k))||value.kty!=='EC'||value.crv!=='P-256'||!['x','y'].every(k=>typeof value[k]==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value[k])))throw Error('A public P-256 key without private fields is required');
 const jwk={crv:value.crv,kty:value.kty,x:value.x,y:value.y};
 const key=crypto.createPublicKey({key:jwk,format:'jwk'});
 if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails.namedCurve!=='prime256v1')throw Error('P-256 key required');
 return {jwk,fingerprint:crypto.createHash('sha256').update(JSON.stringify(jwk)).digest('hex')};
}
function payload(revision,key,signerId){return JSON.stringify({version:1,purpose:'HRM document revision signature',revisionId:revision.id,documentId:revision.documentId,fileSha256:revision.attachment.sha256,fileSize:revision.attachment.size,keyId:key.id,keyFingerprint:key.fingerprint,trustEventId:key.trustEventId,signerId});}
function valid(publicJwk,body,signature){
 if(typeof signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(signature))return false;
 try{return crypto.verify('sha256',Buffer.from(body),{key:crypto.createPublicKey({key:publicJwk,format:'jwk'}),dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64'));}catch{return false;}
}
module.exports={publicKey,payload,valid};
