# 扫雷

## 项目概览

纯前端单机经典扫雷：多档难度、自动标记、失焦暂停、沉浸式模式与常驻滚动条。

- **形态**：`index.html` + `style.css` + `game.js` + `tests/`，零依赖，无构建步骤
- **数据云端**：战绩与最佳纪录通过 `GamePlatform` SDK 上报云端（需登录后游玩），本地不再保存数据
- **移动优化**：触屏适配、失焦自动暂停（切到其他 App/窗口时弹出伪装表）、沉浸式退出按钮极小化、棋盘常驻自定义滚动条
- **部署域名**：`https://mine-sweeper-2f1.pages.dev/`

## 本地运行

```sh
cd mine-sweeper
python3 -m http.server 8000
# 浏览器访问 http://localhost:8000
```

> 游戏本体离线可用；登录与云端战绩、分享卡片二维码需联网，请用上面的本地服务器方式，不要直接 `file://` 打开。

## 架构

### 双层设计（`game.js`）

`game.js` 通过环境守卫分为两层：

1. **纯逻辑层（文件前半段，约 1-128 行）**：无 DOM、无全局变量。定义棋盘模型和游戏规则：
   - `initBoard`、`placeMines`（首次点击安全，排除点击格及 8 邻格）、`reveal`（BFS 泛洪填充）、`toggleFlag`、`remainingMines`、`isWin`、`forEachNeighbor`、`idx`
   - 棋盘结构：`{ rows, cols, mineCount, cells[], firstClick, minesPlaced }`，每格 `{ mine, revealed, flagged, adj }`
   - records 辅助函数：`loadRecords` / `saveRecord`
   - 末尾通过 `module.exports` 暴露，供 Node 测试导入

2. **浏览器层（`typeof document !== 'undefined'` 守卫）**：处理所有 DOM 操作——渲染网格、点击翻开、长按/右键插旗、难度切换（`DIFFS`：easy 9×9/10、medium 16×16/40、hard 30×16/99）、计时器、记录列表、分享卡片生成。

### Records（localStorage）

`loadRecords` / `saveRecord` 使用 key `minesweeper_records`，上限 `MAX_RECORDS = 10`，按日期倒序保留最新。每条记录：`{ date, difficulty, result: 'win'|'lose', time, cellsLeft }`。Node 环境下 `localStorage` 缺失时优雅降级（测试通过 mock 注入）。

### Share Cards

两个表面，均渲染 1200×1600 Canvas 卡片（绿色渐变、圆角面板、难度/时间/结果文本 + `api.qrserver.com` QR 码）：

- **游戏内覆盖层**（`window.generateShareCard(diff, time, state)`）：获胜/失败时自动调用，也通过"📤 分享"按钮触发。绘制到离屏 canvas → `#share-card-img` src 设为 PNG data URL → 显示 `#share-overlay`。QR 使用 `location.href`（部署域名上正确）。`praise(diff, time)` 根据难度和时间阈值选祝贺语；失败显示"再接再厉"。
- **独立 `share-card.html`**：静态自包含页面，绘制相同卡片但 QR 指向部署站点（始终回到游戏而非自身），用于下载 PNG 作为 og:image。

### Element Contract（`game.js` ↔ `index.html`）

`game.js` 查找以下 DOM id/选择器，修改 HTML 时保持同步：`#board`、`#mine-count`、`#timer`、`#record-list`、`#share-overlay`、`#share-card-img`、`#share-btn`、`#share-close`、`#restart`、`.difficulty button[data-diff]`、`.cell`。

- 触屏长按（400ms）设置 `longPressed` 标志，后续 `click` 被忽略只插旗；桌面端右键通过 `contextmenu` `preventDefault` 插旗。
- `style.css` 禁用 `-webkit-touch-callout` 和 `user-select` 阻止微信长按菜单。

## 测试

唯一有自动化测试的项目（Node 内置 test runner，无浏览器依赖）：

```sh
# 全部测试
node --test tests/game.test.js tests/records.test.js

# 单文件测试
node --test tests/game.test.js

# 具名测试
node --test tests/game.test.js --test-name-pattern "initBoard"

# 快速验证 game.js 可在 Node 加载
node -e "require('./game.js')"
```

- 纯逻辑 + records 有完整 `node --test` 覆盖（12 个测试）
- UI 渲染、长按、Canvas 分享覆盖层在浏览器/微信中手动验证（依赖 `document`/canvas，不单元测试）
- 测试文件：`tests/game.test.js`（核心逻辑）、`tests/records.test.js`（本地记录，待弃用）、`tests/records-browser.test.js`（云端战绩）
- 当前分支：`release/1.0.0`

## 文件结构

```
mine-sweeper/
├── index.html       # 页面结构
├── style.css        # 样式（沉浸模式、自定义滚动条）
├── game.js          # 逻辑层（纯逻辑 + DOM 层）
└── tests/           # Node 自动化测试
```

## 约定

- 纯逻辑与 DOM 层分离：`game.js` 前半段为纯逻辑（可 Node 测试），后半段为 DOM 层（浏览器专用）
- 不再使用本地 `localStorage` 存储战绩，全部通过 `GamePlatform` SDK 上报
- 移动优先，适配 320px-428px 宽度
- 无 linter / bundler / framework，验证完全通过 `node --test`
- 部署：推送到 Cloudflare Pages 关联的 git 分支即自动部署
