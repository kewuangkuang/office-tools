const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function loadHorizontalJoin() {
  const start = html.indexOf('function multiBuildHorizontalJoin(');
  const end = html.indexOf('\nfunction multiBuildMergedResult(', start);
  assert.ok(start >= 0, 'horizontal join helper should exist');
  assert.ok(end > start, 'horizontal join helper should end before vertical merge helper');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.api={multiBuildHorizontalJoin};`, context);
  return context.api.multiBuildHorizontalJoin;
}

test('Book1 and Book2 can be joined by 公司名称 into the Book3 layout', () => {
  const multiBuildHorizontalJoin = loadHorizontalJoin();
  const result = multiBuildHorizontalJoin([
    {
      fileName: 'Book1.xlsx',
      sheetName: 'Sheet1',
      data: [
        ['公司名称', '金额1'],
        ['a公司', 100],
        ['b公司', 200],
        ['c公司', 300],
        ['d公司', 400]
      ]
    },
    {
      fileName: 'Book2.xlsx',
      sheetName: 'Sheet1',
      data: [
        ['部门', '公司名称', '金额2'],
        [111, 'a公司', 99],
        [222, 'b公司', 199],
        [333, 'c公司', 299],
        [444, 'd公司', 399]
      ]
    }
  ], {
    headerRows: 1,
    headerKeyRow: 1,
    joinKey: '公司名称',
    skipEmpty: true
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    headers: ['部门', '公司名称', '金额1', '金额2'],
    rows: [
      [111, 'a公司', 100, 99],
      [222, 'b公司', 200, 199],
      [333, 'c公司', 300, 299],
      [444, 'd公司', 400, 399]
    ],
    headerRows_raw: [['部门', '公司名称', '金额1', '金额2']]
  });
});

test('multi-file merge exposes horizontal join and match-column controls', () => {
  assert.match(html, /name="multiMergeDirection" value="append" checked/);
  assert.match(html, /name="multiMergeDirection" value="join"/);
  assert.match(html, /id="multiJoinKey"/);
  assert.match(html, /multiBuildHorizontalJoin\(group\.sheets/);
});

test('Sheet merge reuses horizontal join with the same result-based controls', () => {
  assert.match(html, /name="sheetMergeDirection" value="append" checked/);
  assert.match(html, /name="sheetMergeDirection" value="join"/);
  assert.match(html, /id="sheetJoinKey"/);
  assert.match(html, /function sheetRefreshJoinKeyOptions\(\)/);
  assert.match(html, /const joined=multiBuildHorizontalJoin\(sel\.map/);
  assert.match(html, /class="merge-choice-title">按字段匹配/);
});

test('merge choices explain the visible result without database terminology', () => {
  assert.match(html, /class="merge-choice-title">上下追加/);
  assert.match(html, /class="merge-choice-badge">行增加/);
  assert.match(html, /class="merge-choice-title">按字段匹配/);
  assert.match(html, /class="merge-choice-badge">列增加/);
});

test('header and export settings use examples users can recognize from their sheets', () => {
  assert.match(html, /输出工作表/);
  assert.match(html, /全部放在一个工作表/);
  assert.match(html, /表头行数/);
  assert.match(html, /字段名行/);
  assert.match(html, /表头预览/);
  assert.match(html, /字段名：第 '\+\(keyIndex\+1\)\+' 行/);
  assert.match(html, /function multiUpdateHeaderGuidance\(\)/);
});
