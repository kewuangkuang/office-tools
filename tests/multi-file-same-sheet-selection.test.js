const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

test('multi-file merge exposes one-click selection for common sheet names', () => {
  assert.match(html, /id="multiSheetNameBatch"/);
  assert.match(html, /共有工作表/);
  assert.match(html, /multiSelectOnlyByName/);
  assert.match(html, /const commonArr=Array\.from\(common\)/);
});
