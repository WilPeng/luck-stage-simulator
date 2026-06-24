# 后端接口实现清单

## 概述
本文档列出了选手端前端页面所需的所有后端接口，包括已实现和待实现的接口。

---

## 一、认证相关接口（已实现）

### 1.1 登录
- **接口**: `POST /api/auth/login`
- **请求体**: `{ code: string }`
- **响应**: `{ success: boolean, data: User, token?: string }`
- **状态**: ✅ 已实现

### 1.2 获取当前用户
- **接口**: `GET /api/auth/me`
- **请求头**: `Authorization: Bearer {token}`
- **响应**: `User | null`
- **状态**: ✅ 已实现

### 1.3 退出登录
- **接口**: `POST /api/auth/logout`
- **请求头**: `Authorization: Bearer {token}`
- **响应**: `void`
- **状态**: ✅ 已实现

### 1.4 切换账号规则（重要）
切换账号时前端必须按以下顺序调用：
1. **先** `POST /api/auth/logout` → 清除旧用户的 `hasLogin` 状态
2. **再** `POST /api/auth/login` → 登录新用户

> ⚠️ 不可跳过 logout 直接 login。否则旧会话超时后的 logout 请求会误将新用户的 `hasLogin` 置为 false，导致刷新后无法恢复用户信息。

---

## 二、用户相关接口（部分待完善）

### 2.1 获取用户列表
- **接口**: `GET /api/users`
- **查询参数**: 
  - `keyword?: string` - 搜索关键词
  - `role?: string` - 角色筛选
  - `status?: string` - 状态筛选
  - `teamId?: string` - 队伍筛选
  - `page?: number` - 页码
  - `pageSize?: number` - 每页数量
- **响应**: `{ list: User[], total: number, page: number, pageSize: number, totalPages: number }`
- **状态**: ✅ 已实现

### 2.2 获取用户详情
- **接口**: `GET /api/users/:id`
- **响应**: `User`
- **状态**: ✅ 已实现

### 2.3 更新用户信息
- **接口**: `PUT /api/users/:id`
- **请求体**: `Partial<User>`
- **响应**: `User`
- **状态**: ✅ 已实现

### 2.4 更新用户状态
- **接口**: `PUT /api/users/:id/status`
- **请求体**: `{ status: 'active' | 'danger' | 'eliminated' }`
- **响应**: `User`
- **状态**: ✅ 已实现

### 2.5 上传头像
- **接口**: `POST /api/users/:id/avatar`
- **请求体**: `FormData` (包含 `avatar` 字段)
- **响应**: `{ avatar: string, user: User }`
- **状态**: ✅ 已实现
- **注意**: 需要处理文件上传，返回头像 URL

### 2.6 删除头像
- **接口**: `DELETE /api/users/:id/avatar`
- **响应**: `void`
- **状态**: ✅ 已实现

### 2.7 获取用户统计
- **接口**: `GET /api/users/stats`
- **响应**: `{ total: number, players: number, captains: number, admins: number, active: number, danger: number, eliminated: number, noTeam: number }`
- **状态**: ✅ 已实现

---

## 三、队伍相关接口（已实现）

### 3.1 获取队伍列表
- **接口**: `GET /api/teams`
- **查询参数**: `round?: number` - 轮次
- **响应**: `Team[]`
- **状态**: ✅ 已实现
- **注意**: 需要返回队伍的 `members` 字段（包含完整用户信息）

### 3.2 获取队伍详情
- **接口**: `GET /api/teams/:id`
- **响应**: `Team`
- **状态**: ✅ 已实现

### 3.3 申请加入队伍
- **接口**: `POST /api/teams/:teamId/apply`
- **请求体**: `{ userId: string }`
- **响应**: `TeamApplication`
- **状态**: ✅ 已实现

### 3.4 邀请玩家
- **接口**: `POST /api/teams/:teamId/invite`
- **请求体**: `{ targetUserId: string }`
- **响应**: `TeamInvite`
- **状态**: ✅ 已实现

### 3.5 接受邀请
- **接口**: `POST /api/teams/:teamId/invite/:userId/accept`
- **响应**: `void`
- **状态**: ✅ 已实现

### 3.6 拒绝邀请
- **接口**: `POST /api/teams/:teamId/invite/:userId/reject`
- **响应**: `void`
- **状态**: ✅ 已实现

### 3.7 锁定队伍
- **接口**: `POST /api/teams/:teamId/lock`
- **响应**: `Team`
- **状态**: ✅ 已实现

