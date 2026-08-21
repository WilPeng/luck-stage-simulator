# 公演发挥值生成方式改造方案

## 1. 摘要

当前公演发挥值由系统随机生成（老虎机滚动后随机取值）。本方案新增「生成方式」配置：管理员可在每轮公演开启前选择以下两种方式之一：

1. **随机生成**：保持现有老虎机滚动后随机产生 `-10 ~ 20` 的发挥值。
2. **指针摆动**：选手端看到一个在 `-10 ~ 20` 刻度上快速摆动的指针/游标，点击「停下」后取当前刻度作为发挥值。

该方案涉及后端状态持久化、管理员配置入口、选手端交互改造三部分，保持与现有结算流程兼容。

## 2. 现状分析

### 2.1 关键文件与数据流

| 文件 | 作用 |
|------|------|
| `backend/src/models/PerformanceRoundState.js` | 保存每轮公演开启状态 `started`、已揭晓队伍 `revealedTeamIds` 等。是保存「生成方式」的最合适位置。 |
| `backend/src/models/PerformanceValue.js` | 保存选手最终发挥值 `performanceValue`（范围 `-10 ~ 20`）。 |
| `backend/src/routes/performance.js` | 公演核心路由，包含 `/start`（开启）、`/player-generate`（选手生成）、`/admin-generate`（代生成）、`/player-status/save`（保存发挥值）、`/calculate`（结算）。 |
| `frontend/src/views/admin/AdminPerformanceView.vue` | 管理员公演管理页，包含「选手开始公演」「一键全部生成」「开始结算」等操作入口。 |
| `frontend/src/views/player/PlayerPerformanceView.vue` | 选手端公演页，Phase 2 的抽取 UI 与动画在此实现。 |
| `frontend/src/services/api.ts` | 前端 API 封装，包含 `startPerformance`、`savePerformancePlayerStatus`、`getPerformanceRoundStatus` 等。 |

### 2.2 当前生成逻辑

- 管理员点击「选手开始公演」调用 `POST /api/performance/start`，创建 `PerformanceRoundState` 并设置 `started = true`。
- 选手端进入 Phase 2，点击「抽取发挥值」后，前端本地随机生成 `-10 ~ 20` 的整数，调用 `POST /api/performance/player-status/save` 持久化。
- 结算时 `POST /api/performance/calculate` 读取 `PerformanceValue`，未生成则 `randomInt(-10, 20)` 补齐。

### 2.3 待解决问题

- 没有字段记录本轮使用哪种生成方式。
- 管理员端缺少选择入口。
- 选手端缺少「指针摆动」交互组件。
- 需要保证已开启轮次切换生成方式时的行为一致性。

## 3. 改造方案

### 3.1 后端改造

#### 3.1.1 扩展 `PerformanceRoundState` 模型

文件：`backend/src/models/PerformanceRoundState.js`

在构造函数中新增字段：

```javascript
this.generationMode = 'random'  // 'random' | 'pointer'，默认随机
```

该字段与 `started` 一起保存在 `PerformanceRoundState` 集合中，按 `roundId` 隔离。

#### 3.1.2 新增/修改接口

文件：`backend/src/routes/performance.js`

**A. 开启公演时支持指定生成方式**

修改 `POST /api/performance/start`：

- 接收 `generationMode` 参数（可选，默认 `'random'`）。
- 校验取值只能是 `'random'` 或 `'pointer'`。
- 将 `generationMode` 写入新建的 `PerformanceRoundState`。

**B. 新增设置生成方式接口**

`POST /api/performance/generation-mode`（管理员）：

- 参数：`roundId`、`generationMode`。
- 用于在公演未开启前修改生成方式；若已开启，则拒绝修改（避免选手已按旧方式生成）。

**C. 返回生成方式**

修改以下接口的响应，额外返回 `generationMode`：

- `GET /api/performance/round-status`（选手端用）
- `GET /api/performance/player-status`（管理员端用）
- `POST /api/performance/open`（管理员打开公演管理页时返回）

这样两端都能根据当前模式渲染对应 UI。

**D. 兼容现有保存接口**

`POST /api/performance/player-status/save` 和 `POST /api/performance/player-generate` 保持现状，只接收最终 `performanceValue`，不关心生成过程。无论随机还是指针，最终都是 `-10 ~ 20` 的整数，对结算无影响。

### 3.2 前端管理员端改造

#### 3.2.1 新增生成方式选择控件

文件：`frontend/src/views/admin/AdminPerformanceView.vue`

在「选手发挥」Tab 的 `action-section` 上方或 `overview-section` 中增加：

- 单选控件（t-radio-group）：「随机生成」/「指针摆动」。
- 仅在 `performanceStarted === false` 时可编辑；开启后禁用，并显示当前模式。
- 选择变更时调用 `POST /api/performance/generation-mode` 保存到后端。

