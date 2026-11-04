const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const multiPage = html.slice(html.indexOf('id="page-multi"'), html.indexOf('id="page-sheet"'));
const appendGuide = multiPage.slice(multiPage.indexOf('merge-direction-help-card append'), multiPage.indexOf('merge-direction-help-card join'));
const joinGuide = multiPage.slice(multiPage.indexOf('merge-direction-help-card join'));

test('multi-file merge offers a floating visual guide for row and column growth', () => {
  assert.match(multiPage, /id="multiMergeHelpTrigger"/);
  assert.match(multiPage, /看懂.*行增加.*列增加/);
  assert.match(multiPage, /id="multiMergeHelpModal"/);
  assert.match(multiPage, /role="dialog"/);
  assert.match(multiPage, /id="multiMergeHelpTitle">到底是行变多，还是列变多/);
  assert.match(appendGuide, /上下追加/);
  assert.match(appendGuide, /行变多/);
  assert.match(joinGuide, /按字段匹配/);
  assert.match(joinGuide, /列变多/);
  assert.ok((multiPage.match(/class="merge-help-table"/g) || []).length >= 6, 'the guide should show source and merged tables');
  assert.match(html, /function openMultiMergeHelp\(\)/);
  assert.match(html, /function closeMultiMergeHelp\(event\)/);
});

test('multi-file merge keeps advanced settings visible by default', () => {
  assert.match(multiPage, /<details class="advanced-settings" open>/);
  assert.match(multiPage, /<summary>⚙️ 高级设置（输出、来源、去重等）<\/summary>/);
});
