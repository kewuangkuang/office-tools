const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

test('template selection preview fits the complete page inside the viewport', () => {
  const cssStart = html.indexOf('/* ===== Receipt Crop Adjust Modal ===== */');
  const cssEnd = html.indexOf('/* ===== Container ===== */', cssStart);
  const modalStart = html.indexOf('<div class="modal-mask" id="templateSelectModal"');
  const modalEnd = html.indexOf('<!-- 回单裁剪调整模态框 -->', modalStart);

  assert.ok(cssStart >= 0 && cssEnd > cssStart, 'template preview styles should exist');
  assert.ok(modalStart >= 0 && modalEnd > modalStart, 'template preview modal should exist');

  const css = html.slice(cssStart, cssEnd);
  const modal = html.slice(modalStart, modalEnd);

  assert.match(css, /#templateSelectModal\s+\.crop-adjust-modal[\s\S]*?height:\s*min\([^;]*100vh/);
  assert.match(css, /#templateSelectModal\s+\.crop-adjust-body[\s\S]*?min-height:\s*0/);
  assert.match(css, /#templateSelectModal\s+\.crop-adjust-canvas-wrap[\s\S]*?overflow:\s*auto/);
  assert.match(css, /#templateSelectModal\s+\.crop-adjust-canvas-wrap\s+canvas[\s\S]*?max-height:\s*100%/);
  assert.doesNotMatch(modal, /max-height:\s*62vh/, 'the canvas must not keep a viewport-only height that can exceed its flex wrapper');
});
