const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

test('the shared PDF preview panel is outside the hidden PDF split page', () => {
  const splitPageStart = html.indexOf('<div class="tool-page" id="page-pdf-split"');
  const splitPageEndMarker = html.indexOf('<!-- ============== TOOL 4: SPLIT TABLE ============== -->', splitPageStart);
  const previewPanelStart = html.indexOf('<div id="pdfPreviewPanel"');

  assert.ok(splitPageStart >= 0, 'PDF split page should exist');
  assert.ok(splitPageEndMarker > splitPageStart, 'PDF split page end marker should exist');
  assert.ok(previewPanelStart > splitPageEndMarker, 'shared preview panel must not be nested in PDF split page');
});

test('leaving or resetting PDF tools closes the shared preview panel', () => {
  const showHomeStart = html.indexOf('function showHome()');
  const showHomeEnd = html.indexOf('\n// ======== UTILS ========', showHomeStart);
  const pdfResetStart = html.indexOf('function pdfReset()');
  const pdfResetEnd = html.indexOf('\nfunction pdfClearAll()', pdfResetStart);
  const pdfSplitResetStart = html.indexOf('function pdfSplitReset()');
  const pdfSplitResetEnd = html.indexOf('\nfunction pdfSplitClearUpload()', pdfSplitResetStart);

  assert.ok(showHomeStart >= 0 && showHomeEnd > showHomeStart, 'showHome should exist');
  assert.ok(pdfResetStart >= 0 && pdfResetEnd > pdfResetStart, 'pdfReset should exist');
  assert.ok(pdfSplitResetStart >= 0 && pdfSplitResetEnd > pdfSplitResetStart, 'pdfSplitReset should exist');
  assert.match(html.slice(showHomeStart, showHomeEnd), /closePdfPreview\(\)/);
  assert.match(html.slice(pdfResetStart, pdfResetEnd), /closePdfPreview\(\)/);
  assert.match(html.slice(pdfSplitResetStart, pdfSplitResetEnd), /closePdfPreview\(\)/);
});

test('one-up merge preview uses the original source page bytes', () => {
  const helperStart = html.indexOf('function pdfGetMergePreviewSource(');
  const helperEnd = html.indexOf('\nfunction setNup', helperStart);

  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'merge preview source helper should exist');

  const context = {};
  vm.runInNewContext(`${html.slice(helperStart, helperEnd)}\nthis.fn = pdfGetMergePreviewSource;`, context);

  const sourcePages = [
    { data: 'invoice-a', pageNumber: 2 },
    { data: 'invoice-b', pageNumber: 1 }
  ];

  const target = context.fn(1, sourcePages, 1);
  assert.equal(target.bytes, 'invoice-b');
  assert.equal(target.pageNumbers.length, 1);
  assert.equal(target.pageNumbers[0], 1);
  assert.equal(context.fn(1, sourcePages, 2), null, 'n-up output must keep using the composed PDF');
});

test('PDF preview enables XFA and renders form layers over the page canvas', () => {
  const optionsStart = html.indexOf('function pdfPreviewDocumentOptions(');
  const optionsEnd = html.indexOf('\nasync function pdfShowCanvasPreview', optionsStart);

  assert.ok(optionsStart >= 0 && optionsEnd > optionsStart, 'preview document options helper should exist');

  const context = {
    pdfBytesForPdfJs(bytes) { return bytes; }
  };
  vm.runInNewContext(`${html.slice(optionsStart, optionsEnd)}\nthis.fn = pdfPreviewDocumentOptions;`, context);
  assert.equal(context.fn('invoice-bytes').enableXfa, true);

  const previewSource = html.slice(optionsStart, html.indexOf('\nfunction pdfPreviewUploadedFile', optionsStart));
  assert.match(previewSource, /AnnotationLayer/);
  assert.match(previewSource, /XfaLayer\.render/);
  assert.match(previewSource, /renderForms:\s*true/);
  assert.match(previewSource, /function pdfPreviewCanvasAnnotationMode\(\)/);
  assert.match(previewSource, /annotationMode:\s*pdfPreviewCanvasAnnotationMode\(\)/);
  assert.match(previewSource, /\n      annotations,\n/);
});

