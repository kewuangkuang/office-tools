const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const canonicalFiles = ['index.html'];
const legacyFile = 'excel-tools.html';

function source(name = 'index.html') {
  return fs.readFileSync(path.join(root, name), 'utf8');
}

function loadPureHelpers(html) {
  const start = html.indexOf('function pdfSplitReceiptFieldIsMissing(');
  const end = html.indexOf('async function pdfSplitOcrReceiptCanvas(', start);
  assert.notEqual(start, -1, 'receipt field helpers should exist');
  assert.ok(end > start, 'pure OCR helper block should end before the coordinator');
  const snippets = html.slice(start, end);
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${snippets}\nthis.api={pdfSplitRequiredReceiptFields,pdfSplitMissingReceiptFields,pdfSplitMergeMissingReceiptFields,pdfSplitPreferCoordinatePartyNames};`, context);
  return context.api;
}

function loadPartyParser(html) {
  const cleanStart = html.indexOf('function pdfSplitCleanPartyName(');
  const cleanEnd = html.indexOf('\nfunction pdfSplitPickBetween(', cleanStart);
  const pairedStart = html.indexOf('function pdfSplitExtractPairedPartyNames(');
  const pairedEnd = html.indexOf('\nfunction pdfSplitNormalizeAmountToken(', pairedStart);
  assert.ok(cleanStart >= 0 && cleanEnd > cleanStart, 'party-name cleaner should exist');
  assert.ok(pairedStart >= 0 && pairedEnd > pairedStart, 'paired party-name parser should exist');
  const context = {
    pdfSplitSafeFileName: value => String(value || ''),
    pdfSplitNormalizeOcrText: value => String(value || '')
  };
  vm.createContext(context);
  vm.runInContext(`${html.slice(cleanStart, cleanEnd)}\n${html.slice(pairedStart, pairedEnd)}\nthis.api={pdfSplitExtractPairedPartyNames};`, context);
  return context.api;
}

function loadWordPartyParser(html) {
  const safeStart = html.indexOf('function pdfSplitSafeFileName(');
  const safeEnd = html.indexOf('\nfunction pdfSplitNormalizeOcrText(', safeStart);
  const cleanStart = html.indexOf('function pdfSplitCleanPartyName(');
  const cleanEnd = html.indexOf('\nfunction pdfSplitPickBetween(', cleanStart);
  const parserStart = html.indexOf('function pdfSplitExtractPartyNamesFromOcrWords(');
  const parserEnd = html.indexOf('\nfunction pdfSplitPickBetween(', parserStart);
  assert.ok(safeStart >= 0 && safeEnd > safeStart, 'file-name helper should exist');
  assert.ok(cleanStart >= 0 && cleanEnd > cleanStart, 'party-name cleaner should exist');
  assert.ok(parserStart >= 0 && parserEnd > parserStart, 'word-coordinate party parser should exist');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${html.slice(safeStart, safeEnd)}\n${html.slice(cleanStart, cleanEnd)}\n${html.slice(parserStart, parserEnd)}\nthis.api={pdfSplitCleanPartyName,pdfSplitExtractPartyNamesFromOcrWords};`, context);
  return context.api;
}

function loadTesseractWordAdapter(html) {
  const start = html.indexOf('function pdfSplitFlattenTesseractWords(');
  const end = html.indexOf('\nasync function pdfSplitRunTesseractOcr(', start);
  assert.ok(start >= 0 && end > start, 'Tesseract word adapter should exist before OCR runner');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.api={pdfSplitFlattenTesseractWords};`, context);
  return context.api;
}

function loadPaddleResultAdapter(html) {
  const start = html.indexOf('function pdfSplitPaddlePolyToBbox(');
  const end = html.indexOf('\nasync function pdfSplitRunPaddleOcr(', start);
  assert.ok(start >= 0 && end > start, 'PaddleOCR result adapter should exist before OCR runner');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.api={pdfSplitNormalizePaddleResult,pdfSplitPaddleResultForCrop};`, context);
  return context.api;
}

