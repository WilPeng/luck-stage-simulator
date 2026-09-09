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
          :reachableIds="reachableIds"
          :backyardDoorOpen="backyardDoorOpen"
          @select-room="handleMove"
        />

        <!-- HOH 房间特殊功能 -->
        <div v-if="currentRoomId === 'hoh_room' && isHoh" class="hoh-panel">
          <div class="hoh-panel-title">👑 House Monitor</div>
          <div v-if="hohMonitor.length" class="monitor-grid">
            <div v-for="r in hohMonitor" :key="r.roomId" class="monitor-item">
              <span class="monitor-icon">{{ r.icon }}</span>
              <span class="monitor-name">{{ r.roomName }}</span>
              <span class="monitor-count">{{ r.count }}</span>
            </div>
          </div>

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
            </div>
          </div>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import { useBbSeasonStore } from '../../../stores/bbSeasonStore'
import { useHouseSocket, type HouseMessage, type HousePlayer } from '../../../composables/useHouseSocket'
import { bbGetMyLocation, bbGetReachableRooms, bbMoveToRoom, bbGetHouseRooms } from '../../../services/bbHouseApi'
import { bbGetActiveHouseguests, bbGetCurrentHoh } from '../../../services/bbApi'
import HouseMap from '../../../components/bigbrother/house/HouseMap.vue'
import RoomChat from '../../../components/bigbrother/house/RoomChat.vue'
import type { BBHouseRoomWithCount, BBHohMonitorRoom } from '../../../types/bigbrother'

const authStore = useBbAuthStore()
const seasonStore = useBbSeasonStore()
const house = useHouseSocket()

const currentRoomId = ref('living_room')
const rooms = ref<BBHouseRoomWithCount[]>([])
const reachableIds = ref<string[]>([])
const messages = ref<HouseMessage[]>([])
const presencePlayers = ref<HousePlayer[]>([])
const hohMonitor = ref<BBHohMonitorRoom[]>([])
const backyardDoorOpen = ref(true)
const moving = ref(false)
const movingTargetName = ref('')
const hasMore = ref(true)
const loadingMore = ref(false)
const inviteData = ref<{ hohName: string; hohId: string; roomId: string } | null>(null)

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
  }
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
    currentRoomId.value = locRes?.data?.currentRoomId || 'living_room'
    rooms.value = roomsRes?.data || []
    reachableIds.value = (reachableRes?.data?.rooms || []).map((r: any) => r.id)
    backyardDoorOpen.value = reachableRes?.data?.backyardDoorOpen ?? true
    house.currentRoomId.value = currentRoomId.value

    // 解析当前 HOH（周 HOH > 终局 FHOH 回退）
    const hohRes = await bbGetCurrentHoh()
    if (hohRes && (hohRes as any).winnerId) {
      currentHohId.value = (hohRes as any).winnerId
    } else if (seasonStore.season?.fhohId) {
      currentHohId.value = seasonStore.season.fhohId
    } else {
      currentHohId.value = null
    }

    // 如果是 HOH，加载监控数据
    if (isHoh.value) {
      try {
        const monitorRes = await (await import('../../../services/bbHouseApi')).bbGetHohMonitor()
        hohMonitor.value = monitorRes?.data || []
      } catch {}
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

async function loadActivePlayers() {
  try {
    activePlayers.value = (await bbGetActiveHouseguests()) || []
  } catch {}
}

onMounted(() => {
  loadData()
  loadActivePlayers()
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