### 3.8 解锁队伍
- **接口**: `POST /api/teams/:teamId/unlock`
- **响应**: `void`
- **状态**: ✅ 已实现

### 3.9 获取申请列表
- **接口**: `GET /api/teams/applications`
- **响应**: `TeamApplication[]`
- **状态**: ✅ 已实现

### 3.10 获取邀请列表
- **接口**: `GET /api/teams/invites`
- **响应**: `TeamInvite[]`
- **状态**: ✅ 已实现

---

## 四、歌曲相关接口（已实现）

### 4.1 获取歌曲列表
- **接口**: `GET /api/songs`
- **查询参数**: 
  - `round?: number` - 轮次
  - `type?: 'team_show' | 'team_collab' | 'captain_show' | 'pk_show'` - 歌曲类型
- **响应**: `Song[]`
- **状态**: ✅ 已实现

### 4.2 获取轮次歌曲
- **接口**: `GET /api/songs/round/:round`
- **响应**: `RoundSong[]`
- **状态**: ✅ 已实现
- **注意**: 需要返回 `song` 字段（包含完整歌曲信息）

### 4.3 获取歌曲分配
- **接口**: `GET /api/songs/assignments/list?round=:round`
- **响应**: `SongAssignment[]`
- **状态**: ✅ 已实现
- **注意**: 需要返回 `song` 和 `users` 字段

### 4.4 分配歌曲给选手
- **接口**: `POST /api/songs/assign`
- **请求体**: `{ round: number, songId: string, teamId?: string, userIds: string[] }`
- **响应**: `SongAssignment`
- **状态**: ✅ 已实现

---

## 五、训练相关接口（已实现）

### 5.1 获取训练卡牌
- **接口**: `GET /api/training/cards`
- **响应**: `TrainingCard[]`
- **状态**: ✅ 已实现

### 5.2 抽卡
- **接口**: `POST /api/training/draw/:userId`
- **请求体**: `{ round?: number }`
- **响应**: `{ record: TrainingRecord, user: { id: string, name: string, attributes: { vocal: number, dance: number, charm: number }, trainingCount: number, remainingDraws: number } }`
- **状态**: ✅ 已实现

### 5.3 获取训练记录
- **接口**: `GET /api/training/records`
- **查询参数**: 
  - `userId?: string`
  - `round?: number`
  - `cardId?: string`
  - `startDate?: string`
  - `endDate?: string`
  - `page?: number`
  - `pageSize?: number`
- **响应**: `{ list: TrainingRecord[], total: number, page: number, pageSize: number, totalPages: number }`
- **状态**: ✅ 已实现

### 5.4 获取用户训练记录
- **接口**: `GET /api/training/records/user/:userId`
- **响应**: `TrainingRecord[]`
- **状态**: ✅ 已实现

---

## 六、彩排相关接口（已实现）

### 6.1 开始彩排
- **接口**: `POST /api/rehearsal/:teamId`
- **响应**: `RehearsalResult`
- **状态**: ✅ 已实现

### 6.2 获取彩排结果
- **接口**: `GET /api/rehearsal`
- **响应**: `RehearsalResult[]`
- **状态**: ✅ 已实现

---

## 七、公演相关接口（已实现）

### 7.1 获取公演结果
- **接口**: `GET /api/performance`
- **查询参数**: `round?: number`
- **响应**: `TeamResult[]`
- **状态**: ✅ 已实现

### 7.2 获取选手得分
- **接口**: `GET /api/performance/players`
- **查询参数**: `round?: number`
- **响应**: `PlayerResult[]`
- **状态**: ✅ 已实现

### 7.3 公演结算
- **接口**: `POST /api/performance/calculate`
- **请求体**: `{ round: number }`
- **响应**: `{ round: number, teamResults: TeamResult[], playerResults: PlayerResult[], teamCount: number, playerCount: number, dangerTeams: { teamId: string, teamName: string, rank: number }[] }`
- **状态**: ✅ 已实现

---

## 八、淘汰相关接口（已实现）

### 8.1 获取淘汰统计
- **接口**: `GET /api/elimination/stats`
- **查询参数**: `round?: number`
- **响应**: `EliminationStats`
- **状态**: ✅ 已实现

### 8.2 获取淘汰名单
- **接口**: `GET /api/elimination`
- **查询参数**: `round?: number`
- **响应**: `EliminationRecord[]`
- **状态**: ✅ 已实现

### 8.3 获取排名
- **接口**: `GET /api/elimination/ranking`
- **查询参数**: `round?: number`
- **响应**: `{ rankings: RankingEntry[] }`
- **状态**: ✅ 已实现

---