#### 3.2.2 修改「选手开始公演」按钮

`handleStartPerformance` 在调用 `startPerformance` 时，将当前选择的 `generationMode` 一并传入。因此需要扩展 `startPerformance` API 函数签名。

#### 3.2.3 状态初始化

`initPlayerStatuses` 从 `getPlayerPerformanceStatus` 获取 `generationMode`，并同步到本地响应式变量，确保刷新后仍显示正确模式。

### 3.3 前端选手端改造

#### 3.3.1 获取生成方式

文件：`frontend/src/views/player/PlayerPerformanceView.vue`

在 `onMounted` 中通过 `getPerformanceRoundStatus` 获取 `generationMode`，存入响应式变量 `generationMode`。

#### 3.3.2 随机模式保持现有 UI

当 `generationMode === 'random'` 时，Phase 2 继续使用现有的老虎机 `slot-machine` 和 `doDraw` 逻辑，随机生成数值。

#### 3.3.3 新增指针摆动模式

当 `generationMode === 'pointer'` 时，Phase 2 替换为指针组件：

- **UI**：水平刻度尺，范围 `-10` 到 `20`，每个整数一个刻度。刻度尺上方有一个可左右移动的游标/指针。
- **动画**：游标在 `-10 ~ 20` 之间快速往复移动，使用 `requestAnimationFrame` 实现，速度可先快后略慢（制造紧张感）。
- **交互**：显示「停下」按钮，选手点击后停止动画，取游标最终所在刻度作为 `drawValue`。
- **结果**：停止后显示与随机模式相同的结果揭示动画（`result-reveal`），并调用 `savePerformancePlayerStatus` 持久化。
- **防止重复点击**：动画过程中禁用「停下」按钮的重复点击；停止后进入 `revealed` 状态，与现有流程一致。

指针取值逻辑示例：

```typescript
const MIN_VALUE = -10
const MAX_VALUE = 20
const RANGE = MAX_VALUE - MIN_VALUE  // 30

// 根据游标在刻度尺上的位置计算当前值
function positionToValue(positionRatio: number): number {
  const raw = MIN_VALUE + positionRatio * RANGE
  return Math.round(raw)
}
```

#### 3.3.4 API 类型与封装

文件：`frontend/src/services/api.ts`、`frontend/src/types/performance.ts`

- 在 `performance.ts` 类型中新增 `generationMode: 'random' | 'pointer'`。
- 更新 `startPerformance` 函数签名：`startPerformance(roundId: string, generationMode?: 'random' | 'pointer')`。
- 新增 `setPerformanceGenerationMode(roundId, generationMode)` API 函数。

### 3.4 样式与动画

文件：`frontend/src/views/player/PlayerPerformanceView.vue`（style scoped）

新增指针模式样式：

- `.pointer-scale`：刻度尺容器。
- `.pointer-tick`：刻度线及数字标签。
- `.pointer-cursor`：游标样式，使用渐变背景 + 阴影突出显示。
- `.pointer-active`：游标移动动画类。
- 使用 CSS transform 的 `translateX` 或 `left` 属性配合 `requestAnimationFrame` 实现平滑快速摆动。

## 4. 假设与决策

1. **指针取值范围**：与现有随机模式一致，为整数 `-10 ~ 20`。
2. **指针停止机制**：选手点击「停下」时，游标立即停止在当前所在刻度（或做极短减速动画后停止），最终值由停止位置四舍五入到最近整数。
3. **管理员的「代生成」与「一键全部生成」**：无论当前模式为何，管理员代为生成时仍使用随机值。因为管理员无法为多个选手逐个操作指针，且「一键全部」天然是批量随机行为。
4. **模式切换时机**：生成方式仅在公演开启前可修改；开启后锁定，避免已按指针模式操作的选手与后续随机生成选手数据不一致。
5. **默认值**：未设置时默认使用 `random`，保持现有行为不变。
6. **向后兼容**：已有 `PerformanceRoundState` 文档无 `generationMode` 字段时，前后端均视为 `random`。

## 5. 验证步骤

1. 进入管理员公演管理页，确认出现「随机生成 / 指针摆动」单选控件，且未开启时可切换。
2. 选择「指针摆动」后点击「选手开始公演」，确认后端 `PerformanceRoundState` 中 `generationMode` 为 `pointer`。
3. 进入选手端 Phase 2，确认显示指针摆动组件而非老虎机。
4. 点击「停下」，确认最终发挥值在 `-10 ~ 20` 之间，且能正常保存并进入结果页。
5. 切换回「随机生成」重新开启一轮，确认选手端恢复老虎机动画。
6. 运行 `npm run build`（前端）确认无类型错误和编译错误；后端重启后测试接口正常。
7. 执行结算，确认两种模式生成的发挥值都能正确参与最终得分计算。
