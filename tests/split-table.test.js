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

function runSplitExecute(data, rowsPerPage, tablesPerPage = 2, headerRows = 1) {
  const elements = {
    splitHeaderRows: { value: String(headerRows) }, splitTablesPerPage: { value: String(tablesPerPage) },
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
  assert.deepEqual(layout.slotRows, [9, 7, 2]);
  assert.deepEqual(layout.cutRows, [9, 16]);
  assert.equal(layout.slotRows.reduce((sum, count) => sum + count, 0), 18);
  for (const page of pages) {
    page.forEach((group, slot) => {
      assert.ok(group === null || 1 + group.length <= layout.slotRows[slot]);
    });
  }
});

test('cut layout distributes spare rows between tables instead of below the last table', () => {
  const { splitBuildCutLayout } = loadSplitHelpers();
  const pages = [[['A'], ['B'], ['C'], ['D']]];
  const layout = JSON.parse(JSON.stringify(splitBuildCutLayout(pages, 1, 20)));

  assert.deepEqual(layout.slotRows, [6, 6, 6, 2]);
  assert.deepEqual(layout.cutRows, [6, 12, 18]);
  assert.equal(layout.slotRows[3], 2);
  assert.equal(layout.slotRows.reduce((sum, count) => sum + count, 0), 20);
});

test('incomplete pages preserve trailing empty slots for the fixed cutting layout', () => {
  const { splitBuildCutLayout } = loadSplitHelpers();
  const pages = [
    [['A'], ['B'], ['C'], ['D']],
    [['E'], ['F'], ['G'], null]
  ];
  const layout = JSON.parse(JSON.stringify(splitBuildCutLayout(pages, 1, 20)));

  assert.deepEqual(layout.pageLayouts[1].groups, [['E'], ['F'], ['G'], null]);
  assert.deepEqual(layout.pageLayouts[1].slotRows, [6, 6, 6, 2]);
  assert.deepEqual(layout.pageLayouts[1].cutRows, [6, 12, 18]);
  assert.equal(layout.pageLayouts[1].slotRows.reduce((sum, count) => sum + count, 0), 20);
});

test('split output preserves four slots on incomplete pages', () => {
  const data = [['组']];
  for (let index = 1; index <= 13; index++) data.push([`G${index}`]);
  const { result } = runSplitExecute(data, 20, 4);

  assert.equal(result.pages, 4);
  assert.equal(result.totalRows, 80);
  assert.equal(result.isBlankRow[39], true);
  assert.equal(result.isBlankRow[59], true);
  assert.equal(result.isBlankRow[79], true);
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
  assert.deepEqual(Array.from(result.cutAfterRows), [8, 20]);
  assert.equal(result.rows[8][0], '');
  assert.equal(result.rows[9][0], '组');
  assert.equal(result.rows[20][0], '组');
  assert.equal(result.isBlankRow[7], true);
  assert.equal(result.isBlankRow[19], true);
  assert.equal(result.isBlankRow[11], false);
  assert.equal(result.rows[11][0], 'C');
  assert.match(elements.splitPreviewTable.innerHTML, /split-cut-guide/);
  const worksheet = runSplitExport(result);
  for (const rowNumber of [8, 20]) {
    assert.equal(worksheet.getRow(rowNumber).getCell(1).value, '✂ 沿虚线裁剪');
    assert.equal(worksheet.getRow(rowNumber).getCell(1).border.bottom.style, 'mediumDashed');
    assert.equal(worksheet.getRow(rowNumber).getCell(2).border.bottom.style, 'mediumDashed');
  }
  assert.equal(worksheet.getRow(12).hasPageBreak, true);
  assert.equal(worksheet.pageSetup.fitToPage, true);
  assert.equal(worksheet.pageSetup.fitToWidth, 1);
  assert.equal(worksheet.pageSetup.fitToHeight, 0);
});

test('export expands blank gaps after fitting all columns to one page', () => {
  const data = [['组'], ['A'], ['B'], ['C'], ['D']];
  const { result } = runSplitExecute(data, 20, 4);
  const worksheet = runSplitExport(result);
  const regularHeight = worksheet.getRow(2).height;
  const gapHeights = [3, 9, 15].map(rowNumber => worksheet.getRow(rowNumber).height);

  assert.ok(gapHeights.every(height => height > regularHeight));
  assert.equal(new Set(gapHeights).size, 1);
  assert.ok(gapHeights[0] > 40);
});

test('export keeps four wide table slots on one print page', () => {
  const headers = [
    '12345678901234567890123', '1234567890123456789012', '1234567890', '12345678',
    '123456789', '123456789', '12345678901234567', '123456789012345'
  ];
  const data = [headers, headers.map(() => '')];
  for (const group of ['A', 'B', 'C', 'D']) {
    for (let index = 0; index < 10; index++) data.push([group, index, 1, 2, 3, 4, 5, 6]);
  }
  const { result } = runSplitExecute(data, 50, 4, 2);
  const worksheet = runSplitExport(result);
  const gapHeights = [13, 26, 39].map(rowNumber => worksheet.getRow(rowNumber).height);

  assert.equal(result.pages, 1);
  assert.equal(result.rowsPerPage, 51);
  assert.equal(result.totalRows, 51);
  assert.ok(gapHeights.every(height => height > 13.5 && height < 130));
  assert.equal(new Set(gapHeights).size, 1);
});

test('export keeps missing trailing slots white while sharing one gap height', () => {
  const data = [['组']];
  for (let index = 1; index <= 13; index++) data.push([`G${index}`]);
  const { result } = runSplitExecute(data, 20, 4);
  const worksheet = runSplitExport(result);
  const gapRows = [3, 9, 15, 23, 29, 35, 43, 49, 55, 63, 69, 75];
  const gapHeights = gapRows.map(rowNumber => worksheet.getRow(rowNumber).height);

  assert.equal(result.pages, 4);
  assert.equal(new Set(gapHeights).size, 1);
  assert.equal(worksheet.getRow(39).height, 13.5);
  assert.equal(worksheet.getRow(40).height, 13.5);
  assert.equal(worksheet.getRow(79).height, 13.5);
  assert.equal(worksheet.getRow(80).height, 13.5);
});

test('export moves a short final table down by expanding its leading white space', () => {
  const data = [['组']];
  const groups = [
    ['A', 1], ['B', 10], ['C', 10], ['D', 10],
    ['E', 10], ['F', 10], ['G', 10], ['H', 1]
  ];
  for (const [name, count] of groups) {
    for (let index = 0; index < count; index++) data.push([name]);
  }
  const { result } = runSplitExecute(data, 50, 4);
  const worksheet = runSplitExport(result);

  assert.equal(result.pages, 2);
  assert.equal(result.totalRows, 100);
  assert.ok(worksheet.getRow(90).height > worksheet.getRow(2).height, `${worksheet.getRow(90).height} <= ${worksheet.getRow(2).height}`);
  assert.equal(worksheet.getRow(100).height, 13.5);
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
  assert.match(html, /appendBlankRows\(pageLayout\.slotRows\[gi\], mergeFirst && headerRows > 0, true\)/);
  assert.match(html, /cutLayout\.pageLayouts\?\.\[pageIndex\]/);
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
