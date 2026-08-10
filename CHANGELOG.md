# CHANGELOG

## [2.0.0] - 2026-08-10

### Docs
- 新建 `AGENTS.md`（项目架构与 AI 协作指南），合并原有的 CODEBUDDY.md
- 更新 `README.md`，统一格式

---

## [1.0.0] - 2026-07

### Added
- 扫雷初始版本：经典扫雷游戏
- `index.html` + `style.css` + `game.js` + `tests/`，零依赖
- 三档难度（9×9/16×16/30×16）
- 首次点击安全、BFS 泛洪填充、自动标记
- 失焦自动暂停（伪装表）、沉浸式模式
- Node 自动化测试（12 个测试用例）
- 分享卡片生成（1200×1600 Canvas + QR 码）

### Changed
- 战绩存储从 localStorage 迁移到 GamePlatform 云端
- 接入 GamePlatform 登录门
- 移除顶部用户栏与天梯榜浮层
- 天梯榜按难度分组显示
- 域名改回 Cloudflare Pages 默认域名 `mine-sweeper-2f1.pages.dev`
- 部署至 Cloudflare Pages
