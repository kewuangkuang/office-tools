const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

test('multi-file merge exposes one-click selection for common sheet names', () => {
  assert.match(html, /id="multiSheetNameBatch"/);
  assert.match(html, /共有工作表/);
  assert.match(html, /multiSelectOnlyByName/);
  assert.match(html, /const commonArr=Array\.from\(common\)/);
});

test('multi-file merge exposes position and keyword sheet selection shortcuts', () => {
  assert.match(html, /按位置选择/);
  assert.match(html, /第\$\{index\+1\}个 Sheet/);
  assert.match(html, /id="multiSheetKeyword"/);
  assert.match(html, /multiSelectByKeyword/);
  assert.match(html, /multiSelectByPosition/);
  assert.match(html, /placeholder="例如：8月"/);
  assert.doesNotMatch(html, /placeholder="例如：杏林"/);
});

test('position and keyword shortcuts select the intended sheets across files', () => {
  const start = html.indexOf('function multiSelectByPosition(');
  const end = html.indexOf('\nlet currentPreviewKey', start);
  assert.ok(start >= 0 && end > start);
  const context = {
    multiFiles: [
      { sheets: [{ name: '杏林1', selected: false }, { name: '杏林2', selected: false }] },
      { sheets: [{ name: '杏林', selected: false }, { name: '华信', selected: false }] },
      { sheets: [{ name: '华信数据', selected: false }, { name: '杏林数据', selected: false }] }
    ],
    multiResetNameBtnState() {},
    multiRenderSheetSelector() {},
    showToast() {}
  };
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.api={multiSelectByPosition,multiSelectByKeyword};`, context);
  context.api.multiSelectByPosition(0);
  assert.deepEqual(JSON.parse(JSON.stringify(context.multiFiles.map(file => file.sheets.map(sheet => sheet.selected)))), [
    [true, false],
    [true, false],
    [true, false]
  ]);
  context.api.multiSelectByKeyword('杏林');
  assert.deepEqual(JSON.parse(JSON.stringify(context.multiFiles.map(file => file.sheets.map(sheet => sheet.selected)))), [
    [true, true],
    [true, false],
    [false, true]
  ]);
});
