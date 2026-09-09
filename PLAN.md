# BB House 空间化聊天系统 — 实现计划

## 一、架构总览

```
玩家浏览器
    │
    │ Socket.IO (/bigbrother-house)
    ▼
bbHouse.js (socket)  ←→  bbHouse.js (routes)
    │                          │
    ├─ 房间进出广播              ├─ 移动 API
    ├─ 聊天消息隔离              ├─ 玩家位置查询
    ├─ 后院门状态推送            ├─ HOH Monitor API
    ├─ HOH 邀请                 ├─ 后院门控制 API
    └─ 在线人数同步              └─ 管理员位置查看
    │
    ▼
MongoDB Collections:
  BBHouseRoom (静态配置，seed 初始化)
  BBPlayerLocation (玩家当前位置)
  BBChatMessage (增加 roomId 字段)
```

---

## 二、数据模型

### 2.1 BBHouseRoom（静态房间配置）

存储在 MongoDB，启动时 seed 初始化，运行时只读。

```js
// backend/src/games/bigbrother/models/BBHouseRoom.js
class BBHouseRoom extends BaseModel {
  constructor(data) {
    super('BBHouseRoom')
    this.id = data?.id || null           // 'living_room'
    this.name = data?.name || ''         // '客厅'
    this.nameEn = data?.nameEn || ''     // 'Living Room'
    this.icon = data?.icon || ''         // '🛋️'
    this.type = data?.type || 'common'   // common |住宿|special|outdoor|hidden
    this.capacity = data?.capacity ?? null // null=无限
    this.accessRule = data?.accessRule || 'public' // public|hoh_only|hoh_or_invited|have_not_only|single|admin_only
    this.gameId = data?.gameId || 'bigbrother'
  }
}
```

12 个房间初始数据：

| id | name | icon | type | accessRule |
|----|------|------|------|------------|
| living_room | 客厅 | 🛋️ | common | public |
| kitchen | 厨房 | 🍳 | common | public |
| dining_room | 餐厅 | 🍽️ | common | public |
| gym | 健身房 | 🏋️ | common | public |
| bathroom | 浴室 | 🚿 | common | public |
| storage_room | 储物间 | 📦 | common | public |
| bedroom_a | 卧室 A | 🛏️ | lodging | public |
| bedroom_b | 卧室 B | 🛏️ | lodging | public |
| have_not_room | 贫民屋 | 🥶 | lodging | have_not_only |
| backyard | 后院 | 🌴 | outdoor | public |
| hoh_room | HOH 房 | 👑 | special | hoh_or_invited |
| diary_room | Diary Room | 🎤 | hidden | single |

### 2.2 BBHousePassage（通道配置）

```js
// backend/src/games/bigbrother/models/BBHousePassage.js
class BBHousePassage extends BaseModel {
  constructor(data) {
    super('BBHousePassage')
    this.id = data?.id || null
    this.from = data?.from || ''         // roomId
    this.to = data?.to || ''             // roomId
    this.type = data?.type || 'normal'   // normal | door
    this.doorId = data?.doorId || null   // 仅 type=door 时
    this.gameId = data?.gameId || 'bigbrother'
  }
}
```

通道数据（双向，存一条即可，查询时双向匹配）：

```
living_room ↔ bedroom_a      (normal)
living_room ↔ bedroom_b      (normal)
living_room ↔ kitchen        (normal)
living_room ↔ gym            (normal)
living_room ↔ bathroom       (normal)
living_room ↔ storage_room   (normal)
living_room ↔ have_not_room  (normal)
living_room ↔ hoh_room       (normal)
living_room ↔ backyard       (door, doorId='backyard_door')
kitchen ↔ dining_room        (normal)
```

### 2.3 BBHouseDoor（门状态）

