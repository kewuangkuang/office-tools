const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function loadRenameList() {
  const start = html.indexOf('function renameRenderList(');
  const end = html.indexOf('\nfunction renameFileSearch(', start);
  assert.ok(start >= 0 && end > start, 'rename file-list renderer should exist');
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', style: {} });
    return elements.get(id);
  };
  const context = {
    renameFiles: Array.from({ length: 6 }, (_, i) => ({ name: `文件${i + 1}.txt` })),
    renameCurrentNames: Array.from({ length: 6 }, (_, i) => `文件${i + 1}.txt`),
    renameHistory: [],
    renameSearchFilter: '',
    renameListExpanded: false,
    renameAttrEsc: String,
    renameEsc: String,
    renameRenderStepInfo() {},
    setUploadClearVisible() {},
    document: { getElementById: element }
  };
  vm.createContext(context);
  vm.runInContext(`${html.slice(start, end)}\nthis.api={renameRenderList,renameToggleExpand};`, context);
  return { context, list: element('renameFileList') };
}

test('batch rename initially shows five files and can expand the full list', () => {
  const { context, list } = loadRenameList();
  context.api.renameRenderList();
  assert.equal((list.innerHTML.match(/class="file-list-item"/g) || []).length, 5);
  assert.match(list.innerHTML, /展开全部 6 个文件/);

  context.api.renameToggleExpand();
  assert.equal((list.innerHTML.match(/class="file-list-item"/g) || []).length, 6);
  assert.match(list.innerHTML, /收起/);
});

test('every multi-file upload renderer limits its collapsed list to five items', () => {
  for (const functionName of ['multiRenderFileList', 'pdfRenderList', 'renameRenderList', 'flRenderList']) {
    const start = html.indexOf(`function ${functionName}(`);
    const end = html.indexOf('\nfunction ', start + 1);
    const source = html.slice(start, end);
    assert.match(source, /(?:const|var) MAX\s*=\s*5/, `${functionName} uses the five-file limit`);
    assert.match(source, /slice\(0,\s*MAX\)/, `${functionName} renders only the first five while collapsed`);
  }
});

test('adding another batch returns every multi-file list to its collapsed state', () => {
  for (const [functionName, stateName] of [
    ['multiHandleFiles', 'multiListExpanded'],
    ['pdfHandleFiles', 'pdfListExpanded'],
    ['renameAddFiles', 'renameListExpanded'],
    ['flHandleFiles', 'flListExpanded']
  ]) {
    const start = html.indexOf(`function ${functionName}(`);
    const end = html.indexOf('\nfunction ', start + 1);
    const source = html.slice(start, end);
    assert.match(source, new RegExp(`${stateName}\\s*=\\s*false`), `${functionName} collapses the list for a new upload batch`);
  }
});
