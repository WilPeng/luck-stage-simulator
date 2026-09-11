<template>
  <div class="bb-house">
    <div class="page-header">
      <h1>🏠 BB House</h1>
      <div class="header-meta">
        <span class="location-tag">
          📍 {{ currentRoomName }}
        </span>
        <span class="ws-status" :class="{ connected: house.connected.value }">
          {{ house.connected.value ? '🟢 在线' : '🔴 离线' }}
        </span>
      </div>
    </div>

    <!-- HOH 邀请提示 -->
    <div v-if="inviteData" class="invite-banner">
      <div class="invite-icon">👑</div>
      <div class="invite-info">
        <div class="invite-text">{{ inviteData.hohName }} 邀请你进入 HOH Room</div>
        <div class="invite-actions">
          <button class="bb-btn bb-btn-sm" @click="handleAcceptInvite">接受</button>
          <button class="bb-btn bb-btn-sm bb-btn-outline" @click="handleDeclineInvite">拒绝</button>
        </div>
      </div>
    </div>

    <!-- HOH 门铃提示（房内的人收到） -->
    <div v-if="doorbellNotice" class="doorbell-banner">
      <span class="doorbell-icon">🔔</span>
      <span class="doorbell-text">{{ doorbellNotice }}</span>
      <button v-if="canControlHohDoor" class="bb-btn bb-btn-sm" @click="toggleHohDoor(true)">开门</button>
    </div>

    <!-- 洗澡提示 -->
    <div v-if="isShowering && !isSleeping" class="shower-banner">
      🚿 洗澡中（{{ showerSecondsLeft }}s 后自动结束，只能看到浴室消息）
    </div>

    <!-- 移动中提示 -->
    <div v-if="moving" class="moving-banner">
      <span class="moving-spinner"></span>
      <span>🚶 你正在前往 {{ movingTargetName }}……</span>
    </div>

    <div class="house-layout">
      <!-- 左侧：房屋地图 -->
      <div class="house-left">
        <HouseMap
          :rooms="rooms"
          :currentRoomId="currentRoomId"
          :reachableRooms="reachableRooms"
          :backyardDoorOpen="backyardDoorOpen"
          :hohDoorOpen="hohDoorOpen"
          :showBackyardDoor="canSeeBackyardDoor"
          :showHohDoor="canSeeHohDoor"
          @select-room="handleMove"
        />

        <!-- HOH 房门控制 / 门铃 -->
        <div v-if="canControlHohDoor || atHohDoor" class="hoh-door-panel">
          <div class="hoh-door-title">
            🚪 HOH 房门：<span :class="hohDoorOpen ? 'open' : 'closed'">{{ hohDoorOpen ? '已打开' : '已关闭' }}</span>
          </div>
          <div v-if="canControlHohDoor" class="hoh-door-actions">
            <button class="bb-btn bb-btn-sm" :class="{ 'btn-active': hohDoorOpen }" @click="toggleHohDoor(true)">打开门</button>
            <button class="bb-btn bb-btn-sm" :class="{ 'btn-active': !hohDoorOpen }" @click="toggleHohDoor(false)">关闭门</button>
          </div>
          <div v-if="atHohDoor && !hohDoorOpen" class="doorbell-row">
            <button class="bb-btn bb-btn-sm" @click="ringDoorbell">🔔 按门铃</button>
            <span class="doorbell-hint">门已关闭，按门铃通知房内的人</span>
          </div>
          <div v-if="doorbellSentNotice" class="doorbell-sent">{{ doorbellSentNotice }}</div>
        </div>

        <!-- 睡觉 / 洗澡 -->
        <div v-if="canSleepHere || canShower" class="action-panel">
          <button v-if="canSleepHere" class="bb-btn bb-btn-sm" @click="doSleep">😴 睡觉</button>
          <button v-if="canShower" class="bb-btn bb-btn-sm" @click="doShower">🚿 洗澡</button>
          <span v-if="canShower && myState.lastShowerDate === myState.today" class="action-hint">今天已洗过澡</span>
        </div>

        <!-- 洗漱间：查看浴室内有谁 -->
        <div v-if="currentRoomId === 'washroom'" class="washroom-panel">
          <div class="washroom-title">🧼 洗漱间 · 浴室内</div>
          <div v-if="washroomBathroomPlayers.length" class="washroom-list">
            <div v-for="p in washroomBathroomPlayers" :key="p.playerId" class="washroom-player">
              <BBAvatar :name="p.playerName" :avatar="p.avatar" size="sm" />
              <span>{{ p.playerName }}</span>
            </div>
          </div>
          <div v-else class="washroom-empty">浴室目前无人</div>
        </div>

        <!-- HOH 房间：监控（房内所有人可见）+ 邀请/睡眠同意（仅 HOH） -->
        <div v-if="showMonitor" class="hoh-panel">
          <div class="hoh-panel-title">👑 House Monitor</div>
          <div v-if="hohMonitor.length" class="monitor-grid">
            <div v-for="r in hohMonitor" :key="r.roomId" class="monitor-item">
              <span class="monitor-icon">{{ r.icon }}</span>
              <span class="monitor-name">{{ r.roomName }}</span>
              <span class="monitor-count">{{ r.count }}</span>
            </div>
          </div>

          <template v-if="isHoh">
            <div class="hoh-divider"></div>
            <div class="hoh-panel-title">📨 邀请进入 HOH Room</div>
            <div v-if="declineNotice" class="invite-notice">{{ declineNotice }}</div>
            <div class="invite-row">
              <select v-model="inviteTargetId" class="invite-select">
                <option value="">选择玩家…</option>
                <option v-for="p in inviteCandidates" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
              <button class="bb-btn bb-btn-sm" :disabled="!inviteTargetId" @click="handleInvite">邀请</button>
            </div>
            <div v-if="pendingInvites.length" class="pending-list">
              <div v-for="pid in pendingInvites" :key="pid" class="pending-item">
                <span>⏳ {{ playerName(pid) }} 等待回应</span>
                <button class="bb-btn bb-btn-xs" @click="handleCancelInvite(pid)">撤销</button>
              </div>
            </div>
            <div v-if="cancelNotice" class="invite-notice">{{ cancelNotice }}</div>

            <div class="hoh-divider"></div>
            <div class="hoh-panel-title">😴 允许在 HOH 房睡觉</div>
            <div class="approve-list">
              <div v-for="p in approveCandidates" :key="p.id" class="approve-row">
                <span>{{ p.name }}</span>
                <button class="bb-btn bb-btn-xs" @click="approveSleep(p.id)">同意</button>
              </div>
              <div v-if="!approveCandidates.length" class="approve-empty">暂无可同意的玩家</div>
            </div>
          </template>
        </div>
      </div>

      <!-- 右侧：房间聊天 -->
      <div class="house-right">
        <RoomChat
          :roomId="currentRoomId"
          :roomName="currentRoomName"
          :roomIcon="currentRoomIcon"
          :messages="messages"
          :presencePlayers="presencePlayers"
          :connected="house.connected.value"
          :hasMore="hasMore"
          :loading="loadingMore"
          @send="handleSend"
          @load-more="handleLoadMore"
        />
      </div>
    </div>

    <!-- 睡眠覆盖 -->
    <div v-if="isSleeping" class="state-overlay">
      <div class="state-card">
        <div class="state-icon">😴</div>
        <div class="state-title">睡眠中</div>
        <div class="state-desc">你在睡觉，无法接收任何消息</div>
        <div v-if="!wakeReady" class="state-timer">可醒来倒计时：{{ sleepCountdown }}</div>
        <button class="bb-btn" :disabled="!wakeReady" @click="doWake">
          {{ wakeReady ? '醒来' : '还未到时间' }}
        </button>
      </div>
    </div>

    <!-- 管理员广播提示框 -->
    <div v-if="broadcastData" class="broadcast-overlay" @click.self="broadcastData = null">
      <div class="broadcast-modal">
        <div class="broadcast-icon">{{ broadcastData.type === 'invite' ? '📣' : '🔔' }}</div>
        <div class="broadcast-title">{{ broadcastData.type === 'invite' ? '管理员邀请' : '管理员通知' }}</div>
        <div class="broadcast-msg">{{ broadcastData.message }}</div>
        <div v-if="broadcastData.type === 'invite' && broadcastData.roomName" class="broadcast-room">
          📍 已带你前往「{{ broadcastData.roomName }}」
        </div>
        <div class="broadcast-from">—— {{ broadcastData.from }}</div>
        <div class="broadcast-actions">
          <button class="bb-btn bb-btn-sm" @click="broadcastData = null">知道了</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import { useBbSeasonStore } from '../../../stores/bbSeasonStore'
