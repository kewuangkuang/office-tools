const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

test('homepage describes tools by the result users want', () => {
  assert.match(html, /行变多 \/ 列变多/);
  assert.match(html, /把一个 Excel 里的多个工作表接到下面，或按共同列补到同一行/);
  assert.match(html, /按部门、人员等内容分开/);
  assert.match(html, /切开同一页里的多张回单/);
});

test('spreadsheet settings mark common defaults and use recognizable examples', () => {
  assert.match(html, /每个工作表开头有几行标题？/);
  assert.match(html, /使用原工作表名称（常用）/);
  assert.match(html, /列顺序不一样时自动对齐/);
  assert.match(html, /“部门”在 B 列就填 2/);
  assert.match(html, /相同部门会放进同一份/);
});

test('PDF and image settings explain the visible output', () => {
  assert.match(html, /一张导出页面里放几页内容？/);
  assert.match(html, /一页就是一份，要按页拆开（常用）/);
  assert.match(html, /一页里有多张回单，让系统自动切开/);
  assert.match(html, /要生成几个 PDF？/);
  assert.match(html, /清晰度和文件大小/);
});

test('renaming tools guide users with concrete examples and action language', () => {
  assert.match(html, /输入规则批量改（常用）/);
  assert.match(html, /“1月报表\.xlsx”会变成“2月报表\.xlsx”/);
  assert.match(html, /应用本次规则到预览/);
  assert.match(html, /用哪一张作为示范？/);
  assert.match(html, /公司名称_日期\.pdf/);
  assert.match(html, /多段文字之间用什么隔开？/);
});
