# Multi-File Worker Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse pasted, selected, and dropped Excel files in a local Web Worker so four complex workbooks cannot freeze the office-tools page, while reporting actionable clipboard and per-file failures.

**Architecture:** Keep `index.html` as the only business-code source. Give the existing inline SheetJS script a stable id, build a Blob Worker from that already-bundled source, transfer one file buffer at a time to the Worker, and return only sheet names plus two-dimensional data. Keep the queue and UI state on the main thread; terminate and recreate the Worker for every file so success, failure, and the 60-second timeout all release resources deterministically.

**Tech Stack:** Static HTML, browser Web Worker/Blob/transferable ArrayBuffer APIs, inline SheetJS 0.20.1, Node.js `node:test`, `vm`, and the in-app Browser for rendered QA.

## Global Constraints

- Modify business logic only in `index.html`; `excel-tools.html` must remain a redirect-only compatibility page.
- Keep all file processing local in the browser; add no server upload, backend, external network dependency, or API Key.
- Do not convert the project to a framework or split the application into new production files.
- Preserve the existing merge, Sheet selection, preview, and export data shape: `{name, relPath, size, sheets:[{name,data,selected}]}`.
- Parse files sequentially and use a 60,000 ms Worker parsing timeout per file.
- A failed or timed-out file must not stop later files in the same batch.
- Do not log workbook cell contents.

---

### Task 1: Specify the Worker and clipboard contracts with failing tests

**Files:**
- Create: `tests/multi-file-worker-upload.test.js`
- Read: `index.html:7`
- Read: `index.html:2302-2495`

**Interfaces:**
- Consumes: the canonical application source at `index.html`.
- Produces: regression contracts for `multiBuildWorkbookWorkerSource(sheetJsSource)`, `multiParseWorkbookBuffer(buffer, keepFmt, options)`, `multiCollectClipboardFiles(dataTransfer)`, and the sequential `multiHandleFiles(files, isFolder)` queue.

- [ ] **Step 1: Write the failing regression test**

Create `tests/multi-file-worker-upload.test.js` with this complete content:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function extract(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  assert.ok(start >= 0, `${startMarker} should exist`);
  assert.ok(end > start, `${endMarker} should follow ${startMarker}`);
  return html.slice(start, end);
}

function loadWorkerHelpers(overrides = {}) {
  const workerSource = extract(
    'function multiBuildWorkbookWorkerSource(',
    '\nasync function multiReadWorkbookFile('
  );
  const context = {
    Blob: class Blob {
      constructor(parts, options) { this.parts = parts; this.options = options; }
    },
    URL: {
      createObjectURL: () => 'blob:sheetjs-worker',
      revokeObjectURL: () => {}
    },
    Worker: function Worker() {},
    document: {
      getElementById: () => ({ textContent: 'var XLSX={read(){}};' })
    },
    setTimeout,
    clearTimeout,
    ...overrides
  };
  vm.createContext(context);
  vm.runInContext(
    `${workerSource}\nthis.api={multiBuildWorkbookWorkerSource,multiParseWorkbookBuffer};`,
    context
  );
  return context.api;
}

