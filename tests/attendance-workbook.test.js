const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const workbook=require('../utils/attendanceWorkbook');
test('native attendance workbook independently parses with literal strings, raw numbers and valid ZIP CRCs',t=>{
  if(!process.env.HRM_PYTHON)return t.skip('Independent bundled Python/openpyxl path required for workbook acceptance');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hrm-xlsx-acceptance-')),file=path.join(directory,'records.xlsx');
  try{
    const buffer=workbook(['Name','Recorded date','Recorded hours'],[['=SUM(1,2)','2026-01-01',1.999],['<&emoji😀\r\n',null,0]]);fs.writeFileSync(file,buffer);
    const script="import sys,zipfile,openpyxl; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; w=openpyxl.load_workbook(sys.argv[1]); s=w.active; assert s['A2'].value=='=SUM(1,2)' and s['A2'].data_type=='s'; assert s['C2'].value==1.999 and s['C3'].value==0; assert s['A3'].value=='<&emoji😀\\r\\n'; assert s.freeze_panes=='A2'; assert s.auto_filter.ref=='A1:C3'; assert not any(c.data_type=='f' for row in s for c in row); print('Independent XLSX parse/CRC/raw values/literal formula/Unicode/freeze/filter pass')";
    assert.match(execFileSync(process.env.HRM_PYTHON,['-c',script,file],{encoding:'utf8'}),/pass/);
    assert.throws(()=>workbook(['Name'],[['bad\u0000text']]),{status:422});
  }finally{fs.unlinkSync(file);fs.rmdirSync(directory);}
});
