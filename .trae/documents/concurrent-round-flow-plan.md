# 单轮次内选手行动并发化改造计划

## 1. 概要

当前乘风 2026 单轮次流程为线性：队长选举 → 组队 → 选歌 → 训练 → 公演 → 淘汰。本计划将其改造为：队长选举完成后进入「并发行动阶段」，选手可同时进行组队、选歌、训练抽卡、队伍彩排；管理员可监控各选手/队伍完成进度，对未完成的个体进行单独代理或一键补齐；全部就绪后管理员点击「公布结果」直接完成公演结算并进入结果展示阶段。轮次之间仍然保持先后顺序，不可越界。

## 2. 现状分析

### 2.1 阶段状态机

- 阶段顺序定义在 [backend/src/utils/helpers.js](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/backend/src/utils/helpers.js) 与 [frontend/src/types/season.ts](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/frontend/src/types/season.ts)
- 当前顺序：`preparation → captain_vote → teaming → song_select → training → performance → elimination`
- 状态（completed/current/future）由 `currentRound` + `currentStage` 动态计算，无持久化的「完成标记」
- 选手页面通过 [StageStatusView.vue](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/frontend/src/components/StageStatusView.vue) 根据当前阶段决定是否渲染内容

### 2.2 各行动当前实现

- **组队**：[backend/src/routes/teams.js](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/backend/src/routes/teams.js) + [frontend/src/views/player/PlayerTeamView.vue](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/frontend/src/views/player/PlayerTeamView.vue)，队长邀请/队员申请，管理员可随机/手动分配
- **选歌**：[frontend/src/views/player/PlayerSongSelectionView.vue](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/frontend/src/views/player/PlayerSongSelectionView.vue)，队长从已释放歌曲中抢选
- **训练抽卡**：[backend/src/routes/training.js](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/backend/src/routes/training.js) + [frontend/src/views/player/PlayerTrainingView.vue](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/frontend/src/views/player/PlayerTrainingView.vue)，选手个人抽卡，管理员可一键完成
- **彩排**：[backend/src/routes/rehearsal.js](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/backend/src/routes/rehearsal.js) + [frontend/src/views/player/PlayerRehearsalView.vue](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/frontend/src/views/player/PlayerRehearsalView.vue)，目前仅管理员可触发 `POST /api/rehearsal/roll`
- **公演结算**：[backend/src/routes/admin.js](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/backend/src/routes/admin.js) `POST /api/admin/performance/calculate` + [frontend/src/views/admin/AdminPerformanceView.vue](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/frontend/src/views/admin/AdminPerformanceView.vue)

### 2.3 管理员控制

- [backend/src/routes/season.js](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/backend/src/routes/season.js) 提供 `/set` 与 `/next`
- [frontend/src/views/admin/AdminStageView.vue](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/frontend/src/views/admin/AdminStageView.vue) 矩阵仅允许单步推进

### 2.4 主要问题

- 每完成一个阶段必须等所有人/管理员代理后才能进入下一阶段，流程拖沓
- 缺少统一视图查看所有并发行动完成度

## 3. 改造方案

### 3.1 核心设计

引入「并发行动阶段（concurrent）」：

```
preparation → captain_vote → concurrent → performance → elimination
```

在 `concurrent` 阶段内开放：

- 组队（teaming）
- 选歌（song_select）
- 训练抽卡（training）
- 队伍彩排（rehearsal）

完成状态从已有数据实时推断，不新增独立「完成标记」表：

- 组队完成：`RoundTeamMember` 存在该选手记录
- 选歌完成：`TeamSong` 存在该队伍记录
- 训练完成：`TrainingRecord` 数量 ≥ `season.trainingDrawsPerPlayer`
- 彩排完成：`RehearsalResult` 存在该队伍记录

### 3.2 后端改动

#### 3.2.1 阶段定义与状态机

**文件**：[backend/src/utils/helpers.js](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/backend/src/utils/helpers.js)

- 将 `STAGE_ORDER` 改为：`['preparation', 'captain_vote', 'concurrent', 'performance', 'elimination']`
- `STAGE_NAME` 增加 `concurrent: '并发行动'`
- 修改 `getStageStatus` / `getNextStage` 以支持新顺序

#### 3.2.2 赛季模型

**文件**：[backend/src/models/Season.js](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/backend/src/models/Season.js)

- 确认已有字段可存储 `currentStage: 'concurrent'`，无需新增字段

#### 3.2.3 进度控制接口

**文件**：[backend/src/routes/season.js](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/backend/src/routes/season.js)

- 更新 `/set` 与 `/next` 的校验逻辑，接受 `concurrent` 阶段
- 进入下一轮时清理数据逻辑保持不变

#### 3.2.4 并发阶段状态查询

**新文件**：`backend/src/routes/concurrent.js`

新增接口：

- `GET /api/concurrent/status?roundId=`：返回当前轮次所有选手/队伍的并发行动完成状态
  - 按队伍聚合：组队、选歌、彩排完成状态
  - 按选手聚合：训练完成状态
- `POST /api/concurrent/proxy`：管理员代理指定未完成项
  - `action: 'team' | 'song' | 'training' | 'rehearsal'`
  - `targetId: playerId/teamId`
  - `roundId`
  - 复用现有业务逻辑或调用已有服务函数

#### 3.2.5 彩排改为队长可触发

**文件**：[backend/src/routes/rehearsal.js](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/backend/src/routes/rehearsal.js)

- `POST /api/rehearsal/roll` 移除 `requireAdmin`，改为 `auth` 即可
- 增加权限校验：仅队长可为本队触发；管理员仍可调用
- 限制每队每轮只能有一次有效彩排结果

#### 3.2.6 公布结果结算

**文件**：[backend/src/routes/admin.js](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/backend/src/routes/admin.js)

