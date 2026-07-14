# 回单模式功能地图

唯一应用入口：[index.html](../../index.html)。`excel-tools.html` 仅兼容旧文件名并跳转，不承载业务代码。

## 处理链

| 阶段 | 责任 | 主函数 | 输入 | 输出 / 验证 |
|---|---|---|---|---|
| 1. 页面渲染 | 将选定 PDF 页转为画布并读取文字层 | `pdfSplitExecute` | `pdfSplitJsDoc`、选中页 | 每页 `canvas`、`textContent` |
| 2. 回单裁剪 | 文字层优先；扫描件按图像分界；单张页不硬切 | `pdfSplitReceiptCropsForPage`、`pdfSplitDetectReceiptGapsFromImage`、`pdfSplitShouldKeepSingleScanReceipt` | 页面文字项、画布、每页张数 | `receiptCrops`；丽水为 2 + 2 + 1 |
| 3. OCR 调度 | 先合并文字层字段；缺字段时识别原始裁切图；仍缺名称时识别放大名称区 | `pdfSplitOcrReceiptCanvas`、`pdfSplitRunTesseractOcr`、`pdfSplitCreatePartyNameOcrCanvas` | 原始裁切 `cc`、文字层行、版式字段 | 带 `ocrSource` 的字段对象 |
| 4. 字段解析 | 解析金额、付款人、收款人、日期、流水和账号 | `pdfSplitExtractReceiptFields`、`pdfSplitExtractPairedPartyNames`、`pdfSplitExtractAmountInfo` | OCR 行 / 文字层行 | `fields`；名称为空时保留核对提示 |
| 5. 命名 | 依据命名模式生成、去重并允许人工修改 | `pdfSplitBuildReceiptBaseName`、`pdfSplitFinalizeReceiptNames` | `fields`、序号 | `baseName`、`name` |
| 6. 结果与导出 | 显示预览、字段状态并导出 PDF/JPG | `pdfSplitRenderResults`、`pdfSplitDownload` | `pdfSplitResults` | 可编辑文件名与下载文件 |

## 排错入口

出现问题时，从结果字段反向定位，禁止直接改解析正则：

1. 裁剪数量或边界错：检查阶段 2 的 `receiptCrops` 和原图预览。
2. 只有扫描件名称为空：检查阶段 3 是否把原始 `cc` 传给 `pdfSplitOcrReceiptCanvas`，再查看 OCR 行。
3. OCR 行已有“付款人名称 / 收款人名称”但字段为空：检查阶段 4 的 `pdfSplitExtractPairedPartyNames`。
4. 字段正确、文件名错误：检查阶段 5 的命名模式和用户编辑值。
5. 字段正确、页面显示错误：检查阶段 6 的 `pdfSplitRenderResults`。

## 回归样本

- `丽水.pdf`：扫描件；预期 5 张、不含残片、OCR 路径可得到金额及两方字段。
- `五一.pdf`：文字层 PDF；预期优先文字层，不必启动扫描件 OCR。

## 修改规则

- 业务代码只改 `index.html`。
- 任何回单改动先增加或调整 `tests/pdf-receipt-ocr-fallback.test.js`，先看到失败，再写实现。
- 修改完成后必须运行 `node --test tests/pdf-receipt-ocr-fallback.test.js` 和内嵌脚本语法检查。
- 一个问题一个 Git 提交；不要把页面样式、其他工具和 OCR 算法混在同一次修改里。
