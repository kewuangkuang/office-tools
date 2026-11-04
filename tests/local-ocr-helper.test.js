const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const helperDir = path.join(root, 'ocr-local-helper');
const serverPath = path.join(helperDir, 'server.py');
const requirementsPath = path.join(helperDir, 'requirements.txt');
const localLauncherPath = path.join(helperDir, 'start-local.command');
const windowsLauncherPath = path.join(helperDir, 'start-windows.bat');
const indexPath = path.join(root, 'index.html');
const readmePath = path.join(root, 'README.md');
const helperReadmePath = path.join(helperDir, 'README.md');

test('local OCR helper exposes loopback health and ordered batch OCR endpoints', () => {
  assert.ok(fs.existsSync(serverPath), 'local OCR helper server is missing');
  const source = fs.readFileSync(serverPath, 'utf8');

  assert.match(source, /@app\.get\(['"]\/health['"]/);
  assert.match(source, /@app\.post\(['"]\/v1\/ocr\/batch['"]/);
  assert.match(source, /PP-OCRv5_server_det/);
  assert.match(source, /PP-OCRv5_server_rec/);
  assert.match(source, /127\.0\.0\.1/);
  assert.match(source, /MAX_BATCH/);
  assert.match(source, /results/);
});

test('local OCR helper declares its Python web and image dependencies', () => {
  assert.ok(fs.existsSync(requirementsPath), 'local OCR helper requirements are missing');
  const requirements = fs.readFileSync(requirementsPath, 'utf8');

  assert.match(requirements, /^fastapi/m);
  assert.match(requirements, /^uvicorn/m);
  assert.match(requirements, /^python-multipart/m);
  assert.match(requirements, /^Pillow/m);
  assert.match(requirements, /^numpy/m);
  assert.match(requirements, /^paddleocr/m);
  assert.match(requirements, /^paddlepaddle/m);
});

test('local launcher serves this workspace and starts only loopback services', () => {
  assert.ok(fs.existsSync(localLauncherPath), 'local launcher is missing');
  const source = fs.readFileSync(localLauncherPath, 'utf8');

  assert.match(source, /start-macos\.command/);
  assert.match(source, /http\.server/);
  assert.match(source, /--bind 127\.0\.0\.1/);
  assert.match(source, /index\.html/);
  assert.doesNotMatch(source, /kewuangkuang\.github\.io/);
});

test('Windows launcher serves the local workspace and starts the loopback OCR helper', () => {
  assert.ok(fs.existsSync(windowsLauncherPath), 'Windows launcher is missing');
  const source = fs.readFileSync(windowsLauncherPath, 'utf8');

  assert.match(source, /py\s+-%%P/);
  assert.match(source, /3\.13 3\.12 3\.11 3\.10/);
  assert.match(source, /http\.server/);
  assert.match(source, /server:app/);
  assert.match(source, /127\.0\.0\.1/);
  assert.doesNotMatch(source, /0\.0\.0\.0/);
  assert.doesNotMatch(source, /kewuangkuang\.github\.io/);
});

test('local package manifest includes the frontend, models, helper and launchers', () => {
  assert.ok(fs.existsSync(indexPath), 'index.html is missing');
  const source = fs.readFileSync(indexPath, 'utf8');

  assert.match(source, /LOCAL_PACKAGE_FILES\s*=\s*\[/);
  [
    'index.html',
    'ocr-models/PP-OCRv5_mobile_det_onnx_infer.tar',
    'ocr-models/PP-OCRv5_mobile_rec_onnx_infer.tar',
    'ocr-models/tesseract/chi_sim.traineddata',
    'ocr-models/tesseract/eng.traineddata',
    'ocr-models/tesseract/tesseract.min.js',
    'ocr-models/tesseract/worker.min.js',
    'ocr-models/tesseract/tesseract-core-simd-lstm.wasm.js',
    'ocr-local-helper/server.py',
    'ocr-local-helper/start-macos.command',
    'ocr-local-helper/start-local.command',
    'ocr-local-helper/start-windows.bat',
    'ocr-local-helper/requirements.txt',
    'ocr-local-helper/README.md',
    'LICENSE'
  ].forEach(file => assert.match(source, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
  assert.match(source, /start-macos\.command', name: 'ocr-local-helper\/start-macos\.command', mode: 0o100755/);
  assert.match(source, /start-local\.command', name: 'ocr-local-helper\/start-local\.command', mode: 0o100755/);
});

test('local version button downloads a complete ZIP instead of one HTML file', () => {
  const source = fs.readFileSync(indexPath, 'utf8');
  assert.match(source, /title="下载包含本地 OCR 助手的 ZIP"/);
  const start = source.indexOf('async function downloadLocalVersion()');
  const end = source.indexOf('\ninitLocalMode();', start);
  assert.ok(start >= 0 && end > start, 'downloadLocalVersion should exist');
  const functionSource = source.slice(start, end);

  assert.match(functionSource, /fetch\(new URL\(item\.path, document\.baseURI\)/);
  assert.match(functionSource, /buildZip\(entries\)/);
  assert.match(functionSource, /办公工具箱本地版\.zip/);
  assert.doesNotMatch(functionSource, /excel-tools\.html/);
  assert.match(functionSource, /window\.location\.protocol === 'file:'/);
});

test('local version download fetches binary assets and passes them to the ZIP builder', async () => {
  const source = fs.readFileSync(indexPath, 'utf8');
  const start = source.indexOf('const LOCAL_PACKAGE_ROOT =');
  const end = source.indexOf('\ninitLocalMode();', start);
  assert.ok(start >= 0 && end > start, 'local package download code should exist');

  const button = { innerHTML: '<i>download</i>', disabled: false, textContent: '' };
  const anchor = { click() {} };
  const fetched = [];
  let zipEntries = null;
  const context = {
    window: { location: { protocol: 'http:' } },
    document: {
      baseURI: 'http://127.0.0.1:8766/index.html',
      documentElement: { outerHTML: '<html><body>test</body></html>' },
      getElementById: () => button,
      createElement: () => anchor,
      body: { appendChild() {}, removeChild() {} }
    },
    TextEncoder,
    fetch: async url => {
      fetched.push(String(url));
      return { ok: true, arrayBuffer: async () => Uint8Array.from([fetched.length]).buffer };
    },
    buildZip: entries => {
      zipEntries = entries;
      return new Blob([Uint8Array.from([80, 75])], { type: 'application/zip' });
    },
    URL: Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL() {} }),
    showToast() {},
    console
  };
  vm.createContext(context);
  vm.runInContext(`${source.slice(start, end)}\nthis.run=downloadLocalVersion;`, context);

  await context.run();

  assert.ok(Array.isArray(zipEntries));
  assert.equal(zipEntries.length, 16);
  assert.equal(zipEntries[0].name, '办公工具箱本地版/index.html');
  assert.ok(zipEntries[0].data instanceof Uint8Array);
  assert.equal(zipEntries[1].name, '办公工具箱本地版/ocr-models/PP-OCRv5_mobile_det_onnx_infer.tar');
  assert.equal(fetched.length, 15, 'only the live index should avoid a fetch');
  assert.equal(anchor.download, '办公工具箱本地版.zip');
  assert.equal(button.disabled, false);
  assert.equal(button.innerHTML, '<i>download</i>');
});

test('documentation explains how to install and verify the downloadable local OCR version', () => {
  const readme = fs.readFileSync(readmePath, 'utf8');
  const helperReadme = fs.readFileSync(helperReadmePath, 'utf8');

  assert.match(readme, /办公工具箱本地版\.zip/);
  assert.match(readme, /start-local\.command/);
  assert.match(readme, /start-windows\.bat/);
  assert.match(readme, /本地 PaddleOCR Server/);
  assert.match(helperReadme, /127\.0\.0\.1:8766\/index\.html/);
  assert.match(helperReadme, /start-windows\.bat/);
  assert.match(helperReadme, /不上传到作者服务器或第三方 OCR 服务|图片只在本机/);
});
