const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function loadHelpers() {
  const start = html.indexOf('function multiGroupSheetsByName(');
  const end = html.indexOf('\nfunction multiMerge(', start);
  assert.ok(start >= 0, 'same-name Sheet grouping helper should exist');
  assert.ok(end > start, 'grouping helper block should end before multiMerge');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.api={multiGroupSheetsByName,multiUniqueSheetName};`, context);
  return context.api;
}

test('same-named sheets are grouped separately in first-seen order', () => {
  const { multiGroupSheetsByName } = loadHelpers();
  const groups = multiGroupSheetsByName([
    { fileName: 'A.xlsx', sheetName: 'Sheet1', data: [[1]] },
    { fileName: 'A.xlsx', sheetName: 'Sheet2', data: [[2]] },
    { fileName: 'B.xlsx', sheetName: 'Sheet1', data: [[3]] },
    { fileName: 'B.xlsx', sheetName: 'Sheet2', data: [[4]] }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(groups.map(group => group.name))), ['Sheet1', 'Sheet2']);
  assert.deepEqual(JSON.parse(JSON.stringify(groups.map(group => group.sheets.map(sheet => sheet.data[0][0])))), [[1, 3], [2, 4]]);
});

test('export worksheet names are legal, short, and unique', () => {
  const { multiUniqueSheetName } = loadHelpers();
  const used = new Set();
  const first = multiUniqueSheetName('月度/汇总:*?[]超长工作表名称1234567890', used);
  const second = multiUniqueSheetName('月度/汇总:*?[]超长工作表名称1234567890', used);
  assert.ok(first.length <= 31);
  assert.ok(second.length <= 31);
  assert.doesNotMatch(first, /[\\/:*?\[\]]/);
  assert.notEqual(first, second);
});

test('grouped mode has a separate-sheet option and exports every grouped result', () => {
  assert.match(html, /name="multiOutputMode" value="single" checked/);
  assert.match(html, /name="multiOutputMode" value="grouped"/);
  assert.match(html, /multiMergedData\.results\.forEach/);
  assert.match(html, /CSV 不支持多个工作表/);
});
