<template>
  <div class="bb-house-admin">
    <div class="page-header">
      <h1>🏠 House 管理</h1>
    </div>

    <!-- 后院门控制 -->
    <div class="control-card">
      <div class="control-header">
        <h3>🚪 后院门</h3>
        <div class="door-status" :class="{ open: backyardDoorOpen }">
          {{ backyardDoorOpen ? '🟢 OPEN' : '🔴 CLOSED' }}
        </div>
      </div>
      <div class="control-actions">
        <button class="bb-btn" :class="{ 'btn-active': backyardDoorOpen }" @click="toggleDoor(true)">
          打开后院门
        </button>
        <button class="bb-btn bb-btn-danger" :class="{ 'btn-active': !backyardDoorOpen }" @click="toggleDoor(false)">
          关闭后院门
        </button>
        <button class="bb-btn bb-btn-danger" @click="evictBackyard">
          关闭并清空后院
        </button>
      </div>
    </div>

    <!-- 管理员广播 -->
    <div class="control-card">
      <div class="control-header">
        <h3>📣 广播</h3>
      </div>
      <div class="broadcast-form">
        <select v-model="broadcastType" class="bb-select">
          <option value="notice">通知</option>
          <option value="invite">邀请所有人到房间</option>
        </select>
        <select v-if="broadcastType === 'invite'" v-model="broadcastRoom" class="bb-select">
          <option value="">选择房间…</option>
          <option v-for="r in allRooms" :key="r.id" :value="r.id">{{ r.icon }} {{ r.name }}</option>
        </select>
        <input
          v-model="broadcastMessage"
          class="bb-input"
          :placeholder="broadcastType === 'invite' ? '附言（可选）' : '通知内容'"
        />
        <button
          class="bb-btn bb-btn-primary"
          :disabled="broadcastType === 'invite' && !broadcastRoom"
          @click="sendBroadcast"
        >发送</button>
      </div>
    </div>

    <!-- 玩家位置总览 -->
    <div class="locations-section">
      <h3>📍 玩家位置总览</h3>
      <div class="locations-grid">
        <div v-for="(data, roomId) in locations" :key="roomId" class="location-card">
          <div class="location-header">
            <span class="location-icon">{{ getRoomIcon(roomId as string) }}</span>
            <span class="location-name">{{ getRoomName(roomId as string) }}</span>
            <span class="location-count">{{ data.players?.length || 0 }} 人</span>
          </div>
          <div class="location-players">
            <div v-for="p in (data.players || [])" :key="p.playerId" class="location-player">
              <BBAvatar :name="p.playerName" :avatar="p.avatar" size="sm" />
              <span class="player-name">{{ p.playerName }}</span>
              <span class="player-time">{{ formatTime(p.enteredAt) }}</span>
              <select class="move-select" @change="handleForceMove(p.playerId, ($event.target as any).value); ($event.target as any).value = ''">
                <option value="">移至...</option>
                <option v-for="r in allRooms" :key="r.id" :value="r.id" :disabled="r.id === roomId">
                  {{ r.icon }} {{ r.name }}
                </option>
              </select>
            </div>
            <div v-if="!data.players?.length" class="no-players">空</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import {
  bbGetHouseRooms,
  bbGetHouseMap,
  bbAdminGetLocations,
  bbAdminSetDoor,
  bbAdminEvictBackyard,
  bbAdminMovePlayer,
  bbAdminBroadcast
} from '../../../services/bbHouseApi'
import type { BBHouseRoomWithCount } from '../../../types/bigbrother'
import BBAvatar from '../../../components/bigbrother/BBAvatar.vue'

const rooms = ref<BBHouseRoomWithCount[]>([])
const locations = ref<Record<string, { room: any; players: any[] }>>({})
const backyardDoorOpen = ref(true)

const allRooms = ref<BBHouseRoomWithCount[]>([])

const broadcastType = ref<'notice' | 'invite'>('notice')
const broadcastRoom = ref('')
const broadcastMessage = ref('')

async function sendBroadcast() {
  if (broadcastType.value === 'invite' && !broadcastRoom.value) return
  try {
    await bbAdminBroadcast({
      type: broadcastType.value,
      roomId: broadcastType.value === 'invite' ? broadcastRoom.value : null,
      message: broadcastMessage.value
    })
    broadcastMessage.value = ''
    alert('广播已发送')
  } catch (e: any) {
    alert(e?.message || '发送失败')
  }
}

function getRoomIcon(roomId: string) {
  return allRooms.value.find(r => r.id === roomId)?.icon || '🏠'
}
function getRoomName(roomId: string) {
  return allRooms.value.find(r => r.id === roomId)?.name || roomId
}