function loadClipboardHelper() {
  const source = extract(
    'function multiCollectClipboardFiles(',
    "\ndocument.addEventListener('paste'"
  );
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${source}\nthis.api={multiCollectClipboardFiles};`, context);
  return context.api;
}

test('SheetJS is identified for reuse and workbook parsing is absent from the main-thread reader', () => {
  assert.match(html, /<script id="sheetjs-inline">\/\* SheetJS inlined \*\//);
  const reader = extract('async function multiReadWorkbookFile(', '\nasync function multiHandleFiles(');
  assert.doesNotMatch(reader, /XLSX\.read\(/);
  assert.match(reader, /multiParseWorkbookBuffer\(buf,\s*keepFmt/);
});

test('worker source parses sheets without importing a network script', () => {
  const { multiBuildWorkbookWorkerSource } = loadWorkerHelpers();
  const source = multiBuildWorkbookWorkerSource('/* bundled-sheetjs */');
  assert.match(source, /^\/\* bundled-sheetjs \*\//);
  assert.match(source, /XLSX\.read\(/);
  assert.match(source, /sheet_to_json\(/);
  assert.doesNotMatch(source, /importScripts\s*\(/);
});

test('worker timeout terminates the worker and revokes its Blob URL', async () => {
  let terminated = 0;
  let revoked = 0;
  const worker = {
    postMessage() {},
    terminate() { terminated++; }
  };
  const { multiParseWorkbookBuffer } = loadWorkerHelpers({
    URL: {
      createObjectURL: () => 'blob:timeout-worker',
      revokeObjectURL: value => { assert.equal(value, 'blob:timeout-worker'); revoked++; }
    },
    Worker: function Worker() { return worker; }
  });

  await assert.rejects(
    multiParseWorkbookBuffer(new ArrayBuffer(8), false, { timeoutMs: 5 }),
    /文件解析超时/
  );
  assert.equal(terminated, 1);
  assert.equal(revoked, 1);
});

test('worker success transfers the buffer and returns sheet data', async () => {
  let transferList;
  const worker = {
    postMessage(message, transfer) {
      transferList = transfer;
      queueMicrotask(() => this.onmessage({
        data: { ok: true, sheets: [{ name: 'Sheet1', data: [['A']], selected: true }] }
      }));
    },
    terminate() {}
  };
  const { multiParseWorkbookBuffer } = loadWorkerHelpers({
    Worker: function Worker() { return worker; }
  });
  const buffer = new ArrayBuffer(8);
  const sheets = await multiParseWorkbookBuffer(buffer, false, { timeoutMs: 50 });
  assert.equal(transferList.length, 1);
  assert.equal(transferList[0], buffer);
  assert.deepEqual(JSON.parse(JSON.stringify(sheets)), [
    { name: 'Sheet1', data: [['A']], selected: true }
  ]);
});

test('clipboard collection falls back to files and reports unsupported file entries', () => {
  const { multiCollectClipboardFiles } = loadClipboardHelper();
  const xlsx = { name: 'A.xlsx', size: 10 };
  const pdf = { name: 'B.pdf', size: 20 };
  const fromFiles = multiCollectClipboardFiles({ items: [], files: [xlsx] });
  assert.deepEqual(Array.from(fromFiles.files), [xlsx]);
  assert.equal(fromFiles.fileItemCount, 1);

  const unsupported = multiCollectClipboardFiles({
    items: [{ kind: 'file', getAsFile: () => pdf }],
    files: []
  });
  assert.equal(unsupported.files.length, 0);
  assert.equal(unsupported.fileItemCount, 1);
});

test('multi-file queue is sequential and renders progress after each success', () => {
  const handler = extract('async function multiHandleFiles(', '\nfunction multiRenderFileList(');
  assert.doesNotMatch(handler, /Promise\.all\(/);
  assert.doesNotMatch(handler, /MULTI_SMALL_FILE_CONCURRENCY/);
  assert.match(handler, /正在后台解析/);
  assert.match(handler, /multiRenderFileList\(\)/);
});

test('paste handler gives actionable feedback for unsupported or unavailable files', () => {
  assert.match(html, /剪贴板中没有可读取的文件，请改用拖拽或“选择文件”/);
  assert.match(html, /剪贴板文件格式不支持，仅支持 \.xlsx、\.xls、\.csv/);
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
node --test tests/multi-file-worker-upload.test.js
```

Expected: FAIL because `sheetjs-inline`, `multiBuildWorkbookWorkerSource`, `multiParseWorkbookBuffer`, and `multiCollectClipboardFiles` do not exist and the current handler still calls `Promise.all()`.

- [ ] **Step 3: Commit the regression specification**

```bash
git add tests/multi-file-worker-upload.test.js
git commit -m "test: cover background Excel parsing"
```

Expected: one test-only commit; production behavior remains unchanged and the new test remains red.

---

### Task 2: Move workbook parsing into an offline Blob Worker

**Files:**
- Modify: `index.html:7`
- Modify: `index.html:2384-2411`
- Test: `tests/multi-file-worker-upload.test.js`

**Interfaces:**
- Consumes: inline SheetJS script element `#sheetjs-inline`; `ArrayBuffer`; `keepFmt:boolean`.
- Produces: `multiBuildWorkbookWorkerSource(sheetJsSource):string`, `multiCreateWorkbookWorker():{worker:Worker,url:string}`, and `multiParseWorkbookBuffer(buffer, keepFmt, options?):Promise<Array<{name:string,data:any[][],selected:true}>>`.

- [ ] **Step 1: Add a stable id to the bundled SheetJS script**

Change only the opening tag at the top of `index.html`:

```html
<script id="sheetjs-inline">/* SheetJS inlined */
```

- [ ] **Step 2: Add the Worker source and lifecycle helpers**

Insert the following immediately after `multiWithTimeout()` and before `multiReadWorkbookFile()`:

```js
function multiBuildWorkbookWorkerSource(sheetJsSource){
  return sheetJsSource+`\nself.onmessage=function(event){
    const message=event.data||{};
    try{
      const keepFmt=!!message.keepFmt;
      const wb=XLSX.read(new Uint8Array(message.buffer),{
        type:'array',
        cellDates:keepFmt,
        cellNF:keepFmt,
        cellText:!keepFmt
      });
      const sheets=wb.SheetNames.map(function(name){
        const ws=wb.Sheets[name];
        const data=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:keepFmt});
        return {name:name,data:data,selected:true};
      });
      self.postMessage({ok:true,sheets:sheets});
    }catch(error){
      self.postMessage({ok:false,error:error&&error.message?error.message:String(error)});
    }
  };`;
}

function multiCreateWorkbookWorker(){
  if(typeof Worker==='undefined'||typeof Blob==='undefined'||!URL?.createObjectURL){
    throw new Error('当前浏览器不支持后台解析，请升级 Chrome 或 Edge 后重试。');
  }
  const script=document.getElementById('sheetjs-inline');
  if(!script?.textContent)throw new Error('未找到本地 Excel 解析组件。');
  const source=multiBuildWorkbookWorkerSource(script.textContent);
  const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  return {worker:new Worker(url),url};
}

function multiParseWorkbookBuffer(buffer, keepFmt, options){
  const timeoutMs=options?.timeoutMs||60000;
  let resource;
  try{
    resource=multiCreateWorkbookWorker();
  }catch(error){
    return Promise.reject(error);
  }
  const worker=resource.worker;
  const url=resource.url;
  return new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(callback,value)=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      callback(value);
    };
    const timer=setTimeout(()=>{
      finish(reject,new Error('文件解析超时（60 秒），可能文件结构过于复杂或已损坏。'));
    },timeoutMs);
    worker.onmessage=event=>{
      const result=event.data||{};
      if(result.ok)finish(resolve,result.sheets||[]);
      else finish(reject,new Error(result.error||'文件格式异常，无法解析。'));
    };
    worker.onerror=()=>finish(reject,new Error('后台解析失败，文件可能已损坏或加密。'));
    worker.onmessageerror=()=>finish(reject,new Error('后台解析结果无法读取。'));
    worker.postMessage({buffer,keepFmt},[buffer]);
  });
}
```

