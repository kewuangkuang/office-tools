# PDF Receipt PaddleOCR/Tesseract Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Combine the PaddleOCR implementation from GitHub commit `9a061809002d` with the tuned Tesseract implementation from its predecessor `cae519c03f30`, using Paddle first and Tesseract only when required fields remain missing.

**Architecture:** Keep the existing single-file browser application. Add small pure helper functions for required-field detection and non-destructive field merging, then wire the historical Paddle and Tesseract adapters into one receipt OCR coordinator. Mirror the business-code changes in both HTML entry points.

**Tech Stack:** HTML, browser JavaScript, PDF.js, PDF-Lib, Paddle.js OCR, Tesseract.js, Node.js built-in test/assert modules.

## Global Constraints

- PaddleOCR baseline is GitHub commit `9a061809002d`.
- Tesseract baseline is GitHub commit `cae519c03f30`.
- Do not adopt the OCR orchestration introduced by commits `940d7bc3a1e8` or `17f8f453efb2`.
- PDF rendering and OCR remain browser-local; no file upload, backend, or API key.
- `index.html` and `excel-tools.html` must expose identical receipt OCR behavior.
- Existing receipt crop dimensions, render scale, Tesseract preprocessing, field extraction, and speed-related settings from `cae519c03f30` must be retained.

---

### Task 1: Lock Down Engine Selection and Field Merge Behavior

**Files:**
- Create: `tests/pdf-receipt-ocr-fallback.test.js`
- Modify: `index.html`
- Modify: `excel-tools.html`

**Interfaces:**
- Produces: `pdfSplitRequiredReceiptFields(mode, template)` returning an array of field keys.
- Produces: `pdfSplitMissingReceiptFields(fields, mode, template)` returning missing field keys.
- Produces: `pdfSplitMergeMissingReceiptFields(primary, supplement)` returning a new field object without overwriting non-empty primary values.

- [ ] **Step 1: Write failing tests for required fields**

Create tests that load the business-script portion of `index.html` into a VM context and assert:

```js
assert.deepEqual(required('amount', ''), ['amount']);
assert.deepEqual(required('payer', ''), ['payer']);
assert.deepEqual(required('payee', ''), ['payee']);
assert.deepEqual(required('payee_amount', ''), ['payee', 'amount']);
assert.deepEqual(required('custom', '{收款人}{日期}{序号}'), ['payee', 'date']);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/pdf-receipt-ocr-fallback.test.js`

Expected: FAIL because `pdfSplitRequiredReceiptFields` is not defined.

- [ ] **Step 3: Implement the pure helpers in `index.html`**

Add helpers with these mappings:

```js
const modeFields={amount:['amount'],payer:['payer'],payee:['payee'],payee_amount:['payee','amount']};
const templateFields={金额:'amount',付款人:'payer',收款人:'payee',日期:'date',流水号:'serial'};
```

Custom templates only require placeholders actually present; `{序号}` is ignored. Missing means an empty trimmed string, or an empty array for `accounts`. Merge copies supplement values only where the primary value is missing.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/pdf-receipt-ocr-fallback.test.js`

Expected: all helper tests PASS.

- [ ] **Step 5: Mirror helpers to `excel-tools.html` and compare**

Run `rg -n "pdfSplitRequiredReceiptFields|pdfSplitMissingReceiptFields|pdfSplitMergeMissingReceiptFields" index.html excel-tools.html` and confirm all three functions occur once in each file.

### Task 2: Restore the Two Historical OCR Adapters

**Files:**
- Modify: `index.html`
- Modify: `excel-tools.html`
- Test: `tests/pdf-receipt-ocr-fallback.test.js`

**Interfaces:**
- Produces: `pdfSplitRunPaddleOcr(canvas)` returning `{lines, blocks, raw, ok, error}`.
- Produces: `pdfSplitRunTesseractOcr(canvas)` returning `{lines, blocks, raw, ok, error}`.
- Consumes: the existing `pdfSplitExtractReceiptFields(lines)` parser.

- [ ] **Step 1: Add failing source-contract tests**

Assert that each HTML contains both adapter names, that Paddle runs before Tesseract inside `pdfSplitOcrReceiptCanvas`, and that the obsolete banner-only message `当前版本使用本地 PaddleOCR.js` is not used as the only scanned-PDF outcome.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/pdf-receipt-ocr-fallback.test.js`

