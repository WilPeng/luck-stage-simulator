---
name: round-id-isolation-fix
overview: 修复所有轮次相关接口的 roundId 隔离问题，确保不同轮次之间完全无数据泄漏
todos:
  - id: fix-captain-routes
    content: 修改 src/routes/captain.js：GET/DELETE 接口 roundId 必填，无参返回 400；修复 RoundTeam.find 无过滤问题；修复 deleteMany 无条件删除问题
    status: pending
  - id: fix-teams-routes
    content: 修改 src/routes/teams.js：GET /api/teams、/stats/summary、/history、/unassigned 接口 roundId 必填，无参返回 400
    status: pending
    dependencies:
      - fix-captain-routes
  - id: fix-season-history
    content: 修改 src/routes/season.js：GET /api/season/history 用 roundId (UUID) 过滤，而非 roundIndex
    status: pending
    dependencies:
      - fix-captain-routes
  - id: check-preparation-routes
    content: 检查并修复 src/routes/preparation.js 中的 roundId 隔离问题（如有）
    status: pending
    dependencies:
      - fix-captain-routes
  - id: verify-no-empty-filter
    content: 全局检查：确保所有 find/deleteMany 调用都有 roundId 过滤条件，无空 filter 情况
    status: pending
    dependencies:
      - fix-captain-routes
      - fix-teams-routes
      - fix-season-history
      - check-preparation-routes
---

## 需求概述

用户要求：预先准备、队长选举、组队、选歌、训练、公演、淘汰里所有操作都要带轮次ID（roundId），不同轮次之间没有任何关联，不希望在任意轮次看到之前轮次遗留的数据。

## 核心问题

当前代码中多个接口的 `roundId` 参数是可选的，当未传入 `roundId` 时，代码会 fallback 到当前赛季当前轮，或者直接以空 filter `{}` 查询，导致跨轮次数据泄漏。更严重的是，某些 DELETE 接口在无 `roundId` 时会执行 `deleteMany({})`，清空全表数据。

## 修复范围

1. `src/routes/captain.js` — 队长选举相关接口
2. `src/routes/teams.js` — 组队相关接口
3. `src/routes/season.js` — 赛季历史接口
4. `src/routes/preparation.js` — 预先准备相关接口（需检查）

## 修复原则

- GET/DELETE 请求：`roundId` 必填，缺少时返回 400 错误
- POST/PUT 请求：`roundId` 可选（自动使用当前轮），但写入时必须明确 roundId
- 所有数据库查询必须带 `roundId` 过滤条件，不允许 `filter = {}` 的情况
- `deleteMany({})` 绝不能在无明确过滤条件时执行

## 技术方案

### 1. 新增 `getRequiredRound(roundId)` 辅助函数

在 `captain.js` 和 `teams.js` 中新增一个严格的 round 获取函数，用于 GET/DELETE 接口：

```js
// 用于 GET/DELETE：roundId 必填，无参返回 null
async function getRequiredRound(roundId) {
  if (!roundId) return null
  const Round = require('../models/Round')
  // 直接按 id 查找
  let r = await Round.findOne({ id: roundId })
  if (r) return r
  // 兼容 round-1 / round_1 / 1 格式
  const match = roundId.match(/^round[_-](\d+)$/)
  if (match) {
    const idx = parseInt(match[1])
    const { getCurrentSeason } = require('../utils/helpers')
    const season = await getCurrentSeason()
    if (season) return await Round.findOne({ seasonId: season.id, index: idx })
  }
  return null
}
```

保留原有 `getRound(roundId)` 用于 POST/PUT 接口（允许 fallback 到当前轮）。

### 2. `src/routes/captain.js` 修改

| 接口 | 修改内容 |
| --- | --- |
| GET `/api/captain/votes` (第47行) | 使用 `getRequiredRound`，无 roundId 返回 400 |
| GET `/api/captain/results` (第73行) | 同上 |
| DELETE `/api/captain/votes` (第106行) | 使用 `getRequiredRound`，无 roundId 返回 400；确保 `deleteMany({ roundId: rId })` |
| GET `/api/captain/assigned` (第184行) | roundId 必填；`RoundTeam.find({ roundId: rId })` 加过滤 |
| POST `/api/captain/admin/unassign` (第156行) | roundId 必填，无参返回 400 |
| GET `/api/captain/history` (第214行) | roundId 必填，无参返回 400 |


### 3. `src/routes/teams.js` 修改

| 接口 | 修改内容 |
| --- | --- |
| GET `/api/teams` (第52行) | roundId 必填，无参返回 400 |
| GET `/api/teams/stats/summary` (第101行) | roundId 必填 |
| GET `/api/teams/history` (第496行) | roundId 必填 |
| GET `/api/teams/unassigned/:roundId?` (第531行) | roundId 必填，无参返回 400 |


### 4. `src/routes/season.js` 修改

| 接口 | 修改内容 |
| --- | --- |
| GET `/api/season/history` (第586行) | 用 `roundIndex` 先查 Round 获取 `round.id`，再用 `roundId: round.id` 过滤 `TeamPerformance`/`PlayerPerformance`/`Elimination`/`RoundTeam`/`RoundTeamMember` |


### 5. `src/routes/preparation.js` 检查

需要读取该文件，检查是否有类似问题。

### 6. 数据结构确认

- `TeamPerformance` 和 `PlayerPerformance` 中存储的是 `roundId`（UUID格式）和 `roundIndex`（数字）
- `GET /api/season/history` 当前用 `filter.roundIndex` 过滤，但数据中 `roundIndex` 可能为 null，需要改用 `roundId` 过滤

## 实现要点

1. **最小改动原则**：只修改必要的接口，不改变现有数据结构
2. **向后兼容**：POST/PUT 接口保留原有 `getRound` 的 fallback 行为
3. **安全性**：所有 DELETE 接口必须有明确的 `roundId` 过滤条件
4. **错误提示**：缺少 `roundId` 时返回统一的错误信息 `{ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' }`

本任务为纯后端接口修改，不涉及前端 UI 设计。

## 需要的 Agent Extensions

### SubAgent: code-explorer

- **用途**：在修改前精确确认 `preparation.js` 中的问题，以及确认 `TeamPerformance`/`PlayerPerformance` 模型中 `roundId` 和 `roundIndex` 字段的实际存储情况
- **预期结果**：获得需要修改的确切行号和字段名