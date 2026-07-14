# 回单名称高精度识别 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从原 PDF 的 4 倍渲染名称栏识别付款人和收款人，以提高扫描回单名称的单字准确率。

**Architecture:** 保留现有 2.5 倍页面渲染为主流程。回单模式新增一个每页一次的 4 倍页面画布；每张回单按比例映射裁切坐标，取顶部名称栏进行小区域 OCR。高精度名称仅覆盖双方名称字段，其他字段不变。

**Tech Stack:** 单文件浏览器前端、PDF.js、Canvas、Tesseract.js、Node 内置测试。

## Global Constraints

- 只修改 `index.html` 与 `tests/pdf-receipt-ocr-fallback.test.js`。
- 保持浏览器本地处理，不新增后端、上传或 API Key。
- 主渲染倍率保持 2.5；名称栏高精度页倍率固定 4。
- 高精度结果为空时不可覆盖现有名称。

---

### Task 1: 高精度名称栏映射与覆盖测试

**Files:**
- Modify: `tests/pdf-receipt-ocr-fallback.test.js`

**Interfaces:**
- Produces: `pdfSplitCreateHighResolutionPartyCanvas(highPageCanvas, crop, baseScale, highScale)` 和 `pdfSplitPreferCoordinatePartyNames(fields, coordinateNames)` 的行为约束。

- [ ] **Step 1: 写失败测试**

```js
test('high-resolution party crop maps a 2.5x receipt crop onto the 4x page', () => {
  assert.match(source(), /function pdfSplitCreateHighResolutionPartyCanvas\s*\(/);
  assert.match(source(), /const ratio=highScale\/baseScale/);
});

test('a valid high-resolution party name overrides normal OCR but blank high-resolution data does not', () => {
  const fields = prefer({ payer: '低清名称', payee: '低清收款' }, { payer: '高清付款公司', payee: '' });
  assert.equal(fields.payer, '高清付款公司');
  assert.equal(fields.payee, '低清收款');
});
```

- [ ] **Step 2: 运行失败测试**

Run: `node --test tests/pdf-receipt-ocr-fallback.test.js`

Expected: 高精度画布函数不存在而失败。

- [ ] **Step 3: 实现最小映射函数**

```js
function pdfSplitCreateHighResolutionPartyCanvas(highPageCanvas, crop, baseScale, highScale){
  const ratio=highScale/baseScale;
  const sx=Math.round(crop.x*ratio);
  const sy=Math.round((crop.y+crop.h*0.10)*ratio);
  const sw=Math.round(crop.w*ratio);
  const sh=Math.round(crop.h*0.24*ratio);
  const out=document.createElement('canvas');
  out.width=sw; out.height=sh;
  out.getContext('2d').drawImage(highPageCanvas,sx,sy,sw,sh,0,0,sw,sh);
  return out;
}
```

- [ ] **Step 4: 运行测试**

Run: `node --test tests/pdf-receipt-ocr-fallback.test.js`

Expected: 全部通过。

### Task 2: 接入每页一次的 4 倍名称栏 OCR

**Files:**
- Modify: `index.html:4820-4875`
- Modify: `tests/pdf-receipt-ocr-fallback.test.js`

**Interfaces:**
- Consumes: `pdfSplitCreateHighResolutionPartyCanvas(highPageCanvas, crop, 2.5, 4)`。
- Produces: 回单 `fields.payer` 与 `fields.payee` 的高精度优先结果。

- [ ] **Step 1: 写失败测试**

```js
test('receipt mode renders one 4x source page and OCRs only mapped party strips', () => {
  const loop = source().slice(source().indexOf('if(mode===\'receipt\')'), source().indexOf('pdfSplitFinalizeReceiptNames'));
  assert.match(loop, /const nameScale=4;/);
  assert.match(loop, /pdfSplitCreateHighResolutionPartyCanvas\(highPageCanvas,crop,scale,nameScale\)/);
});
```

- [ ] **Step 2: 运行失败测试**

Run: `node --test tests/pdf-receipt-ocr-fallback.test.js`

Expected: 缺少 `nameScale=4` 或名称栏调用而失败。

- [ ] **Step 3: 实现每页一次高精度渲染和每张回单的小区域 OCR**

```js
const nameScale=4;
const highVp=jsPage.getViewport({scale:nameScale});
const highPageCanvas=document.createElement('canvas');
highPageCanvas.width=highVp.width; highPageCanvas.height=highVp.height;
await jsPage.render({canvasContext:highPageCanvas.getContext('2d'),viewport:highVp}).promise;

const highPartyCanvas=pdfSplitCreateHighResolutionPartyCanvas(highPageCanvas,crop,scale,nameScale);
const highPartyOcr=await pdfSplitRunTesseractOcr(highPartyCanvas);
const highPartyFields=pdfSplitExtractReceiptFields(highPartyOcr.lines||[]);
fields=pdfSplitPreferCoordinatePartyNames(fields,{payer:highPartyFields.payer,payee:highPartyFields.payee});
```

- [ ] **Step 4: 运行完整验证**

Run: `node --test tests/pdf-receipt-ocr-fallback.test.js`

Expected: 全部通过。

Run: `node -e "const fs=require('fs'); const html=fs.readFileSync('index.html','utf8'); for(const s of [...html.matchAll(/<script(?:\\s[^>]*)?>([\\s\\S]*?)<\\/script>/gi)].map(m=>m[1]).filter(Boolean)) new Function(s);"`

Expected: 退出码 0。
