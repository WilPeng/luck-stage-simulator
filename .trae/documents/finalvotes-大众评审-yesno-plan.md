# 乘风2026 finalVotes 改为大众评审 yes/no 模拟计划

## 1. 摘要
将 `TeamPerformance.finalVotes` 从固定公式 `500 + teamScore × 3 + avgCharm` 改为基于 **1000 位大众评审独立 yes/no 投票** 的蒙特卡洛模拟。每位评审对每个舞台独立决定是否投票，单个舞台得票范围控制在 `[0, 1000]`，符合“不超过 1000 票”的要求。

个人分 `playerScore`、团队分 `teamScore` 与 S/A/B/C/D 评级体系保持不变，仅把 `finalVotes` 的生成方式替换为模拟投票。

## 2. 现状分析

### 2.1 当前 finalVotes 逻辑
- 文件：`backend/src/routes/performance.js`
- 位置：
  - 个人分计算：`calcPlayerScore()`（约 247-296 行）
  - 团队分计算：`calcTeamScore()`（约 298-315 行）
  - finalVotes 公式：`const finalVotes = BASE_VOTES + teamScore * 3 + teamCharm`（约 427 行）
- 当前结果上限约为 `500 + 120×3 + 60 = 920`，虽未超过 1000，但属于固定算术公式，不能表达“1000 位评审投票”的语义，且随着属性膨胀可能逼近或超过 1000。

### 2.2 相关模型
- `TeamPerformance.js`：保存 `finalVotes`、`finalScore`、`baseVotes`、`attributeVotes` 等字段。
- `AudienceMember.js` / `AudienceVote.js` / `AudienceVoteSession.js`：已存在 1000 位大众评审模型，但用于“喜爱度投票”（每人 3 票投选手），与本处的“团队舞台票数”是两套逻辑。
- `Season.js`：包含 `baseScore` 等旧配置，本次改动不依赖这些字段。

### 2.3 前端影响
- 管理端 `AdminPerformanceView.vue` 与选手端 `PlayerPerformanceView.vue` 均读取 `finalVotes` 字段并用于排名展示，字段名不变，无需修改。
- 只需保证 `finalVotes` 仍是 0~1000 的整数即可。

## 3. 拟议改动

### 3.1 backend/src/routes/performance.js

#### 新增投票模拟函数
在 `calcTeamScore` 之后新增一个函数：

```js
function simulateAudienceVotes(teamScore, avgCharm, eventVotes = 0, totalAudience = 1000) {
  // 舞台吸引力 = 团队综合分 + 魅力均值 × 0.5
  const appeal = teamScore + avgCharm * 0.5
  // 映射为 yes 概率，限制在 [0.05, 0.95]，避免绝对 0/1000
  let yesRate = appeal / 150
  yesRate = Math.max(0.05, Math.min(0.95, yesRate))
  // 舞台事件微调：事件票数按千分比转换
  yesRate += (eventVotes || 0) / totalAudience
  yesRate = Math.max(0.05, Math.min(0.95, yesRate))

  let finalVotes = 0
  for (let i = 0; i < totalAudience; i++) {
    if (Math.random() < yesRate) finalVotes++
  }

  return { finalVotes, yesRate }
}
```

说明：
- `teamScore` 已限制在 `[0, 120]`，`avgCharm` 通常为 0~100，因此 `appeal` 上限约 170，除以 150 后概率上限约 0.95，最终票数不会达到 1000 但接近；下限约 0.05，避免零票。
- 事件影响保留，但限制概率边界。
- 每次结算都会重新随机，复现“真实投票”的波动性。

#### 替换 finalVotes 计算
在 `POST /api/performance/calculate` 中：

1. 删除 `const BASE_VOTES = 500`（或保留但不再使用）。
2. 将原来的：
   ```js
   const finalVotes = BASE_VOTES + teamScore * 3 + teamCharm
   ```
   替换为：
   ```js
   const { finalVotes, yesRate } = simulateAudienceVotes(teamScore, teamCharm, eventVotes, 1000)
   ```
3. 同步调整票数拆解字段：
   - `baseVotes` 设为 0
   - `attributeVotes` 设为 `finalVotes`
   - `performanceVotes`、`compatibilityVotes`、`eventVotes` 保持为 0（事件影响已通过概率体现）
4. 在 `teamResults` 中新增 `audienceYesRate` 字段，便于前端展示“投票率”。
5. 更新控制台日志，打印“1000 位大众评审模拟：yes 率 / 得票数”。

#### 排名逻辑
队伍排名仍按 `finalVotes` 降序（已有逻辑，无需改动）。

### 3.2 backend/src/models/TeamPerformance.js
- 更新字段注释：
  - `finalVotes`：由 1000 位大众评审模拟投票产生，范围 `[0, 1000]`。
  - `attributeVotes`：兼容字段，现在与 `finalVotes` 相同。
- 不新增/删除字段。

### 3.3 前端（无需改动）
- `finalVotes` 字段名和用途不变，现有展示组件继续正常工作。
- 如后续需要，可在 `AdminPerformanceView.vue` 的票数拆解表格中把 `attributeVotes` 列名改为“大众评审得票”，本次计划不涉及。

## 4. 假设与决策

1. **投票规则**：采用用户确认的“每舞台独立 yes/no”，即 1000 位评审中每位独立决定是否给该舞台投票，一个舞台最多 1000 票。
2. **概率公式**：`p = clamp((teamScore + avgCharm×0.5) / 150, 0.05, 0.95)`。该公式让 top 舞台接近 950 票，避免 1000 票满分；最低保留 5% 基础支持。
3. **事件影响**：现有 `StageEvent.voteEffect` 通过概率偏移体现，正事件提高 yes 率，负事件降低 yes 率，偏移量为 `voteEffect / 1000`。
4. **个人分/团队分不变**：`playerScore`、`teamScore`、`teamRating` 继续用于评级和队内排名，不受本次改动影响。
5. **喜爱度投票独立**：`audienceVoteService.js` 中的 1000×3 选手喜爱度投票逻辑不受影响。

## 5. 验证步骤

1. 启动后端，确保 MongoDB 已连接。
2. 在管理端为一轮创建队伍、分配歌曲、生成发挥值后，调用 `POST /api/shengfeng2026/performance/calculate`。
3. 检查返回的 `teamResults`：
   - 每条记录的 `finalVotes` 为 0~1000 的整数。
   - `audienceYesRate` 在 0.05~0.95 之间。
   - 队伍按 `finalVotes` 降序排名。
4. 重复调用 calculate 2~3 次，确认 `finalVotes` 有合理波动（不是固定值），但仍落在范围内。
5. 运行 `cd frontend && npm run build`，确保前端构建通过。
