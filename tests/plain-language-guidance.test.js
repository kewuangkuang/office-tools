const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

test('homepage describes tools by the result users want', () => {
  assert.match(html, /追加到表尾/);
  assert.match(html, /一个 Excel 内的多个工作表 → 一张表/);
  assert.match(html, /按部门、人员等内容拆分/);
  assert.match(html, /把一页中的多张回单分别裁出/);
});

test('spreadsheet settings mark common defaults and use recognizable examples', () => {
  assert.match(html, /每个工作表开头有几行标题？/);
  assert.match(html, /使用原工作表名称（常用）/);
  assert.match(html, /列顺序不一样时自动对齐/);
  assert.match(html, /“部门”在 B 列就填 2/);
  assert.match(html, /相同部门会放进同一份/);
});

test('PDF and image settings explain the visible output', () => {
  assert.match(html, /一张导出页面里放几页内容？/);
  assert.match(html, /按页拆分/);
  assert.match(html, /自动识别回单/);
  assert.match(html, /要生成几个 PDF？/);
  assert.match(html, /清晰度和文件大小/);
});

test('simple rename uploads stay visually bounded on wide screens', () => {
  assert.match(html, /\.rename-upload-zone\s*\{[\s\S]*?max-width:\s*760px/, 'rename upload zones should have a readable max width');
  assert.equal((html.match(/class="upload-zone rename-upload-zone"/g) || []).length, 3, 'rename, recognition, and filename-list uploads should share the bounded treatment');
});

test('every tool page has the same centered content shell', () => {
  assert.match(html, /\.tool-page\s*\{[\s\S]*?max-width:\s*860px/, 'tool pages should share the Sheet-style content width');
  assert.equal((html.match(/class="tool-page"/g) || []).length, 9, 'all tool pages should opt into the shared shell');
});

test('homepage categories match their visible tool counts', () => {
  assert.match(html, /id="excelSectionTitle">Excel 工具<\/h2>[\s\S]*?class="tool-section-count">3 个工具<\/span>/, 'Excel count should match its three visible cards');
  assert.match(html, /id="renameSectionTitle">文件与数据工具<\/h2>[\s\S]*?class="tool-section-count">4 个工具<\/span>/, 'file and data tools should include all four visible cards');
});

test('homepage uses one consistent line-icon family', () => {
  const homepage = html.slice(html.indexOf('id="page-home"'), html.indexOf('id="page-multi"'));
  assert.match(html, /href="https:\/\/cdn\.jsdelivr\.net\/npm\/@phosphor-icons\/web@2\.1\.2\/src\/regular\/style\.css"/);
  assert.equal((homepage.match(/class="tool-section-mark"><i class="ph /g) || []).length, 3, 'each category should use a line icon mark');
  assert.equal((homepage.match(/class="tool-icon"><i class="ph /g) || []).length, 10, 'each homepage card should use a line icon');
  assert.doesNotMatch(homepage, /📁|📑|✂️|📕|📄|🖼️|🏷️|🔎|📊|📋|>PDF<\/div>|>Aa<\/div>|>▦<\/div>/, 'homepage cards should not fall back to mixed emoji or text icons');
});

test('homepage distinguishes file merging from worksheet merging', () => {
  assert.match(html, /class="tool-icon"><i class="ph ph-files"[^>]*><\/i><\/div>\s*<h3>多文件合并<\/h3>/);
  assert.match(html, /class="tool-icon"><i class="ph ph-table"[^>]*><\/i><\/div>\s*<h3>工作表合并<\/h3>/);
  assert.match(html, /<span class="tool-tag featured">多个文件<\/span>/);
  assert.match(html, /<span class="tool-tag featured">单个文件<\/span>/);
});

test('default theme uses a calm blue as its primary color', () => {
  assert.match(html, /--primary:\s*#48689A;/);
  assert.match(html, /--primary-rgb:\s*72,\s*104,\s*154;/);
});

test('daytime header keeps the purple-blue brand gradient with a line icon', () => {
  assert.match(html, /\.header\s*\{[\s\S]*?background:\s*linear-gradient\(135deg,\s*#4F3A8C 0%,\s*#4F6EF7 100%\)/);
  assert.match(html, /<h1><i class="ph ph-chart-bar home-brand-icon"[^>]*><\/i>办公工具箱<\/h1>/);
});

test('theme variants preserve category separation and soften dark icon surfaces', () => {
  assert.match(html, /body\.theme-eye \.tool-section\s*\{\s*border-top-color:\s*var\(--section-color\);/);
  assert.match(html, /body\.theme-dark \.tool-section\.excel\s*\{[\s\S]*?--section-soft:\s*#19342D;/);
  assert.match(html, /body\.theme-dark \.tool-section\.pdf\s*\{[\s\S]*?--section-soft:\s*#3B282F;/);
  assert.match(html, /body\.theme-dark \.tool-section\.rename\s*\{[\s\S]*?--section-soft:\s*#302946;/);
  assert.match(html, /body\.theme-dark \.tool-section\s*\{\s*border-top-color:\s*var\(--section-color\);/);
});

test('upload zones share a compact visual system and tablet breakpoint', () => {
  assert.match(html, /\.upload-zone\s*\{[\s\S]*?min-height:\s*184px/, 'upload zones should share a stable minimum height');
  assert.equal((html.match(/class="upload-support-summary"/g) || []).length, 2, 'the large upload instructions should be replaced by compact summaries');
  assert.match(html, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.tools-grid\s*\{[\s\S]*?repeat\(2/, 'homepage should collapse to two columns on tablets');
});

test('homepage becomes a single column on phones without noisy wrapping', () => {
  const mobileStyles = html.slice(html.indexOf('@media (max-width: 600px)'), html.indexOf('/* ===== PDF Tool ====='));
  assert.match(mobileStyles, /\.tools-grid\s*\{\s*grid-template-columns:\s*1fr;/, 'homepage cards should become one column on phones');
  assert.match(mobileStyles, /\.tool-section\.rename \.tools-grid\s*\{\s*grid-template-columns:\s*1fr;/, 'the 2×2 file/data group should become one column on phones');
  assert.match(mobileStyles, /\.tool-section-title h2\s*\{[\s\S]*?white-space:\s*nowrap;/, 'category titles should stay on one line on phones');
  assert.match(mobileStyles, /\.tool-tag\s*\{\s*white-space:\s*nowrap;/, 'tags should not break inside a pill');
});

test('interactive controls expose a visible keyboard focus state', () => {
  assert.match(html, /button:focus-visible,\s*a:focus-visible,\s*input:focus-visible,\s*select:focus-visible/, 'buttons, links, and form controls should share a focus ring');
});

test('large preview images stay hidden until a real preview is loaded', () => {
  assert.match(html, /id="batchRecognizePreviewImage"[^>]*\bhidden\b/, 'the preview dialog should not render an empty image placeholder');
});

test('PDF split guidance explains mode choices in plain language', () => {
  assert.match(html, /id="pdfSplitModeDescription"[^>]*>每页生成一个文件，速度最快/);
  assert.match(html, /按 1、2、3 的顺序框选每张回单/);
  assert.match(html, /优先读取 PDF 自带文字；读取不到时，再使用本地文字识别/);
  assert.doesNotMatch(html, /识别顺序：PDF 文字层 → 本地 PaddleOCR → Tesseract/);
});

test('PDF split upload guidance states the single-file limitation', () => {
  assert.match(html, /只处理其中第一个 PDF/);
  assert.match(html, /当前只处理一个 PDF；多个 PDF 请先使用“PDF 合并”/);
});

test('reset and output actions use consistent user-facing wording', () => {
  assert.equal((html.match(/清空并重新开始/g) || []).length, 3, 'PDF and image tools should use the same reset label');
  assert.equal((html.match(/>🔄 重新开始<\/button>/g) || []).length, 6, 'result cards should use one restart action label');
  assert.match(html, /改名并下载 ZIP/);
  assert.match(html, /如何使用文件名链接/);
});

test('renaming tools guide users with concrete examples and action language', () => {
  assert.match(html, /输入规则批量改（常用）/);
  assert.match(html, /“1月报表\.xlsx”会变成“2月报表\.xlsx”/);
  assert.match(html, /应用本次规则到预览/);
  assert.match(html, /示范文件/);
  assert.match(html, /公司名称_日期\.pdf/);
  assert.match(html, /多段文字之间用什么隔开？/);
});