- [ ] **Step 3: Route the existing file reader through the Worker**

Replace `multiReadWorkbookFile()` with:

```js
async function multiReadWorkbookFile(f, keepFmt){
  const relPath=f.webkitRelativePath||f.name;
  const buf=await multiWithTimeout(
    f.arrayBuffer(),
    15000,
    '文件读取超时。请确认文件已下载到本机，并关闭 Excel 后重试。'
  );
  const sheets=await multiParseWorkbookBuffer(buf,keepFmt,{timeoutMs:60000});
  return {name:f.name,relPath,size:f.size,sheets};
}
```

- [ ] **Step 4: Run the Worker tests and verify the Worker subset is GREEN**

Run:

```bash
node --test --test-name-pattern="SheetJS|worker source|worker timeout|worker success" tests/multi-file-worker-upload.test.js
```

Expected: 4 matching tests PASS. Queue and paste-feedback tests may still fail because Tasks 3 and 4 have not been implemented.

- [ ] **Step 5: Run the script syntax check**

```bash
node -e 'const fs=require("fs");const html=fs.readFileSync("index.html","utf8");const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);scripts.forEach((s,i)=>{try{new Function(s)}catch(e){throw new Error(`script ${i+1}: ${e.message}`)}});console.log(`syntax ok: ${scripts.length} scripts`)'
```

Expected: `syntax ok: 7 scripts`.

- [ ] **Step 6: Commit the Worker implementation**

```bash
git add index.html
git commit -m "fix: parse Excel files in a Web Worker"
```

---