```js
// backend/src/games/bigbrother/models/BBHouseDoor.js
class BBHouseDoor extends BaseModel {
  constructor(data) {
    super('BBHouseDoor')
    this.id = data?.id || null           // 'backyard_door'
    this.name = data?.name || ''         // '后院门'
    this.from = data?.from || ''
    this.to = data?.to || ''
    this.isOpen = data?.isOpen ?? true
    this.gameId = data?.gameId || 'bigbrother'
  }
}
```

初始数据：`{ id: 'backyard_door', name: '后院门', from: 'living_room', to: 'backyard', isOpen: true }`

### 2.4 BBPlayerLocation（玩家位置）

```js
// backend/src/games/bigbrother/models/BBPlayerLocation.js
class BBPlayerLocation extends BaseModel {
  constructor(data) {
    super('BBPlayerLocation')
    this.id = data?.id || null           // = playerId
    this.playerId = data?.playerId || ''
    this.playerName = data?.playerName || ''
    this.currentRoomId = data?.currentRoomId || 'living_room'
    this.enteredAt = data?.enteredAt || new Date().toISOString()
    this.gameId = data?.gameId || 'bigbrother'
  }
}
```

### 2.5 BBChatMessage（扩展现有模型）

在现有 `BBChatMessage` 上增加 `roomId` 字段：

```diff
  this.chatType = data?.chatType || 'public'   // 'public' | 'private' | 'room'
+ this.roomId = data?.roomId || null            // 仅 chatType='room' 时
  this.targetId = data?.targetId || null
```

### 2.6 BBHouseguest（扩展现有模型）

增加 `currentRoomId` 和 `isHaveNot` 字段：

```diff
  this.status = data?.status || 'active'
+ this.currentRoomId = data?.currentRoomId || 'living_room'
+ this.isHaveNot = data?.isHaveNot || false
```

### 2.7 BBSeason（扩展现有模型）

增加 `backyardDoorOpen` 字段：

```diff
  this.status = data?.status || 'running'
+ this.backyardDoorOpen = data?.backyardDoorOpen ?? true
```

---

## 三、后端文件变更

### 3.1 新建文件

| 文件 | 用途 |
|------|------|
| `backend/src/games/bigbrother/models/BBHouseRoom.js` | 房间模型 |
| `backend/src/games/bigbrother/models/BBHousePassage.js` | 通道模型 |
| `backend/src/games/bigbrother/models/BBHouseDoor.js` | 门模型 |
| `backend/src/games/bigbrother/models/BBPlayerLocation.js` | 玩家位置模型 |
| `backend/src/games/bigbrother/routes/bbHouse.js` | House REST API |
| `backend/src/socket/bbHouse.js` | House Socket.IO 实时通信 |
| `backend/src/games/bigbrother/houseMap.js` | 房屋静态配置 + seed 数据 |

### 3.2 修改文件

| 文件 | 变更内容 |
|------|----------|
| `backend/src/config/db.js` | COLLECTIONS 数组增加 `BBHouseRoom`, `BBHousePassage`, `BBHouseDoor`, `BBPlayerLocation` |
| `backend/src/index.js` | 挂载 `bbHouse` 路由 (`/api/bigbrother/house`)，初始化 `initBBHouseSocket(io)` |
| `backend/src/games/bigbrother/models/BBHouseguest.js` | 增加 `currentRoomId`, `isHaveNot` 字段 |
| `backend/src/games/bigbrother/models/BBSeason.js` | 增加 `backyardDoorOpen` 字段 |
| `backend/src/games/bigbrother/models/BBChatMessage.js` | 增加 `roomId` 字段 |
| `backend/src/socket/bbChat.js` | 改造：公共聊天改为房间聊天，`chat:send-public` 改为 `chat:send-room` |
| `backend/src/games/bigbrother/routes/bbChat.js` | `GET /` 改为按 roomId 查询 |
| `backend/src/games/bigbrother/routes/bbSeason.js` | reset 时清除玩家位置、重置后院门 |

---

## 四、后端 API 设计

### 4.1 House REST API（`/api/bigbrother/house`）