- 新增 `POST /api/admin/concurrent/publish`
  - 参数：`roundId`
  - 逻辑：
    1. 查询并发状态
    2. 对未完成的选手/队伍自动代理（补齐组队/选歌/训练/彩排）
    3. 调用现有公演结算逻辑生成 `TeamPerformance` / `PlayerPerformance`
    4. 将赛季阶段推进到 `performance`
    5. 返回结算结果

### 3.3 前端改动

#### 3.3.1 类型定义

**文件**：[frontend/src/types/season.ts](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/frontend/src/types/season.ts)

- `STAGE_ORDER` 更新为新顺序
- `STAGE_NAMES` 增加 `concurrent: '并发行动'`
- `StageType` 更新

#### 3.3.2 阶段状态计算

**文件**：[frontend/src/types/season.ts](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/frontend/src/types/season.ts) / [frontend/src/stores/seasonStore.ts](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/frontend/src/stores/seasonStore.ts)

- 更新 `calculateStageStatus` 与 `getNextStageUtil`
- 保持旧阶段名（teaming/song_select/training）在页面中可用，但在状态机中视为并发阶段内的行动

#### 3.3.3 管理员赛程矩阵

**文件**：[frontend/src/views/admin/AdminStageView.vue](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/frontend/src/views/admin/AdminStageView.vue)

- 矩阵展示新阶段顺序
- 「进入下一阶段」在 `captain_vote` 之后进入 `concurrent`
- 在 `concurrent` 阶段不显示「进入下一阶段」按钮，改为显示「前往并发行动中心」按钮

#### 3.3.4 管理员并发行动中心（新页面）

**新文件**：`frontend/src/views/admin/AdminConcurrentView.vue`

- 顶部概览：当前轮次、队伍数、选手数
- 完成状态表格/卡片：
  - 每队：组队、选歌、彩排完成状态
  - 每人：训练完成状态
- 操作区：
  - 单独代理：对未完成项点击「代理组队/代理选歌/代理训练/代理彩排」
  - 一键补齐：按行动类型一键处理所有未完成项
  - 公布结果：全部完成后高亮可用；点击后调用 `/api/admin/concurrent/publish` 并跳转公演结果页

#### 3.3.5 路由

**文件**：[frontend/src/router/index.ts](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/frontend/src/router/index.ts)

- 新增管理员路由：`round/:round/concurrent`
- 选手端现有路由保持不变

#### 3.3.6 管理员菜单

**文件**：[frontend/src/layouts/AdminLayout.vue](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/frontend/src/layouts/AdminLayout.vue)

- `stageConfig` 增加 `concurrent`
- 移除或调整 `teaming/song_select/training` 在菜单中的显示（或保留为子入口但仅在并发阶段可见）

#### 3.3.7 选手端访问控制

**文件**：[frontend/src/layouts/PlayerLayout.vue](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/frontend/src/layouts/PlayerLayout.vue)、[frontend/src/stores/seasonStore.ts](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/frontend/src/stores/seasonStore.ts)

- 当 `currentStage === 'concurrent'` 且 round 为当前轮次时，组队/选歌/训练页面全部可访问
- 更新 `isStageAccessible` / `isStageActive` 逻辑

#### 3.3.8 选手页面

**文件**：

- [frontend/src/views/player/PlayerTeamView.vue](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/frontend/src/views/player/PlayerTeamView.vue)
- [frontend/src/views/player/PlayerSongSelectionView.vue](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/frontend/src/views/player/PlayerSongSelectionView.vue)
- [frontend/src/views/player/PlayerTrainingView.vue](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/frontend/src/views/player/PlayerTrainingView.vue)
- [frontend/src/views/player/PlayerRehearsalView.vue](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/frontend/src/views/player/PlayerRehearsalView.vue)

调整 `StageStatusView` 的使用：在 `concurrent` 阶段始终渲染 `current` 插槽；训练页面显示剩余次数；彩排页面队长可点击「开始彩排」。

#### 3.3.9 公演结果页

**文件**：[frontend/src/views/admin/AdminPerformanceView.vue](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/frontend/src/views/admin/AdminPerformanceView.vue)、[frontend/src/views/player/PlayerPerformanceView.vue](file:///c:/Users/86139/Desktop/桌面/7.15/luck-stage-simulator/frontend/src/views/player/PlayerPerformanceView.vue)

- 进入 `performance` 阶段后直接展示已结算结果
- 管理员页保留重新结算/发布能力

## 4. 假设与决策

1. **不新增完成标记表**：完成状态从已有业务数据推断，避免数据不一致。
2. **队长选举仍前置**：`captain_vote` 结束后才进入 `concurrent`，因为组队、选歌、彩排需要队长角色。
3. **彩排改为队长触发**：每队每轮一次，管理员仍可代理。
4. **公布结果 = 公演结算**：点击后自动补齐未完成项并计算最终票数。
5. **轮次间不可越界**：`concurrent` 只作用于当前轮次；进入下一轮需先完成当前轮淘汰。
6. **向后兼容**：已处于旧流程中的赛季数据可能不兼容，计划仅保证新流程正确运行。

## 5. 验证步骤

1. 启动前后端，进入新赛季。
2. 完成预先准备与队长选举。
3. 管理员进入 `concurrent` 阶段。
4. 选手 A 组队、选手 B 训练、队长 C 选歌、队长 D 彩排，验证可同时进行。
5. 管理员在并发中心查看完成进度，对未完成的选手/队伍分别点击代理。
6. 全部完成后点击「公布结果」，验证自动补齐未完成的项并跳转公演结果页。
7. 验证轮次不可越界：未进入淘汰前无法进入下一轮。
8. 运行 `npm run build` 检查前端编译无错误。