### Task 3: Replace parallel parsing with a responsive sequential queue

**Files:**
- Modify: `index.html:2279-2282`
- Modify: `index.html:2413-2495`
- Test: `tests/multi-file-worker-upload.test.js`

**Interfaces:**
- Consumes: `multiReadWorkbookFile(file, keepFmt):Promise<MultiFile>` from Task 2.
- Produces: sequential `multiHandleFiles(files, isFolder)` behavior that updates `multiFiles`, progress text, and the rendered list after every successful file.

- [ ] **Step 1: Remove obsolete small-file concurrency constants**

Delete:

```js
const MULTI_SMALL_FILE_LIMIT = 1024 * 1024;
const MULTI_SMALL_FILE_CONCURRENCY = 4;
```

- [ ] **Step 2: Replace the small/large split with one sequential pending queue**

Inside `multiHandleFiles()`, replace declarations for `smallFiles` and `largeFiles` with:

```js
  const pendingFiles=[];
```

Replace the classification expression:

```js
      (f.size<=MULTI_SMALL_FILE_LIMIT?smallFiles:largeFiles).push({file:f,idx:i});
```

with:

```js
      pendingFiles.push(f);
```

Replace both existing parsing loops with:

```js
    for(let i=0;i<pendingFiles.length;i++){
      const f=pendingFiles[i];
      multiSetUploadStatus(`正在后台解析 ${i+1}/${pendingFiles.length}：${f.name}`);
      await multiYield();
      try{
        const data=await multiReadWorkbookFile(f,keepFmt);
        multiFiles.push(data);
        readCount++;
        multiRenderFileList();
      }catch(e2){
        handleReadFailure(f,e2);
      }
    }
```

Update the failure toast inside `handleReadFailure` so users see the actual category without exposing cell contents:

```js
    showToast('跳过 '+f.name+'：'+(e2?.message||'读取失败'),'error');
```

- [ ] **Step 3: Run the sequential queue test and verify GREEN**

```bash
node --test --test-name-pattern="multi-file queue" tests/multi-file-worker-upload.test.js
```

Expected: the matching queue test PASS.

- [ ] **Step 4: Run existing multi-file merge regression tests**

```bash
node --test tests/multi-file-group-by-sheet.test.js
```

Expected: 3 tests PASS with 0 failures.

- [ ] **Step 5: Commit the queue change**

```bash
git add index.html
git commit -m "fix: process Excel uploads sequentially"
```

---

### Task 4: Make clipboard failures actionable without breaking text inputs

**Files:**
- Modify: `index.html:2302-2306`
- Test: `tests/multi-file-worker-upload.test.js`

**Interfaces:**
- Consumes: a paste event `DataTransfer` with optional `items` and `files`.
- Produces: `multiCollectClipboardFiles(dataTransfer):{files:File[],fileItemCount:number}` and page-level toast behavior.

- [ ] **Step 1: Add the clipboard collection helper before the paste listener**

```js
function multiCollectClipboardFiles(dataTransfer){
  const files=[];
  let fileItemCount=0;
  const add=file=>{
    if(!file)return;
    fileItemCount++;
    if(/\.(xlsx|xls|csv)$/i.test(file.name||'')&&!files.includes(file))files.push(file);
  };
  const items=Array.from(dataTransfer?.items||[]);
  items.forEach(item=>{
    if(item.kind==='file')add(item.getAsFile());
  });
  Array.from(dataTransfer?.files||[]).forEach(file=>{
    if(!files.includes(file))add(file);
  });
  return {files,fileItemCount};
}
```

- [ ] **Step 2: Replace the multi-file paste handler**

```js
document.addEventListener('paste',e=>{
  const page=document.getElementById('page-multi');
  if(!page||page.style.display==='none')return;
  const target=e.target;
  const isEditable=target&&(
    /^(INPUT|TEXTAREA)$/i.test(target.tagName)||target.isContentEditable
  );
  const result=multiCollectClipboardFiles(e.clipboardData);
  if(result.files.length){
    e.preventDefault();
    multiHandleFiles(result.files);
    showToast('已粘贴 '+result.files.length+' 个文件','success');
  }else if(result.fileItemCount){
    e.preventDefault();
    showToast('剪贴板文件格式不支持，仅支持 .xlsx、.xls、.csv','error');
  }else if(!isEditable){
    showToast('剪贴板中没有可读取的文件，请改用拖拽或“选择文件”','info');
  }
});
```