| Method | Path | 权限 | 说明 |
|--------|------|------|------|
| `GET /map` | 所有人 | 获取房屋地图（房间+通道+门状态） |
| `GET /rooms` | 所有人 | 获取所有房间列表及当前人数 |
| `GET /rooms/:roomId` | 所有人 | 获取指定房间内玩家列表（仅自己房间返回姓名，其他房间仅返回人数） |
| `GET /my-location` | 玩家 | 获取自己当前位置 |
| `POST /move` | 玩家 | 移动到目标房间 `{ targetRoomId }` |
| `POST /invite` | HOH | HOH 邀请玩家进入 HOH Room `{ targetPlayerId }` |
| `POST /accept-invite` | 玩家 | 接受 HOH 邀请 |
| `POST /decline-invite` | 玩家 | 拒绝 HOH 邀请 |
| `GET /hoh-monitor` | HOH | 获取各房间人数（不含身份） |
| `POST /admin/door` | 管理员 | 开关门 `{ doorId, isOpen }` |
| `POST /admin/evict-backyard` | 管理员 | 关闭后院门并清空后院 |
| `GET /admin/locations` | 管理员 | 获取所有玩家完整位置 |
| `POST /admin/move-player` | 管理员 | 强制移动玩家 `{ playerId, targetRoomId }` |

### 4.2 Socket.IO 事件（`/bigbrother-house`）

**客户端 → 服务端：**

| 事件 | 参数 | 说明 |
|------|------|------|
| `house:join` | `{ roomId }` | 加入房间 Socket.IO room |
| `house:leave` | `{ roomId }` | 离开房间 Socket.IO room |
| `house:send-message` | `{ roomId, content }` | 发送房间聊天消息 |
| `house:load-more` | `{ roomId, before }` | 加载更多历史消息 |
| `house:accept-invite` | `{ roomId }` | 接受 HOH 邀请（socket 层面） |

**服务端 → 客户端：**

| 事件 | 说明 |
|------|------|
| `house:player-joined` | 有人进入房间 `{ roomId, playerName }` |
| `house:player-left` | 有人离开房间 `{ roomId, playerName }` |
| `house:new-message` | 新房间聊天消息 `{ roomId, message }` |
| `house:room-presence` | 房间内玩家列表更新 `{ roomId, players }` |
| `house:door-update` | 后院门状态变化 `{ doorId, isOpen }` |
| `house:invite-received` | 收到 HOH 邀请 `{ hohName, roomId }` |
| `house:invite-declined` | 邀请被拒绝 `{ playerName }` |
| `house:hoh-monitor` | HOH 监控数据更新 `{ rooms }` |
| `house:force-moved` | 被管理员强制移动 `{ targetRoomId, reason }` |

---

## 五、前端文件变更

### 5.1 新建文件

| 文件 | 用途 |
|------|------|
| `frontend/src/views/bigbrother/player/BBHouseView.vue` | 玩家端 House 主页面（地图+聊天+移动） |
| `frontend/src/views/bigbrother/admin/BBHouseAdminView.vue` | 管理员端 House 监控页面 |
| `frontend/src/services/bbHouseApi.ts` | House 相关 API 函数 |
| `frontend/src/composables/useHouseSocket.ts` | House Socket.IO composable |
| `frontend/src/components/bigbrother/house/HouseMap.vue` | 房屋地图组件 |
| `frontend/src/components/bigbrother/house/RoomChat.vue` | 房间聊天组件 |
| `frontend/src/components/bigbrother/house/RoomPanel.vue` | 当前房间信息面板 |
| `frontend/src/components/bigbrother/house/HohMonitor.vue` | HOH 监控面板 |
| `frontend/src/components/bigbrother/house/MoveDialog.vue` | 移动确认对话框 |

### 5.2 修改文件