Expected: FAIL because the current page has no working Paddle adapter in the receipt coordinator.

- [ ] **Step 3: Restore Paddle from `9a061809002d`**

Restore its loader, one-time initialization promise, result-to-lines normalization, and canvas recognition call. Convert failures into `{ok:false,error}` instead of throwing out of the split operation.

- [ ] **Step 4: Restore Tesseract from `cae519c03f30`**

Restore the exact worker language, render/crop input, preprocessing and recognition parameters from that commit. Preserve one worker per page session and return failure metadata without aborting export.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `node --test tests/pdf-receipt-ocr-fallback.test.js`

Expected: adapter source-contract tests PASS.

- [ ] **Step 6: Apply the identical adapter block to `excel-tools.html`**

Compare targeted blocks with a script that extracts from the first OCR adapter declaration through the end of `pdfSplitOcrReceiptCanvas`; expected diff is empty.

### Task 3: Wire Paddle-First, Tesseract-Fallback Orchestration

**Files:**
- Modify: `index.html`
- Modify: `excel-tools.html`
- Test: `tests/pdf-receipt-ocr-fallback.test.js`

**Interfaces:**
- Consumes: `pdfSplitMissingReceiptFields`, `pdfSplitMergeMissingReceiptFields`, `pdfSplitRunPaddleOcr`, `pdfSplitRunTesseractOcr`.
- Produces: `pdfSplitOcrReceiptCanvas(canvas, fallbackLines, layoutFields)` returning merged receipt fields plus `ocrSources`.

- [ ] **Step 1: Write failing coordinator tests with injected engines**

Cover these behaviors:

```js
// Complete text-layer fields: neither OCR engine called.
// Missing amount: Paddle called; if it supplies amount, Tesseract not called.
// Paddle throws or returns empty lines: Tesseract called.
// Paddle supplies payer but not amount: Tesseract runs and only fills amount.
// Existing payee must not be overwritten by either engine.
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/pdf-receipt-ocr-fallback.test.js`

Expected: FAIL because the current coordinator calls Tesseract directly.

- [ ] **Step 3: Implement minimal orchestration**

Determine the active naming mode and template from the UI. Start from layout/text-layer fields. If required fields are missing, run Paddle, parse its lines, and merge only missing values. Recalculate missing fields; only then run Tesseract and merge only missing values. Record successful engines in `ocrSources` and append a manual-review warning only when required fields remain missing or an OCR-derived amount is used.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/pdf-receipt-ocr-fallback.test.js`

Expected: all coordinator tests PASS.

- [ ] **Step 5: Mirror the coordinator to `excel-tools.html`**

Extract and compare the coordinator and helper blocks; expected diff is empty.

### Task 4: Validate Syntax, Historical Settings, and Browser Flow

**Files:**
- Verify: `index.html`
- Verify: `excel-tools.html`
- Verify: `test-receipt.pdf`

**Interfaces:**
- Consumes all prior tasks.
- Produces verified static pages with no syntax regression.

- [ ] **Step 1: Run the full Node test suite**

Run: `node --test tests/pdf-receipt-ocr-fallback.test.js`

Expected: PASS with zero failures.

- [ ] **Step 2: Run embedded-script syntax checks**

For each HTML, extract non-`src` script bodies and pass them to `new Function(script)`.

Expected: both files report syntax OK.

- [ ] **Step 3: Confirm historical Tesseract settings**

Compare the Tesseract worker setup, crop/render scale and preprocessing block against commit `cae519c03f30` using GitHub file contents. Expected: no behavior-changing difference outside the new failure-return wrapper.

- [ ] **Step 4: Start the local static server**

Run: `python3 -m http.server 8765`

Expected: both `/index.html` and `/excel-tools.html` return HTTP 200.

- [ ] **Step 5: Exercise `test-receipt.pdf` in receipt mode**

Verify the page splits, the result remains editable, Paddle is attempted before Tesseract, Tesseract activates when Paddle is unavailable/incomplete, and export completes without uploading the document.

- [ ] **Step 6: Record the no-Git limitation**

Do not run commit steps because this workspace contains no `.git` directory. Report changed files, test commands and manual-browser observations in the handoff.
