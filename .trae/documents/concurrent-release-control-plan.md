# 并发阶段改造计划：从执行中心改为释放控制中心

## 1. 摘要

将当前新增的「并发行动中心」从「执行并代理所有子行动 + 公布结果」的执行型页面，改造为「只控制哪些子行动对选手开放」的释放控制面板。原管理员页面（组队、选歌、训练、彩排）全部保留，管理员继续在这些页面上使用已有的一键生成/分配/锁定等按钮完成实际操作；选手端页面根据释放开关决定是否允许执行对应操作。

## 2. 当前状态分析

- **阶段状态机**：已合并为 `preparation → captain_vote → concurrent → performance → elimination`。
- **后端**：`backend/src/routes/concurrent.js` 当前提供 `/status`、代理执行 `/proxy`、公布结果 `/admin/concurrent/publish`；`backend/src/routes/rehearsal.js` 已支持队长触发并限制每队一次。
- **管理员原页面**：
  - `AdminTeamView.vue`：已有队伍设置、锁定/解锁、添加成员等操作。
  - `AdminSongView.vue`：已有歌曲「释放」和「直接分配」按钮（基于 `RoundSong.released`）。
  - `AdminTrainingCardView.vue`：管理训练卡牌，没有面向选手训练的一键生成入口。
  - 没有独立的管理员彩排页面。
- **选手端**：
  - `PlayerTeamView.vue`：入队受 `team.locked` 控制。
  - `PlayerSongSelectionView.vue`：选歌受 `RoundSong.released` 控制。
  - `PlayerTrainingView.vue`：训练翻牌只受剩余次数控制，没有释放开关。
  - `PlayerRehearsalView.vue`：队长可开启彩排，没有释放开关。
- **已有的释放机制**：歌曲释放已有 `RoundSong.released`；队伍招募受 `team.locked` 控制；训练和彩排缺少释放机制。

## 3. 目标设计

- 新增一个统一的后台数据结构来记录本轮四个子行动的释放状态。
- 管理员并发中心只显示/切换这四个释放开关，并给出当前完成度概览。
- 选手页面在原有入口上增加释放状态校验：未释放时按钮置灰并提示。
- 「公布结果」不放在并发中心，继续由赛程矩阵的「进入下一阶段」或公演页流程处理。

## 4. 具体改动

### 4.1 后端

#### 4.1.1 `backend/src/models/Round.js`

在 `Round` 模型新增四个布尔字段，默认值 `false`：

```js
this.teamReleased = false      // 组队是否开放给选手
this.songReleased = false      // 选歌是否开放给选手（ songs 表已有 released，这里做总开关）
this.trainingReleased = false  // 训练抽卡是否开放给选手
this.rehearsalReleased = false // 彩排是否开放给队长
```

#### 4.1.2 `backend/src/routes/concurrent.js`

移除原来的代理执行和公布结果逻辑，改为释放控制接口：

- `GET /api/:gameId/concurrent/status?roundId=...`
  - 返回当前轮次的释放状态（`teamReleased`、`songReleased`、`trainingReleased`、`rehearsalReleased`）。
  - 同时返回各子行动的完成度概览（已组队人数、已选歌队伍数、已完成训练人数、已彩排队伍数），供管理员决策。
- `POST /api/:gameId/concurrent/release`
  - 请求体：`{ roundId, action: 'team'|'song'|'training'|'rehearsal', released: boolean }`
  - 更新 `Round` 对应字段并返回更新后的状态。
  - 当 `action='team' && released=true` 时，可顺带将该轮所有 `RoundTeam.locked` 批量设为 `false`（或让选手端同时检查 round.teamReleased 与 team.locked）。
  - 当 `action='song' && released=true` 时，可顺带将该轮所有未分配 `RoundSong.released` 批量设为 `true`。

#### 4.1.3 `backend/src/routes/teams.js`

- 选手申请入队/队长邀请/自由加入接口：增加校验 `round.teamReleased === true` 且 `team.locked === false`，否则返回 `TEAM_NOT_RELEASED`。
- 管理员解锁/锁定单个队伍保持原逻辑不变。

#### 4.1.4 `backend/src/routes/songs.js`

- 选手抢选/队长分配接口：将「该歌曲已释放」的判断改为 `roundSong.released === true || round.songReleased === true`。
- 管理员单个「释放歌曲」按钮保持原逻辑不变。

#### 4.1.5 `backend/src/routes/training.js`

- 选手抽卡接口：增加校验 `round.trainingReleased === true`，否则返回 `TRAINING_NOT_RELEASED`。

#### 4.1.6 `backend/src/routes/rehearsal.js`

- 队长触发彩排接口：增加校验 `round.rehearsalReleased === true`，否则返回 `REHEARSAL_NOT_RELEASED`。

