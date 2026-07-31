# 扫雷（Mine Sweeper）

纯前端单机经典扫雷：多档难度、自动标记、失焦暂停、沉浸式模式与常驻滚动条。

## 单机版特性

- **纯静态**：`index.html` + `style.css` + `game.js`，零依赖、无构建步骤。
- **无需联网**：游戏逻辑全部在浏览器本地运行。
- **数据本地**：难度选择、沉浸模式偏好、最佳记录保存在本机 `localStorage`。
- **移动端优化**：触屏适配、失焦自动暂停（切到其他 App/窗口时弹出伪装表）、沉浸式退出按钮极小化、棋盘常驻自定义滚动条。

## 本地运行

```sh
cd mine-sweeper
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000
```

或直接用浏览器打开 `index.html`。

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

## 版本

当前分支：`release/1.0.0`
