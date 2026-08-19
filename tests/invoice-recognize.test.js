const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function item(text, x, y, w = 40) {
  return { text, x, y, w, h: 12 };
}

test('homepage exposes a direct invoice recognition entry', () => {
  assert.match(html, /onclick="showTool\('invoice'\)"/);
  assert.match(html, /发票通用识别/);
  assert.match(html, /id="invoiceRecognizeOptionsCard"/);
  assert.match(html, /onclick="invoiceRecognizeStart\(\)"/);
  assert.match(html, /id="batchRecognizeInput"[^>]*multiple/);
  assert.match(html, /连续粘贴/);
});

test('invoice upload appends files from successive selections or pastes', () => {
  const start = html.indexOf('function batchRecognizeFileKey(');
  const end = html.indexOf('\nfunction batchRecognizeHandleFiles(', start);
  assert.ok(start >= 0 && end > start, 'invoice upload merge helper should exist');

  const context = {};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.fn=batchRecognizeMergeFiles;`, context);

  const first = { name: '甲.pdf', size: 10, lastModified: 1 };
  const second = { name: '乙.pdf', size: 20, lastModified: 2 };
  const third = { name: '丙.pdf', size: 30, lastModified: 3 };
  const merged = context.fn([first], [second, first, third]);

  assert.deepEqual(Array.from(merged).map(file => file.name), ['甲.pdf', '乙.pdf', '丙.pdf']);
});

test('invoice parser extracts common fields from a PDF text layer', () => {
  const start = html.indexOf('var INVOICE_RECOGNIZE_COLUMNS=');
  const end = html.indexOf('\nasync function invoiceRecognizeRecognizeFile(', start);
  assert.ok(start >= 0 && end > start, 'invoice parser helpers should exist');

  const context = {};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.fn=invoiceRecognizeExtractFields;`, context);

  const fields = context.fn([
    item('电子发票（普通发票）', 180, 20, 160),
    item('发票号码：', 410, 35), item('26512000002725525366', 465, 35, 145),
    item('开票日期：', 410, 48), item('2026年06月29日', 465, 48, 90),
    item('名称：', 20, 100), item('成都杏林大药房有限责任公司锦江区二环路东五段药店', 58, 100, 210),
    item('名称：', 300, 100), item('四川爱达乐锦成食品有限公司', 338, 100, 125),
    item('统一社会信用代码/纳税人识别号：', 20, 120, 180), item('91510104MAC1A57G3B', 205, 120, 120),
    item('统一社会信用代码/纳税人识别号：', 300, 120, 180), item('91510114MA7NHHFA7J', 485, 120, 120),
    item('项目名称', 20, 150), item('规格型号', 80, 150), item('单', 135, 150, 10), item('位', 147, 150, 10),
    item('数量', 185, 150), item('单价', 235, 150), item('金额', 285, 150), item('税率/征收率', 345, 150, 70), item('税额', 430, 150),
    item('*方便食品*粽子礼盒', 10, 165, 100), item('份', 140, 165, 12), item('2', 190, 165, 8),
    item('88.4955752212389', 225, 165, 90), item('176.99', 285, 165, 45), item('13%', 350, 165, 22), item('23.01', 430, 165, 45),
    item('价税合计（小写）', 100, 280, 100), item('¥200.00', 330, 280, 48),
    item('开票人：', 20, 320), item('周艳', 62, 320, 25)
  ]);

  assert.equal(fields.invoiceType, '普票');
  assert.equal(fields.invoiceNumber, '26512000002725525366');
  assert.equal(fields.invoiceDate, '2026年06月29日');
  assert.equal(fields.buyerName, '成都杏林大药房有限责任公司锦江区二环路东五段药店');
  assert.equal(fields.sellerName, '四川爱达乐锦成食品有限公司');
  assert.equal(fields.buyerTaxId, '91510104MAC1A57G3B');
  assert.equal(fields.sellerTaxId, '91510114MA7NHHFA7J');
  assert.equal(fields.projectName, '*方便食品*粽子礼盒');
  assert.equal(fields.unit, '份');
  assert.equal(fields.quantity, '2');
  assert.equal(fields.amount, '176.99');
  assert.equal(fields.taxRate, '13%');
  assert.equal(fields.tax, '23.01');
  assert.equal(fields.total, '200.00');
  assert.equal(fields.issuer, '周艳');
});

