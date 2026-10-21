const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function loadMergedBuilder(settings = {}) {
  const start = html.indexOf('function multiNormalizeMergeRange(');
  const end = html.indexOf('\nfunction multiRenderMergedPreview(', start);
  assert.ok(start >= 0, 'multi merge-range helpers should exist');
  assert.ok(end > start, 'multi merge helpers should end before the preview renderer');
  const values = {
    multiNoHeader: { checked: false },
    multiHeaderRows: { value: '1' },
    multiHeaderKeyRow: { value: '1' },
    multiAddSource: { checked: false },
    multiSourceText: { value: '' },
    multiSkipEmpty: { checked: true },
    multiDedupe: { checked: false },
    multiAlignByName: { checked: false },
    multiMergeHdr: { checked: false },
    multiMergeHdrRows: { value: '1' },
    ...settings
  };
  const context = {
    headerRows_raw: null,
    document: {
      getElementById(id) { return values[id] || { checked: false, value: '' }; },
      querySelector(selector) {
        if (selector.includes('multiMergeDirection')) return { value: 'append' };
        if (selector.includes('multiSourceMode')) return { value: 'auto' };
        return null;
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.api={multiBuildMergedResult};`, context);
  return context.api.multiBuildMergedResult;
}

function book3AndBook4() {
  return [
    {
      fileName: 'Book3.xlsx',
      sheetName: 'Sheet1',
      data: [['a', 'b', 'c'], [1, 1, 1], ['', '', 2]],
      merges: [
        { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } },
        { s: { r: 1, c: 1 }, e: { r: 2, c: 1 } }
      ]
    },
    {
      fileName: 'Book4.xlsx',
      sheetName: 'Sheet1',
      data: [['a', 'b', 'c'], ['x', 'x', 'x'], ['', '', 'y']],
      merges: [
        { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } },
        { s: { r: 1, c: 1 }, e: { r: 2, c: 1 } }
      ]
    }
  ];
}

test('multi-file append reproduces Book5 rows and preserves source merges', () => {
  const build = loadMergedBuilder({ multiAlignByName: { checked: true } });
  const result = build(book3AndBook4());
  assert.deepEqual(JSON.parse(JSON.stringify(result.rows)), [
    [1, 1, 1],
    ['', '', 2],
    ['x', 'x', 'x'],
    ['', '', 'y']
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.merges)), [
    { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } },
    { s: { r: 1, c: 1 }, e: { r: 2, c: 1 } },
    { s: { r: 3, c: 0 }, e: { r: 4, c: 0 } },
    { s: { r: 3, c: 1 }, e: { r: 4, c: 1 } }
  ]);
});

test('ignored blank rows that continue a merged range stay in the append result', () => {
  const build = loadMergedBuilder();
  const result = build([{
    fileName: 'Book3.xlsx',
    sheetName: 'Sheet1',
    data: [['a', 'b'], ['value', 1], ['', 2]],
    merges: [{ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }]
  }]);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(result.merges)), [
    { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }
  ]);
});

test('worker parser carries native worksheet merge ranges into the selected sheet data', () => {
  const start = html.indexOf('function multiBuildWorkbookWorkerSource(');
  const end = html.indexOf('\nfunction multiCreateWorkbookWorker(', start);
  assert.ok(start >= 0 && end > start);
  const context = {
    XLSX: {
      read() {
        return { SheetNames: ['Sheet1'], Sheets: { Sheet1: {
          '!merges': [{ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }]
        } } };
      },
      utils: { sheet_to_json() { return [['a'], ['value'], ['']]; } }
    },
    self: { postMessage(message) { this.result = message; } }
  };
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.api={multiBuildWorkbookWorkerSource};`, context);
  const source = context.api.multiBuildWorkbookWorkerSource('/* bundled */');
  vm.runInContext(source, context);
  context.self.onmessage({ data: { buffer: new ArrayBuffer(8), keepFmt: false } });
  assert.deepEqual(JSON.parse(JSON.stringify(context.self.result.sheets[0].merges)), [
    { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }
  ]);
});

test('multi-file export writes mapped source merges together with optional title merges', () => {
  assert.match(html, /const merges=Array\.isArray\(result\.merges\)/);
  assert.match(html, /ws\['!merges'\]=merges\.filter/);
  assert.match(html, /保留合并区域/);
});
