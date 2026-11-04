# 办公工具箱本地高精度 OCR 助手

这是一个实验版的本地 OCR 服务。配套的 `start-local.command` 会同时启动本地网页和 OCR 助手；批量识别命名会把选中的文字裁剪区域发送到 `127.0.0.1:8765`，由本机的 `PP-OCRv5_server` 模型识别。

图片只在本机的浏览器和本地助手之间传输，不会发送到百度或其他云 OCR 服务。助手没有运行时，网页会自动回退到浏览器里的 PaddleOCR/Tesseract。

## 运行环境

- macOS Apple Silicon（M 系列）可以使用 CPU 版 PaddlePaddle；当前官方 macOS pip 包不再支持 Intel x86_64。Windows x64 和 Linux x64 可使用对应 CPU 包。
- Python 使用 3.10、3.11、3.12 或 3.13。Python 3.14 暂不在本实验版支持范围内。
- 第一次安装需要联网下载 Python 依赖；第一次实际识别还会下载模型文件。

PaddlePaddle 的系统与 Python 支持以[官方安装说明](https://www.paddlepaddle.org.cn/documentation/docs/zh/install/pip/macos-pip.html)为准。

## macOS 本地启动

从“下载本地版”得到 ZIP 后，先解压整个文件夹。推荐直接双击 `start-local.command`。它会：

- 启动本地 OCR 助手；
- 在 `127.0.0.1:8766` 提供当前工具网站；
- 自动打开 `http://127.0.0.1:8766/index.html`。

保持终端窗口打开，关闭窗口会停止本地网页和 OCR 助手。

如果 macOS 阻止执行，可在终端运行：

```bash
cd /path/to/ocr-local-helper
chmod +x start-local.command
./start-local.command
```

脚本会创建 `.venv`、安装依赖，然后只监听本机回环地址。看到：

```text
本地网页：http://127.0.0.1:8766/index.html
```

打开本地网页，进入“批量识别命名”即可调用本地 OCR。识别结果来源显示“本地 PaddleOCR Server”时，表示已经真正使用了本地高精度模型。

如果只需要启动 OCR 助手，也可以双击 `start-macos.command`，再另外运行本地静态服务：

```bash
cd /path/to/工具网站
python3.13 -m http.server 8766 --bind 127.0.0.1
```

## Windows 本地启动

在已安装 Python 3.10–3.13 的 Windows 电脑上，双击 `start-windows.bat`。脚本会创建虚拟环境、安装依赖、启动两个回环服务，并打开：

```text
http://127.0.0.1:8766/index.html
```

如果 Windows 阻止脚本运行，请右键使用命令提示符打开；不要把服务改成监听 `0.0.0.0`。

## 手动运行

```bash
python3.13 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install paddlepaddle==3.2.0 -i https://www.paddlepaddle.org.cn/packages/stable/cpu/
python -m pip install -r requirements.txt
python -m uvicorn server:app --host 127.0.0.1 --port 8765
```

另开一个终端提供本地网页：

```bash
cd /path/to/工具网站
python3.13 -m http.server 8766 --bind 127.0.0.1
```

服务接口：

- `GET /health`：检测助手是否在线，不加载模型。
- `POST /v1/ocr`：字段名为 `image` 的单图识别。
- `POST /v1/ocr/batch`：重复提交字段名 `images` 的多图识别，返回顺序与上传顺序一致。

不要把服务改成监听 `0.0.0.0`，否则局域网内其他设备可能访问本地 OCR 接口。模型和依赖会占用本机磁盘与内存；停止终端进程即可停止服务。

## 当前限制

这是本地实验原型，不是签名安装包。当前 macOS 启动脚本需要用户已有 Python 3.10–3.13；后续如果确认效果值得保留，再制作无需 Python 环境的 macOS/Windows 安装包。
