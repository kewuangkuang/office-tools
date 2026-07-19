const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');

test('homepage changelog modal shows the latest documented release', () => {
  const latestDate = changelog.match(/^## (\d{4}-\d{2}-\d{2})$/m)?.[1];
  assert.ok(latestDate, 'CHANGELOG should contain a dated release');

  const modalStart = html.indexOf('<div class="modal-mask" id="changelogModal"');
  const modalEnd = html.indexOf('</div>\n\n<div class="modal-mask"', modalStart + 1);
  const modal = html.slice(modalStart, modalEnd > modalStart ? modalEnd : html.indexOf('<script', modalStart));
  assert.match(modal, new RegExp(`<div class="changelog-date">${latestDate}</div>`));
  assert.match(modal, /回单模式.*默认.*JPG/);
  assert.match(modal, /超过 5 个.*展开全部/);
});
