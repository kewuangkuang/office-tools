const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function extract(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  assert.ok(start >= 0, `${startMarker} should exist`);
  const end = html.indexOf(endMarker, start);
  assert.ok(end > start, `${endMarker} should follow ${startMarker}`);
  return html.slice(start, end);
}

test('invoice PDFs read the text layer without rasterizing the page', () => {
  const reader = extract(
    'async function invoiceRecognizeReadPdfTextSource(',
    '\n// 结果表格里的缩略图'
  );
  // Rasterizing at OCR resolution costs seconds per file; the text-layer
  // reader must never do it.
  assert.doesNotMatch(reader, /\.render\(/);
  assert.match(reader, /getTextContent\(\)/);
  assert.match(reader, /__batchRecognizePdfTextItems/);
  assert.match(reader, /__batchRecognizePdfBytes/);
  assert.match(reader, /__batchRecognizePdfScale/);
});

test('the full-resolution canvas is only rendered when OCR is reached', () => {
  const recognize = extract(
    'async function invoiceRecognizeRecognizeFile(',
    '\nasync function batchRecognizeLoadTemplate('
  );
  assert.match(recognize, /async function invoiceRecognizeRecognizeFile\(sourceCanvas,ensureCanvas\)/);
  // The text-layer early return must come before ensureCanvas() is called.
  const earlyReturn = recognize.indexOf("source:usedRawPdfText?'PDF 文字层 + 原始文字流'");
  const ensureCall = recognize.indexOf('await ensureCanvas()');
  assert.ok(earlyReturn >= 0, 'text-layer early return should exist');
  assert.ok(ensureCall > earlyReturn, 'ensureCanvas() must only run after the text-layer path declines');
  // OCR must consume the lazily rendered canvas, not the metadata-only source.
  assert.match(recognize, /pdfSplitRunPaddleOcr\(ocrCanvas\)/);
  assert.match(recognize, /pdfSplitRunTesseractOcr\(ocrCanvas,/);
});

test('batch processing renders no preview image for text-layer invoices', () => {
  const processFile = extract(
    'async function invoiceRecognizeProcessFile(',
    '\nasync function invoiceRecognizeStart('
  );
  assert.match(processFile, /invoiceRecognizeReadPdfTextSource\(file\)/);
  assert.match(processFile, /renderedCanvas\?batchRecognizeMakePreviewUrl\(renderedCanvas\):''/);
  // Eagerly building a thumbnail per file would reintroduce a per-file render.
  assert.doesNotMatch(processFile, /await invoiceRecognizePdfPreviewUrl\(file\)/);
});

test('preview thumbnails are generated on demand and cannot hang', () => {
  const openPreview = extract(
    'async function batchRecognizeOpenPreview(',
    '\nfunction batchRecognizeClosePreview('
  );
  assert.match(openPreview, /if\(!result\.previewUrl\)/);
  assert.match(openPreview, /await invoiceRecognizePdfPreviewUrl\(result\.file\)/);
  assert.match(openPreview, /result\.previewUrl=/, 'rendered preview should be cached on the result');

  const previewUrl = extract(
    'async function invoiceRecognizePdfPreviewUrl(',
    '\nasync function batchRecognizeRenderSource('
  );
  assert.match(previewUrl, /pdfSplitWithTimeout\(/);
  assert.match(previewUrl, /INVOICE_RECOGNIZE_PREVIEW_TIMEOUT_MS/);
  assert.match(html, /const INVOICE_RECOGNIZE_PREVIEW_TIMEOUT_MS = \d+;/);

  // Rows with no rendered image still need a clickable affordance.
  assert.match(html, /recognize-preview-lazy/);
  assert.match(html, /点击预览/);
});

test('each invoice keeps a hard per-file processing timeout', () => {
  assert.match(html, /const INVOICE_RECOGNIZE_FILE_TIMEOUT_MS = \d+;/);
  const start = extract('async function invoiceRecognizeStart(', '\nasync function batchRecognizeStart(');
  assert.match(start, /INVOICE_RECOGNIZE_FILE_TIMEOUT_MS/);
  assert.match(start, /invoiceRecognizeProcessFile\(file,isPdf\)/);
});
