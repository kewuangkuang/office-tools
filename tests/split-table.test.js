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
  vm.runInContext(`${html.slice(start, end)}\nthis.api={splitReadInt, splitGetMaxCols, splitGetDataRange, splitBuildPageGroups, splitBuildCutLayout};`, context);
  return context.api;
}

function runSplitExecute(data, rowsPerPage) {
  const elements = {
    splitHeaderRows: { value: '1' }, splitTablesPerPage: { value: '2' },
    splitRowsPerPage: { value: String(rowsPerPage) }, splitRowHeight: { value: '13.5' },
    splitMergeFirst: { checked: false }, splitFirstRowH: { value: '20' },
    splitCol: { value: '1' }, splitStats: { innerHTML: '' },
    splitPreviewTable: { innerHTML: '' }, splitCutGuideInfo: { style: {} },
    splitResultCard: { style: {}, scrollIntoView() {} }
  };
  const toasts = [];
  const context = {
    document: { getElementById: id => elements[id] },
    splitWB: { Sheets: { Sheet1: {} } }, splitSelectedSheet: 'Sheet1',
    splitMode: 'column', splitOrder: 'position', splitMergedData: null,
    inputData: data, showToast: (...args) => toasts.push(args),
    esc: value => String(value), fmtCell: value => String(value)
  };
  vm.createContext(context);
  const helpersStart = html.indexOf('function splitReadInt(');
  const helpersEnd = html.indexOf('\nfunction splitSetMode(', helpersStart);
  const executeStart = html.indexOf('function splitExecute()');
  const executeEnd = html.indexOf('\n// Auto-fit column widths utility', executeStart);
  vm.runInContext(html.slice(helpersStart, helpersEnd) + html.slice(executeStart, executeEnd), context);
  vm.runInContext('splitReadSheetData = () => inputData; splitExecute();', context);
  return { result: context.splitMergedData, elements, toasts };
}

