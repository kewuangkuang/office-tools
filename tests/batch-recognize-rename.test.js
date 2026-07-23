const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

test('batch recognize rename is linked from the homepage and navigation', () => {
  assert.match(html, /onclick="showTool\('recognize-rename'\)"/);
  assert.match(html, /id="page-recognize-rename"/);
  assert.match(html, /tool === 'recognize-rename'/);
  assert.match(html, /getElementById\('page-recognize-rename'\)\.style\.display = 'none'/);
});

test('batch recognize rename accepts PDFs and common image formats', () => {
  assert.match(
    html,
    /id="batchRecognizeInput"[^>]*accept="application\/pdf,image\/jpeg,image\/png,image\/webp,image\/bmp,image\/gif"[^>]*multiple/
  );
  assert.match(html, /batchRecognizeRenderSource/);
  assert.match(html, /pdfjsLib\.getDocument/);
});

test('OCR keeps normal phone-photo resolution and enlarges narrow text crops', () => {
  const fitStart = html.indexOf('function batchRecognizeFitSourceSize(');
  const fitEnd = html.indexOf('\nasync function batchRecognizeRenderSource(', fitStart);
  const scaleStart = html.indexOf('function batchRecognizeCropScale(');
  const scaleEnd = html.indexOf('\nfunction batchRecognizeCropCanvas(', scaleStart);
  assert.ok(fitStart >= 0 && fitEnd > fitStart, 'source-size helper should exist');
  assert.ok(scaleStart >= 0 && scaleEnd > scaleStart, 'crop-scale helper should exist');
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${html.slice(fitStart, fitEnd)}\n${html.slice(scaleStart, scaleEnd)}\nthis.api={batchRecognizeFitSourceSize,batchRecognizeCropScale};`,
    context
  );

  assert.deepEqual(Array.from(context.api.batchRecognizeFitSourceSize(4032, 3024)), [4032, 3024]);
  const huge = Array.from(context.api.batchRecognizeFitSourceSize(12000, 9000));
  assert.ok(Math.max(...huge) <= 5000);
  assert.ok(huge[0] * huge[1] <= 24000000);
  assert.ok(context.api.batchRecognizeCropScale(800, 120) >= 3.5);
  assert.ok(context.api.batchRecognizeCropScale(800, 120) <= 5);
  assert.match(html, /function batchRecognizeEnhanceCanvas\(/);
  assert.match(html, /batchRecognizeEnhanceCanvas\(crop\)/);
});

test('batch recognize rename accepts pasted files only while its page is active', () => {
  const start = html.indexOf('/* ===== 批量识别命名 ===== */');
  const end = html.indexOf('// ==========================================', start);
  const source = html.slice(start, end);
  assert.match(source, /document\.addEventListener\('paste'/);
  assert.match(source, /page-recognize-rename/);
  assert.match(source, /clipboardData/);
  assert.match(source, /getAsFile\(\)/);
  assert.match(source, /batchRecognizeHandleFiles\(files\)/);
  assert.match(html, /拖拽、粘贴或点击选择文件/);
});

test('template selection is stored as normalized coordinates and reused for every file', () => {
  assert.match(html, /id="batchRecognizeTemplateSelect"/);
  assert.match(html, /onchange="batchRecognizeChooseTemplate\(this\.value\)"/);
  assert.match(html, /batchRecognizeTemplateIndex/);
  assert.match(html, /loadIndex=batchRecognizeTemplateIndex/);
  assert.match(html, /batchRecognizeFiles\[loadIndex\]/);
  assert.match(html, /batchRecognizeTemplate\s*=\s*\{\s*x:/);
  assert.match(html, /batchRecognizeCropCanvas\(sourceCanvas,\s*batchRecognizeTemplate\)/);
  assert.match(html, /i===batchRecognizeTemplateIndex/);
  assert.match(html, /pointerdown/);
  assert.match(html, /pointermove/);
  assert.match(html, /pointerup/);
});

test('recognized text becomes safe unique names while preserving extensions', () => {
  const start = html.indexOf('function batchRecognizeSafeBase(');
  const end = html.indexOf('\nfunction batchRecognizeRenderResults(', start);
  assert.ok(start >= 0 && end > start, 'naming helpers should exist');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.api={batchRecognizeBuildNames};`, context);

  const names = context.api.batchRecognizeBuildNames(
    [{ name: '甲.pdf' }, { name: '乙.png' }, { name: '丙.jpg' }],
    ['合同/2026:07', '合同/2026:07', '']
  );
  assert.deepEqual(
    Array.from(names),
    ['合同 2026 07.pdf', '合同 2026 07(2).png', '未识别_003.jpg']
  );
});

test('result table supports one-click text replacement across all new names', () => {
  assert.match(html, /id="batchRecognizeReplaceFind"/);
  assert.match(html, /id="batchRecognizeReplaceWith"/);
  assert.match(html, /onclick="batchRecognizeReplaceAll\(\)"/);
  const start = html.indexOf('function batchRecognizeReplaceTexts(');
  const end = html.indexOf('\nfunction batchRecognizeReplaceAll(', start);
  assert.ok(start >= 0 && end > start, 'replace helper should exist');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.fn=batchRecognizeReplaceTexts;`, context);
  assert.deepEqual(
    Array.from(context.fn(['成都公司金牛店', '成都公司武侯店'], '成都公司', '')),
    ['金牛店', '武侯店']
  );
  assert.deepEqual(
    Array.from(context.fn(['成都木林大药房', '四川杏林药店'], '*林', '成都杏林')),
    ['成都杏林大药房', '成都杏林药店']
  );
});

test('every original filename has a clickable image or PDF preview', () => {
  assert.match(html, /function batchRecognizeMakePreviewUrl\(/);
  assert.match(html, /previewUrl:previews\[i\]/);
  assert.match(html, /onclick="batchRecognizeOpenPreview\(/);
  assert.match(html, /id="batchRecognizePreviewModal"/);
  assert.match(html, /id="batchRecognizePreviewImage"/);
});

test('file preview stays image-only without a second full-page OCR action', () => {
  assert.doesNotMatch(html, /id="batchRecognizePreviewText"/);
  assert.doesNotMatch(html, /batchRecognizeOcrPreview/);
  assert.doesNotMatch(html, /batchRecognizeOcrFullPage/);
});

test('download packages the original local files without uploading them', () => {
  const start = html.indexOf('/* ===== 批量识别命名 ===== */');
  const end = html.indexOf('// ==========================================', start);
  const source = html.slice(start, end);
  assert.match(source, /await f\.arrayBuffer\(\)/);
  assert.match(source, /buildZip\(entries\)/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
});
