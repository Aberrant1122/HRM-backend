const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {inspect,storedInfo}=require('../utils/employeeDocumentFile');
const fixtures=path.resolve(__dirname,'../../document-format-fixtures');
const file=(name,as=name)=>({originalname:as,mimetype:'application/x-untrusted',buffer:fs.readFileSync(path.join(fixtures,name))});
test('bounded type inspection accepts real Office and generated image fixtures without trusting MIME',()=>{
 for(const ext of ['doc','docx','xls','xlsx','png','jpg','gif','webp','bmp','tiff'])assert.equal(inspect(file('sample.'+ext)).extension,ext);
 assert.equal(inspect(file('sample.jpg','PHOTO.JPEG')).format,'jpeg');
 assert.equal(inspect(file('sample.tiff','scan.tif')).format,'tiff');
 assert.equal(inspect(file('encrypted-sample.docx')).encryptedOffice,true);
 const pdf={originalname:'legacy.pdf',buffer:Buffer.from('%PDF-1.4\nSynthetic test\n%%EOF\n')};assert.equal(inspect(pdf).format,'pdf');
 assert.deepEqual(storedInfo({filename:'legacy.pdf',size:pdf.buffer.length,sha256:'a'.repeat(64)}),{extension:'pdf',format:'pdf',contentType:'application/pdf'});
});
test('mismatched, truncated, unsupported and inconsistent retained metadata are rejected',()=>{
 for(const [from,to] of [['doc','xls'],['xls','doc'],['docx','xlsx'],['xlsx','docx'],['png','jpg'],['jpg','pdf'],['docx','exe'],['png','svg']])assert.throws(()=>inspect(file('sample.'+from,'wrong.'+to)),e=>e.code===400);
 for(const ext of ['doc','docx','xls','xlsx','png','jpg','gif','webp','bmp','tiff']){const f=file('sample.'+ext);f.buffer=f.buffer.subarray(0,Math.min(20,f.buffer.length-1));assert.throws(()=>inspect(f),e=>e.code===400);}
 assert.throws(()=>inspect({originalname:'large.pdf',buffer:Buffer.alloc(20*1024*1024+1)}),e=>e.code===400);
 for(const metadata of [{filename:'old.docx'},{filename:'a.pdf',extension:'docx'},{filename:'a.pdf',format:'doc'},{filename:'a.pdf',contentType:'text/html'},{filename:'../a.pdf'},{filename:'a.pdf',encryptedOffice:true}])assert.throws(()=>storedInfo(metadata),e=>e.code===409);
 const cyclic=file('sample.doc');const first=cyclic.buffer.readUInt32LE(48),fat=cyclic.buffer.readUInt32LE(76);cyclic.buffer.writeUInt32LE(first,(fat+1)*512+first*4);assert.throws(()=>inspect(cyclic),e=>e.code===400);
});