| 文件 | 变更内容 |
|------|----------|
| `frontend/src/layouts/BBPlayerLayout.vue` | 侧边栏增加「🏠 BB House」菜单项 |
| `frontend/src/layouts/BBAdminLayout.vue` | 侧边栏增加「🏠 House 管理」菜单项 |
| `frontend/src/stores/bbSeasonStore.ts` | 增加 `backyardDoorOpen` 状态 |
| `frontend/src/types/bigbrother/index.ts` | 增加 House 相关类型定义 |
| `frontend/src/services/bbApi.ts` | 增加 House API 导出 |
| `frontend/src/router/index.ts` | 增加 House 路由 |

---

## 六、实现顺序（分步骤）

### Phase 1: 数据层 + 静态配置

**Step 1** — 创建 `houseMap.js` 静态配置
- 定义 12 个房间数据
- 定义 10 条通道数据
- 定义 1 个门数据
- 导出 seed 函数

**Step 2** — 创建 4 个新 Model
- `BBHouseRoom.js`
- `BBHousePassage.js`
- `BBHouseDoor.js`
- `BBPlayerLocation.js`

**Step 3** — 修改现有 Model
- `BBHouseguest.js` 增加 `currentRoomId`, `isHaveNot`
- `BBSeason.js` 增加 `backyardDoorOpen`
- `BBChatMessage.js` 增加 `roomId`

**Step 4** — 注册 Collection
- `db.js` 增加 4 个新 collection

**Step 5** — Seed 初始化
- `index.js` 启动时调用 seed 函数，确保房间/通道/门数据存在
- 赛季 reset 时重置所有玩家位置回 `living_room`

### Phase 2: 后端 REST API

**Step 6** — 创建 `bbHouse.js` 路由
- `GET /map` — 返回房间+通道+门状态
- `GET /rooms` — 返回所有房间+人数
- `GET /rooms/:roomId` — 返回房间内玩家（权限判断）
- `GET /my-location` — 返回自己位置
- `POST /move` — 移动逻辑（6 步校验）

**Step 7** — 移动逻辑实现
```
校验流程：
1. 玩家是否 active
2. 目标房间是否存在
3. 通道是否存在（from→to 或 to→from）
4. 通道是否开放（door 检查）
5. 目标房间权限是否满足
6. 目标房间是否满员
→ 全部通过：更新 BBPlayerLocation
→ 广播人数变化
```

**Step 8** — HOH 相关 API
- `POST /invite` — HOH 邀请
- `GET /hoh-monitor` — 仅返回 `{ roomId, count }` 数组

**Step 9** — 管理员 API
- `POST /admin/door` — 开关门
- `POST /admin/evict-backyard` — 清空后院
- `GET /admin/locations` — 全量位置

### Phase 3: Socket.IO 实时层

**Step 10** — 创建 `bbHouse.js` socket
- 命名空间 `/bigbrother-house`
- JWT 认证
- 连接时自动加入当前房间的 Socket.IO room

**Step 11** — 聊天改造
- `chat:send-public` → `chat:send-room`
- 服务端只向同一房间的 socket 广播
- 消息存入 DB 时带 `roomId`
- 离开房间时从 socket room 中 leave

**Step 12** — 实时事件
- 移动时广播 `house:player-joined` / `house:player-left`
- 门状态变化广播 `house:door-update`
- HOH 邀请通过 socket 推送

### Phase 4: 前端玩家端

**Step 13** — 创建 `bbHouseApi.ts` + `useHouseSocket.ts`

**Step 14** — 创建 `HouseMap.vue` 组件
- 房屋平面图渲染
- 当前位置高亮
- 可前往的房间显示移动按钮
- 不可达的房间灰显
- 后院门关闭时显示锁定图标

**Step 15** — 创建 `RoomChat.vue` 组件
- 当前房间聊天消息列表
- 消息输入框
- 进入/离开系统提示
- 玩家列表（当前房间）

**Step 16** — 创建 `BBHouseView.vue` 主页面
- 三栏布局：左=地图 | 中=聊天 | 右=房间信息
- 当前地点显示
- 移动中状态 "🚶 你正在前往xxx……"

