const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function loadHelpers() {
  const start = html.indexOf('function splitReadInt(');
  const end = html.indexOf('\nfunction splitSetMode(', start);
  assert.ok(start >= 0, 'split input helpers should exist');
  assert.ok(end > start, 'split input helpers should end before mode controls');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.api={splitBuildFieldSheets,splitUniqueSheetName,splitGetFieldColumnIndex};`, context);
  return context.api;
}

test('field splitting keeps first-seen groups and repeats the header rows in every sheet', () => {
  const { splitBuildFieldSheets } = loadHelpers();
  const headers = [['姓名', '部门', '金额']];
  const rows = [
    ['张三', '销售', 100],
    ['李四', '技术', 200],
    ['王五', '销售', 300]
  ];

  const sheets = splitBuildFieldSheets(headers, rows, 1);

  assert.deepEqual(JSON.parse(JSON.stringify(sheets.map(sheet => sheet.key))), ['销售', '技术']);
  assert.deepEqual(JSON.parse(JSON.stringify(sheets.map(sheet => sheet.rows))), [
    [headers[0], rows[0], rows[2]],
    [headers[0], rows[1]]
  ]);
});

test('field splitting keeps blank values and creates legal unique sheet names', () => {
  const { splitBuildFieldSheets } = loadHelpers();
  const headers = [['姓名', '部门']];
  const rows = [
    ['甲', 'History'],
    ['乙', ''],
    ['丙', "'研发"]
  ];

  const sheets = splitBuildFieldSheets(headers, rows, 1);
  const names = JSON.parse(JSON.stringify(sheets.map(sheet => sheet.name)));

  assert.equal(sheets.length, 3);
  assert.equal(sheets[1].key, '');
  assert.equal(sheets[1].rows.length, 2);
  assert.ok(names.every(name => name.length <= 31));
  assert.ok(names.every(name => !/[\\/:*?\[\]]/.test(name)));
  assert.ok(names.every(name => !name.startsWith("'") && !name.endsWith("'")));
  assert.ok(names.every(name => name.toLowerCase() !== 'history'));
  assert.equal(new Set(names).size, names.length);
});

test('field splitting allows a selected column that is entirely blank beyond the populated range', () => {
  const { splitGetFieldColumnIndex } = loadHelpers();

  assert.equal(splitGetFieldColumnIndex(3, 2, 50), 2);
  assert.equal(splitGetFieldColumnIndex(51, 2, 50), -1);
});

test('split table UI exposes the multiple-sheet mode and its export path', () => {
  assert.match(html, /id="splitRuleOptions"/);
  assert.match(html, /id="splitFieldOutputRow"/);
  assert.match(html, /id="splitFieldOutputOptions"/);
  assert.match(html, /id="splitFieldOutputOptions"[\s\S]*data-mode="sheets"/);
  assert.match(html, /onclick="splitSetMode\('sheets'\)"/);
  assert.match(html, /splitMergedData\.mode === 'sheets'/);
  assert.match(html, /addWorksheet\(sheet\.name\)/);
});

test('split mode selection keeps field output as a nested choice', () => {
  const start = html.indexOf('function splitSetMode(');
  const end = html.indexOf('\nfunction splitSetOrder(', start);
  assert.ok(start >= 0 && end > start, 'split mode controller should exist');

  const controls = {};
  const makeControl = () => ({ style: { display: '', setProperty(name, value) { this[name] = value; } } });
  ['splitResultCard', 'splitColLabel', 'splitCol', 'splitFieldOutputRow', 'splitPageSetupCard', 'splitTablesPerPageRow', 'splitOrderRow']
    .forEach(id => { controls[id] = makeControl(); });
  controls.splitCol.value = 1;

  const makeButton = mode => ({
    dataset: { mode },
    classList: { active: false, toggle(name, value) { if (name === 'active') this.active = value; } }
  });
  const ruleButtons = [makeButton('column'), makeButton('rows')];
  const outputButtons = [makeButton('column'), makeButton('sheets')];
  const document = {
    getElementById: id => controls[id],
    querySelectorAll: selector => selector === '#splitRuleOptions .nup-option' ? ruleButtons : outputButtons
  };
  const context = { document, splitWB: {}, splitMergedData: null, ruleButtons, outputButtons };
  vm.createContext(context);
  vm.runInContext(`let splitMode = 'column';\n${html.slice(start, end)}\nthis.api={set:splitSetMode,state:()=>({mode:splitMode,ruleButtons,outputButtons,outputDisplay:document.getElementById('splitFieldOutputRow').style.display,pageSetup:document.getElementById('splitPageSetupCard').style.display})};`, context);

  context.api.set('sheets');
  let state = context.api.state();
  assert.equal(state.mode, 'sheets');
  assert.deepEqual(JSON.parse(JSON.stringify(state.ruleButtons.map(button => button.classList.active))), [true, false]);
  assert.deepEqual(JSON.parse(JSON.stringify(state.outputButtons.map(button => button.classList.active))), [false, true]);
  assert.equal(state.outputDisplay, '');
  assert.equal(state.pageSetup, 'none');

  context.api.set('rows');
  state = context.api.state();
  assert.equal(state.outputDisplay, 'none');
  assert.deepEqual(JSON.parse(JSON.stringify(state.ruleButtons.map(button => button.classList.active))), [false, true]);
});