test('invoice parser ignores summary and remarks rows when reading fixed invoice columns', () => {
  const start = html.indexOf('var INVOICE_RECOGNIZE_COLUMNS=');
  const end = html.indexOf('\nasync function invoiceRecognizeRecognizeFile(', start);
  assert.ok(start >= 0 && end > start, 'invoice parser helpers should exist');

  const context = {};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.fn=invoiceRecognizeExtractFields;`, context);

  const fields = context.fn([
    item('电子发票（普通发票）', 194.5, 42, 200),
    item('发票号码：', 440.5, 43), item('26512000002725525366', 486.5, 42.5, 145),
    item('开票日期：', 440.5, 60), item('2026年06月29日', 486.5, 59.5, 90),
    item('名称：', 34.5, 110.4), item('成都杏林大药房有限责任公司锦江区二环路东五段药店', 59.5, 108.5, 210),
    item('名称：', 321.5, 109), item('四川爱达乐锦成食品有限公司', 346.5, 108.5, 125),
    item('统一社会信用代码/纳税人识别号：', 34.5, 137, 126), item('91510104MAC1A57G3B', 156.5, 136.5, 130),
    item('统一社会信用代码/纳税人识别号：', 321.5, 137, 126), item('91510114MA7NHHFA7J', 443.5, 136.5, 130),
    item('项目名称', 46.5, 161, 36), item('规格型号', 120.5, 161, 36), item('单', 191.5, 161), item('位', 209.5, 161),
    item('数', 265.5, 161), item('量', 283.5, 161), item('单', 335.5, 161), item('价', 353.5, 161),
    item('金', 408.5, 161), item('额', 426.5, 161), item('税率/征收率', 447.5, 161, 49.5), item('税', 555.5, 161), item('额', 573.5, 161),
    item('*方便食品*粽子礼盒', 16, 172, 160), item('份', 200.5, 172), item('2', 287.8, 172),
    item('88.4955752212389', 297.5, 172, 110), item('176.99', 411.1, 172, 45), item('13%', 467.3, 172, 20), item('23.01', 563.7, 172, 40),
    item('¥176.99', 402.1, 274, 50), item('¥23.01', 554.7, 274, 50),
    item('¥ 200.00', 446, 292, 60),
    item('销方开户银行:中国工商银行股份有限公司成都城东支行; 银行账号:4402940019100107186;', 34.5, 310, 360),
    item('开票人：', 57.5, 380), item('周艳', 93.5, 380)
  ]);

  assert.equal(fields.invoiceNumber, '26512000002725525366');
  assert.equal(fields.invoiceDate, '2026年06月29日');
  assert.equal(fields.buyerName, '成都杏林大药房有限责任公司锦江区二环路东五段药店');
  assert.equal(fields.sellerName, '四川爱达乐锦成食品有限公司');
  assert.equal(fields.projectName, '*方便食品*粽子礼盒');
  assert.equal(fields.model, '');
  assert.equal(fields.unit, '份');
  assert.equal(fields.quantity, '2');
  assert.equal(fields.unitPrice, '88.4955752212389');
  assert.equal(fields.amount, '176.99');
  assert.equal(fields.taxRate, '13%');
  assert.equal(fields.tax, '23.01');
  assert.equal(fields.total, '200.00');
  assert.equal(fields.issuer, '周艳');
});

test('invoice parser keeps labels and values together on a high-resolution PDF canvas', () => {
  const start = html.indexOf('var INVOICE_RECOGNIZE_COLUMNS=');
  const end = html.indexOf('\nasync function invoiceRecognizeRecognizeFile(', start);
  assert.ok(start >= 0 && end > start, 'invoice parser helpers should exist');

  const context = {};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.fn=invoiceRecognizeExtractFields;`, context);

  const scale = 6;
  const base = [
    item('销', 304.5, 103, 9), item('售', 304.5, 113, 9), item('方', 304.5, 123, 9), item('信', 304.5, 133, 9), item('息', 304.5, 143, 9),
    item('名称：', 34.5, 110.4, 27),
    item('成都杏林大药房有限责任公司锦江区二环路东五段药店', 59.5, 108.5, 210),
    item('名称：', 321.5, 109, 27),
    item('四川爱达乐锦成食品有限公司', 346.5, 108.5, 125),
    item('统一社会信用代码/纳税人识别号：', 34.5, 137, 126),
    item('91510104MAC1A57G3B', 156.5, 136.5, 130),
    item('统一社会信用代码/纳税人识别号：', 321.5, 137, 126),
    item('91510114MA7NHHFA7J', 443.5, 136.5, 130)
  ];
  const fields = context.fn(base.map(value => ({
    ...value,
    x: value.x * scale,
    y: value.y * scale,
    w: value.w * scale,
    h: value.h * scale
  })));

  assert.equal(fields.buyerName, '成都杏林大药房有限责任公司锦江区二环路东五段药店');
  assert.equal(fields.sellerName, '四川爱达乐锦成食品有限公司');
  assert.equal(fields.buyerTaxId, '91510104MAC1A57G3B');
  assert.equal(fields.sellerTaxId, '91510114MA7NHHFA7J');
});

