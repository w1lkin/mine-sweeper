# 扫雷（Mine Sweeper）

纯前端单机经典扫雷：多档难度、自动标记、失焦暂停、沉浸式模式与常驻滚动条。

## 特性

- **纯静态**：`index.html` + `style.css` + `game.js`，零依赖、无构建步骤。
- **无需联网**：游戏逻辑全部在浏览器本地运行。
- **数据云端**：战绩与最佳纪录通过 `GamePlatform` SDK 上报云端（需登录后游玩），本地不再保存数据。
- **移动端优化**：触屏适配、失焦自动暂停（切到其他 App/窗口时弹出伪装表）、沉浸式退出按钮极小化、棋盘常驻自定义滚动条。

## 本地运行

```sh
cd mine-sweeper
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000
```

> 游戏本体离线可用；登录与云端战绩、分享卡片二维码需联网，请用上面的本地服务器方式，不要直接 `file://` 打开。

## 文件结构

```
mine-sweeper/
├── index.html     # 页面结构
├── style.css      # 样式（含沉浸模式、自定义滚动条）
├── game.js        # 逻辑层（纯逻辑 + DOM 层，可在 Node 测试）
└── tests/         # Node 自动化测试
```

## 测试

```sh
node --test tests/game.test.js tests/records.test.js
```

## 部署

已部署示例：`mine-sweeper-2f1.pages.dev`（Cloudflare Pages）。