## 九、日志相关接口（已实现）

### 9.1 获取日志列表
- **接口**: `GET /api/logs`
- **响应**: `OperationLog[]`
- **状态**: ✅ 已实现

---

## 十、赛季相关接口

### 10.1 获取赛季信息
- **接口**: `GET /api/season`
- **响应**: `Season`
- **状态**: ✅ 已实现

### 10.2 获取当前赛程进度（核心接口）
- **接口**: `GET /api/season/progress`
- **响应**: `{ currentRound: number, currentStage: StageType }`
- **状态**: ❌ **待实现**
- **说明**: 这是阶段控制系统的核心接口，所有页面依赖此接口获取当前状态

### 10.3 设置赛程状态（管理员操作）
- **接口**: `POST /api/admin/progress/set`
- **请求体**: `{ round: number, stage: StageType }`
- **响应**: `{ success: boolean, currentRound: number, currentStage: StageType }`
- **状态**: ❌ **待实现**
- **说明**: 管理员点击矩阵时调用，用于切换到指定阶段

### 10.4 自动推进下一阶段（管理员操作）
- **接口**: `POST /api/admin/progress/next`
- **响应**: `{ currentRound: number, currentStage: StageType }`
- **状态**: ❌ **待实现**
- **说明**: 管理员点击"下一阶段"按钮时调用
- **逻辑**:
  - 如果当前是 `ELIMINATION`，返回 `{ currentRound: currentRound + 1, currentStage: "PREPARATION" }`
  - 其他情况返回下一个阶段

### 10.5 获取用户菜单
- **接口**: `GET /api/season/menu`
- **响应**: `MenuItem[]`
- **状态**: ❌ **待实现**
- **说明**: 返回用户菜单列表，包含每个菜单项的状态（completed/current/future）

---

## 十一、待完善的功能点

### 11.1 队伍接口完善
- **问题**: `GET /api/teams` 返回的 `Team` 对象需要包含 `members` 字段
- **说明**: `members` 应该是完整的用户对象数组，包含 `id`, `name`, `attributes`, `avatar` 等字段
- **影响**: 选手端组队页面需要显示队员的头像和属性

### 11.2 歌曲分配接口完善
- **问题**: `GET /api/songs/assignments/list` 返回的 `SongAssignment` 需要包含 `song` 和 `users` 字段
- **说明**: 
  - `song` 应该是完整的歌曲对象
  - `users` 应该是 `{ userId: string, name: string }[]` 格式
- **影响**: 选手端公演歌曲页面需要显示歌曲详情和参赛人员

### 11.3 训练记录接口完善
- **问题**: `GET /api/training/records/user/:userId` 返回的 `TrainingRecord` 需要包含 `cardName`, `cardType`, `effect`, `attributesAfter` 等字段
- **影响**: 选手端个人资料页面需要显示属性变化记录

### 11.4 公演结果接口完善
- **问题**: `GET /api/performance` 返回的 `TeamResult` 需要包含 `songName`, `teamName` 字段
- **影响**: 选手端公演结果页面需要显示歌曲名称和队伍名称

### 11.5 头像URL处理
- **问题**: 头像上传后返回的 `avatar` 字段应该是相对路径（如 `/uploads/avatars/xxx.png`）
- **说明**: 前端会自动拼接服务器根地址
- **影响**: 所有需要显示头像的页面

---

## 十二、数据类型定义

### 12.1 User
```typescript
interface User {
  id: string
  name: string
  loginCode: string
  role: 'player' | 'captain' | 'admin'
  status: 'active' | 'danger' | 'eliminated'
  teamId?: string
  hasLogin: boolean
  avatar?: string | null
  attributes: {
    vocal: number
    dance: number
    charm: number
  }
  trainingCount?: number
}
```

### 12.2 Team
```typescript
interface Team {
  id: string
  name: string
  captainId?: string | null
  memberIds: string[]
  maxMembers: number
  locked: boolean
  index?: number
  round?: number
  members?: User[]  // 需要返回完整用户信息
}
```

### 12.3 Song
```typescript
interface Song {
  id: string
  name: string
  type: 'team_show' | 'team_collab' | 'captain_show' | 'pk_show'
  style: string
  difficulty: number
  vocalWeight: number
  danceWeight: number
  charmWeight: number
  baseScore: number
  riskFactor: number
  availableRounds?: number[]
  enabled?: boolean
  description?: string
}
```

### 12.4 RoundSong
```typescript
interface RoundSong {
  id: string
  round: number
  songId: string
  songType: 'team_show' | 'team_collab' | 'captain_show' | 'pk_show'
  scoringMethod?: 'actual' | 'fixed' | 'ranked'
  song: Song  // 需要返回完整歌曲信息
  createdAt: string
}
```

