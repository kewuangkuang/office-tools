const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function extract(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  assert.ok(start >= 0, `${startMarker} should exist`);
  assert.ok(end > start, `${endMarker} should follow ${startMarker}`);
  return html.slice(start, end);
}

function loadWorkerHelpers(overrides = {}) {
  const workerSource = extract(
    'function multiBuildWorkbookWorkerSource(',
    '\nasync function multiReadWorkbookFile('
  );
  const context = {
    Blob: class Blob {
      constructor(parts, options) { this.parts = parts; this.options = options; }
    },
    URL: {
      createObjectURL: () => 'blob:sheetjs-worker',
      revokeObjectURL: () => {}
    },
    Worker: function Worker() {},
    document: {
      getElementById: () => ({ textContent: 'var XLSX={read(){}};' })
    },
    setTimeout,
    clearTimeout,
    ...overrides
  };
  vm.createContext(context);
  vm.runInContext(
    `${workerSource}\nthis.api={multiBuildWorkbookWorkerSource,multiParseWorkbookBuffer};`,
    context
  );
  return context.api;
}

function loadClipboardHelper() {
  const source = extract(
    'function multiCollectClipboardFiles(',
    "\ndocument.addEventListener('paste'"
  );
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${source}\nthis.api={multiCollectClipboardFiles};`, context);
  return context.api;
}

test('SheetJS is identified for reuse and workbook parsing is absent from the main-thread reader', () => {
  assert.match(html, /<script id="sheetjs-inline">\/\* SheetJS inlined \*\//);
  const reader = extract('async function multiReadWorkbookFile(', '\nasync function multiHandleFiles(');
  assert.doesNotMatch(reader, /XLSX\.read\(/);
  assert.match(reader, /multiParseWorkbookBuffer\(buf,\s*keepFmt/);
});

test('worker source parses sheets without importing a network script', () => {
  const { multiBuildWorkbookWorkerSource } = loadWorkerHelpers();
  const source = multiBuildWorkbookWorkerSource('/* bundled-sheetjs */');
  assert.match(source, /^\/\* bundled-sheetjs \*\//);
  assert.match(source, /XLSX\.read\(/);
  assert.match(source, /sheet_to_json\(/);
  assert.doesNotMatch(source, /importScripts\s*\(/);
});

test('worker timeout terminates the worker and revokes its Blob URL', async () => {
  let terminated = 0;
  let revoked = 0;
  const worker = {
    postMessage() {},
    terminate() { terminated++; }
  };
  const { multiParseWorkbookBuffer } = loadWorkerHelpers({
    URL: {
      createObjectURL: () => 'blob:timeout-worker',
      revokeObjectURL: value => { assert.equal(value, 'blob:timeout-worker'); revoked++; }
    },
    Worker: function Worker() { return worker; }
  });

  await assert.rejects(
    multiParseWorkbookBuffer(new ArrayBuffer(8), false, { timeoutMs: 5 }),
    /文件解析超时/
  );
  assert.equal(terminated, 1);
  assert.equal(revoked, 1);
});

test('worker success transfers the buffer and returns sheet data', async () => {
  let transferList;
  const worker = {
    postMessage(message, transfer) {
      transferList = transfer;
      queueMicrotask(() => this.onmessage({
        data: { ok: true, sheets: [{ name: 'Sheet1', data: [['A']], selected: true }] }
      }));
    },
    terminate() {}
  };
  const { multiParseWorkbookBuffer } = loadWorkerHelpers({
    Worker: function Worker() { return worker; }
  });
  const buffer = new ArrayBuffer(8);
  const sheets = await multiParseWorkbookBuffer(buffer, false, { timeoutMs: 50 });
  assert.equal(transferList.length, 1);
  assert.equal(transferList[0], buffer);
  assert.deepEqual(JSON.parse(JSON.stringify(sheets)), [
    { name: 'Sheet1', data: [['A']], selected: true }
  ]);
});

test('clipboard collection falls back to files and reports unsupported file entries', () => {
  const { multiCollectClipboardFiles } = loadClipboardHelper();
  const xlsx = { name: 'A.xlsx', size: 10 };
  const pdf = { name: 'B.pdf', size: 20 };
  const fromFiles = multiCollectClipboardFiles({ items: [], files: [xlsx] });
  assert.deepEqual(Array.from(fromFiles.files), [xlsx]);
  assert.equal(fromFiles.fileItemCount, 1);

  const unsupported = multiCollectClipboardFiles({
    items: [{ kind: 'file', getAsFile: () => pdf }],
    files: []
  });
  assert.equal(unsupported.files.length, 0);
  assert.equal(unsupported.fileItemCount, 1);
});

test('multi-file queue is sequential and renders progress after each success', () => {
  const handler = extract('async function multiHandleFiles(', '\nfunction multiRenderFileList(');
  assert.doesNotMatch(handler, /Promise\.all\(/);
  assert.doesNotMatch(handler, /MULTI_SMALL_FILE_CONCURRENCY/);
  assert.match(handler, /正在后台解析/);
  assert.match(handler, /multiRenderFileList\(\)/);
});

test('paste handler gives actionable feedback for unsupported or unavailable files', () => {
  assert.match(html, /剪贴板中没有可读取的文件，请改用拖拽或“选择文件”/);
  assert.match(html, /剪贴板文件格式不支持，仅支持 \.xlsx、\.xls、\.csv/);
});
