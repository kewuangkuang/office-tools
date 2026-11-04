const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'index.html');
const extensionDir = path.join(root, 'receipt-card-pack-extension');
const corePath = path.join(extensionDir, 'core.js');
const extensionManifestPath = path.join(extensionDir, 'manifest.json');
const contentPath = path.join(extensionDir, 'content.js');
const popupPath = path.join(extensionDir, 'popup.html');
const popupScriptPath = path.join(extensionDir, 'popup.js');
const zipReaderPath = path.join(extensionDir, 'zip-reader.js');
const storagePath = path.join(extensionDir, 'storage.js');
const serviceWorkerPath = path.join(extensionDir, 'service-worker.js');
const binaryPath = path.join(extensionDir, 'binary.js');

test('PDF 拆分结果提供加入回单卡包入口', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /id="pdfSplitCardPackBtn"/);
  assert.match(html, /function pdfSplitBuildCardPackManifest/);
  assert.match(html, /function pdfSplitExportCardPack/);
});

test('拆分结果能生成可移植的回单卡包清单', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const start = html.indexOf('function pdfSplitBuildCardPackManifest');
  const end = html.indexOf('async function pdfSplitExportCardPack');
  assert.ok(start >= 0 && end > start, 'card pack manifest builder is missing');

  const source = html.slice(start, end);
  const context = { result: null };
  vm.runInNewContext(`${source}
    result = pdfSplitBuildCardPackManifest([
      { name: '7109.35.jpg', baseName: '7109.35', imgUrl: 'data:image/jpeg;base64,AAA', pageNum: 1, receiptIdx: 0, fields: { amount: '7109.35', date: '2026-08-25', payer: '付款方', payee: '收款方', serial: 'ABC123' } }
    ], '原始回单.pdf', 'pack-1');`, context);

  assert.equal(context.result.schema, 'receipt-card-pack');
  assert.equal(context.result.version, 1);
  assert.equal(context.result.cards.length, 1);
  assert.equal(context.result.cards[0].amount, '7109.35');
  assert.equal(context.result.cards[0].files.jpg, 'cards/001_7109.35.jpg');
  assert.equal(context.result.cards[0].files.pdf, 'cards/001_7109.35.pdf');
});

test('插件核心把不同金额写法归一化并优先精确匹配', () => {
  assert.ok(fs.existsSync(corePath), 'receipt card pack core is missing');
  const core = require(corePath);
  assert.equal(core.normalizeAmount('￥ 7,109.35'), '7109.35');
  assert.equal(core.normalizeAmount('7109.350元'), '7109.35');

  const results = core.searchCards([
    { id: 'a', amount: '7109.35', name: '7109.35.jpg' },
    { id: 'b', amount: '2912.00', name: '2912.00.jpg' },
    { id: 'c', amount: '7109.35', name: '7109.35_02.jpg' }
  ], '¥7,109.35');

  assert.deepEqual(results.map(card => card.id), ['a', 'c']);
  assert.ok(results.every(card => card.matchType === 'exact-amount'));
});

test('金额查询同时返回单张精确回单和合计相等的多张回单组合', () => {
  const core = require(corePath);
  const results = core.searchCards([
    { id: 'direct', amount: '300.00', name: '300.jpg' },
    { id: 'left', amount: '150.00', name: '150-1.jpg' },
    { id: 'right', amount: '150', name: '150-2.jpg' },
    { id: 'other', amount: '100.00', name: '100.jpg' }
  ], '300');

  assert.deepEqual(results.map(result => result.matchType), ['exact-amount', 'combined-amount']);
  assert.equal(results[0].id, 'direct');
  assert.equal(results[1].amount, '300.00');
  assert.deepEqual(results[1].cardIds, ['left', 'right']);
  assert.deepEqual(results[1].cards.map(card => card.id), ['left', 'right']);
});

test('插件界面支持展示并选择合计金额的多张回单组合', () => {
  const content = fs.readFileSync(contentPath, 'utf8');
  assert.match(content, /combined-amount/);
  assert.match(content, /Array\.isArray\(card\.cards\)/);
  assert.match(content, /input\.multiple/);
  assert.match(content, /Promise\.all/);
});

test('没有匹配回单时显示统一提示', () => {
  const content = fs.readFileSync(contentPath, 'utf8');
  assert.match(content, /未找到对应回单/);
  assert.doesNotMatch(content, /没有找到相同金额的回单/);
  assert.doesNotMatch(content, /没有找到完全相同金额的回单。/);
});

test('插件能从点击元素及其所在行提取金额查询词', () => {
  assert.ok(fs.existsSync(corePath), 'receipt card pack core is missing');
  const core = require(corePath);
  assert.equal(core.extractAmountFromText('报销金额合计\n¥ 7,109.35'), '7109.35');
  assert.equal(core.extractAmountFromText('7月电费'), '');
  assert.equal(core.extractAmountFromText('2026-08-25'), '');
});