### 12.5 SongAssignment
```typescript
interface SongAssignment {
  id: string
  round: number
  songId: string
  songType: string
  teamId: string | null
  userIds: string[]
  song: Song  // 需要返回完整歌曲信息
  users: { userId: string; name: string }[]  // 需要返回用户信息
}
```

### 12.6 TrainingRecord
```typescript
interface TrainingRecord {
  id: string
  userId: string
  userName?: string
  cardId: string
  cardName: string
  cardType: 'vocal' | 'dance' | 'charm' | 'mixed' | 'event'
  effect: {
    vocal?: number
    dance?: number
    charm?: number
  }
  attributesAfter?: {
    vocal: number
    dance: number
    charm: number
  }
  round?: number
  createdAt: string
}
```

### 12.7 TeamResult
```typescript
interface TeamResult {
  id: string
  teamId: string
  teamName: string  // 需要返回队伍名称
  songId: string
  songName: string  // 需要返回歌曲名称
  teamVocal: number
  teamDance: number
  teamCharm: number
  attrScore: number
  randomScore: number
  rehearsalBonus?: number
  teamRankBonus?: number
  finalScore: number
  rank: number
  round?: number
  dangerTeam?: boolean
}
```

### 12.8 PlayerResult
```typescript
interface PlayerResult {
  id: string
  userId: string
  userName: string
  teamId: string
  teamName: string
  vocalScore: number
  danceScore: number
  charmScore: number
  randomScore: number
  teamBonus: number
  finalScore: number
  rank: number
  round?: number
}
```

### 12.9 RehearsalResult
```typescript
interface RehearsalResult {
  id: string
  teamId: string
  eventName: string
  description: string
  bonus: {
    vocal?: number
    dance?: number
    charm?: number
  }
  createdAt: string
}
```

### 12.10 EliminationRecord
```typescript
interface EliminationRecord {
  id: string
  userId: string
  userName: string
  teamName?: string
  round: number
  rank: number | null
  finalScore: number | null
  reason: string
  eliminated: boolean
  eliminatedAt: string
}
```

### 12.11 OperationLog
```typescript
interface OperationLog {
  id: string
  userId: string
  userName?: string
  actionType: string
  detail: string
  createdAt: string
}
```

### 12.12 Season
```typescript
interface Season {
  id: string
  name: string
  currentStage: 'preparation' | 'setup' | 'captain' | 'team' | 'song' | 'training' | 'rehearsal' | 'performance' | 'elimination' | 'review'
  status: 'pending' | 'running' | 'finished'
  performanceRound?: number
  eliminationRound?: number
  trainingConfig?: {
    drawsPerPlayer: number
    currentRound: number
    totalRounds: number
  }
  createdAt: string
  updatedAt: string
}
```

---

## 十三、总结

### 已实现的接口
- ✅ 认证相关（3个）
- ✅ 用户相关（7个）
- ✅ 队伍相关（10个）
- ✅ 歌曲相关（4个）
- ✅ 训练相关（4个）
- ✅ 彩排相关（2个）
- ✅ 公演相关（3个）
- ✅ 淘汰相关（3个）
- ✅ 日志相关（1个）
- ✅ 赛季相关（1个）

**总计**: 38个接口已实现

### 待完善的功能点
1. 队伍接口需要返回 `members` 字段（完整用户信息）
2. 歌曲分配接口需要返回 `song` 和 `users` 字段
3. 训练记录接口需要返回完整的 `TrainingRecord` 字段
4. 公演结果接口需要返回 `songName` 和 `teamName` 字段
5. 头像URL需要正确处理（返回相对路径）

### 优先级
- **高优先级**: 11.1, 11.2, 11.4（影响核心功能展示）
- **中优先级**: 11.3, 11.5（影响部分功能展示）

---

## 十四、测试建议

### 14.1 接口测试
1. 测试所有接口的正常情况
2. 测试接口的异常情况（参数错误、权限不足等）
3. 测试接口的边界情况（空数据、大数据量等）

### 14.2 集成测试
1. 测试完整的组队流程
2. 测试完整的选歌流程
3. 测试完整的训练流程
4. 测试完整的公演流程
5. 测试完整的淘汰流程

### 14.3 性能测试
1. 测试大量用户同时登录
2. 测试大量数据查询的性能
3. 测试文件上传的性能

---

## 十五、联系方式

如有任何问题，请联系前端开发团队。
