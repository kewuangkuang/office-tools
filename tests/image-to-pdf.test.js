const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

test('image-to-PDF tool is linked from the homepage and navigation', () => {
  assert.match(html, /onclick="showTool\('image-pdf'\)"/);
  assert.match(html, /id="page-image-pdf"/);
  assert.match(html, /tool === 'image-pdf'/);
  assert.match(html, /getElementById\('page-image-pdf'\)\.style\.display = 'none'/);
});

test('image picker supports multiple common browser image formats', () => {
  assert.match(html, /id="imagePdfInput"[^>]*multiple/);
  assert.match(html, /accept="image\/jpeg,image\/png,image\/webp,image\/bmp,image\/gif"/);
  assert.match(html, /imagePdfHandleFiles\(e\.dataTransfer\.files\)/);
  assert.match(html, /document\.addEventListener\('paste'/);
});

test('page dimension helper follows image orientation', () => {
  const start = html.indexOf('function imagePdfGetPageDimensions(');
  const end = html.indexOf('\nasync function imagePdfConvert(', start);
  assert.ok(start >= 0);
  assert.ok(end > start);
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.fn=imagePdfGetPageDimensions;`, context);
  const portrait = context.fn(800, 1200, 'a4', 'auto');
  const landscape = context.fn(1200, 800, 'a4', 'auto');
  assert.ok(portrait[1] > portrait[0]);
  assert.ok(landscape[0] > landscape[1]);
});

test('conversion creates one page per image and keeps processing local', () => {
  assert.match(html, /PDFLib\.PDFDocument\.create\(\)/);
  assert.match(html, /targetDoc\.addPage\(\[pageWidth, pageHeight\]\)/);
  assert.match(html, /page\.drawImage\(prepared\.embedded/);
  assert.doesNotMatch(html.slice(html.indexOf('// IMAGE TO PDF TOOL'), html.indexOf('// PDF SPLIT TOOL')), /\bfetch\s*\(/);
});

test('export mode supports one merged PDF or one PDF per image', () => {
  assert.match(html, /id="imagePdfExportMode"/);
  assert.match(html, /value="merged" selected>所有图片合并成一个 PDF/);
  assert.match(html, /value="separate">每张图片生成一个 PDF/);
  assert.match(html, /exportMode === 'merged'/);
  assert.match(html, /exportMode === 'separate'/);
});

test('separate PDFs use unique image-based names and download as ZIP', () => {
  const start = html.indexOf('function imagePdfOutputBaseName(');
  const end = html.indexOf('\nasync function imagePdfConvert(', start);
  assert.ok(start >= 0);
  assert.ok(end > start);
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.fn=imagePdfUniqueOutputName;`, context);
  const used = new Set();
  assert.equal(context.fn('收据.jpg', used), '收据.pdf');
  assert.equal(context.fn('收据.png', used), '收据_2.pdf');
  assert.match(html, /function imagePdfCreateZip\(files\)/);
  assert.match(html, /0x04034B50/);
  assert.match(html, /0x02014B50/);
  assert.match(html, /0x06054B50/);
  assert.match(html, /fileName = name\.replace\(\/\\\.zip\$\/i, ''\) \+ '\.zip'/);
});

test('local ZIP builder writes standard local, central and end records', async () => {
  const start = html.indexOf('let imagePdfCrcTable = null;');
  const end = html.indexOf('\nasync function imagePdfConvert(', start);
  assert.ok(start >= 0);
  assert.ok(end > start);
  const context = { Uint8Array, Uint32Array, DataView, TextEncoder, Date, Blob };
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.createZip=imagePdfCreateZip;`, context);
  const blob = context.createZip([
    { name: '图片一.pdf', bytes: new Uint8Array([1, 2, 3]) },
    { name: '图片二.pdf', bytes: new Uint8Array([4, 5]) }
  ]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0, true), 0x04034B50);
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054B50);
  assert.equal(view.getUint16(bytes.length - 14, true), 2);
  const centralOffset = view.getUint32(bytes.length - 6, true);
  assert.equal(view.getUint32(centralOffset, true), 0x02014B50);
});
