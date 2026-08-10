const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

test('homepage exposes batch box extraction and Excel export mode', () => {
  assert.match(html, /onclick="showTool\('extract'\)"/);
  assert.match(html, /function batchRecognizeSetMode\(/);
  assert.match(html, /id="batchRecognizeExportExcelBtn"/);
  assert.match(html, /onclick="batchRecognizeExportXLSX\(\)"/);
});

test('selected boxes become one Excel column per file row', () => {
  const start = html.indexOf('function batchRecognizeParseNumber(');
  const end = html.indexOf('\nfunction batchRecognizeRenderResults(', start);
  assert.ok(start >= 0 && end > start, 'Excel row helpers should exist');

  const context = {};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.fn=batchRecognizeBuildExcelRows;`, context);

  const output = context.fn(
    [
      {
        file: { name: '甲.pdf' },
        texts: ['成都杏林', '增值税', '3842.27'],
        sources: ['PDF 文字层', 'PDF 文字层', 'PDF 文字层']
      },
      {
        file: { name: '乙.pdf' },
        texts: ['四川药店', '印花税\n教育费附加', '30.61\n57.63'],
        sources: ['PDF 文字层', 'Tesseract', 'Tesseract']
      },
      {
        file: { name: '丙.pdf' },
        texts: ['', '未识别', ''],
        sources: ['识别失败', '识别失败', '识别失败']
      }
    ],
    [{ label: '公司名称' }, { label: '税种' }, { label: '金额' }]
  );

  assert.deepEqual(Array.from(output.headers), ['原文件名', '公司名称', '税种', '金额', '识别状态', '识别来源']);
  assert.deepEqual(Array.from(output.rows[0]), ['甲.pdf', '成都杏林', '增值税', '3842.27', '已识别', 'PDF 文字层']);
  assert.deepEqual(Array.from(output.rows[1]), ['乙.pdf', '四川药店', '印花税\n教育费附加', '30.61\n57.63', '已识别', 'PDF 文字层、Tesseract']);
  assert.equal(output.rows[2][4], '需核对');
});

test('numeric columns remove currency symbols and export typed numbers', () => {
  const start = html.indexOf('function batchRecognizeParseNumber(');
  const end = html.indexOf('\nfunction batchRecognizeSetFieldValue(', start);
  assert.ok(start >= 0 && end > start, 'number formatting helpers should exist');

  const context = {};
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.fn=batchRecognizeBuildExcelRows;`, context);

  const output = context.fn(
    [{
      file: { name: '金额.pdf' },
      texts: ['¥38.42', '￥1,234.50', '未识别'],
      sources: ['PDF 文字层', 'PDF 文字层', 'PDF 文字层']
    }],
    [
      { label: '金额', format: 'number' },
      { label: '税额', format: 'number' },
      { label: '备注', format: 'number' }
    ]
  );

  assert.equal(output.rows[0][1], 38.42);
  assert.equal(typeof output.rows[0][1], 'number');
  assert.equal(output.rows[0][2], 1234.5);
  assert.equal(typeof output.rows[0][2], 'number');
  assert.equal(output.rows[0][3], '未识别');
  assert.equal(output.rows[0][output.headers.length - 2], '需核对');
});

test('extraction result table keeps field values editable before export', () => {
  assert.match(html, /function batchRecognizeSetFieldValue\(/);
  assert.match(html, /function batchRecognizeSetTemplateFormat\(/);
  assert.match(html, /数字（去掉 ¥ \/ ￥ \/ 元）/);
  assert.match(html, /batchRecognizeSetFieldValue\('\+i\+','\+index\+',this\.value\)/);
  assert.match(html, /batchRecognizeBuildExcelRows\(batchRecognizeResults,batchRecognizeTemplates\)/);
  assert.match(html, /XLSX\.writeFile\(wb,fileName\+'\.xlsx'\)/);
});

test('box extraction supports more than five dynamic columns', () => {
  assert.match(html, /function batchRecognizeTemplateLimitReached\(/);

  const start = html.indexOf('function batchRecognizeColumnName(');
  const end = html.indexOf('\nfunction batchRecognizeIsSupported(', start);
  assert.ok(start >= 0 && end > start, 'dynamic Excel column name helper should exist');

  const context = { batchRecognizeTemplates: new Array(30), batchRecognizeMode: 'extract' };
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.columnName=batchRecognizeColumnName;\nthis.limitReached=batchRecognizeTemplateLimitReached;`, context);

  assert.equal(context.columnName(0), 'A');
  assert.equal(context.columnName(25), 'Z');
  assert.equal(context.columnName(26), 'AA');
  assert.equal(context.columnName(51), 'AZ');
  assert.equal(context.columnName(52), 'BA');
  assert.equal(context.limitReached(), false);

  context.batchRecognizeMode = 'rename';
  assert.equal(context.limitReached(), true);
});
