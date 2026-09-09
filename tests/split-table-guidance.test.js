const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const splitPage = html.slice(html.indexOf('id="page-split"'));

test('split table settings foreground the split rule instead of repeating long help text', () => {
  assert.match(splitPage, /class="card split-settings-card" id="splitOptionsCard"/);
  assert.match(splitPage, /class="split-mode-choice-grid" id="splitRuleOptions"/);
  assert.match(splitPage, /按列内容拆分/);
  assert.match(splitPage, /按固定行数拆分/);
  assert.match(splitPage, /class="split-output-choice-grid" id="splitFieldOutputOptions"/);
  assert.match(splitPage, /字段拆分后的输出/);
  assert.doesNotMatch(splitPage, /按什么规则拆分？<small>先选择按字段拆分，还是按固定行数拆分<\/small>/);
  assert.doesNotMatch(splitPage, /字段拆分后怎么输出？<small>只对“按某列内容分开”生效；可以放在一个 Sheet 中，也可以每个字段一个 Sheet<\/small>/);
});

test('split table keeps concise dynamic guidance and explicit units', () => {
  assert.match(html, /<span class="split-setting-label">根据哪一列分组？<\/span><small>例如：“部门”在 B 列就填 2<\/small>/);
  assert.match(html, /<span class="split-setting-label">每份多少行？<\/span><small>不含重复的表头<\/small>/);
  assert.match(html, /<span class="split-setting-label">根据哪一列生成 Sheet？<\/span><small>例如：“部门”在 B 列就填 2<\/small>/);
  assert.match(splitPage, /id="splitColUnit">列<\/span>/);
  assert.match(html, /unit\.textContent = '行'/);
  assert.match(html, /unit\.textContent = '列'/);
});

test('selected split mode keeps nested text readable on its light background', () => {
  assert.match(html, /\.split-mode-choice\.nup-option\.active \.split-mode-choice-copy\s*\{[^}]*color:\s*var\(--gray-800\)\s*!important/);
  assert.match(html, /\.split-mode-choice\.nup-option\.active \.split-mode-choice-copy small\s*\{[^}]*color:\s*var\(--gray-500\)\s*!important/);
  assert.match(html, /\.split-mode-choice\.nup-option\.active \.split-mode-choice-tag\s*\{[^}]*color:\s*var\(--primary\)\s*!important/);
});
