<template>
  <div class="bb-chat-logs">
    <div class="page-header">
      <h1>💬 房间聊天记录</h1>
      <div class="filters">
        <input v-model="keyword" class="bb-input" placeholder="搜索内容 / 发送者…" />
        <select v-model="roomFilter" class="bb-select" @change="loadLogs">
          <option value="">全部房间</option>
          <option v-for="r in rooms" :key="r.id" :value="r.id">{{ r.icon }} {{ r.name }}</option>
        </select>
        <button class="bb-btn" @click="loadLogs">刷新</button>
      </div>
    </div>

    <div class="chat-layout">
      <aside class="room-list">
        <div class="rl-item" :class="{ active: roomFilter === '' }" @click="selectRoom('')">🏠 全部房间</div>
        <div v-for="r in rooms" :key="r.id" class="rl-item" :class="{ active: roomFilter === r.id }" @click="selectRoom(r.id)">
          {{ r.icon }} {{ r.name }}
          <span class="rl-count">{{ countByRoom(r.id) }}</span>
        </div>
      </aside>

      <section class="chat-panel">
        <div ref="scrollEl" class="chat-scroll">
          <template v-for="(group, gi) in grouped" :key="gi">
            <div class="day-sep"><span>{{ group.day }}</span></div>
            <div v-for="m in group.items" :key="m.id" class="msg">
              <BBAvatar :name="m.senderName" :avatar="m.senderAvatar" size="sm" />
              <div class="bubble-wrap">
                <div class="msg-meta">
                  <span class="sender">{{ m.senderName }}</span>
                  <span class="room-tag">{{ roomName(m.roomId) }}</span>
                  <span class="time">{{ formatTime(m.createdAt) }}</span>
                </div>
                <div class="bubble">{{ m.content }}</div>
                <div class="seen" @click="toggleDetail(m.id)">
                  👁 {{ (m.seenBy || []).length }} 人看到 {{ expanded === m.id ? '▲' : '▼' }}
                </div>
                <div v-if="expanded === m.id" class="seen-detail">
                  {{ (m.seenBy || []).join('、') || '（消息发出时无人在房间）' }}
                </div>
              </div>
            </div>
          </template>
          <div v-if="!filteredLogs.length" class="empty">暂无聊天记录</div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { bbGetHouseRooms, bbAdminChatLogs } from '../../../services/bbHouseApi'
import { useBbRealtimeStore } from '../../../stores/bbRealtimeStore'
import BBAvatar from '../../../components/bigbrother/BBAvatar.vue'

const rooms = ref<any[]>([])
const roomFilter = ref('')
const logs = ref<any[]>([])
const expanded = ref<string | null>(null)
const keyword = ref('')
const scrollEl = ref<HTMLElement | null>(null)
let timer: ReturnType<typeof setInterval> | null = null
const realtime = useBbRealtimeStore()

function roomName(id: string) {
  return rooms.value.find(r => r.id === id)?.name || id
}
function countByRoom(id: string) {
  return logs.value.filter(m => m.roomId === id).length
}
function toggleDetail(id: string) { expanded.value = expanded.value === id ? null : id }
function pad(n: number) { return String(n).padStart(2, '0') }
function formatTime(t: string) {
  if (!t) return ''
  const d = new Date(t)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function dayKey(t: string) {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const filteredLogs = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return logs.value
  return logs.value.filter(m =>
    String(m.content || '').toLowerCase().includes(kw) ||
    String(m.senderName || '').toLowerCase().includes(kw)
  )
})

const grouped = computed(() => {
  const groups: { day: string; items: any[] }[] = []
  for (const m of filteredLogs.value) {
    const d = dayKey(m.createdAt)
    let g = groups[groups.length - 1]
    if (!g || g.day !== d) { g = { day: d, items: [] }; groups.push(g) }
    g.items.push(m)
  }
  return groups
})

function selectRoom(id: string) { roomFilter.value = id; loadLogs() }

async function loadLogs() {
  try {
    const res = await bbAdminChatLogs(roomFilter.value || undefined)
    logs.value = res?.messages || []
    await nextTick()
    if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
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
.bb-chat-logs { max-width: 1200px; margin: 0 auto; padding: 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
.page-header h1 { font-size: 22px; color: #e0e0e0; margin: 0; }
.filters { display: flex; gap: 8px; align-items: center; }
.bb-input, .bb-select { padding: 8px 12px; background: #0a0a1a; border: 1px solid #00ff8833; border-radius: 6px; color: #e0e0e0; font-size: 13px; outline: none; }
.bb-input { width: 200px; }
.bb-btn { background: transparent; border: 1px solid #00ff8844; color: #00ff88; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.chat-layout { display: grid; grid-template-columns: 220px 1fr; gap: 14px; }
.room-list { background: #0f0f2e; border: 1px solid #ffffff12; border-radius: 10px; padding: 10px; height: 72vh; overflow-y: auto; }
.rl-item { display: flex; align-items: center; gap: 6px; padding: 9px 12px; border-radius: 8px; font-size: 13px; color: #ccc; cursor: pointer; margin-bottom: 4px; }
.rl-item:hover { background: #ffffff08; }
.rl-item.active { background: #00ff8822; color: #00ff88; }
.rl-count { margin-left: auto; font-size: 11px; color: #8a8aa5; }
.chat-panel { background: #0b0b1c; border: 1px solid #ffffff12; border-radius: 10px; overflow: hidden; }
.chat-scroll { height: 72vh; overflow-y: auto; padding: 18px; }
.day-sep { text-align: center; margin: 14px 0; }
.day-sep span { background: #ffffff10; color: #8a8aa5; font-size: 12px; padding: 3px 12px; border-radius: 10px; }
.msg { display: flex; gap: 10px; margin-bottom: 14px; }
.bubble-wrap { flex: 1; min-width: 0; }
.msg-meta { display: flex; align-items: center; gap: 8px; font-size: 12px; margin-bottom: 4px; }
.sender { color: #00ff88; font-weight: 600; }
.room-tag { color: #7fb0ff; background: #7fb0ff14; border-radius: 4px; padding: 0 6px; font-size: 11px; }
.time { color: #666; margin-left: auto; }
.bubble { display: inline-block; max-width: 80%; background: #16163a; border: 1px solid #ffffff12; border-radius: 4px 12px 12px 12px; padding: 9px 14px; color: #e6e6f5; font-size: 14px; line-height: 1.5; word-break: break-word; }
.seen { font-size: 11px; color: #666; margin-top: 4px; cursor: pointer; }
.seen:hover { color: #ffaa00; }
.seen-detail { margin-top: 4px; font-size: 12px; color: #ffaa00; background: #ffaa0012; border-radius: 6px; padding: 5px 10px; display: inline-block; }
.empty { color: #666; padding: 40px; text-align: center; }
</style>
