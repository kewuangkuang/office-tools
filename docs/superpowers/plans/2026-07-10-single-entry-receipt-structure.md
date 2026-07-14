# Single Entry Receipt Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep one full office-tools application and make the old local entry redirect to it, eliminating duplicated receipt OCR code.

**Architecture:** `index.html` is the sole application source. `excel-tools.html` becomes a compatibility shell that immediately redirects to sibling `index.html` and shows a manual link if script navigation is unavailable. Regression tests enforce this boundary.

**Tech Stack:** Static HTML, Node.js built-in test runner, Git.

## Global Constraints

- Keep all file processing in the browser; add no backend or API key.
- Do not change any business behavior in `index.html` during this task.
- Preserve `excel-tools.html` as a usable legacy filename.
- Do not track OCR models or sample PDFs in Git.

---

### Task 1: Lock the single-entry contract with tests

**Files:**
- Modify: `tests/pdf-receipt-ocr-fallback.test.js`

**Interfaces:**
- Consumes: `index.html`, `excel-tools.html`
- Produces: a test that rejects a duplicated legacy application and requires a relative redirect.

- [x] **Step 1: Write the failing test**

Add a test that requires `excel-tools.html` to contain `index.html`, a `location.replace` call, and no `function pdfSplit` definition; also require `index.html` to contain `function pdfSplitOcrReceiptCanvas`.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/pdf-receipt-ocr-fallback.test.js`

Expected: FAIL because the legacy page still contains the duplicated application.

- [x] **Step 3: Implement the compatibility shell**

Replace `excel-tools.html` with a small standalone HTML page that calls:

```html
<script>location.replace(new URL('index.html', location.href).href);</script>
```

and includes an `<a href="index.html">` fallback link.

- [x] **Step 4: Run tests and syntax checks**

Run:

```bash
node --test tests/pdf-receipt-ocr-fallback.test.js
node -e "const fs=require('fs'); new Function(fs.readFileSync('excel-tools.html','utf8').match(/<script>([\\s\\S]*?)<\\/script>/)[1]);"
```

Expected: all tests pass and the redirect script parses.

- [ ] **Step 5: Commit**

```bash
git add index.html excel-tools.html tests/pdf-receipt-ocr-fallback.test.js docs/superpowers/specs/2026-07-10-receipt-mode-structure-design.md docs/superpowers/plans/2026-07-10-single-entry-receipt-structure.md
git commit -m "refactor: use a single office-tools entry"
```

### Task 2: Add an operator-facing receipt function map

**Files:**
- Create: `docs/architecture/receipt-mode-map.md`

**Interfaces:**
- Consumes: the `pdfSplit` functions in `index.html`
- Produces: a six-stage map with entry functions, inputs, outputs, and regression coverage.

- [x] **Step 1: Document the six stages**

Record the exact function names for render, crop, OCR, field extraction, naming, and result rendering. Mark `pdfSplitOcrReceiptCanvas` as the only OCR coordinator.

- [x] **Step 2: Link each stage to its regression proof**

For each stage, state the corresponding test or real sample: `丽水.pdf` for scan crop/OCR and `五一.pdf` for text layer extraction.

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/receipt-mode-map.md
git commit -m "docs: map receipt processing pipeline"
```
