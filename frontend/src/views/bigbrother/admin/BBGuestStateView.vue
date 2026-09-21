<template>
  <div class="bb-guest-state">
    <div class="page-header">
      <h1>😴🚿 房客睡眠 / 洗澡记录</h1>
      <span class="today">今天：{{ today }}</span>
    </div>

    <div class="table-wrapper">
      <table class="state-table">
        <thead>
          <tr>
            <th>房客</th>
            <th>状态</th>
            <th>位置</th>
            <th>今天已睡</th>
            <th>在睡觉</th>
            <th>今天已洗</th>
            <th>在洗澡</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in houseguests" :key="g.id">
            <td class="name-cell">
              <BBAvatar :name="g.name" :avatar="g.avatar" size="sm" />
              <span>{{ g.name }}</span>
            </td>
            <td>
              <span class="status-tag" :class="g.status">{{ statusLabel(g.status) }}</span>
            </td>
            <td>{{ roomName(g.currentRoomId) }}</td>
            <td>
              <span class="badge" :class="g.lastSleepDate === today ? 'ok' : 'none'">
                {{ g.lastSleepDate === today ? '已睡' : '未睡' }}
              </span>
            </td>
            <td>
              <span v-if="g.isSleeping" class="badge sleeping" :title="g.wakeAt ? '醒来：' + formatTime(g.wakeAt) : ''">睡眠中</span>
              <span v-else class="badge none">清醒</span>
            </td>
            <td>
              <span class="badge" :class="g.lastShowerDate === today ? 'ok' : 'none'">
                {{ g.lastShowerDate === today ? '已洗' : '未洗' }}
              </span>
            </td>
            <td>
              <span v-if="g.isShowering" class="badge showering" :title="g.showerStartedAt ? '开始：' + formatTime(g.showerStartedAt) : ''">洗澡中</span>
              <span v-else class="badge none">未洗</span>
            </td>
            <td class="actions">
              <button v-if="g.isSleeping" class="bb-btn-xs danger" @click="sleep(g, 'end')">立即结束睡觉</button>
              <button v-else class="bb-btn-xs" @click="sleep(g, 'start')">立即开始睡觉</button>
              <button v-if="g.lastSleepDate === today" class="bb-btn-xs" @click="sleep(g, 'clear')">清除已睡</button>
              <button v-else class="bb-btn-xs" @click="sleep(g, 'mark')">标记已睡</button>

              <button v-if="g.isShowering" class="bb-btn-xs danger" @click="shower(g, 'end')">立即结束洗澡</button>
              <button v-else class="bb-btn-xs" @click="shower(g, 'start')">立即开始洗澡</button>
              <button v-if="g.lastShowerDate === today" class="bb-btn-xs" @click="shower(g, 'clear')">清除已洗</button>
              <button v-else class="bb-btn-xs" @click="shower(g, 'mark')">标记已洗</button>
            </td>
          </tr>
          <tr v-if="!houseguests.length"><td colspan="8" class="empty">暂无房客</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { bbAdminGuestStates, bbAdminSleepAction, bbAdminShowerAction, bbGetHouseRooms } from '../../../services/bbHouseApi'
import BBAvatar from '../../../components/bigbrother/BBAvatar.vue'

const guests = ref<any[]>([])
const rooms = ref<any[]>([])
const today = ref('')
let timer: ReturnType<typeof setInterval> | null = null

const houseguests = computed(() => guests.value.filter(g => g.role !== 'admin'))

function roomName(id: string) {
  return rooms.value.find(r => r.id === id)?.name || id
}
function statusLabel(s: string) {
  return ({ active: '在住', evicted: '淘汰', jury: '陪审' } as Record<string, string>)[s] || s || ''
}
function formatTime(t: string) {
  if (!t) return ''
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

async function load() {
  try {
    const res: any = await bbAdminGuestStates()
    if (Array.isArray(res)) {
      guests.value = res
      today.value = localToday()
    } else {
      guests.value = res?.guests || []
      today.value = res?.today || localToday()
    }
  } catch {}
}
function localToday() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

async function sleep(g: any, action: 'start' | 'end' | 'mark' | 'clear') {
  try { await bbAdminSleepAction(g.id, action); await load() } catch (e: any) { alert(e?.message || '失败') }
}
async function shower(g: any, action: 'start' | 'end' | 'mark' | 'clear') {
  try { await bbAdminShowerAction(g.id, action); await load() } catch (e: any) { alert(e?.message || '失败') }
}

onMounted(async () => {
  try { rooms.value = await bbGetHouseRooms() || [] } catch {}
  await load()
  timer = setInterval(load, 8000)
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.bb-guest-state { max-width: 1200px; margin: 0 auto; padding: 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-header h1 { font-size: 22px; color: #e0e0e0; margin: 0; }
.today { color: #888; font-size: 13px; }
.table-wrapper { overflow-x: auto; }
.state-table { width: 100%; border-collapse: collapse; }
.state-table th, .state-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #ffffff12; font-size: 13px; color: #ddd; white-space: nowrap; }
.state-table th { color: #888; font-size: 12px; }
.name-cell { display: flex; align-items: center; gap: 8px; }
.status-tag { padding: 1px 8px; border-radius: 6px; font-size: 11px; }
.status-tag.active { background: #00ff8822; color: #00ff88; }
.status-tag.evicted { background: #ff444422; color: #ff6666; }
.status-tag.jury { background: #ffaa0022; color: #ffaa00; }
.badge { padding: 2px 10px; border-radius: 10px; font-size: 11px; }
.badge.ok { background: #00ff8822; color: #00ff88; }
.badge.sleeping { background: #4488ff22; color: #7fb0ff; }
.badge.showering { background: #00c8ff22; color: #7fd8ff; }
.badge.none { background: #ffffff10; color: #888; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
.bb-btn-xs { padding: 3px 10px; font-size: 11px; background: transparent; border: 1px solid #00ff8844; color: #00ff88; border-radius: 4px; cursor: pointer; }
.bb-btn-xs:hover { background: #00ff8822; }
.bb-btn-xs.danger { border-color: #ff444466; color: #ff6666; }
.bb-btn-xs.danger:hover { background: #ff444422; }
.empty { text-align: center; color: #666; padding: 30px; }
</style>