- [ ] **Step 3: Run all new regression tests and verify GREEN**

```bash
node --test tests/multi-file-worker-upload.test.js
```

Expected: 7 tests PASS with 0 failures.

- [ ] **Step 4: Commit the clipboard feedback change**

```bash
git add index.html
git commit -m "fix: explain unsupported pasted Excel files"
```

---

### Task 5: Full regression and rendered browser verification

**Files:**
- Verify: `index.html`
- Verify: `excel-tools.html`
- Verify: `tests/multi-file-worker-upload.test.js`
- Verify: `tests/multi-file-group-by-sheet.test.js`
- Verify: `tests/pdf-receipt-ocr-fallback.test.js`

**Interfaces:**
- Consumes: completed implementation from Tasks 2–4.
- Produces: fresh automated and rendered evidence for syntax, redirect compatibility, worker parsing, progress, error isolation, console health, and page responsiveness.

- [ ] **Step 1: Run the complete automated regression set**

```bash
node -e 'const fs=require("fs");const html=fs.readFileSync("index.html","utf8");const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);scripts.forEach((s,i)=>{try{new Function(s)}catch(e){throw new Error(`script ${i+1}: ${e.message}`)}});console.log(`syntax ok: ${scripts.length} scripts`)'
node --test tests/multi-file-worker-upload.test.js tests/multi-file-group-by-sheet.test.js
node --test tests/pdf-receipt-ocr-fallback.test.js
```

Expected:

- Syntax check exits 0.
- Worker and multi-file tests exit 0 with 10 total passing tests.
- PDF test result is recorded exactly. If the pre-existing receipt-preview assertion still fails because it expects `mode==='receipt'` rather than `isReceiptLike`, report it as an unrelated existing failure; do not alter PDF business code in this task.

- [ ] **Step 2: Start the required local static server**

```bash
python3 -m http.server 8766 --bind 127.0.0.1
```

Expected: server listens at `http://127.0.0.1:8766/index.html`.

- [ ] **Step 3: Verify page identity and baseline console health in the in-app Browser**

Use the Browser plugin to open `http://127.0.0.1:8766/index.html`, then verify:

- URL is the intended localhost page.
- Title is `办公工具箱`.
- DOM snapshot contains the `多文件合并` card and no framework error overlay.
- Error/warning logs contain no application errors.

- [ ] **Step 4: Verify standard clipboard-file parsing**

Open the multi-file merge page. Write a small attachment-style `text/csv` clipboard item containing `name,amount\nA,2\n`, press paste, and verify:

- `clipboard.csv` appears in the file list.
- It reports one Sheet and two rows.
- The Sheet-selection and merge-setting cards become visible.
- Console has no relevant errors.

- [ ] **Step 5: Verify four-file responsiveness and progress**

Write four attachment-style CSV clipboard items with at least 50,000 rows each, paste once, and verify:

- Four files appear.
- Upload text changes through `正在后台解析 N/4`.
- A theme button remains clickable while parsing is in progress.
- The page never presents a JavaScript unresponsive dialog.
- Final toast reports four readable files.

- [ ] **Step 6: Verify clipboard fallback messaging**

With no editable input focused, paste plain text and verify the informational toast says `剪贴板中没有可读取的文件，请改用拖拽或“选择文件”`. Then focus the file-search input, paste text, and verify normal text insertion is not prevented and no unavailable-file toast is shown.

- [ ] **Step 7: Capture screenshot and console evidence**

Capture one viewport screenshot showing the four parsed files and visible merge controls. Re-read warning/error logs and record that no relevant application errors occurred.

- [ ] **Step 8: Inspect the final diff and scope**

```bash
git status --short
git diff --check HEAD~3..HEAD
git diff --stat HEAD~3..HEAD
```

Expected: only `index.html` and `tests/multi-file-worker-upload.test.js` changed across implementation commits; pre-existing untracked files remain untouched.

- [ ] **Step 9: Final verification commit only if QA required a test-only correction**

If no correction was needed, do not create an empty commit. If a test-only correction was required, stage only that test and commit:

```bash
git add tests/multi-file-worker-upload.test.js
git commit -m "test: refine Excel worker regression coverage"
```
