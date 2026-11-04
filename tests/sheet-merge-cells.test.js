const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function loadMergeRangeHelper() {
  const start = html.indexOf('function sheetNormalizeMergeRange(');
  const end = html.indexOf('\nfunction sheetMerge(', start);
  assert.ok(start >= 0, 'sheet merge range helper should exist');
  assert.ok(end > start, 'sheet merge range helper should end before sheetMerge');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.api={sheetMapMergedRanges};`, context);
  return context.api.sheetMapMergedRanges;
}

function runSheetMerge(sheetData) {
  const start = html.indexOf('function sheetNormalizeMergeRange(');
  const end = html.indexOf('\nfunction sheetExportXLSX(', start);
  assert.ok(start >= 0 && end > start, 'sheet merge implementation should be extractable');
  const elements = {
    sheetNoHeader: { checked: false },
    sheetHeaderRows: { value: '1' },
    sheetAddSource: { checked: false },
    sheetSourceText: { value: '' },
    sheetSkipEmpty: { checked: true },
    sheetDedupe: { checked: false },
    sheetAlignByName: { checked: false },
    sheetHeaderKeyRow: { value: '1' },
    sheetJoinKey: { value: '' },
    sheetStats: { innerHTML: '' },
    sheetPreviewTable: { innerHTML: '' },
    sheetResultCard: { style: {}, scrollIntoView() {} }
  };
  const context = {
    sheetData,
    sheetMergedData: null,
    document: {
      getElementById(id) { return elements[id] || (elements[id] = { value: '', checked: false, style: {} }); },
      querySelector(selector) {
        if (selector.includes('sheetMergeDirection')) return { value: 'append' };
        if (selector.includes('sheetSourceMode')) return { value: 'auto' };
        return null;
      }
    },
    showToast() {},
    esc(value) { return String(value ?? ''); },
    fmtCell(value) { return String(value ?? ''); },
    centerMergedCells() {},
    autoFitCols() {}
  };
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.api={sheetMerge};`, context);
  context.api.sheetMerge();
  return context.sheetMergedData;
}

test('sheet append maps source merge ranges to their new output rows', () => {
  const sheetMapMergedRanges = loadMergeRangeHelper();
  const ranges = sheetMapMergedRanges([
    {
      merges: [
        { s: { r: 0, c: 1 }, e: { r: 0, c: 2 } },
        { s: { r: 1, c: 0 }, e: { r: 2, c: 1 } }
      ]
    },
    {
      merges: [{ s: { r: 1, c: 0 }, e: { r: 2, c: 1 } }]
    }
  ], {
    headerRows: 1,
    rowMaps: [new Map([[1, 1], [2, 2]]), new Map([[1, 3], [2, 4]])],
    columnMaps: [new Map([[0, 0], [1, 1], [2, 2]]), new Map([[0, 0], [1, 1]])]
  });

  assert.deepEqual(JSON.parse(JSON.stringify(ranges)), [
    { s: { r: 0, c: 1 }, e: { r: 0, c: 2 } },
    { s: { r: 1, c: 0 }, e: { r: 2, c: 1 } },
    { s: { r: 3, c: 0 }, e: { r: 4, c: 1 } }
  ]);
});

test('sheet append skips a merge when an ignored row breaks its continuity', () => {
  const sheetMapMergedRanges = loadMergeRangeHelper();
  const ranges = sheetMapMergedRanges([
    { merges: [{ s: { r: 1, c: 0 }, e: { r: 3, c: 0 } }] }
  ], {
    headerRows: 1,
    rowMaps: [new Map([[1, 1], [3, 2]])],
    columnMaps: [new Map([[0, 0]])]
  });

  assert.deepEqual(JSON.parse(JSON.stringify(ranges)), []);
});

test('sheet append keeps blank continuation rows that belong to a merged cell', () => {
  const result = runSheetMerge([{
    name: 'Sheet1',
    selected: true,
    data: [['标题'], ['已合并'], ['']],
    merges: [{ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }]
  }]);

  assert.deepEqual(JSON.parse(JSON.stringify(result.rows)), [['已合并'], ['']]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.merges)), [
    { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }
  ]);
});

test('sheet merge stores and exports preserved merge ranges in append mode', () => {
  assert.match(html, /merges=Array\.isArray\(ws\['!merges'\]\)/);
  assert.match(html, /sheetMergedData=\{headers,rows,merges:sheetMapMergedRanges/);
  assert.match(html, /ws\['!merges'\]=sheetMergedData\.merges/);
  assert.match(html, /上下追加会保留原表中可对应的合并单元格/);
});