import { useHouseSocket, type HouseMessage, type HousePlayer } from '../../../composables/useHouseSocket'
import { bbGetMyLocation, bbGetReachableRooms, bbMoveToRoom, bbGetHouseRooms, bbGetRoomPlayers, bbGetMyState, bbSleep, bbSleepWake, bbSleepApprove, bbShower } from '../../../services/bbHouseApi'
import { bbGetActiveHouseguests, bbGetCurrentHoh } from '../../../services/bbApi'
import HouseMap from '../../../components/bigbrother/house/HouseMap.vue'
import RoomChat from '../../../components/bigbrother/house/RoomChat.vue'
import BBAvatar from '../../../components/bigbrother/BBAvatar.vue'
import type { BBHouseRoomWithCount, BBHohMonitorRoom } from '../../../types/bigbrother'

const authStore = useBbAuthStore()
const seasonStore = useBbSeasonStore()
const house = useHouseSocket()

const currentRoomId = ref('living_room')
const rooms = ref<BBHouseRoomWithCount[]>([])
const reachableRooms = ref<any[]>([])
const messages = ref<HouseMessage[]>([])
const presencePlayers = ref<HousePlayer[]>([])
const hohMonitor = ref<BBHohMonitorRoom[]>([])
const backyardDoorOpen = ref(true)
const hohDoorOpen = ref(false)
const doorbellNotice = ref('')
const doorbellSentNotice = ref('')
const moving = ref(false)
const movingTargetName = ref('')
const hasMore = ref(true)
const loadingMore = ref(false)
const inviteData = ref<{ hohName: string; hohId: string; roomId: string } | null>(null)
const cancelNotice = ref('')
const broadcastData = ref<{ type: string; roomId: string | null; roomName?: string; roomIcon?: string; message: string; from: string } | null>(null)

