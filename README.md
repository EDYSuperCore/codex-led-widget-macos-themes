# Codex LED Widget

## 中文说明

Codex LED Widget 是一个支持 Windows/macOS 的桌面透明悬浮小组件，用于显示本机 Codex 剩余额度。

界面采用液态玻璃质感，并通过红绿灯状态快速展示额度情况。

![Codex LED Widget Screenshot](assets/1.png)
![Codex LED Widget Screenshot](assets/2.png)
![Codex LED Widget Screenshot](assets/3.png)
![Codex LED Widget Screenshot](assets/4.png)
![Codex LED Widget Screenshot](assets/5.png)

## 功能

- 液态玻璃质感界面
- 红绿灯额度状态
  - 绿色：剩余额度大于等于 10%
  - 黄色：剩余额度小于 10% 且大于 0
  - 红色：剩余额度为 0
- 支持中文 / English 切换
- 支持置顶 / 取消置顶
- 支持 5 套内置主题，并会记住上次选择
- 自动刷新额度
- 到重置时间后自动重新读取额度
- macOS 打包 App 会优先查找 `/opt/homebrew/bin/codex`、`/usr/local/bin/codex`、`/usr/bin/codex`

## 使用方法

### Windows

1. 下载 Release 中的 exe 文件
2. 确保本机已经安装并登录 Codex
3. 双击运行 exe
4. 如果 Windows 提示未知发布者，请点击“更多信息”，然后选择“仍要运行”

### macOS

1. 下载 Release 中的 dmg 或 zip 文件
2. 确保终端中可以执行 `codex`
3. 如果 `codex` 不在 PATH 中，可以设置 `CODEX_CLI_PATH` 指向 Codex CLI 可执行文件
4. 首次打开如遇到 macOS 安全提示，需要到系统设置中允许打开

## 开发与打包

```bash
npm install
npm run dev
npm run build:dir
npm run build:mac
npm run build:win
```

调试 Codex 额度读取：

```bash
npm run debug:quota
```

主题可以通过托盘菜单中的“主题”子菜单切换，也可以点击窗口顶部的主题按钮切换。主题选择保存在本机 `localStorage` 中，重启后会自动恢复。

## 隐私说明

- 本工具使用本机 Codex 登录状态读取额度信息
- 不会读取、保存或显示你的认证 Token
- 剩余额度根据 Codex 返回的 `usedPercent` 字段计算
- 诊断信息会隐藏常见 token / API key 形式的敏感字段

## English

Codex LED Widget is a Windows/macOS floating desktop widget for showing your local Codex remaining usage quota.

The interface uses a liquid glass style and displays quota status with a traffic-light indicator.

## Features

- Liquid glass style interface
- Traffic-light quota status
  - Green: remaining quota is 10% or higher
  - Yellow: remaining quota is below 10% and above 0
  - Red: remaining quota is 0
- Chinese / English language switch
- Pin / unpin always-on-top
- 5 built-in themes with local persistence
- Automatic quota refresh
- Automatically refreshes again after the quota reset time
- Packaged macOS apps prefer `/opt/homebrew/bin/codex`, `/usr/local/bin/codex`, and `/usr/bin/codex`

## How to Use

### Windows

1. Download the exe file from Releases
2. Make sure Codex is installed and signed in on your computer
3. Double-click the exe to run it
4. If Windows shows an unknown publisher warning, click “More info”, then choose “Run anyway”

### macOS

1. Download the dmg or zip file from Releases
2. Make sure `codex` can run from Terminal
3. If `codex` is not in PATH, set `CODEX_CLI_PATH` to the Codex CLI executable
4. If macOS shows a first-open security warning, allow the app in System Settings

## Development

```bash
npm install
npm run dev
npm run build:dir
npm run build:mac
npm run build:win
```

Debug quota loading:

```bash
npm run debug:quota
```

Themes can be changed from the tray menu or the theme button in the title bar. The selected theme is stored locally in `localStorage` and restored on restart.

## Privacy

- This tool uses your existing local Codex sign-in state to read quota information
- It does not read, store, or display your authentication tokens
- The remaining quota is calculated from Codex’s `usedPercent` field
- Diagnostics redact common token / API key patterns