test('PDF canvas preview keeps annotation appearance streams visible', () => {
  const optionsStart = html.indexOf('function pdfPreviewCanvasAnnotationMode()');
  const optionsEnd = html.indexOf('\nfunction pdfPreviewLinkService', optionsStart);

  assert.ok(optionsStart >= 0 && optionsEnd > optionsStart, 'canvas annotation mode helper should exist');

  const context = {
    window: {
      pdfjsLib: {
        AnnotationMode: { ENABLE: 1, ENABLE_FORMS: 2, DISABLE: 0 }
      }
    }
  };
  vm.runInNewContext(`${html.slice(optionsStart, optionsEnd)}\nthis.fn = pdfPreviewCanvasAnnotationMode;`, context);
  assert.equal(context.fn(), 1, 'preview should paint annotation appearance streams on the canvas');
});

test('one-up merge thumbnails use the same original-page renderer as the full preview', () => {
  const mergeStart = html.indexOf('async function pdfMerge()');
  const mergeEnd = html.indexOf('\nfunction pdfDownload()', mergeStart);

  assert.ok(mergeStart >= 0 && mergeEnd > mergeStart, 'PDF merge implementation should exist');
  const mergeSource = html.slice(mergeStart, mergeEnd);
  assert.match(mergeSource, /pdfRenderPageThumbnail/);
  assert.match(mergeSource, /pdfGetMergePreviewSource\(i, pdfMergeSourcePages, pdfNup\)/);
  assert.match(mergeSource, /<img src="\$\{thumbnailUrl\}/);
});

test('n-up merge composition rasterizes original pages before placing them', () => {
  const mergeStart = html.indexOf('async function pdfMerge()');
  const mergeEnd = html.indexOf('\nfunction pdfDownload()', mergeStart);

  assert.ok(mergeStart >= 0 && mergeEnd > mergeStart, 'PDF merge implementation should exist');
  const mergeSource = html.slice(mergeStart, mergeEnd);
  assert.match(mergeSource, /pdfRenderPageRaster/);
  assert.match(mergeSource, /newDoc\.embedPng/);
  assert.match(mergeSource, /newPage\.drawImage/);
});

test('PDF preview enables optional content groups so hidden invoice layers are shown', () => {
  const previewStart = html.indexOf('async function pdfPreviewGetOptionalContentConfig');
  const previewEnd = html.indexOf('\nfunction pdfPreviewUploadedFile', previewStart);

  assert.ok(previewStart >= 0 && previewEnd > previewStart, 'full PDF preview implementation should exist');
  const previewSource = html.slice(previewStart, previewEnd);
  assert.match(previewSource, /getOptionalContentConfig/);
  assert.match(previewSource, /setVisibility\(.*true/);
  assert.match(previewSource, /optionalContentConfigPromise/);
});

test('PDF split previews reuse the full source-page renderer for form PDFs', () => {
  const pagePreviewStart = html.indexOf('async function pdfSplitPagePreview');
  const pagePreviewEnd = html.indexOf('\nfunction closePdfPreview', pagePreviewStart);
  const resultPreviewStart = html.indexOf('async function pdfSplitResultPreview');
  const resultPreviewEnd = html.indexOf('\nlet dragPdfPanel', resultPreviewStart);

  assert.ok(pagePreviewStart >= 0 && pagePreviewEnd > pagePreviewStart, 'split page preview should exist');
  assert.ok(resultPreviewStart >= 0 && resultPreviewEnd > resultPreviewStart, 'split result preview should exist');
  assert.match(html, /pdfSplitSourceBytes\s*=\s*null/);
  assert.match(html.slice(pagePreviewStart, pagePreviewEnd), /pdfShowCanvasPreview\(pdfSplitSourceBytes/);
  assert.match(html.slice(resultPreviewStart, resultPreviewEnd), /pdfShowCanvasPreview\(pdfSplitSourceBytes/);
});
