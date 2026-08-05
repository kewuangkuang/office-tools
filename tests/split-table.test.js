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
  const context = { document: { getElementById: id => ({ value: values[id] }) } };
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.api={splitReadInt, splitGetMaxCols};`, context);
  return context.api;
}

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