test('invoice Excel rows include the requested fields and one row per file', () => {
  const start = html.indexOf('var INVOICE_RECOGNIZE_COLUMNS=');
  const end = html.indexOf('\nasync function invoiceRecognizeRecognizeFile(', start);
  assert.ok(start >= 0 && end > start, 'invoice row helpers should exist');

  const context = {};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.fn=invoiceRecognizeBuildExcelRows;`, context);

  const output = context.fn([
    {
      file: { name: '发票.pdf' },
      fields: { invoiceType: '普票', buyerName: '购买方', sellerName: '销售方', buyerTaxId: '9133', projectName: '项目', model: '', amount: '176.99', taxRate: '13%', tax: '23.01', total: '200.00' },
      status: '已识别',
      source: 'PDF 文字层'
    }
  ]);

  assert.equal(output.rows.length, 1);
  assert.deepEqual(Array.from(output.rows[0]).slice(0, 6), ['发票.pdf', '普票', '', '', '购买方', '9133']);
  assert.ok(output.headers.includes('销售方公司名称'));
  assert.ok(output.headers.includes('项目名称'));
  assert.ok(output.headers.includes('规格型号'));
  assert.ok(output.headers.includes('金额'));
  assert.ok(output.headers.includes('税率'));
  assert.ok(output.headers.includes('税额'));
  assert.ok(output.headers.includes('合计'));
  assert.equal(output.rows[0][output.headers.indexOf('识别来源')], 'PDF 文字层');
});

test('malformed PDF fallback decodes UTF-16BE text streams with their positions', () => {
  const start = html.indexOf('var INVOICE_RECOGNIZE_COLUMNS=');
  const end = html.indexOf('\nasync function invoiceRecognizeRecognizeFile(', start);
  assert.ok(start >= 0 && end > start, 'raw PDF text fallback should exist');

  const context = {};
  vm.createContext(context);
  vm.runInContext(html.slice(start, end) + '\nthis.fn=invoiceRecognizeRawPdfItemsFromStreams;', context);

  const utf16 = text => Array.from(text).map(char => {
    const code = char.charCodeAt(0);
    return String.fromCharCode(code >> 8, code & 255);
  }).join('');
  const stream = '/Xi0 9 Tf 1 0 0 1 59.5 291.5 Tm (' +
    utf16('成都杏林大药房有限责任公司锦江区二环路东五段药店') +
    ')Tj';
  const items = context.fn([stream], 400, 1);

  assert.equal(items.length, 1);
  assert.equal(items[0].text, '成都杏林大药房有限责任公司锦江区二环路东五段药店');
  assert.equal(items[0].x, 59.5);
  assert.equal(items[0].y, 108.5);
});
