# 沉浸式免费翻译 · 桌面版 (translate-desktop)

浏览器插件 [free-immersive-translate](https://github.com/18163623522/free-immersive-translate) 的桌面端兄弟项目：把翻译能力从浏览器里解放出来，覆盖 **任何应用**——全局划词、系统级音频实时听译（桌面会议客户端/本地播放器）、截图 OCR、剪贴板流翻译。

> 当前状态：**M1 完成**（早期开发中）。Tauri 2 + 复用插件 JS 引擎，主窗口文本翻译可用；
> 全局划词 / 系统音频听译 / 截图 OCR / 悬浮条按 [DESIGN.md](DESIGN.md) 里程碑（M2-M5）逐步交付。

## 架构

```
Tauri 2 壳（Rust：WASAPI 音频 / 全局热键 / 剪贴板 / WinRT OCR / 托盘）
        │  Tauri command / event
WebView 前端（WinUI3/Fluent，复用插件 JS 引擎与 fluent.css）
```

核心决策：**插件已验证的 JS 引擎不重写**——服务商层/降级链/提示词直接搬进
webview，仅写 storage 垫片与 HTTP 桥（Rust 侧 ureq 转发，绕 webview CORS）。

## 开发

```bash
# 无需 npm/Vite：前端为纯静态文件，cargo 直编
cd src-tauri
CARGO_BUILD_JOBS=4 cargo build
# 产物：src-tauri/target/debug/translate-desktop.exe
```

图标重生成：`python tools/gen_icons.py png 32 > ...`（见脚本头部用法）。

## 里程碑

| 阶段 | 内容 | 状态 |
|---|---|---|
| M0 | Tauri2 脚手架 + 托盘窗口 | ✅ |
| M1 | 引擎移植 + 主窗口文本翻译 | ✅ |
| M2 | 全局划词 | ⬜ |
| M3 | 系统音频实时听译（WASAPI） | ⬜ |
| M4 | 截图 OCR（WinRT 本地 + 云视觉双引擎） | ⬜ |
| M5 | 悬浮条 / 剪贴板监听 / 安装包 | ⬜ |

设计细节见 [DESIGN.md](DESIGN.md)。