// 睡眠 / 洗澡
const myState = ref<any>({
  isSleeping: false, wakeAt: null, sleepStartedAt: null,
  isShowering: false, showerStartedAt: null, lastShowerDate: null,
  autoSleepHour: 18, today: '', hohSleepAllowed: true
})
const nowTs = ref(Date.now())
const washroomBathroomPlayers = ref<any[]>([])

// HOH 相关：周 HOH（BBHohRecord）> 终局 FHOH 回退
const currentHohId = ref<string | null>(null)
const myId = computed(() => authStore.currentUser?.id || '')
const isHoh = computed(() => currentHohId.value === myId.value)

// HOH 邀请 UI
const activePlayers = ref<{ id: string; name: string; avatar: string | null }[]>([])
const inviteTargetId = ref('')
const pendingInvites = ref<string[]>([])
const declineNotice = ref('')

const currentRoomDef = computed(() => rooms.value.find(r => r.id === currentRoomId.value))
const currentRoomName = computed(() => currentRoomDef.value?.name || currentRoomId.value)
const currentRoomIcon = computed(() => currentRoomDef.value?.icon || '🏠')

const atHohDoor = computed(() => currentRoomId.value === 'hoh_door')
const canControlHohDoor = computed(() =>
  currentRoomId.value === 'hoh_room' || (isHoh.value && currentRoomId.value === 'hoh_door')
)
// 门状态可见范围
const canSeeBackyardDoor = computed(() => currentRoomId.value === 'living_room' || currentRoomId.value === 'backyard')
const canSeeHohDoor = computed(() => currentRoomId.value === 'hoh_room' || currentRoomId.value === 'hoh_door')

