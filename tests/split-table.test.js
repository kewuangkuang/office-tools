const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function loadSplitHelpers(values = {}) {
  const start = html.indexOf('function splitReadInt(');
  const end = html.indexOf('\nfunction splitSetMode(', start);
  assert.ok(start >= 0, 'split input helpers should exist');
  assert.ok(end > start, 'split input helpers should end before mode controls');
  const decodeColumn = column => {
    let result = 0;
    for (const char of column) result = result * 26 + char.charCodeAt(0) - 64;
    return result - 1;
  };
  const encodeColumn = index => {
    let value = index + 1;
    let result = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      value = Math.floor((value - 1) / 26);
    }
    return result;
  };
  const xlsxUtils = {
    decode_cell: address => {
      const match = /^([A-Z]+)(\d+)$/.exec(address);
      return { c: decodeColumn(match[1]), r: Number(match[2]) - 1 };
    },
    decode_range: range => {
      const [startCell, endCell] = range.split(':');
      return { s: xlsxUtils.decode_cell(startCell), e: xlsxUtils.decode_cell(endCell) };
    },
    encode_range: range => `${encodeColumn(range.s.c)}${range.s.r + 1}:${encodeColumn(range.e.c)}${range.e.r + 1}`
  };
  const context = {
    document: { getElementById: id => ({ value: values[id] }) },
    XLSX: { utils: xlsxUtils }
  };
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.api={splitReadInt, splitGetMaxCols, splitGetDataRange, splitBuildPageGroups};`, context);
  return context.api;
}

test('table groups are ordered by print position across pages for easier cropping', () => {
  const { splitBuildPageGroups } = loadSplitHelpers();
  const groups = Array.from({ length: 40 }, (_, index) => `group-${index + 1}`);
  const expectedPages = Array.from({ length: 10 }, (_, pageIndex) => [
    `group-${pageIndex + 1}`,
    `group-${pageIndex + 11}`,
    `group-${pageIndex + 21}`,
    `group-${pageIndex + 31}`
  ]);

  const actualPages = JSON.parse(JSON.stringify(splitBuildPageGroups(groups, 4)));
  assert.deepEqual(actualPages, expectedPages);
});

test('table groups can keep the original page-first order when selected', () => {
  const { splitBuildPageGroups } = loadSplitHelpers();
  const groups = Array.from({ length: 8 }, (_, index) => `group-${index + 1}`);
  const actualPages = JSON.parse(JSON.stringify(splitBuildPageGroups(groups, 4, 'page')));

  assert.deepEqual(actualPages, [
    ['group-1', 'group-2', 'group-3', 'group-4'],
    ['group-5', 'group-6', 'group-7', 'group-8']
  ]);
});

test('split table UI exposes both page ordering choices and passes the selected order', () => {
  assert.match(html, /id="splitOrderOptions"/);
  assert.match(html, /onclick="splitSetOrder\('page'\)"/);
  assert.match(html, /splitBuildPageGroups\(tableGroups, tablesPerPage, splitOrder\)/);
});

test('split order choices have a clickable visual explanation', () => {
  assert.match(html, /id="splitOrderHelpTrigger"/);
  assert.match(html, /onclick="openSplitOrderHelp\(\)"/);
  assert.match(html, /id="splitOrderHelpModal"/);
  assert.match(html, /data-guide-order="position"/);
  assert.match(html, /data-guide-order="page"/);
  assert.match(html, /function openSplitOrderHelp\(\)/);
  assert.match(html, /function closeSplitOrderHelp\(/);
});

test('fixed-row splitting calculates max columns for large sheets without argument overflow', () => {
  const { splitGetMaxCols } = loadSplitHelpers();
  const dataRows = Array.from({ length: 130000 }, (_, i) => [i + 1, `row-${i + 1}`]);

  assert.equal(splitGetMaxCols([[['编号', '名称']], dataRows]), 2);
});

test('invalid split settings fall back to safe positive loop values', () => {
  const values = {
    splitCol: '-5',
    splitTablesPerPage: '0',
    splitRowsPerPage: 'not-a-number',
    splitHeaderRows: '0'
  };
  const { splitReadInt } = loadSplitHelpers(values);

  assert.equal(splitReadInt('splitCol', 10), 10);
  assert.equal(splitReadInt('splitTablesPerPage', 4), 4);
  assert.equal(splitReadInt('splitRowsPerPage', 52), 52);
  assert.equal(splitReadInt('splitHeaderRows', 1, 0), 0);
});

test('split range ignores a full-sheet selection that only contains formatting', () => {
  const { splitGetDataRange } = loadSplitHelpers();
  const worksheet = {
    '!ref': 'A1:D1048576',
    A1: { v: '标题' },
    D83: { v: 123 },
    A1048576: { s: 1 },
    D1048576: { s: 1 }
  };

  assert.equal(splitGetDataRange(worksheet), 'A1:D83');
});
