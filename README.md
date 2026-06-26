# 办公工具箱

一个在浏览器里运行的办公文件处理工具箱，主要面向财务、行政、门店资料整理等高频场景。

在线使用地址：

<https://kewuangkuang.github.io/office-tools/>

## 能做什么

- 多个 Excel / CSV 文件合并
- 单个 Excel 内多个 Sheet 合并
- PDF 合并，支持每页放多个原始页面
- PDF 拆分，支持按页、按范围、回单场景拆分，可导出 PDF 或 JPG
- 批量重命名，并打包成 ZIP 下载
- 大表拆分，支持按列值或固定行数拆分
- 文件名汇总，导出 Excel 清单

## 使用方式

### 方式一：直接打开网页

访问下面地址即可使用，不需要注册 GitHub，也不需要下载代码：

<https://kewuangkuang.github.io/office-tools/>

### 方式二：下载后本地使用（处理敏感文件时推荐）

1. 下载本仓库代码。
2. 双击打开 `index.html`。
3. 把文件拖进去处理。

这个项目不需要安装 Python、Node.js、数据库，也不需要注册账号。

## 问题反馈

使用中遇到问题或有改进建议，可以填写反馈表：

<https://my.feishu.cn/share/base/form/shrcnTJaOV5wHJZ2Zk37qyVBd6b>

请尽量写清楚使用的功能、操作步骤和实际现象。截图可以上传，但不要上传含敏感信息的原始财务文件。

## 更新日志

重要更新见 [CHANGELOG.md](./CHANGELOG.md)。

## 其他用户需要配置什么

大部分功能不需要配置。

| 功能 | 是否需要配置 | 说明 |
|---|---:|---|
| Excel 合并 / Sheet 合并 / 表格拆分 | 否 | 浏览器本地读取和导出 |
| PDF 合并 / PDF 拆分 | 否 | 浏览器本地处理 |
| 批量重命名 / 文件名汇总 | 否 | 浏览器本地处理 |
| 部分 PDF 回单识别场景 | 需要联网 | 如触发 OCR，会从 CDN 加载 `tesseract.js` 和 OCR 语言包 |

## 网络要求

普通 Excel / PDF 功能主要在浏览器本地运行。

部分 PDF 回单识别场景可能会用到 OCR。OCR 依赖 `tesseract.js`，当前通过 CDN 加载：

```html
https://cdn.jsdelivr.net/npm/tesseract.js@5.0.4/dist/tesseract.min.js
```

因此：

- 能联网时：需要 OCR 的识别场景可以自动加载识别引擎和语言包。
- 断网或公司内网限制 CDN 时：普通功能可用，需要 OCR 的识别场景可能失败。
- 处理敏感文件时：建议下载源码后本地打开 `index.html` 使用。

## 隐私说明

本工具的设计目标是尽量在浏览器本地完成文件处理。用户选择的 Excel、PDF、图片、文件名等内容不会主动上传到作者服务器。

需要注意：

- 部分 PDF 回单识别场景会加载第三方 CDN 脚本和语言包。
- 如果你访问的是别人部署的网站，浏览器仍会向该网页地址和第三方 CDN 发起请求。
- 处理财务、合同、身份证、银行回单等敏感文件时，建议下载本仓库后在本地打开 `index.html`。

更完整说明见 [PRIVACY.md](./PRIVACY.md)。

## 技术依赖

项目目前是一个单文件前端应用：

- `index.html`：页面、样式、业务逻辑
- 内联库：SheetJS、ExcelJS、pdf-lib、PDF.js 等
- 在线库：Tesseract.js，用于部分 PDF 回单 OCR 识别场景

没有后端服务，没有数据库，没有 API Key。

## 已知边界

- OCR 识别准确率受扫描质量、表格线、图片清晰度影响，结果需要人工复核。
- 加密、损坏、超大 PDF 可能无法处理或处理较慢。
- 浏览器性能有限，特别大的 Excel / PDF 可能卡顿。
- 当前主要按中文办公场景设计，其他语言文件未充分验证。

## 许可证

本项目使用 MIT License，见 [LICENSE](./LICENSE)。
