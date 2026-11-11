<template>
  <div class="bb-chat-logs">
    <div class="page-header">
      <h1>💬 房间聊天记录</h1>
      <div class="filters">
        <input v-model="keyword" class="bb-input" placeholder="搜索内容 / 发送者…" />
        <select v-model="roomFilter" class="bb-select" @change="onRoomFilterChange">
          <option value="">全部房间</option>
          <option v-for="r in rooms" :key="r.id" :value="r.id">{{ r.icon }} {{ r.name }}</option>
        </select>
        <button class="bb-btn" @click="loadLogs(true)">刷新</button>
        <button class="bb-btn" @click="openExport">📤 导出TXT</button>
        <button class="bb-btn" :class="{ active: composerVisible }" @click="toggleComposer">
          💬 房间发言{{ composerVisible ? ' ▲' : ' ▼' }}
        </button>
      </div>
    </div>

    <div class="chat-layout">
      <aside class="room-list">
        <div class="rl-item" :class="{ active: roomFilter === '' }" @click="selectRoom('')">
          🏠 全部房间
          <span class="rl-online" title="当前在房间人数">👥 {{ totalOccupancy }}</span>
        </div>
        <div v-for="r in rooms" :key="r.id" class="rl-item" :class="{ active: roomFilter === r.id }" @click="selectRoom(r.id)">
          {{ r.icon }} {{ r.name }}
          <span class="rl-online" title="当前在房间人数">👥 {{ occupancy[r.id] || 0 }}</span>
          <span class="rl-count" title="已加载消息数">💬 {{ countByRoom(r.id) }}</span>
        </div>
      </aside>

      <section class="chat-panel">
        <div ref="scrollEl" class="chat-scroll">
          <div v-if="hasMore" class="load-more" @click="loadMoreHistory">
            {{ loadingMore ? '加载中…' : '↑ 加载更早的消息' }}
          </div>
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
                  👁 {{ (m.seenBy || []).length }} 人看到 {{ expanded.has(m.id) ? '▲' : '▼' }}
                </div>
                <div v-if="expanded.has(m.id)" class="seen-detail">
                  <div v-if="(m.seenBy || []).length" class="seen-avatars">
                    <div v-for="v in m.seenBy" :key="v.playerId || v" class="seen-avatar" :title="v.name || v">
                      <BBAvatar :name="v.name || String(v)" :avatar="v.avatar || null" size="sm" />
                    </div>
                  </div>
                  <span v-else class="seen-empty">（消息发出时无人在房间）</span>
                </div>
              </div>
            </div>
          </template>
          <div v-if="!filteredLogs.length" class="empty">暂无聊天记录</div>
        </div>

        <!-- 管理员上帝视角发言 -->
        <div v-if="composerVisible" class="composer">
          <select v-model="composerRoom" class="bb-select composer-room">
            <option v-for="r in rooms" :key="r.id" :value="r.id">{{ r.icon }} {{ r.name }}</option>
          </select>
          <input
            v-model="composerText"
            class="composer-input"
            placeholder="以管理员身份在所选房间发言…"
            @keyup.enter="sendMessage"
          />
          <button
            class="bb-btn bb-btn-primary"
            :disabled="sending || !composerRoom || !composerText.trim()"
            @click="sendMessage"
          >{{ sending ? '发送中…' : '发送' }}</button>
        </div>
      </section>
    </div>

    <!-- 导出聊天记录 -->
    <div v-if="exportVisible" class="export-mask" @click.self="exportVisible = false">
      <div class="export-dialog">
        <div class="export-head">
          <h3>📤 导出聊天记录</h3>
          <button class="export-close" @click="exportVisible = false">✕</button>
        </div>
        <div class="export-body">
          <label class="export-field">
            <span>开始时间</span>
            <input v-model="exportStart" type="datetime-local" class="bb-input" />
          </label>
          <label class="export-field">
            <span>结束时间</span>
            <input v-model="exportEnd" type="datetime-local" class="bb-input" />
          </label>
          <label class="export-field">
            <span>发送者</span>
            <select v-model="exportSender" class="bb-select">
              <option value="">全部发送者</option>
              <option v-for="g in senders" :key="g.id" :value="g.id">
                {{ g.name }}{{ g.role === 'admin' ? '（管理员）' : '' }}
              </option>
            </select>
          </label>
          <label class="export-field">
            <span>接收者视角</span>
            <select v-model="exportReceiver" class="bb-select">
              <option value="">全部（管理员视角）</option>
              <option v-for="g in receivers" :key="g.id" :value="g.id">{{ g.name }}</option>
            </select>
          </label>
          <label class="export-field">
            <span>房间</span>
            <select v-model="exportRoom" class="bb-select">
              <option value="">全部房间</option>
              <option v-for="r in rooms" :key="r.id" :value="r.id">{{ r.icon }} {{ r.name }}</option>
            </select>
          </label>
          <label class="export-field">
            <span>关键词</span>
            <input v-model="exportKeyword" class="bb-input" placeholder="内容 / 发送者姓名" />
          </label>
        </div>
        <div class="export-tip">
          导出为 .txt 文件。每条消息包含发送时间、发送者、发送房间，以及可看到该消息的其他玩家。
          选择「接收者视角」后，仅导出该玩家当时能看到的全部聊天记录。
        </div>
        <div class="export-actions">
          <button class="bb-btn" @click="resetExportFilters">重置</button>
          <button class="bb-btn bb-btn-primary" :disabled="exporting" @click="doExport">
            {{ exporting ? '导出中…' : '导出 TXT' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { bbGetHouseRooms, bbAdminChatLogs, bbAdminSendMessage, bbAdminExportChatLogs, bbAdminGuestStates } from '../../../services/bbHouseApi'
import { useBbRealtimeStore } from '../../../stores/bbRealtimeStore'
import BBAvatar from '../../../components/bigbrother/BBAvatar.vue'

const route = useRoute()
const rooms = ref<any[]>([])
const roomFilter = ref('')
const occupancy = ref<Record<string, number>>({})
const logs = ref<any[]>([])
const hasMore = ref(false)
const loadingMore = ref(false)
const expanded = ref<Set<string>>(new Set())
const keyword = ref('')
const scrollEl = ref<HTMLElement | null>(null)
let timer: ReturnType<typeof setInterval> | null = null
const realtime = useBbRealtimeStore()

// 管理员上帝视角发言
const composerVisible = ref(true)
const composerRoom = ref('')
const composerText = ref('')
const sending = ref(false)

// 导出聊天记录
const exportVisible = ref(false)
const exportStart = ref('')
const exportEnd = ref('')
const exportSender = ref('')
const exportReceiver = ref('')
const exportRoom = ref('')
const exportKeyword = ref('')
const exporting = ref(false)
const participants = ref<any[]>([])

const senders = computed(() => participants.value)
const receivers = computed(() => participants.value.filter(g => g.role !== 'admin'))

async function loadParticipants() {
  if (participants.value.length) return
  try {
    const res = await bbAdminGuestStates()
    participants.value = res?.guests || []
  } catch {}
}

async function openExport() {
  exportVisible.value = true
  await loadParticipants()
}

function resetExportFilters() {
  exportStart.value = ''
  exportEnd.value = ''
  exportSender.value = ''
  exportReceiver.value = ''
  exportRoom.value = ''
  exportKeyword.value = ''
}

function toIso(value: string) {
  if (!value) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

async function doExport() {
  if (exporting.value) return
  const start = toIso(exportStart.value)
  const end = toIso(exportEnd.value)
  if (start && end && new Date(start) > new Date(end)) {
    alert('开始时间不能晚于结束时间')
    return
  }
  exporting.value = true
  try {
    const { blob, filename } = await bbAdminExportChatLogs({
      start,
      end,
      roomId: exportRoom.value || undefined,
      senderId: exportSender.value || undefined,
      receiverId: exportReceiver.value || undefined,
      keyword: exportKeyword.value.trim() || undefined
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename || 'chat-logs.txt'
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (e: any) {
    alert(e?.message || '导出失败')
  } finally {
    exporting.value = false
  }
}

function toggleComposer() {
  composerVisible.value = !composerVisible.value
  if (composerVisible.value && !composerRoom.value && rooms.value.length) {
    composerRoom.value = rooms.value[0].id
  }
}

async function sendMessage() {
  const roomId = composerRoom.value
  const content = composerText.value.trim()
  if (!roomId || !content || sending.value) return
  sending.value = true
  try {
    await bbAdminSendMessage(roomId, content)
    composerText.value = ''
    if (!roomFilter.value || roomFilter.value === roomId) await loadLogs(true)
  } catch (e: any) {
    alert(e?.message || '发言失败')
  } finally {
    sending.value = false
  }
}

function roomName(id: string) {
  return rooms.value.find(r => r.id === id)?.name || id
}
function countByRoom(id: string) {
  return logs.value.filter(m => m.roomId === id).length
}
const totalOccupancy = computed(() => Object.values(occupancy.value).reduce((sum, n) => sum + (Number(n) || 0), 0))
function toggleDetail(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}
function pad(n: number) { return String(n).padStart(2, '0') }
function formatTime(t: string) {
  if (!t) return ''
  const d = new Date(t)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
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

function selectRoom(id: string) {
  roomFilter.value = id
  if (id) composerRoom.value = id
  loadLogs(true, true)
}

function onRoomFilterChange() {
  if (roomFilter.value) composerRoom.value = roomFilter.value
  loadLogs(true, true)
}

async function loadLogs(forceBottom = false, reset = false) {
  try {
    const el = scrollEl.value
    // 仅当管理员本来就在底部附近时才跟随新消息，避免打断向上翻阅
    const wasNearBottom = !el || (el.scrollHeight - el.scrollTop - el.clientHeight < 80)
    const res = await bbAdminChatLogs(roomFilter.value || undefined)
    occupancy.value = res?.occupancy || {}
    const fetched = res?.messages || []
    if (reset || logs.value.length === 0) {
      logs.value = fetched
      hasMore.value = !!res?.hasMore
    } else {
      // 合并新消息，保留已经加载的更早历史
      const map = new Map()
      for (const m of [...logs.value, ...fetched]) map.set(m.id, m)
      logs.value = Array.from(map.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    }
    await nextTick()
    if (scrollEl.value && (forceBottom || wasNearBottom)) {
      scrollEl.value.scrollTop = scrollEl.value.scrollHeight
    }
  } catch {
    if (reset) { logs.value = []; hasMore.value = false }
  }
}

async function loadMoreHistory() {
  if (loadingMore.value || !hasMore.value || !logs.value.length) return
  loadingMore.value = true
  const el = scrollEl.value
  const prevHeight = el?.scrollHeight || 0
  const prevTop = el?.scrollTop || 0
  try {
    const before = logs.value[0]?.createdAt
    const res = await bbAdminChatLogs(roomFilter.value || undefined, before)
    const older = res?.messages || []
    const map = new Map()
    for (const m of [...older, ...logs.value]) map.set(m.id, m)
    logs.value = Array.from(map.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    hasMore.value = !!res?.hasMore
    await nextTick()
    if (scrollEl.value) {
      // 保持当前阅读位置，不因前面插入历史消息而跳动
      scrollEl.value.scrollTop = prevTop + (scrollEl.value.scrollHeight - prevHeight)
    }
  } catch {} finally {
    loadingMore.value = false
  }
}

async function loadRooms() {
  try {
    rooms.value = await bbGetHouseRooms() || []
    if (!composerRoom.value && rooms.value.length) composerRoom.value = rooms.value[0].id
  } catch {}
}

onMounted(async () => {
  realtime.connect()
  const initialRoom = typeof route.query.roomId === 'string' ? route.query.roomId : ''
  roomFilter.value = initialRoom
  await loadRooms()
  if (initialRoom) composerRoom.value = initialRoom
  await loadLogs(true, true)
  timer = setInterval(() => loadLogs(false), 5000)
})

watch(() => route.query.roomId, (value) => {
  const nextRoom = typeof value === 'string' ? value : ''
  roomFilter.value = nextRoom
  if (nextRoom) composerRoom.value = nextRoom
  loadLogs(true, true)
})
onUnmounted(() => {
  if (timer) { clearInterval(timer); timer = null }
})
</script>

<style scoped>
.bb-chat-logs { max-width: 1200px; margin: 0 auto; padding: 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
.page-header h1 { font-size: 22px; color: #ece7fb; margin: 0; }
.filters { display: flex; gap: 8px; align-items: center; }
.bb-input, .bb-select { padding: 8px 12px; background: #120a22; border: 1px solid #b39bff33; border-radius: 6px; color: #ece7fb; font-size: 13px; outline: none; }
.bb-input { width: 200px; }
.bb-btn { background: transparent; border: 1px solid #b39bff44; color: #b39bff; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.chat-layout { display: grid; grid-template-columns: 220px 1fr; gap: 14px; }
.room-list { background: #1b1130; border: 1px solid #ffffff12; border-radius: 10px; padding: 10px; height: 72vh; overflow-y: auto; }
.rl-item { display: flex; align-items: center; gap: 6px; padding: 9px 12px; border-radius: 8px; font-size: 13px; color: #cfc4ea; cursor: pointer; margin-bottom: 4px; }
.rl-item:hover { background: #ffffff08; }
.rl-item.active { background: #b39bff22; color: #b39bff; }
.rl-count { margin-left: auto; font-size: 11px; color: #b3a6d6; }
.rl-online { font-size: 11px; color: #7fd8ff; margin-left: 8px; }
.chat-panel { background: #0b0b1c; border: 1px solid #ffffff12; border-radius: 10px; overflow: hidden; }
.chat-scroll { height: 72vh; overflow-y: auto; padding: 18px; }
.load-more { text-align: center; color: #b39bff; font-size: 12px; cursor: pointer; padding: 6px 0 12px; user-select: none; }
.load-more:hover { text-decoration: underline; }
.day-sep { text-align: center; margin: 14px 0; }
.day-sep span { background: #ffffff10; color: #b3a6d6; font-size: 12px; padding: 3px 12px; border-radius: 10px; }
.msg { display: flex; gap: 10px; margin-bottom: 14px; }
.bubble-wrap { flex: 1; min-width: 0; }
.msg-meta { display: flex; align-items: center; gap: 8px; font-size: 12px; margin-bottom: 4px; }
.sender { color: #b39bff; font-weight: 600; }
.room-tag { color: #7fb0ff; background: #7fb0ff14; border-radius: 4px; padding: 0 6px; font-size: 11px; }
.time { color: #6b5f92; margin-left: auto; }
.bubble { display: inline-block; max-width: 80%; background: #211640; border: 1px solid #ffffff12; border-radius: 4px 12px 12px 12px; padding: 9px 14px; color: #f0ebff; font-size: 14px; line-height: 1.5; word-break: break-word; }
.seen { font-size: 11px; color: #6b5f92; margin-top: 4px; cursor: pointer; }
.seen:hover { color: #e6c988; }
.seen-detail { margin-top: 4px; font-size: 12px; color: #e6c988; background: #e6c98812; border-radius: 6px; padding: 6px 10px; display: inline-block; }
.seen-avatars { display: flex; flex-wrap: wrap; gap: 6px; }
.seen-avatar { display: inline-flex; }
.seen-empty { color: #b3a6d6; }
.empty { color: #6b5f92; padding: 40px; text-align: center; }
.bb-btn.active { border-color: #e6c988; color: #e6c988; background: #e6c98818; }
.bb-btn-primary { background: #b39bff22; border-color: #b39bff; }
.bb-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.composer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-top: 1px solid #ffffff12;
  background: #150e28;
}
.composer-room { width: 160px; flex: none; }
.composer-input {
  flex: 1;
  min-width: 0;
  padding: 9px 12px;
  background: #120a22;
  border: 1px solid #b39bff33;
  border-radius: 8px;
  color: #ece7fb;
  font-size: 14px;
  outline: none;
}
.composer-input:focus { border-color: #b39bff; }
.export-mask {
  position: fixed;
  inset: 0;
  background: #000000aa;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}
.export-dialog {
  width: 520px;
  max-width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  background: #1b1130;
  border: 1px solid #b39bff44;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 20px 60px #00000066;
}
.export-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.export-head h3 { margin: 0; font-size: 17px; color: #ece7fb; }
.export-close { background: transparent; border: none; color: #b3a6d6; font-size: 16px; cursor: pointer; }
.export-close:hover { color: #ece7fb; }
.export-body { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.export-field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: #b3a6d6; }
.export-field .bb-input, .export-field .bb-select { width: 100%; box-sizing: border-box; }
.export-tip { margin-top: 14px; font-size: 12px; line-height: 1.6; color: #8c7fb3; }
.export-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
@media (max-width: 640px) {
  .export-body { grid-template-columns: 1fr; }
}
@media (max-width: 820px) {
  .bb-chat-logs { padding: 14px; }
  .page-header { flex-direction: column; align-items: stretch; }
  .filters { flex-wrap: wrap; }
  .filters .bb-input { width: 100%; }
  .chat-layout { grid-template-columns: 1fr; }
  .room-list { height: auto; max-height: 24vh; }
  .chat-scroll { height: 55vh; }
}
@media (max-width: 640px) {
  .composer { flex-wrap: wrap; }
  .composer-room { width: 100%; }
  .filters .bb-btn { flex: 1; }
}
</style>