test('点击补充回执单时按报销金额合计表头锁定同一行金额', () => {
  assert.ok(fs.existsSync(corePath), 'receipt card pack core is missing');
  const core = require(corePath);
  assert.equal(core.extractReceiptAmountFromTable(
    ['选择', '账号', '报销金额\n合计', '操作'],
    ['', '128', '¥ 912.01', '补充回执单'],
    '128 四川省林医药连锁… 912.01 补充回执单'
  ), '912.01');
});

test('插件内容脚本把补充回执单点击接入自动查找和图片结果展示', () => {
  const content = fs.readFileSync(contentPath, 'utf8');
  assert.match(content, /extractQueryFromReceiptAction/);
  assert.match(content, /补充回执单/);
  assert.match(content, /lookup\(query\)/);
  assert.match(content, /showPreviewImage/);
});

test('候选回单列表不再自动加载大图预览', () => {
  const content = fs.readFileSync(contentPath, 'utf8');
  assert.doesNotMatch(content, /\.inline-preview/);
  assert.doesNotMatch(content, /showInlinePreview/);
  assert.doesNotMatch(content, /receipt-card-pack-page-preview/);
});

test('仍可通过预览按钮按需打开单张回单', () => {
  const content = fs.readFileSync(contentPath, 'utf8');
  assert.match(content, /previewBtn/);
  assert.match(content, /showPreview\(card\)/);
});

test('浏览器插件包含卡包导入、网页读取和本地存储所需文件', () => {
  assert.ok(fs.existsSync(extensionManifestPath), 'extension manifest is missing');
  const manifest = JSON.parse(fs.readFileSync(extensionManifestPath, 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.background?.service_worker);
  assert.ok(manifest.content_scripts?.length);
  assert.ok(manifest.action?.default_popup);

  const requiredFiles = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...(manifest.content_scripts[0].js || [])
  ];
  for (const file of requiredFiles) {
    assert.ok(fs.existsSync(path.join(extensionDir, file)), `missing extension file: ${file}`);
  }
});

test('插件内容脚本提供点击金额、预览和填入上传框的动作', () => {
  assert.ok(fs.existsSync(contentPath), 'content script is missing');
  const content = fs.readFileSync(contentPath, 'utf8');
  assert.match(content, /extractQueryFromElement/);
  assert.match(content, /getAsset/);
  assert.match(content, /new DataTransfer/);
  assert.match(content, /input\.files/);
});

test('回单预览使用独立的大号悬浮窗口', () => {
  const content = fs.readFileSync(contentPath, 'utf8');
  assert.match(content, /id="rcp-preview-modal"/);
  assert.match(content, /class="preview-modal"/);
  assert.match(content, /id="rcp-preview-close"/);
  assert.match(content, /aria-modal="true"/);
  assert.match(content, /\.preview-modal\[hidden\]/);
});

test('回单卡包支持拖动并记住位置', () => {
  const content = fs.readFileSync(contentPath, 'utf8');
  assert.match(content, /pointerdown/);
  assert.match(content, /pointermove/);
  assert.match(content, /pointerup/);
  assert.match(content, /chrome\.storage\.local\.get/);
  assert.match(content, /chrome\.storage\.local\.set/);
});

test('插件弹窗提供带清理图标的卡包清理窗口', () => {
  const popup = fs.readFileSync(popupPath, 'utf8');
  const popupScript = fs.readFileSync(popupScriptPath, 'utf8');
  assert.match(popup, /id="cleanupButton"/);
  assert.match(popup, /🧹/);
  assert.match(popup, /id="cleanupModal"/);
  assert.match(popup, /aria-modal="true"/);
  assert.match(popup, /id="cleanupDelete"/);
  assert.match(popupScript, /function openCleanup/);
  assert.match(popupScript, /deletePack/);
});

test('插件附件通过 Base64 跨消息边界并可还原二进制', () => {
  assert.ok(fs.existsSync(binaryPath), 'binary transport helper is missing');
  const binary = require(binaryPath);
  const original = new Uint8Array([255, 216, 255, 217, 0, 1, 2, 3]);
  const encoded = binary.bytesToBase64(original);
  assert.deepEqual(Array.from(binary.base64ToBytes(encoded)), Array.from(original));

  const content = fs.readFileSync(contentPath, 'utf8');
  const serviceWorker = fs.readFileSync(serviceWorkerPath, 'utf8');
  assert.match(content, /base64ToBytes/);
  assert.match(content, /response\.dataBase64/);
  assert.match(serviceWorker, /bytesToBase64/);
  assert.match(serviceWorker, /dataBase64/);
});

