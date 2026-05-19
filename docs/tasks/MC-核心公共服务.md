# MC — 核心公共服务

| 属性 | 内容 |
|------|------|
| **阶段** | P0（最先） |
| **依赖** | 无 |
| **被依赖** | M1、M2、M5 |
| **主要文件** | `app.js`（或 `modules/core/*`）、`styles.css`（仅数值列字体） |

## 目标

提供可复用的**数值格式化**与 **localStorage 持久化**，供各业务模块调用；不改动 Web 整体布局。

## Vibe Coding 任务清单

### 格式化（`formatTelemetryNumber`）

- [x] 新增/抽离 `formatTelemetryNumber(value, { decimals })`：`decimals === -1` 时约 8 位有效数字
- [x] `decimals` 为 0–12 时使用固定小数位
- [x] `|value| > 1e8` 或 `< 1e-4` 时使用 `toExponential(3)`（如 `1.23e+8`）
- [x] 遥测表格「当前值」列改用该函数（替换现有简单 `toFixed`）
- [ ] 曲线 tooltip / 轴标签可复用同一函数（供 M2 调用）

### 持久化（`PersistenceService`）

- [x] 统一键前缀 `uuspace.web2.v1.*`
- [x] 实现 `load(namespace)` / `save(namespace, data)`，JSON 解析失败时回退默认
- [x] 启动时合并到 `state`（或 store）：`telemetry.columns`、`telemetry.decimals`、`curve.views` 等占位结构
- [x] 提供防抖写入（列宽拖动等高频场景）

### 验收

- [x] 刷新页面后，已保存的列配置仍能加载（可与 M1 联调一项键即可）
- [x] 输入 `1e9`、`-1e-5` 在表格中显示为科学计数形式

## 参考

- 详细设计 §4.1 MC、§6 持久化键规范  
- 决策 Q-03