function loadFixedFieldBoxes(html) {
  const start = html.indexOf('function pdfSplitReceiptFixedFieldBoxes(');
  const end = html.indexOf('\nfunction pdfSplitCreateFixedFieldOcrCanvases(', start);
  assert.ok(start >= 0 && end > start, 'fixed receipt field boxes should exist before canvas creation');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.api={pdfSplitReceiptFixedFieldBoxes};`, context);
  return context.api;
}

function loadReceiptCropHelpers(html) {
  const start = html.indexOf('function pdfSplitGroupReceiptBoundaryRows(');
  const end = html.indexOf('\nfunction pdfSplitDetectReceiptGapsFromImage(', start);
  assert.ok(start >= 0 && end > start, 'automatic receipt crop helpers should exist before image detection');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.api={pdfSplitGroupReceiptBoundaryRows,pdfSplitBuildReceiptCropsFromBoundaries,pdfSplitBuildReceiptCropsFromFrameRows};`, context);
  return context.api;
}

function loadAmountParser(html) {
  const start = html.indexOf('function pdfSplitNormalizeAmountToken(');
  const end = html.indexOf('\nfunction pdfSplitExtractAmount(', start);
  assert.ok(start >= 0 && end > start, 'amount parser helpers should exist');
  assert.match(html.slice(start, end), /function pdfSplitReconcileAmountWithChinese\(/, 'Chinese amount reconciliation should exist');
  const context = { pdfSplitNormalizeOcrText: value => String(value || '') };
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.api={pdfSplitReconcileAmountWithChinese};`, context);
  return context.api;
}

function loadFixedAmountParser(html) {
  const start = html.indexOf('function pdfSplitNormalizeAmountToken(');
  const end = html.indexOf('\nfunction pdfSplitExtractAmount(', start);
  const snippets = html.slice(start, end);
  assert.match(snippets, /function pdfSplitExtractFixedAmountInfo\(/, 'fixed numeric-cell parser should exist');
  const context = { pdfSplitNormalizeOcrText: value => String(value || '') };
  vm.createContext(context);
  vm.runInContext(`${snippets}\nthis.api={pdfSplitExtractFixedAmountInfo};`, context);
  return context.api;
}

function loadFixedPreference(html) {
  const start = html.indexOf('function pdfSplitReceiptFieldIsMissing(');
  const end = html.indexOf('async function pdfSplitOcrReceiptCanvas(', start);
  const snippets = html.slice(start, end);
  assert.match(snippets, /function pdfSplitPreferFixedReceiptFields\(/, 'fixed field preference should exist');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${snippets}\nthis.api={pdfSplitPreferFixedReceiptFields};`, context);
  return context.api;
}