test('卡包导入器能读取办公工具箱生成的无压缩 ZIP', () => {
  assert.ok(fs.existsSync(zipReaderPath), 'zip reader is missing');
  const reader = require(zipReaderPath);
  const bytes = new Uint8Array(30 + 5 + 3 + 22);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint32(18, 3, true);
  view.setUint32(22, 3, true);
  view.setUint16(26, 5, true);
  new TextEncoder().encodeInto('a.txt', bytes.subarray(30, 35));
  bytes.set([65, 66, 67], 35);
  view.setUint32(38, 0x06054b50, true);
  const files = reader.readStoreZip(bytes);
  assert.equal(files.get('a.txt')[0], 65);
  assert.equal(files.get('a.txt').length, 3);
});

test('PDF 工具导出的卡包 ZIP 能被插件完整读回', async () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const reader = require(zipReaderPath);
  const manifestStart = html.indexOf('function pdfSplitBuildCardPackManifest');
  const manifestEnd = html.indexOf('async function pdfSplitExportCardPack');
  const zipStart = html.indexOf('var _crcT=');
  const zipEnd = html.indexOf('async function renameDownloadZip');
  assert.ok(manifestStart >= 0 && manifestEnd > manifestStart, 'card pack manifest builder is missing');
  assert.ok(zipStart >= 0 && zipEnd > zipStart, 'zip builder is missing');

  const context = { Blob, TextEncoder, manifest: null, zip: null };
  vm.runInNewContext(`${html.slice(manifestStart, manifestEnd)}
    ${html.slice(zipStart, zipEnd)}
    manifest = pdfSplitBuildCardPackManifest([
      { name: '7109.35.jpg', baseName: '7109.35', pageNum: 1, receiptIdx: 0, bytes: new Uint8Array([9, 8]), fields: { amount: '7109.35', date: '2026-08-25', payer: '付款方', payee: '收款方', serial: 'ABC123' } }
    ], '原始回单.pdf', 'pack-roundtrip');
    zip = buildZip([
      { name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest)) },
      { name: manifest.cards[0].files.jpg, data: new Uint8Array([1, 2, 3]) },
      { name: manifest.cards[0].files.pdf, data: new Uint8Array([4, 5, 6]) }
    ]);`, context);

  const parsed = reader.readCardPackZip(new Uint8Array(await context.zip.arrayBuffer()));
  assert.equal(parsed.manifest.packId, 'pack-roundtrip');
  assert.deepEqual(Array.from(parsed.files.get('cards/001_7109.35.jpg')), [1, 2, 3]);
  assert.deepEqual(Array.from(parsed.files.get('cards/001_7109.35.pdf')), [4, 5, 6]);
});

test('PDF 卡包导出会尝试同步到已安装的回单卡包插件', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const start = html.indexOf('async function pdfSplitExportCardPack');
  const end = html.indexOf('async function pdfSplitDownload(){');
  assert.ok(start >= 0 && end > start, 'card pack export function is missing');
  const exportSource = html.slice(start, end);
  assert.match(html, /function pdfSplitTryAutoSyncCardPack/);
  assert.match(exportSource, /pdfSplitTryAutoSyncCardPack\(manifest,zip\)/);
  assert.match(html, /receipt-card-pack\.page-export/);
});

test('卡包导出以自动同步成功为主，未连接时才下载 ZIP', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const start = html.indexOf('async function pdfSplitExportCardPack');
  const end = html.indexOf('async function pdfSplitDownload(){');
  assert.ok(start >= 0 && end > start, 'card pack export function is missing');
  const exportSource = html.slice(start, end);
  assert.match(exportSource, /syncResult=await pdfSplitTryAutoSyncCardPack\(manifest,zip\)/);
  assert.match(exportSource, /if\(syncResult\?\.ok\)/);
  assert.match(exportSource, /pdfSplitDownloadCardPackZip\(zip,sourceBase\)/);
});

test('插件能接收网页导出的卡包并自动保存为当前卡包', () => {
  const manifest = JSON.parse(fs.readFileSync(extensionManifestPath, 'utf8'));
  const content = fs.readFileSync(contentPath, 'utf8');
  const serviceWorker = fs.readFileSync(serviceWorkerPath, 'utf8');
  const storage = fs.readFileSync(storagePath, 'utf8');
  const contentScripts = manifest.content_scripts?.[0]?.js || [];

  assert.ok(contentScripts.includes('zip-reader.js'), 'content script must read exported card packs');
  assert.match(content, /receipt-card-pack\.page-export/);
  assert.match(content, /readCardPackZip/);
  assert.match(content, /receipt-card-pack\.importStart/);
  assert.match(content, /receipt-card-pack\.importFile/);
  assert.match(content, /receipt-card-pack\.importComplete/);
  assert.match(serviceWorker, /receipt-card-pack\.importStart/);
  assert.match(serviceWorker, /receipt-card-pack\.importFile/);
  assert.match(serviceWorker, /receipt-card-pack\.importComplete/);
  assert.match(storage, /putPackManifest/);
  assert.match(storage, /putPackAsset/);
  assert.match(storage, /completePackImport/);
});
