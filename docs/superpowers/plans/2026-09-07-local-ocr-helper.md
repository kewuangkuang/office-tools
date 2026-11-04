# Local OCR Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional locally installed OCR helper so the online batch-recognition page can call a local PP-OCRv5 Server model without uploading images to a cloud service.

**Architecture:** Keep the existing GitHub Pages frontend and browser OCR as the default fallback. Add a loopback-only FastAPI service with `/health` and `/v1/ocr/batch`; the page posts exact field crops to it when available, and falls back to the current browser PaddleOCR/Tesseract path when it is not installed or fails.

**Tech Stack:** Vanilla JavaScript in `index.html`; Python 3.10–3.13; FastAPI; Uvicorn; Pillow; NumPy; PaddlePaddle CPU; PaddleOCR 3.x with `PP-OCRv5_server_det` and `PP-OCRv5_server_rec`.

## Global Constraints

- Keep `index.html` as the only frontend business-code source; do not add business code to `excel-tools.html`.
- Bind the helper to `127.0.0.1` by default; never expose it on `0.0.0.0` from the starter script.
- Do not put cloud credentials or reusable secrets in `index.html`.
- Preserve browser OCR and existing PDF/text-layer flows when the helper is unavailable.
- Do not stage or modify the unrelated existing files `docs/superpowers/plans/2026-07-16-multi-file-worker-upload.md`, `receipt-card-pack-extension/`, or `tests/receipt-card-pack.test.js`.

---

### Task 1: Archive the current browser OCR baseline

**Files:**
- Modify: Git history only; stage `index.html` and `tests/batch-recognize-rename.test.js`.
- Preserve: all unrelated tracked/untracked files.

- [ ] **Step 1: Check the targeted diff and whitespace**

Run:

```bash
git diff --check -- index.html tests/batch-recognize-rename.test.js
git diff --stat -- index.html tests/batch-recognize-rename.test.js
```

Expected: no whitespace errors and only the two targeted files in the stat.

- [ ] **Step 2: Create the recoverable archive commit**

```bash
git add index.html tests/batch-recognize-rename.test.js
git commit -m "fix: restore precise image OCR crops"
```

Expected: a commit containing only the current image-OCR browser fix; unrelated work remains unstaged/uncommitted.

---

### Task 2: Define and test the local-helper contract first

**Files:**
- Create: `ocr-local-helper/server.py`
- Create: `ocr-local-helper/requirements.txt`
- Create: `tests/local-ocr-helper.test.js`
- Modify: none in production frontend yet.

**Interfaces:**
- `GET /health` returns `{ "ok": true, "engine": "PP-OCRv5_server", "model_loaded": boolean }`.
- `POST /v1/ocr/batch` accepts repeated multipart field `images` and returns `{ "engine": "PP-OCRv5_server", "results": [{ "text": string, "lines": string[], "scores": number[] }] }` in request order.
- The helper accepts only configured browser origins and rejects batches over eight images.

- [ ] **Step 1: Write failing contract tests**

`tests/local-ocr-helper.test.js` must assert that the helper files exist, Python source contains `/health` and `/v1/ocr/batch`, binds to loopback in the starter path, names both Server models, and the frontend is not yet required to call the helper in this task.

- [ ] **Step 2: Run the focused test**

```bash
node --test tests/local-ocr-helper.test.js
```

Expected: FAIL because the helper files do not exist yet.

- [ ] **Step 3: Implement the smallest helper contract**

Implement lazy model loading, image-size validation, generic result normalization, loopback-safe CORS, and ordered batch responses in `server.py`; keep model loading out of `/health` so availability checks are fast.

- [ ] **Step 4: Run the focused test and Python syntax check**

```bash
node --test tests/local-ocr-helper.test.js
python3 -m py_compile ocr-local-helper/server.py
```

Expected: PASS and a successful Python compile.

---

### Task 3: Add the browser client with local-first/high-accuracy fallback

**Files:**
- Modify: `index.html` in the batch-recognize OCR section.
- Modify: `tests/batch-recognize-rename.test.js`.

**Interfaces:**
- `batchRecognizeLocalOcrHealth()` returns a boolean and caches a short-lived result.
- `batchRecognizeLocalOcrBatch(crops, onProgress)` returns the helper result array or `null` when unavailable.
- Image field recognition tries the helper first, then the current browser PaddleOCR/Tesseract path.

- [ ] **Step 1: Add failing frontend tests**

Assert that `index.html` defines the local helper URL/health and batch client, sends `images` as multipart data, uses `127.0.0.1`, and preserves the existing browser fallback.

- [ ] **Step 2: Run the focused test**

```bash
node --test tests/batch-recognize-rename.test.js
```

Expected: FAIL because the local-helper client is not present.

- [ ] **Step 3: Implement the client and integrate it only for image crops**

Use a short health timeout, an AbortController timeout for OCR requests, `canvas.toBlob('image/png')`, request-order preservation, and fallback on any network/JSON/shape error. Do not change PDF text-layer priority or invoice OCR behavior.

- [ ] **Step 4: Run the focused and full test suites**

```bash
node --test tests/batch-recognize-rename.test.js
node --test tests/*.test.js
```

Expected: all tests PASS.

---

### Task 4: Make the helper runnable by a user

**Files:**
- Create: `ocr-local-helper/README.md`
- Create: `ocr-local-helper/start-macos.command`
- Create: `ocr-local-helper/.gitignore`
- Modify: `index.html` copy only where the optional local helper is described.

- [ ] **Step 1: Document supported setup and privacy behavior**

Document Python version, Apple Silicon macOS CPU-only limitation, Windows/Linux CPU path, first-run model download, loopback-only binding, and that browser OCR remains available without installation.

- [ ] **Step 2: Add a macOS starter**

The starter creates/uses `.venv`, installs the pinned CPU PaddlePaddle and requirements, then runs `uvicorn server:app --host 127.0.0.1 --port 8765`; it must not use shell redirection or expose a public bind address.

- [ ] **Step 3: Verify documentation and starter references**

```bash
python3 -m py_compile ocr-local-helper/server.py
git diff --check -- index.html tests/batch-recognize-rename.test.js ocr-local-helper
```

Expected: no syntax or whitespace errors.

---

### Task 5: Validate the online page and finish the archive handoff

**Files:**
- Modify: none unless validation finds a defect.

- [ ] **Step 1: Run all automated checks**

```bash
node --test tests/*.test.js
node -e "const fs=require('fs');const h=fs.readFileSync('index.html','utf8');const re=/<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi;let m,n=0;while((m=re.exec(h))){if(!m[1].trim())continue;new Function(m[1]);n++;}console.log('parsed inline scripts:',n);"
```

- [ ] **Step 2: Run the static page through a local server**

```bash
python3 -m http.server 8766 --bind 127.0.0.1
```

Check the homepage and batch-recognition page for a rendered local-helper hint, no console errors, and no regression in the existing upload flow.

- [ ] **Step 3: Report what is and is not deployed**

Report the archive commit, the local helper prototype path, the fact that an installer is not yet signed/distributed, and the remaining requirement for users to run the helper locally.