function renderPdfSplitResults(html, mode) {
  const start = html.indexOf('function pdfSplitCurrentExportFormat(');
  const end = html.indexOf('\nfunction pdfSplitDataUrlToBytes(', start);
  assert.ok(start >= 0 && end > start, 'PDF split export renderer should exist');
  const formatInputs = {
    pdf: { value: 'pdf', checked: false },
    jpg: { value: 'jpg', checked: false }
  };
  const elements = {
    pdfSplitExportName: { placeholder: '' },
    pdfSplitPreviewThumbs: { innerHTML: '', style: {} },
    pdfSplitResultStats: { innerHTML: '' }
  };
  const document = {
    getElementById(id) {
      return elements[id] || null;
    },
    querySelector(selector) {
      if (selector === 'input[name="pdfSplitMode"]:checked') return { value: mode };
      if (selector === 'input[name="pdfSplitExportFormat"]:checked') {
        return Object.values(formatInputs).find(input => input.checked) || null;
      }
      const match = selector.match(/input\[name="pdfSplitExportFormat"\]\[value="(pdf|jpg)"\]/);
      return match ? formatInputs[match[1]] : null;
    }
  };
  const context = { document, pdfSplitResults: [], URL, Blob };
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\npdfSplitRenderResults(${JSON.stringify(mode)});`, context);
  return { formatInputs, elements };
}

test('required OCR fields follow the selected receipt naming mode', () => {
  const { pdfSplitRequiredReceiptFields: required } = loadPureHelpers(source());
  assert.deepEqual(Array.from(required('amount', '')), ['amount']);
  assert.deepEqual(Array.from(required('payer', '')), ['payer']);
  assert.deepEqual(Array.from(required('payee', '')), ['payee']);
  assert.deepEqual(Array.from(required('payee_amount', '')), ['payee', 'amount']);
  assert.deepEqual(Array.from(required('custom', '{收款人}{日期}{序号}')), ['payee', 'date']);
});

test('missing fields and merge only fill empty primary values', () => {
  const { pdfSplitMissingReceiptFields: missing, pdfSplitMergeMissingReceiptFields: merge } = loadPureHelpers(source());
  assert.deepEqual(Array.from(missing({ payee: '甲方', amount: '' }, 'payee_amount', '')), ['amount']);
  const merged = merge(
    { payer: '原付款人', payee: '', amount: '', accounts: [] },
    { payer: '错误覆盖值', payee: '补充收款人', amount: '12.34元', accounts: ['12345678'] }
  );
  assert.equal(merged.payer, '原付款人');
  assert.equal(merged.payee, '补充收款人');
  assert.equal(merged.amount, '12.34元');
  assert.deepEqual(Array.from(merged.accounts), ['12345678']);
  const recovered = merge(
    { payer: '未识别', payee: '未识别' },
    { payer: '付款方公司', payee: '收款方公司' }
  );
  assert.equal(recovered.payer, '付款方公司');
  assert.equal(recovered.payee, '收款方公司');
});

test('left-right OCR coordinates override a low-confidence merged party line', () => {
  const { pdfSplitPreferCoordinatePartyNames: prefer } = loadPureHelpers(source());
  const fields = prefer(
    { payer: '四川杏林医药连锁收款人名称四川久远银海', payee: '收文人和', amount: '3400.00元' },
    { payer: '四川杏林医药连锁有限责任公司达州市丽水翠苑药店', payee: '四川久远银海软件股份有限公司' }
  );
  assert.equal(fields.payer, '四川杏林医药连锁有限责任公司达州市丽水翠苑药店');
  assert.equal(fields.payee, '四川久远银海软件股份有限公司');
  assert.equal(fields.amount, '3400.00元');
});

test('canonical entry uses text fields, then browser PaddleOCR, then Tesseract', () => {
  for (const file of canonicalFiles) {
    const html = source(file);
    assert.match(html, /async function pdfSplitRunPaddleOcr\s*\(/, `${file} PaddleOCR adapter`);
    assert.match(html, /function pdfSplitRunTesseractOcr\s*\(/, `${file} Tesseract adapter`);
    const coordinator = html.slice(html.indexOf('async function pdfSplitOcrReceiptCanvas'), html.indexOf('function pdfSplitBuildReceiptBaseName'));
    const paddleCall = coordinator.indexOf('pdfSplitRunPaddleOcr(canvas)');
    const tesseractCall = coordinator.indexOf('pdfSplitRunTesseractOcr(canvas)');
    assert.ok(paddleCall >= 0, `${file} should call PaddleOCR when text fields are missing`);
    assert.ok(tesseractCall > paddleCall, `${file} should keep Tesseract after PaddleOCR`);
    assert.match(coordinator, /if\(stillNeedsOcr\)/, `${file} only reaches Tesseract when PaddleOCR leaves fields missing`);
    assert.doesNotMatch(html, /baiduOcr|BAIDU_OCR|百度高精度 OCR|Secret Key|API Key/, `${file} should not retain Baidu cloud credentials or calls`);
    assert.doesNotMatch(html, /pdfSplitPreprocessForTesseract/, `${file} must not run the later full-image Otsu preprocessing`);
    assert.match(html, /const scale=2\.5;/, `${file} should restore the faster pre-Paddle render scale`);
  }
});

test('two-column BOC payer and payee labels are extracted independently from OCR text', () => {
  const lines = [
    '付款人名称: 四川杏林医药连锁有限责任公司达州市丽水翠苑药店    收款人名称: 四川久远银海软件股份有限公司',
    '付款人开户行: 中国银行达州通川支行    收款人开户行: 中国农业银行股份有限公司'
  ];
  for (const file of canonicalFiles) {
    const { pdfSplitExtractPairedPartyNames: parse } = loadPartyParser(source(file));
    const fields = parse(lines);
    assert.equal(fields.payer, '四川杏林医药连锁有限责任公司达州市丽水翠苑药店', `${file} payer`);
    assert.equal(fields.payee, '四川久远银海软件股份有限公司', `${file} payee`);
  }
});

test('actual Lishui Tesseract output still yields both parties when OCR confuses the payer label', () => {
  const lines = [
    '付 歌 人 名 称 : 四 川 杏 林 医 药 连 锁 有 限 黄 任 公司 达州 市 丽水 萄 ” 收 款 人 名 称 : 四 川 入 远 银 海 软件 股份 有 限 公司',
    '苑 药店',
    '付款 人 开户 行 : 中 国 银 行 达州 通 川 支 行 收 款 人 开户 行 :中 国 农 业 银行 股份 有 限 公司'
  ];
  for (const file of canonicalFiles) {
    const { pdfSplitExtractPairedPartyNames: parse } = loadPartyParser(source(file));
    const fields = parse(lines);
    assert.match(fields.payer, /^四川杏林医药连锁/, `${file} payer from actual OCR`);
    assert.match(fields.payer, /苑药店$/, `${file} payer continuation`);
    assert.match(fields.payee, /^四川入远银海软件股份有限公司$/, `${file} payee from actual OCR`);
  }
});

test('actual Lishui OCR word coordinates recover both party names even if label text is imperfect', () => {
  const words = [
    ['付款', 91, 181], ['人', 152, 181], ['名', 172, 181], ['称', 202, 181], [':四', 222, 182], ['川', 268, 181], ['杏林', 306, 181], ['医药', 339, 181], ['连锁', 388, 177], ['有', 435, 181], ['限', 460, 182], ['责任', 485, 181], ['公司', 530, 181], ['达州', 577, 181], ['市', 631, 177], ['丽水', 654, 181], ['到', 701, 181],
    ['收', 771, 181], ['款', 802, 177], ['人', 825, 181], ['名', 845, 181], ['称', 874, 181], [':四', 894, 182], ['川', 942, 181], ['入', 966, 177], ['远', 987, 182], ['银', 1009, 181], ['海', 1036, 181], ['软件', 1075, 181], ['股份', 1124, 181], ['有', 1173, 182], ['限', 1181, 182], ['公司', 1203, 181],
    ['苑', 234, 213], ['药店', 264, 212]
  ].map(([text, x0, y0]) => ({ text, bbox: { x0, y0, x1: x0 + 20, y1: y0 + 22 } }));
  const { pdfSplitExtractPartyNamesFromOcrWords: parse } = loadWordPartyParser(source());
  const fields = parse(words, 1489, 1005);
  assert.match(fields.payer, /^四川杏林医药连锁有限责任公司达州市丽水到苑药店$/, 'left name from OCR coordinates');
  assert.match(fields.payee, /^四川入远银海软件股份有限公司$/, 'right name from OCR coordinates');
});

test('an empty party OCR result stays empty instead of becoming a filename placeholder', () => {
  const { pdfSplitCleanPartyName: clean } = loadWordPartyParser(source());
  assert.equal(clean(''), '');
});

test('Tesseract v5 nested blocks are flattened into OCR words', () => {
  const { pdfSplitFlattenTesseractWords: flatten } = loadTesseractWordAdapter(source());
  const words = flatten({
    blocks: [{
      paragraphs: [{
        lines: [{
          words: [
            { text: '付款人名称', bbox: { x0: 10, y0: 20, x1: 80, y1: 45 } },
            { text: '测试公司', bbox: { x0: 90, y0: 20, x1: 150, y1: 45 } }
          ]
        }]
      }]
    }]
  });
  assert.deepEqual(JSON.parse(JSON.stringify(words)), [
    { text: '付款人名称', bbox: { x0: 10, y0: 20, x1: 80, y1: 45 } },
    { text: '测试公司', bbox: { x0: 90, y0: 20, x1: 150, y1: 45 } }
  ]);
});

test('official PaddleOCR.js items become text lines and coordinate words', () => {
  const { pdfSplitNormalizePaddleResult: normalize } = loadPaddleResultAdapter(source());
  const result = normalize([{
    image: { width: 900, height: 220 },
    items: [{
      text: '测试文字12345',
      score: 0.99,
      poly: [[50, 70], [450, 70], [450, 145], [50, 145]]
    }]
  }]);
  assert.deepEqual(Array.from(result.lines), ['测试文字12345']);
  assert.deepEqual(JSON.parse(JSON.stringify(result.words)), [{
    text: '测试文字12345',
    bbox: { x0: 50, y0: 70, x1: 450, y1: 145 }
  }]);
  assert.equal(result.ok, true);
});

test('page-level PaddleOCR results can be reused for individual receipt crops', () => {
  const { pdfSplitPaddleResultForCrop: forCrop } = loadPaddleResultAdapter(source());
  const result = forCrop({
    lines: ['付款人名称 甲公司', '不属于本张回单'],
    words: [
      { text: '付款人名称', bbox: { x0: 20, y0: 20, x1: 110, y1: 42 } },
      { text: '甲公司', bbox: { x0: 120, y0: 20, x1: 180, y1: 42 } },
      { text: '其他回单', bbox: { x0: 20, y0: 180, x1: 100, y1: 202 } }
    ]
  }, { x: 10, y: 10, w: 220, h: 80 });
  assert.deepEqual(JSON.parse(JSON.stringify(result.lines)), ['付款人名称 甲公司']);
  assert.deepEqual(JSON.parse(JSON.stringify(result.words)), [
    { text: '付款人名称', bbox: { x0: 10, y0: 10, x1: 100, y1: 32 } },
    { text: '甲公司', bbox: { x0: 110, y0: 10, x1: 170, y1: 32 } }
  ]);
});

test('empty top-level Tesseract words fall back to nested block coordinates', () => {
  const { pdfSplitFlattenTesseractWords: flatten } = loadTesseractWordAdapter(source());
  const words = flatten({
    words: [],
    blocks: [{ paragraphs: [{ lines: [{
      words: [{ text: '收款人名称', bbox: { x0: 200, y0: 20, x1: 280, y1: 45 } }]
    }] }] }]
  });
  assert.deepEqual(JSON.parse(JSON.stringify(words)), [
    { text: '收款人名称', bbox: { x0: 200, y0: 20, x1: 280, y1: 45 } }
  ]);
});

test('canonical entry applies scan-image receipt gap detection before equal splitting', () => {
  for (const file of canonicalFiles) {
    const html = source(file);
    assert.match(html, /function pdfSplitDetectReceiptGapsFromImage\s*\(/, `${file} image gap detector`);
    assert.match(html, /pdfSplitDetectReceiptGapsFromImage\(canvas,canvas\.width,canvas\.height,manualCount\)/, `${file} uses image gap detector for scans`);
    assert.match(html, /redY-pageH\*0\.045/, `${file} keeps the next receipt header out of the prior crop`);
  }
});

test('scan pages with one compact receipt do not become a footer fragment', () => {
  for (const file of canonicalFiles) {
    const html = source(file);
    assert.match(html, /function pdfSplitShouldKeepSingleScanReceipt\s*\(/, `${file} single-receipt guard`);
    assert.match(html, /pdfSplitShouldKeepSingleScanReceipt\(canvas,manualCount\)/, `${file} applies single-receipt guard`);
  }
});

test('missing party names trigger a focused top-of-receipt OCR pass', () => {
  for (const file of canonicalFiles) {
    const html = source(file);
    assert.match(html, /function pdfSplitCreatePartyNameOcrCanvas\s*\(/, `${file} focused name canvas`);
    const coordinator = html.slice(html.indexOf('async function pdfSplitOcrReceiptCanvas'), html.indexOf('function pdfSplitBuildReceiptBaseName'));
    assert.match(coordinator, /pdfSplitCreatePartyNameOcrCanvas\(canvas\)/, `${file} uses focused name OCR`);
    assert.match(coordinator, /pdfSplitExtractPartyNamesFromOcrWords\(tess\.words,canvas\.width,canvas\.height\)/, `${file} uses OCR word coordinates before text fallback`);
  }
});

test('ABC standard receipt fallback isolates payer, payee and amount cells', () => {
  const { pdfSplitReceiptFixedFieldBoxes: boxes } = loadFixedFieldBoxes(source());
  const fields = boxes(1000, 500);
  assert.deepEqual(JSON.parse(JSON.stringify(fields)), {
    payer: { x: 120, y: 190, w: 380, h: 50 },
    payee: { x: 615, y: 190, w: 370, h: 50 },
    amount: { x: 120, y: 253, w: 380, h: 45 },
    amountUpper: { x: 615, y: 253, w: 370, h: 45 }
  });
});

test('actual Suci receipt grid rows anchor fields independently of crop whitespace', () => {
  const { pdfSplitReceiptFixedFieldBoxes: boxes } = loadFixedFieldBoxes(source());
  const first = boxes(1489, 776, [186, 220, 256, 290, 323, 358, 392, 428]);
  const second = boxes(1489, 700, [111, 145, 181, 215, 249, 284, 318, 353]);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), {
    payer: { x: 208, y: 259, w: 469, h: 28 },
    payee: { x: 834, y: 259, w: 476, h: 28 },
    amount: { x: 208, y: 326, w: 469, h: 29 },
    amountUpper: { x: 834, y: 326, w: 476, h: 29 }
  });
  assert.equal(second.payer.y, 184);
  assert.equal(second.amount.y, 252);
});

test('fixed field canvases detect table rows before choosing OCR boxes', () => {
  const html = source();
  const start = html.indexOf('function pdfSplitCreateFixedFieldOcrCanvases(');
  const end = html.indexOf('\nfunction pdfSplitExtractFixedPartyName(', start);
  const creator = html.slice(start, end);
  assert.match(creator, /pdfSplitDetectReceiptTableRows\(canvas\)/);
  assert.match(creator, /pdfSplitReceiptFixedFieldBoxes\(canvas\.width,canvas\.height,tableRows\)/);
});

test('automatic receipt splitting supports different receipt counts on each page', () => {
  const { pdfSplitGroupReceiptBoundaryRows: group, pdfSplitBuildReceiptCropsFromBoundaries: build, pdfSplitBuildReceiptCropsFromFrameRows: buildFrames } = loadReceiptCropHelpers(source());
  const pageOneRows = group([300, 301, 302, 600, 601, 900, 901], 1000);
  const pageTwoRows = group([300, 301, 600, 601], 1000);
  assert.equal(pageOneRows.length, 3, 'page one should keep three boundary lines');
  assert.equal(pageTwoRows.length, 2, 'page two should keep two boundary lines');
  const pageOneCrops = build(1000, 1000, pageOneRows, { y: 0, h: 920 });
  const pageTwoCrops = build(1000, 1000, pageTwoRows, { y: 0, h: 620 });
  assert.equal(pageOneCrops.length, 3, 'page one should produce three crops');
  assert.equal(pageTwoCrops.length, 2, 'page two should produce two crops');
  assert.ok(pageOneCrops[1].y > pageOneCrops[0].y, 'page one crops should be ordered vertically');
  assert.ok(pageTwoCrops[1].y > pageTwoCrops[0].y, 'page two crops should be ordered vertically');
  const framed = buildFrames(1000,1000,[70,670,752,1350,1434,2032].map(y => y * 1000 / 2104), { y: 0, h: 1000 });
  assert.equal(framed.length, 3, 'paired frame lines should produce three receipt crops');
});

test('receipt mode defaults to two receipts per page and exposes progress/timeout handling', () => {
  const html = source();
  assert.doesNotMatch(html, /<option value="auto"[^>]*>自动识别每页数量（推荐）<\/option>/, 'automatic per-page count should be removed from the receipt count menu');
  assert.match(html, /<option value="2" selected>2<\/option>/, 'receipt mode should default to two receipts per page');
  assert.match(html, /function pdfSplitSetReceiptProgress\s*\(/, 'receipt mode should expose progress updates');
  assert.match(html, /PDF_SPLIT_OCR_TIMEOUT_MS\s*=\s*15000/, 'OCR should have a bounded wait');
  const execute = html.slice(html.indexOf('async function pdfSplitExecute'), html.indexOf('\nlet pdfSplitResults=[]'));
  assert.match(execute, /pdfSplitSetReceiptProgress\(/, 'execute should report receipt progress');
  assert.match(execute, /pdfSplitDetectReceiptGapsFromImage\(canvas,canvas\.width,canvas\.height,manualCount\)/, 'execute should prefer image detection before single-receipt fallback');
});

test('receipt UI recommends template splitting and reuses one OCR pass per image page', () => {
  const html = source();
  assert.match(html, /class="pdf-split-mode-picker"/, 'split modes should use the compact picker layout');
  assert.match(html, /按页拆分/, 'page splitting should have a concise label');
  assert.match(html, /自动识别回单/, 'automatic receipt splitting should have a concise label');
  assert.match(html, /模板框选/, 'manual template splitting should have a concise label');
  assert.match(html, /class="pdf-split-mode-hint"/, 'the recommendation should be separated from the mode buttons');
  assert.match(html, /自动识别适合版式不固定[^<]*速度较慢/, 'automatic mode should explain its speed tradeoff');
  assert.match(html, /id="pdfSplitTemplateOcr" checked/, 'template mode should enable OCR naming by default');
  assert.match(html, /关闭识别.*加速/, 'template mode should explain how to opt out of OCR');
  assert.match(html, /模板模式默认.*识别内容并命名/, 'template mode should explain its recognition default');
  const execute = html.slice(html.indexOf('async function pdfSplitExecute'), html.indexOf('\nlet pdfSplitResults=[]'));
  assert.match(execute, /pagePaddleOcr/, 'execute should keep a page-level OCR result');
  assert.match(execute, /pdfSplitPaddleResultForCrop\(pagePaddleOcr/, 'each crop should reuse the page-level OCR result');
  assert.match(execute, /pdfSplitOcrReceiptCanvas\(cc,cropLines,layoutFields,cropPaddleOcr\)/, 'receipt OCR should accept the shared crop result');
  assert.match(execute, /templateOcrEnabled/, 'template mode should keep an explicit OCR switch');
  assert.match(execute, /templateOcrEnabled\s*\?\s*await pdfSplitOcrReceiptCanvas/, 'template mode should recognize when OCR is enabled');
  const reset = html.slice(html.indexOf('function pdfSplitReset'), html.indexOf('\nfunction pdfSplitClearUpload', html.indexOf('function pdfSplitReset')));
  assert.match(reset, /getElementById\('pdfSplitTemplateOcr'\)\.checked=true/, 'reset should restore the recognition default');
});

test('template selection clearly labels receipt order with hatched numbered overlays', () => {
  const html = source();
  assert.match(html, /id="templateSelectLegend"/, 'template selection should show an order legend');
  assert.match(html, /class="template-select-legend-item"/, 'legend entries should be visually grouped');
  assert.match(html, /function __tplDrawHatchedOverlay\s*\(/, 'selected regions should have a hatched overlay');
  assert.match(html, /function __tplDrawCircleBadge\s*\(/, 'selected regions should have circular number badges');
  assert.match(html, /__tplDrawHatchedOverlay\(r,color,i\+1\)/, 'confirmed regions should use numbered hatched overlays');
  assert.match(html, /__tplDrawCircleBadge\(r,color,i\+1\)/, 'confirmed regions should show their order number');
  assert.match(html, /__tplDrawCircleBadge\(__tplDragRect,color,__tplRects\.length\+1\)/, 'the region being drawn should preview its next order number');
});

test('Chinese uppercase amount restores a decimal point missed by OCR', () => {
  const { pdfSplitReconcileAmountWithChinese: reconcile } = loadAmountParser(source());
  const result = reconcile(
    { amount: '137900.00元', warning: '', source: '数字金额' },
    '金额（大写）壹仟叁佰柒拾玖元整'
  );
  assert.equal(result.amount, '1379.00元');
  assert.match(result.warning, /已按中文大写校正/);
  assert.equal(result.source, '中文大写金额校正');
});

test('actual Suci fixed amount cells accept standalone OCR numbers', () => {
  const { pdfSplitExtractFixedAmountInfo: parse } = loadFixedAmountParser(source());
  assert.equal(parse(['850.00']).amount, '850.00元');
  assert.equal(parse(['55.25']).amount, '55.25元');
  assert.equal(parse(['1379.00']).amount, '1379.00元');
});

test('trusted ABC fixed cells override plausible but wrong full-page OCR names', () => {
  const { pdfSplitPreferFixedReceiptFields: prefer } = loadFixedPreference(source());
  const result = prefer(
    { payer: '四川久远银海软件股份有限公司', payee: 'Faty', amount: '137900.00元' },
    { payer: '四川杏林医药连锁有限责任公司眉山市苏祠街药店', payee: '张海琴', amount: '1379.00元' },
    true
  );
  assert.equal(result.payer, '四川杏林医药连锁有限责任公司眉山市苏祠街药店');
  assert.equal(result.payee, '张海琴');
  assert.equal(result.amount, '1379.00元');
});

test('fixed-position OCR still runs when full-receipt Tesseract returns no lines', () => {
  const html = source();
  const coordinator = html.slice(html.indexOf('async function pdfSplitOcrReceiptCanvas'), html.indexOf('function pdfSplitBuildReceiptBaseName'));
  assert.match(coordinator, /pdfSplitCreateFixedFieldOcrCanvases\(canvas\)/, 'coordinator creates standard field crops');
  const fullLineGuard = coordinator.indexOf('if(tess.lines?.length)');
  const fixedFallback = coordinator.indexOf('pdfSplitCreateFixedFieldOcrCanvases(canvas)');
  assert.ok(fixedFallback > fullLineGuard, 'fixed fallback follows the full OCR attempt');
  assert.match(
    coordinator,
    /if\(tess\.lines\?\.length\)\{[\s\S]*?\n        \}\n        \/\/ 农行标准回单[\s\S]*?pdfSplitCreateFixedFieldOcrCanvases\(canvas\)/,
    'fixed fallback is not trapped inside the non-empty full OCR branch'
  );
});

test('unrecognized party names expose compact OCR diagnostics in the preview', () => {
  const html = source();
  const coordinator = html.slice(html.indexOf('async function pdfSplitOcrReceiptCanvas'), html.indexOf('function pdfSplitBuildReceiptBaseName'));
  assert.match(coordinator, /partyOcrDebug/, 'OCR coordinator records party-name diagnostic boundaries');
  const preview = html.slice(html.indexOf('function pdfSplitRenderResults'), html.indexOf('function pdfSplitShowPreview'));
  assert.match(preview, /名称诊断：/, 'receipt preview renders diagnostics only when needed');
  assert.match(preview, /r\.fields\.partyOcrDebug/, 'preview reads the receipt diagnostic field');
});

test('receipt result preview does not clip party fields below the thumbnail row', () => {
  const renderer = source().slice(source().indexOf('function pdfSplitRenderResults'), source().indexOf('function pdfSplitDataUrlToBytes'));
  assert.match(renderer, /previewThumbs\.style\.maxHeight=isReceiptLike\?'none':'300px'/, 'receipt-like modes expand the result area for field metadata');
  assert.match(renderer, /previewThumbs\.style\.overflowY=isReceiptLike\?'visible':'auto'/, 'receipt metadata remains visible instead of scrolling under the export controls');
});

test('receipt results default to JPG image export', () => {
  const { formatInputs, elements } = renderPdfSplitResults(source(), 'receipt');
  assert.equal(formatInputs.jpg.checked, true);
  assert.equal(elements.pdfSplitExportName.placeholder, 'JPG 文件名');
});

test('canonical entry sends the original receipt crop to OCR so small party labels survive', () => {
  for (const file of canonicalFiles) {
    const html = source(file);
    const receiptLoop = html.slice(html.indexOf('for(let n=0;n<receiptCrops.length;n++)'), html.indexOf('const baseName=pdfSplitBuildReceiptBaseName'));
    assert.match(receiptLoop, /pdfSplitOcrReceiptCanvas\(cc,cropLines,layoutFields,cropPaddleOcr\)/, `${file} OCR uses the original crop`);
    assert.doesNotMatch(receiptLoop, /pdfSplitOcrReceiptCanvas\(processed,cropLines,layoutFields\)/, `${file} must not OCR the destructive preprocessing output`);
  }
});

test('legacy local entry redirects to the canonical application without duplicating business code', () => {
  const html = source(legacyFile);
  assert.match(html, /new URL\('index\.html',\s*location\.href\)/, 'legacy entry redirects to sibling index.html');
  assert.match(html, /<a[^>]+href="index\.html"/i, 'legacy entry has a no-script fallback link');
  assert.doesNotMatch(html, /function\s+pdfSplit/, 'legacy entry must not include receipt business functions');
  assert.match(source('index.html'), /async function pdfSplitOcrReceiptCanvas/, 'canonical entry keeps receipt business code');
});
