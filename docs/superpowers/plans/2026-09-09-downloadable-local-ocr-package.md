# 可下载本地 OCR 版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将“下载本地版”升级为包含网页、OCR 模型、本地 PaddleOCR Server 和启动脚本的可分发 ZIP，并保持所有图片只在用户电脑处理。

**Architecture:** 继续使用单文件 `index.html`，下载按钮通过同源 `fetch` 读取当前版本的必要静态文件，再复用现有无压缩 ZIP 构建器生成本地包。ZIP 内的本地网页运行在 `127.0.0.1`，启动脚本在用户电脑上创建 Python 虚拟环境并启动 loopback OCR 服务；服务不可用时网页保留浏览器 OCR 回退。

**Tech Stack:** 原生 HTML/JavaScript、现有 `buildZip`、FastAPI、Uvicorn、PaddleOCR/PaddlePaddle、macOS shell、Windows batch。

## Global Constraints

- 不发布、不推送、不修改线上部署。
- 只把运行所需文件放入 ZIP：`index.html`、`ocr-models/`、`ocr-local-helper/` 和许可证文件。
- OCR 服务只监听 `127.0.0.1`，不监听 `0.0.0.0`。
- 首版依赖用户已有 Python 3.10–3.13；Mac M 系列和 Windows x64 提供启动脚本。
- 双击本地 HTML 不是推荐运行方式，必须通过本地静态服务打开，避免 `file://` 的 Worker/CORS 限制。

---

### Task 1: Lock the local package manifest and platform launchers

**Files:**
- Create: `ocr-local-helper/start-windows.bat`
- Modify: `tests/local-ocr-helper.test.js`

**Interfaces:**
- Produces a Windows launcher that creates `ocr-local-helper\\.venv`, starts `server.py` on `127.0.0.1:8765`, serves the project on `127.0.0.1:8766`, and opens `index.html`.
- Tests expose the exact package paths required by the browser download function.

- [ ] **Step 1: Write the failing test**

Add assertions for `start-windows.bat` and the package manifest strings in `index.html`; require the manifest to include `index.html`, both PP-OCRv5 model archives, all Tesseract local assets, `server.py`, both launchers, `requirements.txt`, `README.md`, and `LICENSE`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/local-ocr-helper.test.js`

Expected: FAIL because the Windows launcher and package manifest do not exist yet.

- [ ] **Step 3: Add the Windows launcher**

Implement `start-windows.bat` with `py -3.13` through `py -3.10` detection, virtual-environment creation, dependency installation, loopback-only Uvicorn, local `http.server`, and `start http://127.0.0.1:8766/index.html`. Do not include a public URL or `0.0.0.0`.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `node --test tests/local-ocr-helper.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/local-ocr-helper.test.js ocr-local-helper/start-windows.bat
git commit -m "feat: add Windows launcher for local OCR"
```

### Task 2: Make the existing download button create the complete local ZIP

**Files:**
- Modify: `index.html:1911`
- Modify: `index.html:10551-10565`
- Modify: `tests/local-ocr-helper.test.js`

**Interfaces:**
- `LOCAL_PACKAGE_FILES`: ordered list of same-origin package entries with `{path,name}`.
- `downloadLocalVersion()`: async function that fetches every package entry, calls `buildZip(entries)`, and downloads `办公工具箱本地版.zip`.

- [ ] **Step 1: Write the failing test**

Assert that the button title describes a ZIP local OCR package, `LOCAL_PACKAGE_FILES` includes the required frontend/model/helper assets, and `downloadLocalVersion` uses `fetch`, `buildZip`, and the ZIP filename.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/local-ocr-helper.test.js`

Expected: FAIL because the button still downloads one HTML file and no package manifest exists.

- [ ] **Step 3: Implement the download flow**

Replace the single-HTML download with an async same-origin fetch of the manifest entries. Encode the live document as `index.html`, preserve binary model files as `Uint8Array`, show progress on the button, restore the button in `finally`, and show a clear error if a static asset is missing. Keep the `file:` case actionable: tell the user to download from a served page or use the packaged folder.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `node --test tests/local-ocr-helper.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/local-ocr-helper.test.js
git commit -m "feat: download complete local OCR package"
```

### Task 3: Document the downloaded package and verify its contents

**Files:**
- Modify: `README.md`
- Modify: `ocr-local-helper/README.md`
- Modify: `tests/local-ocr-helper.test.js`

**Interfaces:**
- Documentation tells users to click “下载本地版”, extract the ZIP, run the platform launcher, and verify `本地 PaddleOCR Server` in the result source.

- [ ] **Step 1: Add documentation assertions**

Require the project README to mention `办公工具箱本地版.zip`, `start-local.command`, and `start-windows.bat`; require the helper README to describe both local URLs and the no-publish local workflow.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/local-ocr-helper.test.js`

Expected: FAIL until both READMEs describe the downloadable package.

- [ ] **Step 3: Update the documentation**

Explain that the ZIP is a first-version Python-based package, first run downloads dependencies/models, Mac requires Python 3.10–3.13, Windows uses the corresponding launcher, and the OCR service remains loopback-only.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `node --test tests/local-ocr-helper.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md ocr-local-helper/README.md tests/local-ocr-helper.test.js
git commit -m "docs: explain downloadable local OCR package"
```

### Task 4: Run the full verification suite

**Files:**
- Verify: `index.html`, `ocr-local-helper/server.py`, `ocr-local-helper/start-macos.command`, `ocr-local-helper/start-local.command`, `ocr-local-helper/start-windows.bat`

- [ ] **Step 1: Run all automated tests**

Run: `node --test tests/*.test.js`

Expected: all tests pass.

- [ ] **Step 2: Parse scripts and check whitespace**

Run: `python3 -m py_compile ocr-local-helper/server.py`, `bash -n ocr-local-helper/start-macos.command ocr-local-helper/start-local.command`, and `git diff --check`.

Expected: all commands succeed without output errors.

- [ ] **Step 3: Inspect the generated package manifest**

Run: `rg -n "LOCAL_PACKAGE_FILES|start-windows|PP-OCRv5|办公工具箱本地版" index.html tests/local-ocr-helper.test.js README.md ocr-local-helper/README.md`.

Expected: the same package names appear in the download code, tests, and documentation; no public deployment is performed.
