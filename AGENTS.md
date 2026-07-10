# 办公工具网站专项说明

## 定位

这里是独立的“办公工具箱”静态网站。用户说“办公工具网站 / 工具网站 / office-tools / 批量重命名 / Sheet 合并 / 文件合并 / PDF 合并拆分 / 表格拆分 / 文件名汇总”时，优先把工作范围限定在本目录，不要先扫描整个 `/工作`。

## 关键文件

- `index.html`：在线入口，通常必须改。
- `excel-tools.html`：本地/备用入口，通常要和 `index.html` 同步改。
- `README.md` / `CHANGELOG.md`：只有用户要求更新说明或发布记录时再改。
- `打开在线版.html`：跳转在线版，一般不要改。

## 工作方式

1. 先在本目录内用 `rg` 定位功能名和函数名，避免全仓库搜索。
2. 这个项目是单文件前端应用，`index.html` 和 `excel-tools.html` 都很大，里面内嵌第三方库。不要阅读文件开头的大段内嵌库；优先用关键词定位业务代码。
3. 改业务逻辑时，通常要同时修改 `index.html` 和 `excel-tools.html`，保持两个入口一致。
4. 能做小改就小改，不重构成框架项目，除非用户明确要求。
5. 文件处理功能必须保持浏览器本地处理，不新增上传服务器、后端、API Key。

## 常用定位词

- 多文件合并：`page-multi`、`multiExportXLSX`、`multiHandleFiles`
- Sheet 合并：`page-sheet`、`sheetMerge`、`sheetExportXLSX`
- 批量重命名：`page-rename`、`renameAddFiles`、`renameDownloadZip`
- 文件名汇总：`page-filelist`、`flHandleFiles`
- 表格拆分：`page-split`、`splitExport`
- PDF 合并：`page-pdf`、`pdfHandleFiles`
- PDF 拆分：`page-pdfsplit`、`pdfSplit`

## 验证

- 至少跑一次脚本语法检查：
  `node -e "...new Function(script)..."`
- 页面可用性用本地静态服务验证：
  `python3 -m http.server <端口>`
- 如果只是导出格式小改，至少确认相关函数和导出路径都同步到两个 HTML。

