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
  const start = html.indexOf('function pdfSplitRequiredReceiptFields(');
  const end = html.indexOf('async function pdfSplitOcrReceiptCanvas(', start);
  assert.notEqual(start, -1, 'pure OCR helpers should exist');
  assert.ok(end > start, 'pure OCR helper block should end before the coordinator');
  const snippets = html.slice(start, end);
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${snippets}\nthis.api={pdfSplitRequiredReceiptFields,pdfSplitMissingReceiptFields,pdfSplitMergeMissingReceiptFields};`, context);
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
});

test('canonical entry uses the pre-Paddle Tesseract receipt path', () => {
  for (const file of canonicalFiles) {
    const html = source(file);
    assert.match(html, /function pdfSplitRunTesseractOcr\s*\(/, `${file} Tesseract adapter`);
    const coordinator = html.slice(html.indexOf('async function pdfSplitOcrReceiptCanvas'), html.indexOf('function pdfSplitBuildReceiptBaseName'));
    assert.doesNotMatch(coordinator, /pdfSplitRunPaddleOcr/, `${file} must not wait for Paddle before Tesseract`);
    assert.match(coordinator, /pdfSplitRunTesseractOcr/, `${file} should use Tesseract when text fields are missing`);
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
  }
});

test('canonical entry sends the original receipt crop to OCR so small party labels survive', () => {
  for (const file of canonicalFiles) {
    const html = source(file);
    const receiptLoop = html.slice(html.indexOf('for(let n=0;n<receiptCrops.length;n++)'), html.indexOf('const baseName=pdfSplitBuildReceiptBaseName'));
    assert.match(receiptLoop, /pdfSplitOcrReceiptCanvas\(cc,cropLines,layoutFields\)/, `${file} OCR uses the original crop`);
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
