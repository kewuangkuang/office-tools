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

test('PDF recognition checks the selected text layer before browser OCR', () => {
  assert.match(html, /canvas\.__batchRecognizePdfTextItems=pdfSplitAllTextItems\(textContent,viewport\)/);
  assert.match(html, /function batchRecognizeTextLayerText\(/);
  const start = html.indexOf('async function batchRecognizeStart()');
  const end = html.indexOf('\nfunction batchRecognizeJoinTexts(', start);
  const source = html.slice(start, end);
  const textLayer = source.indexOf('batchRecognizeTextLayerText(sourceCanvas,batchRecognizeTemplates[j])');
  const imageOcr = source.indexOf('batchRecognizeOcr(crop,enhanced)');
  assert.ok(textLayer >= 0, 'selected PDF text layer should be read');
  assert.ok(imageOcr > textLayer, 'image OCR should only follow an empty text-layer result');
});

test('image recognition uses browser PaddleOCR before Tesseract and records the source', () => {
  const start = html.indexOf('async function batchRecognizeOcr(crop,enhanced)');
  const end = html.indexOf('\nasync function batchRecognizeStart()', start);
  const source = html.slice(start, end);
  const paddle = source.indexOf('pdfSplitRunPaddleOcr(crop)');
  const tesseract = source.indexOf('pdfSplitRunTesseractOcr(enhanced||crop');
  assert.ok(paddle >= 0, 'PaddleOCR should be attempted');
  assert.ok(tesseract > paddle, 'Tesseract should remain the final fallback');
  assert.match(html, /sources:allSources\[i\]/);
  assert.match(html, /\['\+renameEsc\(source\)\+'\]/);
});

test('browser PaddleOCR needs no credentials or local proxy', () => {
  assert.match(html, /@paddleocr\/paddleocr-js@0\.4\.2\/\+esm/);
  assert.match(html, /onnxruntime-web@1\.22\.0\/dist/);
  assert.match(html, /ocrVersion:'PP-OCRv5'/);
  assert.match(html, /lang:'ch'/);
  assert.match(html, /backend:'wasm'/);
  assert.match(html, /textDetectionModelAsset:\{url:'\.\/ocr-models\/PP-OCRv5_mobile_det_onnx_infer\.tar'\}/);
  assert.match(html, /textRecognitionModelAsset:\{url:'\.\/ocr-models\/PP-OCRv5_mobile_rec_onnx_infer\.tar'\}/);
  assert.doesNotMatch(html, /baiduOcr|BAIDU_OCR|百度 OCR 设置|Secret Key|API Key|启动百度OCR服务\.command/);
});

test('failed PaddleOCR initialization is cached so a batch falls back only once', () => {
  const start = html.indexOf('async function ensurePaddleOcrLoaded()');
  const end = html.indexOf('\nfunction pdfSplitPaddlePolyToBbox(', start);
  const source = html.slice(start, end);
  assert.match(source, /paddleOcrUnavailable/);
  assert.match(source, /if\(paddleOcrUnavailable\)return false/);
  assert.match(source, /paddleOcrUnavailable=true/);
  assert.doesNotMatch(source, /paddleOcrInitPromise=null/);
});

test('online OCR retries alternate CDNs for PaddleOCR and Tesseract', () => {
  assert.match(html, /PADDLE_OCR_MODULE_URLS=\[/);
  assert.match(html, /https:\/\/esm\.sh\/\@paddleocr\/paddleocr-js\@0\.4\.2\?bundle/);
  assert.match(html, /https:\/\/unpkg\.com\/\@paddleocr\/paddleocr-js\@0\.4\.2\/dist\/index\.mjs\?module/);
  assert.match(html, /PADDLE_OCR_WASM_BASE_URLS=\[/);
  assert.match(html, /https:\/\/unpkg\.com\/onnxruntime-web\@1\.22\.0\/dist\//);
  assert.match(html, /TESSERACT_SCRIPT_URLS=\[/);
  assert.match(html, /https:\/\/unpkg\.com\/tesseract\.js\@5\.1\.1\/dist\/tesseract\.min\.js/);
});

function loadBatchRecognizeOcr(overrides = {}) {
  const start = html.indexOf('async function batchRecognizeOcr(crop,enhanced)');
  const end = html.indexOf('\nasync function batchRecognizeStart()', start);
  assert.ok(start >= 0 && end > start, 'batchRecognizeOcr should exist');
  const context = {
    batchRecognizeCleanText: text => String(text || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim(),
    pdfSplitRunPaddleOcr: async () => ({lines: [], error: 'Paddle unavailable'}),
    pdfSplitRunTesseractOcr: async () => ({lines: [], error: 'Tesseract unavailable'}),
    PDF_SPLIT_OCR_TIMEOUT_MS: 15000,
    pdfSplitWithTimeout: (task, timeoutMs, label) => {
      let timer = null;
      const work = Promise.resolve().then(() => (typeof task === 'function' ? task() : task));
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), timeoutMs);
      });
      return Promise.race([work, timeout]).finally(() => { if (timer) clearTimeout(timer); });
    },
    setTimeout,
    clearTimeout,
    ...overrides
  };
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.run=batchRecognizeOcr;`, context);
  return context.run;
}

test('OCR reports a resource-loading failure instead of silently saying unrecognized', async () => {
  const run = loadBatchRecognizeOcr();
  const result = await run({}, {});
  assert.equal(result.source, 'OCR资源加载失败');
  assert.match(result.error, /Paddle unavailable/);
  assert.match(result.error, /Tesseract unavailable/);
});

test('a hanging OCR engine cannot stall the batch indefinitely', async () => {
  // Every OCR call must be bounded; one unresponsive image used to hang the
  // whole batch because these calls had no timeout wrapper.
  const run = loadBatchRecognizeOcr({
    PDF_SPLIT_OCR_TIMEOUT_MS: 20,
    pdfSplitRunPaddleOcr: () => new Promise(() => {}),
    pdfSplitRunTesseractOcr: () => new Promise(() => {})
  });
  const result = await run({}, {});
  assert.equal(result.text, '');
  assert.equal(result.source, 'OCR资源加载失败');
  assert.match(result.error, /超时/);
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
  assert.match(html, /拖拽文件到这里，或点击选择，也支持 Ctrl\+V 粘贴/);
});

test('up to five normalized template boxes can be managed and reused for every file', () => {
  assert.match(html, /id="batchRecognizeTemplateSelect"/);
  assert.match(html, /onchange="batchRecognizeChooseTemplate\(this\.value\)"/);
  assert.match(html, /id="batchRecognizeAddFieldBtn"/);
  assert.match(html, /id="batchRecognizeFieldList"/);
  assert.match(html, /function batchRecognizeAddTemplate\(/);
  assert.match(html, /function batchRecognizeMoveTemplate\(/);
  assert.match(html, /function batchRecognizeDeleteTemplate\(/);
  assert.match(html, /batchRecognizeTemplateIndex/);
  assert.match(html, /loadIndex=batchRecognizeTemplateIndex/);
  assert.match(html, /batchRecognizeFiles\[loadIndex\]/);
  assert.match(html, /batchRecognizeTemplates\s*=\s*\[\]/);
  assert.match(html, /batchRecognizeTemplates\.length>=5/);
  assert.match(html, /batchRecognizeTemplates\[j\]/);
  assert.match(html, /batchRecognizeCropCanvas\(sourceCanvas,\s*batchRecognizeTemplates\[j\]\)/);
  assert.match(html, /i===batchRecognizeTemplateIndex/);
  assert.match(html, /pointerdown/);
  assert.match(html, /pointermove/);
  assert.match(html, /pointerup/);
});

test('recognized fields are combined in box order with the selected separator', () => {
  assert.match(html, /id="batchRecognizeSeparator"/);
  const start = html.indexOf('function batchRecognizeJoinTexts(');
  const end = html.indexOf('\nfunction batchRecognizeSafeBase(', start);
  assert.ok(start >= 0 && end > start, 'field join helper should exist');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.fn=batchRecognizeJoinTexts;`, context);
  assert.equal(context.fn(['成都杏林', '2026年06月'], '_'), '成都杏林_2026年06月');
  assert.equal(context.fn(['成都杏林', '', '金牛店'], '-'), '成都杏林-金牛店');
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

test('download still packages the original files after OCR naming', () => {
  const start = html.indexOf('/* ===== 批量识别命名 ===== */');
  const end = html.indexOf('// ==========================================', start);
  const source = html.slice(start, end);
  assert.match(source, /await f\.arrayBuffer\(\)/);
  assert.match(source, /buildZip\(entries\)/);
  assert.match(source, /pdfSplitRunPaddleOcr\(crop\)/);
});
