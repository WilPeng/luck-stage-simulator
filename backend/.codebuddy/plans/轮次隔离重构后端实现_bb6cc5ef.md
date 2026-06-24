---
name: 轮次隔离重构后端实现
overview: 实现轮次隔离重构方案中的4处后端修改：推进轮次时自动清理旧数据、新增按轮次查询队长和可用选手的接口
todos:
  - id: modify-season-next
    content: 修改 season.js POST /next 端点，推进轮次时清除旧轮次业务数据
    status: completed
  - id: modify-season-set
    content: 修改 season.js POST /set 端点，轮次变化时清除旧轮次业务数据（提取公用函数）
    status: completed
    dependencies:
      - modify-season-next
  - id: add-captain-available-players
    content: 在 captain.js 新增 GET /available-players 接口（按轮次返回可用队长候选人）
    status: completed
  - id: add-captain-current
    content: 在 captain.js 新增 GET /current 接口（按轮次返回已分配队长列表）
    status: completed
    dependencies:
      - add-captain-available-players
  - id: restart-server
    content: 重启后端服务器并验证所有修改生效
    status: completed
    dependencies:
      - modify-season-next
      - modify-season-set
      - add-captain-current
---

根据 `docs/轮次隔离重构方案.md`，实现后端 4 处修改，确保不同轮次公演的数据完全隔离：

1. season.js `POST /next`：推进到新轮次时自动清除旧轮次的队伍/队长/选歌数据
2. season.js `POST /set`：轮次变化时自动清除旧轮次数据
3. captain.js 新增 `GET /available-players`：按轮次返回可用队长候选人
4. captain.js 新增 `GET /current`：按轮次返回已分配的队长列表

## 涉及文件

- `src/routes/season.js` — 修改 `POST /next` 和 `POST /set` 端点
- `src/routes/captain.js` — 新增 2 个 GET 接口，补充 RoundTeamMember 导入

## 实现要点

### 1. season.js POST /next（第149行）

在 `nextStage === null`（淘汰→进入下一轮）的分支中，修改 `season.currentRound` 之前，添加清理逻辑：

- 通过 `Round.findOne({ seasonId, index: prevRound })` 获取上一轮 Round 文档
- 构建 `{ roundId: { $in: [prevRoundDetail.id, `round-${prevRound}`] } }` 过滤器
- 依次清除：`RoundTeam`、`RoundTeamMember`、`RoundCaptain`、`CaptainVote`、`TeamSong`、`RoundSong`
- 保留 `User.role` 不动（会被新轮次指派覆盖），保留公演结果/淘汰记录

### 2. season.js POST /set（第99行）

在 `round !== prevRound` 时执行相同的清理逻辑。提取公用函数 `clearRoundData(roundIndex)` 复用。

### 3. captain.js 新增 GET /available-players

- 需要导入 `RoundTeamMember` 模型
- 查 `RoundCaptain.find({ roundId })` 获取已指定队长
- 查 `RoundTeamMember.find({ roundId })` 获取已在队伍中的选手
- 从活跃用户中过滤：排除 admin、eliminated、已指定队长
- 返回格式：`{ id, name, avatar, attributes, inTeam, status }`

### 4. captain.js 新增 GET /current

- 查 `RoundCaptain.find({ roundId })` 关联队伍和用户
- 返回格式：`{ playerId, playerName, playerAvatar, teamId, teamName }`
- 与已有 `/assigned` 接口功能相似但更简洁

## 注意事项

- roundId 兼容查询使用 `{ roundId: { $in: [UUID, `round-X`] } }` 模式
- 不对已存在的功能做任何改动，只做增量修改
- 重启服务器后生效