// 睡眠 / 洗澡
const isSleeping = computed(() => !!myState.value.isSleeping)
const isShowering = computed(() => !!myState.value.isShowering)
const canSleepHere = computed(() => !!currentRoomDef.value?.canSleep)
const wakeReady = computed(() => myState.value.wakeAt ? nowTs.value >= new Date(myState.value.wakeAt).getTime() : false)
const sleepCountdown = computed(() => {
  if (!myState.value.wakeAt) return ''
  const ms = Math.max(0, new Date(myState.value.wakeAt).getTime() - nowTs.value)
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${h}小时${m}分`
})
const canShower = computed(() =>
  currentRoomId.value === 'bathroom' && !isShowering.value && !isSleeping.value &&
  myState.value.lastShowerDate !== myState.value.today
)
const showerSecondsLeft = computed(() => {
  if (!myState.value.showerStartedAt) return 0
  return Math.max(0, Math.ceil((new Date(myState.value.showerStartedAt).getTime() + 10 * 60 * 1000 - nowTs.value) / 1000))
})
const showMonitor = computed(() => currentRoomId.value === 'hoh_room')
const approveCandidates = computed(() => activePlayers.value.filter(p => p.id !== myId.value))

const inviteCandidates = computed(() => {
  const inRoom = new Set(presencePlayers.value.map(p => p.playerId))
  const pending = new Set(pendingInvites.value)
  return activePlayers.value.filter(p => p.id !== myId.value && !inRoom.has(p.id) && !pending.has(p.id))
})

// Socket 事件绑定
house.onHistory.value = (data) => {
  if (data.roomId === currentRoomId.value) {
    messages.value = data.messages
    hasMore.value = data.messages.length >= 50
  }
}

house.onNewMessage.value = (data) => {
  if (data.roomId === currentRoomId.value) {
    messages.value.push(data.message)
  }
}

house.onOlderMessages.value = (data) => {
  if (data.roomId === currentRoomId.value && data.messages.length > 0) {
    messages.value = [...data.messages, ...messages.value]
    if (data.messages.length < 30) hasMore.value = false
  }
  loadingMore.value = false
}

house.onPlayerJoined.value = (data) => {
  if (data.roomId === currentRoomId.value) {
    messages.value.push({
      id: `sys_${Date.now()}`,
      senderId: 'system',
      senderName: 'System',
      senderRole: 'system',
      senderAvatar: null,
      content: `${data.playerName} 进入了房间`,
      chatType: 'room',
      roomId: data.roomId,
      gameId: 'bigbrother',
      createdAt: new Date().toISOString()
    })
  }
}

house.onPlayerLeft.value = (data) => {
  if (data.roomId === currentRoomId.value) {
    messages.value.push({
      id: `sys_${Date.now()}`,
      senderId: 'system',
      senderName: 'System',
      senderRole: 'system',
      senderAvatar: null,
      content: `${data.playerName} 离开了房间`,
      chatType: 'room',
      roomId: data.roomId,
      gameId: 'bigbrother',
      createdAt: new Date().toISOString()
    })
  }
}

house.onRoomPresence.value = (data) => {
  if (data.roomId === currentRoomId.value) {
    presencePlayers.value = data.players
  }
}

house.onDoorUpdate.value = (data) => {
  if (data.doorId === 'backyard_door') {
    backyardDoorOpen.value = data.isOpen
    // 更新 seasonStore
    if (seasonStore.season) {
      (seasonStore.season as any).backyardDoorOpen = data.isOpen
    }
  } else if (data.doorId === 'hoh_door') {
    hohDoorOpen.value = data.isOpen
  }
  // 门开关影响可前往房间，刷新可达列表
  loadData()
}

house.onHohDoorbell.value = (data) => {
  doorbellNotice.value = `${data.playerName} 在 HOH 房门口按了门铃`
  window.setTimeout(() => { doorbellNotice.value = '' }, 6000)
}

house.onHohDoorbellSent.value = () => {
  doorbellSentNotice.value = '已按门铃，等待房内回应…'
  window.setTimeout(() => { doorbellSentNotice.value = '' }, 5000)
}

house.onMonitorUpdate.value = (data) => {
  hohMonitor.value = data as any
}

house.onInviteReceived.value = (data) => {
  inviteData.value = data
}

house.onInviteAccepted.value = (data) => {
  pendingInvites.value = pendingInvites.value.filter(id => id !== data.playerId)
}

house.onInviteDeclined.value = (data) => {
  pendingInvites.value = pendingInvites.value.filter(id => id !== data.playerId)
  declineNotice.value = `${data.playerName} 拒绝了你的邀请`
  window.setTimeout(() => { declineNotice.value = '' }, 4000)
}

house.onInviteCancelled.value = (data) => {
  if (data.playerId) {
    // HOH 侧：移除待回应
    pendingInvites.value = pendingInvites.value.filter(id => id !== data.playerId)
  }
  if (data.hohId) {
    // 被邀请者侧：邀请被撤销
    inviteData.value = null
    cancelNotice.value = 'HOH 撤销了邀请'
    window.setTimeout(() => { cancelNotice.value = '' }, 4000)
  }
}

house.onBroadcast.value = (data) => {
  broadcastData.value = data
}

house.onSleepForced.value = (data) => {
  myState.value = { ...myState.value, isSleeping: true, wakeAt: data.wakeAt }
}

house.onForceMoved.value = (data) => {
  currentRoomId.value = data.targetRoomId
  house.currentRoomId.value = data.targetRoomId
  messages.value = []
  presencePlayers.value = []
  hasMore.value = true
  inviteData.value = null
  // 服务端已切换 socket 房间并推送历史
  loadData()
}

house.onError.value = (data) => {
  console.error('[BBHouse]', data.error)
}

async function loadData() {
  try {
    const [locRes, roomsRes, reachableRes] = await Promise.all([
      bbGetMyLocation(),
      bbGetHouseRooms(),
      bbGetReachableRooms()
    ])
    currentRoomId.value = locRes?.currentRoomId || 'living_room'
    rooms.value = roomsRes || []
    reachableRooms.value = reachableRes?.rooms || []
    backyardDoorOpen.value = reachableRes?.backyardDoorOpen ?? true
    hohDoorOpen.value = reachableRes?.hohDoorOpen ?? false
    house.currentRoomId.value = currentRoomId.value

    // 睡眠/洗澡状态
    try { myState.value = await bbGetMyState() } catch {}

    // 洗漱间：查看浴室内有谁
    if (currentRoomId.value === 'washroom') {
      try {
        const r = await bbGetRoomPlayers('washroom')
        washroomBathroomPlayers.value = r?.bathroomPlayers || []
      } catch { washroomBathroomPlayers.value = [] }
    } else {
      washroomBathroomPlayers.value = []
    }

    // 解析当前 HOH（周 HOH > 终局 FHOH 回退）
    const hohRes = await bbGetCurrentHoh()
    if (hohRes && (hohRes as any).winnerId) {
      currentHohId.value = (hohRes as any).winnerId
    } else if (seasonStore.season?.fhohId) {
      currentHohId.value = seasonStore.season.fhohId
    } else {
      currentHohId.value = null
    }

    // 身处 HOH 房即可查看监控（含普通房客）
    if (currentRoomId.value === 'hoh_room') {
      try {
        const monitorRes = await (await import('../../../services/bbHouseApi')).bbGetHohMonitor()
        hohMonitor.value = monitorRes || []
      } catch { hohMonitor.value = [] }
    } else {
      hohMonitor.value = []
    }
  } catch (e) {
    console.error('[BBHouse] Load data error:', e)
  }
}

async function handleMove(roomId: string) {
  if (roomId === currentRoomId.value) return
  if (moving.value) return

  moving.value = true
  const targetDef = rooms.value.find(r => r.id === roomId)
  movingTargetName.value = targetDef?.name || roomId

  try {
    await bbMoveToRoom(roomId)
    const oldRoomId = currentRoomId.value
    currentRoomId.value = roomId
    messages.value = []
    presencePlayers.value = []
    hasMore.value = true

    // 通知 socket
    house.notifyMoved(oldRoomId, roomId)

    // 重新加载可达房间 / HOH 状态
    await loadData()
  } catch (e: any) {
    alert(e?.message || '移动失败')
  } finally {
    moving.value = false
  }
}

function handleSend(content: string) {
  house.sendMessage(currentRoomId.value, content)
}

function handleLoadMore() {
  if (messages.value.length === 0) return
  loadingMore.value = true
  house.loadMore(currentRoomId.value, messages.value[0].createdAt)
}

async function handleAcceptInvite() {
  // 走 socket 端（服务端更新位置 + 切换房间 + 通知 HOH + 推历史）
  house.acceptInvite()
  currentRoomId.value = 'hoh_room'
  house.currentRoomId.value = 'hoh_room'
  messages.value = []
  presencePlayers.value = []
  hasMore.value = true
  inviteData.value = null
  loadData()
}

function handleDeclineInvite() {
  if (inviteData.value) {
    house.declineInvite(inviteData.value.hohId)
  }
  inviteData.value = null
}

function handleInvite() {
  if (!inviteTargetId.value) return
  house.invitePlayer(inviteTargetId.value)
  pendingInvites.value.push(inviteTargetId.value)
  inviteTargetId.value = ''
}

function playerName(pid: string): string {
  return activePlayers.value.find(p => p.id === pid)?.name || pid
}

function toggleHohDoor(isOpen: boolean) {
  house.setHohDoor(isOpen)
}

function ringDoorbell() {
  house.ringHohDoorbell()
}

function handleCancelInvite(pid: string) {
  house.cancelInvite(pid)
}

async function doSleep() {
  try { await bbSleep(); await loadData() } catch (e: any) { alert(e?.message || '无法睡觉') }
}
async function doWake() {
  try { await bbSleepWake(); await loadData() } catch (e: any) { alert(e?.message || '无法醒来') }
}
async function doShower() {
  try { await bbShower(); await loadData() } catch (e: any) { alert(e?.message || '无法洗澡') }
}
async function approveSleep(pid: string) {
  try { await bbSleepApprove(pid) } catch (e: any) { alert(e?.message || '操作失败') }
}

async function loadActivePlayers() {
  try {
    activePlayers.value = (await bbGetActiveHouseguests()) || []
  } catch {}
}

let stateTicker: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  loadData()
  loadActivePlayers()
  stateTicker = setInterval(() => { nowTs.value = Date.now() }, 1000)
})

onUnmounted(() => {
  if (stateTicker) { clearInterval(stateTicker); stateTicker = null }
})

// 监听 season 变化以更新 backyardDoorOpen
watch(() => seasonStore.season?.backyardDoorOpen, (v) => {
  if (v !== undefined) backyardDoorOpen.value = v
})
</script>

<style scoped>
.bb-house {
  max-width: 1200px;
  margin: 0 auto;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.page-header h1 {
  font-size: 22px;
  font-weight: 600;
  color: #e0e0e0;
  margin: 0;
}
.header-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}
.location-tag {
  background: #00ff8822;
  color: #00ff88;
  padding: 4px 14px;
  border-radius: 10px;
  font-size: 13px;
  border: 1px solid #00ff8844;
}
.ws-status {
  font-size: 12px;
  color: #888;
}
.ws-status.connected { color: #00ff88; }

.invite-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 20px;
  background: linear-gradient(135deg, #2e2a0f, #1a1a0f);
  border: 1px solid #ffaa0066;
  border-radius: 10px;
  margin-bottom: 16px;
}
.invite-icon { font-size: 32px; }
.invite-info { flex: 1; }
.invite-text { font-size: 14px; color: #ffaa00; font-weight: 500; margin-bottom: 8px; }
.invite-actions { display: flex; gap: 8px; }

.moving-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: #00ff8815;
  border: 1px solid #00ff8833;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 13px;
  color: #00ff88;
}

.doorbell-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  background: linear-gradient(135deg, #3a2e0f, #241a08);
  border: 1px solid #ffaa0066;
  border-radius: 10px;
  margin-bottom: 16px;
}
.doorbell-icon { font-size: 22px; }
.doorbell-text { flex: 1; color: #ffaa00; font-size: 14px; }

.hoh-door-panel {
  background: #0f0f2e;
  border: 1px solid #ffaa0033;
  border-radius: 10px;
  padding: 14px;
}
.hoh-door-title { font-size: 14px; color: #e0e0e0; margin-bottom: 10px; font-weight: 600; }
.hoh-door-title .open { color: #00ff88; }
.hoh-door-title .closed { color: #ff6b6b; }
.hoh-door-actions { display: flex; gap: 8px; }
.bb-btn.btn-active { background: #00ff8822; border-color: #00ff88; }
.doorbell-row { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
.doorbell-hint { font-size: 11px; color: #888; }
.doorbell-sent { margin-top: 10px; font-size: 12px; color: #ffaa00; }

.pending-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.bb-btn-xs { padding: 2px 8px; font-size: 11px; }

.broadcast-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}
.broadcast-modal {
  background: linear-gradient(135deg, #1a1a3e, #0f0f2e);
  border: 1px solid #00ff8866;
  border-radius: 14px;
  padding: 28px 32px;
  width: min(420px, 90vw);
  text-align: center;
  box-shadow: 0 12px 48px #000000aa;
}
.broadcast-icon { font-size: 44px; }
.broadcast-title { color: #00ff88; font-weight: 700; margin: 10px 0 8px; font-size: 16px; }
.broadcast-msg { color: #e0e0e0; font-size: 15px; line-height: 1.6; margin-bottom: 8px; }
.broadcast-room { color: #00ff88; font-size: 13px; margin-bottom: 8px; }
.broadcast-from { color: #777; font-size: 12px; margin-bottom: 16px; }
.broadcast-actions { display: flex; gap: 10px; justify-content: center; }

.action-panel {
  display: flex; gap: 10px; align-items: center;
  background: #0f0f2e; border: 1px solid #00ff8833; border-radius: 10px; padding: 12px 14px;
}
.action-hint { font-size: 11px; color: #888; }

.washroom-panel { background: #0f0f2e; border: 1px solid #4488ff33; border-radius: 10px; padding: 14px; }
.washroom-title { font-size: 14px; color: #7fb0ff; font-weight: 600; margin-bottom: 10px; }
.washroom-list { display: flex; flex-direction: column; gap: 8px; }
.washroom-player { display: flex; align-items: center; gap: 8px; color: #ccc; font-size: 13px; }
.washroom-empty { color: #666; font-size: 12px; }

.approve-list { display: flex; flex-direction: column; gap: 6px; }
.approve-row { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: #ccc; }
.approve-empty { color: #666; font-size: 12px; }

.shower-banner {
  padding: 10px 16px; margin-bottom: 16px;
  background: #4488ff18; border: 1px solid #4488ff55; border-radius: 8px;
  color: #7fb0ff; font-size: 13px;
}

.state-overlay {
  position: fixed; inset: 0; z-index: 1800;
  background: rgba(4, 6, 20, 0.92);
  display: flex; align-items: center; justify-content: center;
}
.state-card { text-align: center; color: #e0e0e0; }
.state-icon { font-size: 72px; }
.state-title { font-size: 24px; font-weight: 700; margin: 12px 0 6px; color: #00ff88; }
.state-desc { color: #888; margin-bottom: 12px; }
.state-timer { color: #ffaa00; margin-bottom: 16px; }
.moving-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #00ff8833;
  border-top-color: #00ff88;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.house-layout {
  display: flex;
  gap: 16px;
  min-height: 500px;
}
.house-left {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.house-right {
  flex: 1;
  min-width: 0;
}

.hoh-panel {
  background: #0f0f2e;
  border: 1px solid #ffaa0033;
  border-radius: 10px;
  padding: 14px;
}
.hoh-panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #ffaa00;
  margin-bottom: 10px;
}
.monitor-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.monitor-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: #ffffff05;
  border-radius: 6px;
  font-size: 12px;
}
.monitor-icon { font-size: 14px; }
.monitor-name { flex: 1; color: #aaa; }
.monitor-count { color: #00ff88; font-weight: 600; }

.hoh-divider {
  height: 1px;
  background: #ffaa0022;
  margin: 12px 0;
}
.invite-notice {
  font-size: 12px;
  color: #ff6b6b;
  background: #ff444415;
  border: 1px solid #ff444433;
  padding: 4px 10px;
  border-radius: 6px;
  margin-bottom: 8px;
}
.invite-row {
  display: flex;
  gap: 8px;
}
.invite-select {
  flex: 1;
  padding: 6px 10px;
  background: #1a1a3e;
  border: 1px solid #ffffff20;
  border-radius: 6px;
  color: #e0e0e0;
  font-size: 12px;
  outline: none;
}
.invite-select:focus { border-color: #ffaa00; }
.invite-select option { background: #0f0f2e; color: #fff; }
.pending-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}
.pending-item {
  font-size: 12px;
  color: #ffaa00;
  background: #ffaa0010;
  padding: 4px 10px;
  border-radius: 6px;
}

.bb-btn {
  background: transparent;
  border: 1px solid #00ff8844;
  color: #00ff88;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}
.bb-btn:hover { background: #00ff8822; }
.bb-btn-sm { padding: 4px 12px; font-size: 11px; }
.bb-btn-outline { border-color: #ffffff22; color: #888; }
.bb-btn-outline:hover { background: #ffffff08; color: #aaa; border-color: #ffffff33; }

@media (max-width: 768px) {
  .house-layout { flex-direction: column; }
  .house-left { width: 100%; }
}
</style>