### 4.2 前端

#### 4.2.1 `frontend/src/types/season.ts`

- 更新 `ConcurrentStatusResponse`：移除 `teamStatuses`、`playerStatuses` 等代理执行相关细粒度字段，改为：
  - `teamReleased`、`songReleased`、`trainingReleased`、`rehearsalReleased`
  - `summary: { teamCompleted, songCompleted, trainingCompleted, rehearsalCompleted, allCompleted }`
- 保留 `ConcurrentActionType = 'team' | 'song' | 'training' | 'rehearsal'` 用于释放开关标识。

#### 4.2.2 `frontend/src/services/api.ts`

- `getConcurrentStatus(roundId)`：仍调用 `/concurrent/status`。
- 将 `proxyConcurrentAction` 改为 `setConcurrentRelease(roundId, action, released)`，调用 `/concurrent/release`。
- 移除 `publishConcurrentResult`（公布结果改由其他地方触发）。

#### 4.2.3 `frontend/src/views/admin/AdminConcurrentView.vue`

重构成「释放控制面板」：

- 顶部显示当前轮次与四个开关的整体状态。
- 四个卡片/行，每行对应一个子行动：
  - 名称 + 当前释放状态标签
  - 「开放」/「关闭」切换按钮
  - 该子行动的完成度提示（例如：X/Y 队伍已组队、X/Y 队伍已选歌、X/Y 选手已完成训练、X/Y 队伍已彩排）
- 移除「补齐成员」「随机选歌」「生成结果」「一键补齐训练」「一键补齐并公布结果」等代理执行按钮。
- 不再负责公布结果。

#### 4.2.4 `frontend/src/views/admin/AdminStageView.vue`

- 保留 `concurrent` 阶段的「前往并发行动中心」按钮，但文案可改为「前往释放控制」或保持现状。
- 「进入下一阶段」按钮在 `concurrent` 阶段保持可用（用于进入 `performance`）。

#### 4.2.5 `frontend/src/views/player/PlayerTeamView.vue`

- 从 `seasonStore` 或 `roundStore` 获取当前轮次的 `teamReleased`。
- 未开放时：隐藏「申请加入」/「邀请队员」按钮，显示提示「组队尚未开放，请等待管理员释放」。

#### 4.2.6 `frontend/src/views/player/PlayerSongSelectionView.vue`

- 获取 `round.songReleased`。
- 若 `songReleased` 为 `true`，所有未分配歌曲都视为已释放；否则维持原有 `rs.released` 判断。
- 未开放时显示提示并禁用抢选/分配按钮。

#### 4.2.7 `frontend/src/views/player/PlayerTrainingView.vue`

- 获取 `round.trainingReleased`。
- 未开放时：卡槽统一置灰，禁用翻牌，显示提示「训练尚未开放」。

#### 4.2.8 `frontend/src/views/player/PlayerRehearsalView.vue`

- 获取 `round.rehearsalReleased`。
- 未开放时：队长也禁用「开始彩排」按钮，显示提示「彩排尚未开放」。

#### 4.2.9 `frontend/src/views/player/PlayerConcurrentView.vue`

- 简化为一个「并发行动入口」页面：仅展示当前哪些子行动已开放，并提供跳转到 组队/选歌/训练/彩排 的快捷入口。
- 不替代原有页面功能。

## 5. 关键假设与决策

- **释放开关粒度**：采用轮次级总开关（`Round` 模型），与已有的歌曲/队伍实体级开关互补。选手端判定为「总开关开放 AND 实体条件满足」。
- **公布结果位置**：根据用户确认，并发中心只做释放控制，不保留「公布结果」。进入 `performance` 由赛程矩阵的「进入下一阶段」或公演页流程负责。
- **管理员操作不变**：原页面的所有一键生成/分配/锁定按钮保持原样，不迁移到并发中心。
- **彩排管理**：由于没有独立管理员彩排页面，管理员仍通过原页面（或队伍页面）一键生成彩排结果；并发中心只负责开放/关闭选手队长的彩排权限。

## 6. 验证步骤

1. 运行 `npm run build`（前端）与 `npm start`（后端），确认无编译/启动错误。
2. 管理员进入并发行动中心，确认只看到四个释放开关与完成度，没有代理执行按钮。
3. 管理员依次打开「组队」「选歌」「训练」「彩排」开关，确认后端 `Round` 字段正确更新。
4. 选手端进入各子行动页面：
   - 未释放时按钮禁用并显示提示。
   - 释放后可正常执行。
5. 确认 `AdminTeamView`、`AdminSongView`、`AdminTrainingCardView` 原有操作不受影响。
6. 确认赛程矩阵可从 `concurrent` 正常进入 `performance`。