function runSplitExport(result) {
  const worksheet = {
    rows: new Map(), columns: new Map(),
    getRow(number) {
      if (!this.rows.has(number)) {
        const row = { cells: new Map(), getCell(column) {
          if (!this.cells.has(column)) this.cells.set(column, {});
          return this.cells.get(column);
        }, addPageBreak() { this.hasPageBreak = true; } };
        this.rows.set(number, row);
      }
      return this.rows.get(number);
    },
    getColumn(number) {
      if (!this.columns.has(number)) this.columns.set(number, {});
      return this.columns.get(number);
    },
    mergeCells() {}
  };
  const elements = {
    splitExportName: { value: '' }, splitBorders: { checked: false },
    splitStyles: { checked: false }, splitRowHeight: { value: '13.5' },
    splitMarginTop: { value: '2.54' }, splitMarginBottom: { value: '2.54' },
    splitMarginLeft: { value: '1.91' }, splitMarginRight: { value: '1.91' }
  };
  const context = {
    splitMergedData: result, splitFileName: 'sample.xlsx',
    splitPaper: 'A4', splitOrient: 'portrait',
    document: { getElementById: id => elements[id] },
    ExcelJS: { Workbook: class {
      addWorksheet() { return worksheet; }
      xlsx = { writeBuffer: () => new Promise(() => {}) };
    } }
  };
  vm.createContext(context);
  const start = html.indexOf('function splitExport()');
  const end = html.indexOf('\nfunction splitReset()', start);
  vm.runInContext(html.slice(start, end) + '\nsplitExport();', context);
  return worksheet;
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

test('incomplete final pages keep all physical table slots', () => {
  const { splitBuildPageGroups } = loadSplitHelpers();
  const groups = Array.from({ length: 146 }, (_, index) => `group-${index + 1}`);
  const positionPages = JSON.parse(JSON.stringify(splitBuildPageGroups(groups, 4)));
  const pagePages = JSON.parse(JSON.stringify(splitBuildPageGroups(groups, 4, 'page')));

  assert.equal(positionPages.length, 37);
  assert.ok(positionPages.every(page => page.length === 4));
  assert.deepEqual(positionPages[34], ['group-35', 'group-72', 'group-109', 'group-146']);
  assert.deepEqual(positionPages[35], ['group-36', 'group-73', 'group-110', null]);
  assert.deepEqual(positionPages[36], ['group-37', 'group-74', 'group-111', null]);
  assert.deepEqual(pagePages[36], ['group-145', 'group-146', null, null]);
});

test('cut positions stay on the same rows when groups have different lengths', () => {
  const { splitBuildCutLayout } = loadSplitHelpers();
  const pages = [
    [[1, 2], [1, 2, 3, 4], [1]],
    [[1, 2, 3, 4, 5], [1], null]
  ];
  const layout = JSON.parse(JSON.stringify(splitBuildCutLayout(pages, 1, 18)));

  assert.equal(layout.requiredRows, 13);
  assert.deepEqual(layout.slotRows, [8, 7, 3]);
  assert.deepEqual(layout.cutRows, [8, 15]);
  assert.equal(layout.slotRows.reduce((sum, count) => sum + count, 0), 18);
  for (const page of pages) {
    page.forEach((group, slot) => {
      assert.ok(group === null || 1 + group.length <= layout.slotRows[slot]);
    });
  }
});

test('cut layout refuses pages that would split a long table', () => {
  const { splitBuildCutLayout } = loadSplitHelpers();
  const layout = JSON.parse(JSON.stringify(splitBuildCutLayout([[[1, 2, 3, 4], [1, 2, 3]]], 1, 8)));
  assert.equal(layout.requiredRows, 9);
  assert.deepEqual(layout.slotRows, []);
});

test('table output pads shorter groups and repeats each cut line at the same row', () => {
  const data = [['组', '值'],
    ['A', 1], ['A', 2], ['A', 3], ['A', 4],
    ['B', 1], ['C', 1], ['C', 2],
    ['D', 1], ['D', 2], ['D', 3]];
  const { result, elements } = runSplitExecute(data, 12);

  assert.equal(result.pages, 2);
  assert.equal(result.totalRows, 24);
  assert.deepEqual(Array.from(result.cutAfterRows), [7, 19]);
  assert.equal(result.rows[7][0], '组');
  assert.equal(result.rows[19][0], '组');
  assert.equal(result.isBlankRow[6], true);
  assert.equal(result.isBlankRow[18], true);
  assert.match(elements.splitPreviewTable.innerHTML, /split-cut-guide/);
  const worksheet = runSplitExport(result);
  for (const rowNumber of [7, 19]) {
    assert.equal(worksheet.getRow(rowNumber).getCell(1).value, '✂ 沿虚线裁剪');
    assert.equal(worksheet.getRow(rowNumber).getCell(1).border.bottom.style, 'mediumDashed');
    assert.equal(worksheet.getRow(rowNumber).getCell(2).border.bottom.style, 'mediumDashed');
  }
  assert.equal(worksheet.getRow(12).hasPageBreak, true);
});

test('table output stops when aligned slots cannot fit the selected page size', () => {
  const data = [['组'], ['A'], ['A'], ['A'], ['A'], ['B'], ['C'], ['C'], ['D'], ['D'], ['D']];
  const { result, toasts } = runSplitExecute(data, 8);

  assert.equal(result, null);
  assert.match(toasts.at(-1)[0], /至少需要 9 行/);
});

test('split table UI exposes both page ordering choices and passes the selected order', () => {
  assert.match(html, /id="splitOrderOptions"/);
  assert.match(html, /onclick="splitSetOrder\('page'\)"/);
  assert.match(html, /splitBuildPageGroups\(tableGroups, tablesPerPage, splitOrder\)/);
  assert.match(html, /splitBuildCutLayout\(pageGroupsList, headerRows, rowsPerPage\)/);
  assert.match(html, /appendBlankRows\(cutLayout\.slotRows\[gi\], mergeFirst && headerRows > 0\)/);
  assert.match(html, /cutAfterRows: Array\.from\(cutAfterRows\)/);
  assert.match(html, /沿虚线裁剪/);
  assert.match(html, /保留空白位置/);
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
