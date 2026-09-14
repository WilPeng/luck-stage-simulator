<template>
  <div class="bb-chat-logs">
    <div class="page-header">
      <h1>💬 房间聊天记录</h1>
      <select v-model="roomFilter" class="bb-select" @change="loadLogs">
        <option value="">全部房间</option>
        <option v-for="r in rooms" :key="r.id" :value="r.id">{{ r.icon }} {{ r.name }}</option>
      </select>
    </div>

    <div class="chat-logs">
      <div v-for="m in logs" :key="m.id" class="chat-log-item">
        <div class="cl-head">
          <span class="cl-room">{{ roomName(m.roomId) }}</span>
          <span class="cl-sender">{{ m.senderName }}</span>
          <span class="cl-time">{{ formatDateTime(m.createdAt) }}</span>
          <button class="bb-btn-xs" @click="toggleDetail(m.id)">{{ expanded === m.id ? '收起' : '展开详情' }}</button>
        </div>
        <div class="cl-content">{{ m.content }}</div>
        <div v-if="expanded === m.id" class="cl-detail">
          👁 看到此消息的房客：{{ (m.seenBy || []).join('、') || '（无人在房间）' }}
        </div>
      </div>
      <div v-if="!logs.length" class="empty">暂无聊天记录</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { bbGetHouseRooms, bbAdminChatLogs } from '../../../services/bbHouseApi'
import { useBbRealtimeStore } from '../../../stores/bbRealtimeStore'

const rooms = ref<any[]>([])
const roomFilter = ref('')
const logs = ref<any[]>([])
const expanded = ref<string | null>(null)
let timer: ReturnType<typeof setInterval> | null = null
const realtime = useBbRealtimeStore()

function roomName(id: string) {
  return rooms.value.find(r => r.id === id)?.name || id
}
function toggleDetail(id: string) { expanded.value = expanded.value === id ? null : id }
function formatDateTime(t: string) {
  if (!t) return ''
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

async function loadLogs() {
  try {
    const res = await bbAdminChatLogs(roomFilter.value || undefined)
    logs.value = res?.messages || []
  } catch { logs.value = [] }
}

async function loadRooms() {
  try { rooms.value = await bbGetHouseRooms() || [] } catch {}
}

onMounted(async () => {
  realtime.connect()
  await loadRooms()
  await loadLogs()
  timer = setInterval(loadLogs, 5000)
})
onUnmounted(() => {
  if (timer) { clearInterval(timer); timer = null }
})
</script>

<style scoped>
.bb-chat-logs { max-width: 1100px; margin: 0 auto; padding: 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-header h1 { font-size: 22px; color: #e0e0e0; margin: 0; }
.bb-select { padding: 8px 12px; background: #0a0a1a; border: 1px solid #00ff8833; border-radius: 6px; color: #e0e0e0; font-size: 13px; }
.chat-logs { display: flex; flex-direction: column; gap: 8px; }
.chat-log-item { background: #0f0f2e; border: 1px solid #ffffff10; border-radius: 8px; padding: 10px 12px; }
.cl-head { display: flex; align-items: center; gap: 10px; font-size: 12px; }
.cl-room { color: #7fb0ff; }
.cl-sender { color: #00ff88; font-weight: 600; }
.cl-time { color: #666; margin-left: auto; }
.cl-content { color: #ddd; font-size: 13px; margin-top: 6px; }
.cl-detail { margin-top: 8px; font-size: 12px; color: #ffaa00; background: #ffaa0010; border-radius: 6px; padding: 6px 10px; }
.bb-btn-xs { padding: 3px 10px; font-size: 11px; background: transparent; border: 1px solid #00ff8844; color: #00ff88; border-radius: 4px; cursor: pointer; }
.empty { color: #666; padding: 30px; text-align: center; }
</style>