**Step 17** — 路由 + 侧边栏
- 增加 `/games/bigbrother/house` 路由
- 玩家侧边栏增加「🏠 BB House」

### Phase 5: 前端管理员端

**Step 18** — 创建 `BBHouseAdminView.vue`
- 全局地图 + 所有玩家位置
- 后院门开关控制
- "关闭并清空后院" 按钮
- 强制移动玩家

**Step 19** — 管理员路由 + 侧边栏

### Phase 6: 赛季集成

**Step 20** — 赛季重置集成
- `bbSeason.js` 的 `/reset` 清除所有 `BBPlayerLocation`
- 新赛季开始时所有玩家默认放入 `living_room`
- HOH 产生后自动设为可进入 `hoh_room`
- Have-Not 设定后更新 `isHaveNot`

---

## 七、关键实现细节

### 7.1 移动校验伪代码

```js
async function movePlayer(playerId, targetRoomId) {
  // 1. 玩家状态
  const player = await BBHouseguest.findOne({ id: playerId, gameId })
  if (player.status !== 'active') throw '非活跃玩家'

  // 2. 目标房间存在
  const targetRoom = await BBHouseRoom.findOne({ id: targetRoomId, gameId })
  if (!targetRoom) throw '房间不存在'

  // 3. 通道存在
  const loc = await BBPlayerLocation.findOne({ playerId })
  const passage = await BBHousePassage.findOne({
    gameId,
    $or: [
      { from: loc.currentRoomId, to: targetRoomId },
      { from: targetRoomId, to: loc.currentRoomId }
    ]
  })
  if (!passage) throw '不可达'

  // 4. 通道开放（door 检查）
  if (passage.type === 'door') {
    const door = await BBHouseDoor.findOne({ id: passage.doorId, gameId })
    if (door && !door.isOpen) throw '门已关闭'
  }

  // 5. 权限检查
  if (targetRoom.accessRule === 'hoh_only') {
    const season = await ensureSeason()
    if (season.fhohId !== playerId) throw '仅 HOH 可进入'
  }
  if (targetRoom.accessRule === 'hoh_or_invited') {
    // 检查是否为 HOH 或被邀请
  }
  if (targetRoom.accessRule === 'have_not_only') {
    if (!player.isHaveNot) throw '仅 Have-Not 可进入'
  }
  if (targetRoom.accessRule === 'single') {
    const count = await BBPlayerLocation.countDocuments({ currentRoomId: targetRoomId })
    if (count >= 1) throw '已有人在内'
  }

  // 6. 容量检查
  if (targetRoom.capacity) {
    const count = await BBPlayerLocation.countDocuments({ currentRoomId: targetRoomId })
    if (count >= targetRoom.capacity) throw '房间已满'
  }

  // 执行移动
  const oldRoomId = loc.currentRoomId
  loc.currentRoomId = targetRoomId
  loc.enteredAt = new Date().toISOString()
  await loc.save()

  return { oldRoomId, newRoomId: targetRoomId }
}
```

### 7.2 Socket.IO 房间隔离

```js
// 玩家连接时
socket.join(`room:${playerLocation.currentRoomId}`)

// 玩家移动时
socket.leave(`room:${oldRoomId}`)
socket.join(`room:${newRoomId}`)

// 发送消息时
socket.on('chat:send-room', ({ roomId, content }) => {
  // 校验 player.currentRoomId === roomId
  // 保存到 BBChatMessage { roomId, chatType: 'room' }
  // 只广播给同房间
  bbNamespace.to(`room:${roomId}`).emit('house:new-message', msg)
})
```

### 7.3 HOH Monitor（仅返回人数）

```js
router.get('/hoh-monitor', auth, async (req, res) => {
  const rooms = await BBHouseRoom.find({ gameId, type: { $ne: 'hidden' } })
  const result = []
  for (const room of rooms) {
    const count = await BBPlayerLocation.countDocuments({
      currentRoomId: room.id, gameId
    })
    result.push({ roomId: room.id, roomName: room.name, icon: room.icon, count })
  }
  res.json({ success: true, data: result })
})
```

