// A data-only SpreadsheetML export: no formulas, macros, links or workbook inputs.
// Package structure follows Microsoft Open XML's minimum workbook scenario:
// https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/structure-of-a-spreadsheetml-document
const { deflateRawSync } = require('node:zlib');
const checksums = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = checksums[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
function packageZip(parts) {
  const local = [], directory = []; let offset = 0;
  for (const [filename, xml] of Object.entries(parts)) {
    const name = Buffer.from(filename), data = Buffer.from(xml), compressed = deflateRawSync(data), crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(8, 8); header.writeUInt16LE(33, 12); header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
    local.push(header, name, compressed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x800, 8);
    entry.writeUInt16LE(8, 10); entry.writeUInt16LE(33, 14); entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(compressed.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(offset, 42);
    directory.push(entry, name); offset += header.length + name.length + compressed.length;
  }
  const central = Buffer.concat(directory), end = Buffer.alloc(22), count = Object.keys(parts).length;
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, central, end]);
}
function escapeXml(value) {
  const text = String(value);
  for (const character of text) {
    const code = character.codePointAt(0);
    if (![9, 10, 13].includes(code) && !(code >= 32 && code <= 0xd7ff) && !(code >= 0xe000 && code <= 0xfffd) && !(code >= 0x10000 && code <= 0x10ffff)) {
      throw Object.assign(Error('Recorded text contains characters unsupported by Excel. Use CSV or review the source text.'), { status: 422 });
    }
  }
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/\r/g,'&#13;');
}
function column(index) { let name = ''; for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name; return name; }
module.exports = function attendanceWorkbook(headers, rows) {
  const sheet = [headers, ...rows].map((row, index) => `<row r="${index + 1}">` + row.map((value, c) => {
    const address = column(c) + (index + 1), style = index === 0 ? ' s="1"' : '';
    if (value == null) return `<c r="${address}"/>`;
    if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${address}"${style}><v>${value}</v></c>`;
    // Explicit inline-string type keeps names such as =SUM(1,2) as literal text.
    return `<c r="${address}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  }).join('') + '</row>').join('');
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return packageZip({
    '[Content_Types].xml': xml + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': xml + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': xml + `<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets><sheet name="Recorded attendance" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': xml + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': xml + `<styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EFF7"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    'xl/worksheets/sheet1.xml': xml + `<worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>` + [12, 12, 32, 38, 24, 18, 18, 18, 18, 28, 28, 23].map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join('') + `</cols><sheetData>${sheet}</sheetData><autoFilter ref="A1:${column(headers.length - 1)}${rows.length + 1}"/></worksheet>`,
  });
};