function formatTime(t: string) {
  if (!t) return ''
  const d = new Date(t)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

async function loadData() {
  try {
    const [roomsRes, locRes, mapRes] = await Promise.all([
      bbGetHouseRooms(),
      bbAdminGetLocations(),
      bbGetHouseMap()
    ])
    allRooms.value = roomsRes || []
    rooms.value = allRooms.value
    locations.value = locRes || {}
    // 获取后院门状态
    backyardDoorOpen.value = mapRes?.backyardDoorOpen ?? true
  } catch (e) {
    console.error(e)
  }
}

let refreshTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  loadData()
  // 每 5 秒自动刷新玩家位置总览
  refreshTimer = setInterval(loadData, 5000)
})
onUnmounted(() => {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null }
})

async function toggleDoor(isOpen: boolean) {
  try {
    await bbAdminSetDoor('backyard_door', isOpen)
    backyardDoorOpen.value = isOpen
    await loadData()
  } catch (e: any) {
    alert(e?.message || '操作失败')
  }
}

async function evictBackyard() {
  if (!confirm('确定关闭后院门并将所有后院玩家移到客厅？')) return
  try {
    const res = await bbAdminEvictBackyard()
    backyardDoorOpen.value = false
    alert(`已清空后院，${res?.movedPlayers?.length || 0} 名玩家被移至客厅`)
    await loadData()
  } catch (e: any) {
    alert(e?.message || '操作失败')
  }
}

async function handleForceMove(playerId: string, targetRoomId: string) {
  if (!targetRoomId) return
  try {
    await bbAdminMovePlayer(playerId, targetRoomId)
    await loadData()
  } catch (e: any) {
    alert(e?.message || '移动失败')
  }
}
</script>
<style scoped>
.bb-house-admin { max-width: 1200px; margin: 0 auto; }
.page-header { margin-bottom: 20px; }
.page-header h1 { font-size: 22px; font-weight: 600; color: #e0e0e0; margin: 0; }

.control-card {
  background: #0f0f2e;
  border: 1px solid #00ff8822;
  border-radius: 10px;
  padding: 16px 20px;
  margin-bottom: 20px;
}
.control-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.control-header h3 { margin: 0; font-size: 16px; color: #e0e0e0; }
.door-status { font-size: 13px; font-weight: 600; color: #ff6b6b; }
.door-status.open { color: #00ff88; }
.control-actions { display: flex; gap: 10px; }

.broadcast-form { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.bb-select, .bb-input {
  padding: 8px 12px;
  background: #0a0a1a;
  border: 1px solid #00ff8833;
  border-radius: 6px;
  color: #e0e0e0;
  font-size: 13px;
  outline: none;
}
.bb-input { flex: 1; min-width: 180px; }
.bb-select:focus, .bb-input:focus { border-color: #00ff88; }
.bb-btn-primary { background: #00ff8822; border-color: #00ff88; }

.bb-btn {
  background: transparent;
  border: 1px solid #00ff8844;
  color: #00ff88;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}
.bb-btn:hover { background: #00ff8822; }
.bb-btn.btn-active { background: #00ff8822; border-color: #00ff88; }
.bb-btn-danger { border-color: #ff444466; color: #ff6b6b; }
.bb-btn-danger:hover { background: #ff444422; }

.locations-section h3 {
  font-size: 16px;
  color: #e0e0e0;
  margin: 0 0 14px;
}
.locations-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}
.location-card {
  background: #0f0f2e;
  border: 1px solid #ffffff10;
  border-radius: 10px;
  overflow: hidden;
}
.location-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #141430;
  border-bottom: 1px solid #ffffff08;
}
.location-icon { font-size: 16px; }
.location-name { flex: 1; font-size: 13px; font-weight: 600; color: #e0e0e0; }
.location-count { font-size: 11px; color: #00ff88; background: #00ff8815; padding: 2px 8px; border-radius: 8px; }

.location-players { padding: 8px 14px; }
.location-player {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
}
.player-name { color: #ccc; min-width: 60px; }
.player-time { color: #666; font-size: 11px; }
.move-select {
  margin-left: auto;
  padding: 2px 4px;
  background: #1a1a3e;
  border: 1px solid #ffffff15;
  border-radius: 4px;
  color: #aaa;
  font-size: 11px;
  cursor: pointer;
}
.move-select option { background: #0f0f2e; color: #fff; }
.no-players { color: #555; font-size: 12px; padding: 4px 0; }
</style>