### 7.4 前端聊天改造

现有 `BBChatView.vue`（玩家端）改造为 `BBHouseView.vue`：
- 移除「公共聊天」和「私聊」tab
- 替换为：左侧房屋地图 + 右侧当前房间聊天
- 私聊功能保留但放在单独页面
- 聊天消息通过 `house:new-message` 事件接收
- 只显示当前房间的消息

### 7.5 赛季 Reset 集成

```js
// bbSeason.js POST /reset 中增加：
await BBPlayerLocation.deleteMany({ gameId: 'bigbrother' })
// 重新为所有活跃玩家创建位置记录，默认 living_room
const activePlayers = await BBHouseguest.find({ gameId, status: 'active' })
for (const p of activePlayers) {
  await BBPlayerLocation.insertOne({
    id: p.id, playerId: p.id, playerName: p.name,
    currentRoomId: 'living_room', enteredAt: new Date().toISOString(),
    gameId: 'bigbrother'
  })
}
season.backyardDoorOpen = true
```

---

## 八、文件清单汇总

### 新建（7 个后端 + 9 个前端 = 16 个）

**后端：**
1. `backend/src/games/bigbrother/houseMap.js`
2. `backend/src/games/bigbrother/models/BBHouseRoom.js`
3. `backend/src/games/bigbrother/models/BBHousePassage.js`
4. `backend/src/games/bigbrother/models/BBHouseDoor.js`
5. `backend/src/games/bigbrother/models/BBPlayerLocation.js`
6. `backend/src/games/bigbrother/routes/bbHouse.js`
7. `backend/src/socket/bbHouse.js`

**前端：**
8. `frontend/src/services/bbHouseApi.ts`
9. `frontend/src/composables/useHouseSocket.ts`
10. `frontend/src/views/bigbrother/player/BBHouseView.vue`
11. `frontend/src/views/bigbrother/admin/BBHouseAdminView.vue`
12. `frontend/src/components/bigbrother/house/HouseMap.vue`
13. `frontend/src/components/bigbrother/house/RoomChat.vue`
14. `frontend/src/components/bigbrother/house/RoomPanel.vue`
15. `frontend/src/components/bigbrother/house/HohMonitor.vue`
16. `frontend/src/components/bigbrother/house/MoveDialog.vue`

### 修改（10 个）

**后端：**
1. `backend/src/config/db.js` — +4 collections
2. `backend/src/index.js` — 挂载路由 + socket + seed
3. `backend/src/games/bigbrother/models/BBHouseguest.js` — +2 fields
4. `backend/src/games/bigbrother/models/BBSeason.js` — +1 field
5. `backend/src/games/bigbrother/models/BBChatMessage.js` — +1 field
6. `backend/src/socket/bbChat.js` — public → room 改造
7. `backend/src/games/bigbrother/routes/bbChat.js` — 按 roomId 查询
8. `backend/src/games/bigbrother/routes/bbSeason.js` — reset 集成

**前端：**
9. `frontend/src/layouts/BBPlayerLayout.vue` — 侧边栏菜单
10. `frontend/src/layouts/BBAdminLayout.vue` — 侧边栏菜单

---

## 九、第一阶段交付标准

完成以上 Phase 1-5 后，系统应满足：

- [x] 12 个房间 + 走廊概念 + 通道连接
- [x] 玩家在房间间移动，聊天空间随之改变
- [x] 聊天消息房间隔离
- [x] 后院门开关控制
- [x] HOH Room 权限 + 邀请
- [x] Have-Not Room 权限
- [x] Diary Room 单人限制
- [x] HOH Monitor（仅人数）
- [x] 管理员全量位置查看
- [x] 管理员强制移动
- [x] 进入/离开提示
- [x] 移动中的过渡提示
