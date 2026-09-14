<template>
  <div class="mg-replay">
    <div class="page-header">
      <h1>小游戏复盘</h1>
      <div class="filters">
        <select v-model="filterGameType" class="bb-input" @change="loadList">
          <option value="">全部场景</option>
          <option value="hoh">HOH</option>
          <option value="veto">否决权</option>
          <option value="bbbb">BBBB</option>
          <option value="finale">终局</option>
        </select>
        <button class="bb-btn" @click="loadList">🔄 刷新</button>
      </div>
    </div>

    <div class="replay-layout">
      <div class="list-panel">
        <div v-if="!list.length" class="empty-hint">暂无复盘记录</div>
        <div
          v-for="r in list"
          :key="r.id"
          class="replay-item"
          :class="{ active: detail && detail.id === r.id }"
          @click="openReplay(r.id)"
        >
          <div class="ri-top">
            <span class="ri-name">{{ r.minigameName || r.minigameId }}</span>
            <span class="ri-type">{{ gameTypeLabel(r.gameType) }}</span>
          </div>
          <div class="ri-meta">
            {{ fmtDate(r.startedAt) }} · {{ r.participants?.length || 0 }}人 · {{ r.eventCount }} 事件
          </div>
          <div class="ri-winner" v-if="r.winner">🏆 {{ r.winner.playerName }}</div>
          <div class="ri-winner none" v-else-if="r.status !== 'playing'">无胜者</div>
        </div>
      </div>

      <div class="detail-panel">
        <div v-if="!detail" class="empty-hint">选择左侧对局查看复盘</div>
        <template v-else>
          <div class="detail-head">
            <div>
              <div class="dh-title">{{ detail.minigameName || detail.minigameId }}</div>
              <div class="dh-sub">
                {{ gameTypeLabel(detail.gameType) }} · {{ fmtDate(detail.startedAt) }}
                <span v-if="detail.roundIndex"> · 第{{ detail.roundIndex }}周</span>
                <span v-if="detail.targetScore"> · 目标 {{ detail.targetScore }}</span>
              </div>
            </div>
            <button class="bb-btn bb-btn-danger" @click="removeReplay(detail.id)">删除</button>
          </div>

          <div class="detail-grid">
            <div class="dg-block">
              <div class="dg-title">参赛选手</div>
              <div class="dg-players">
                <div v-for="p in detail.participants" :key="p.playerId" class="dg-player"
                  :class="{ winner: detail.winner && detail.winner.playerId === p.playerId }">
                  <BBAvatar :name="p.playerName" :avatar="p.avatar" size="sm" />
                  <span>{{ p.playerName }}</span>
                  <span v-if="detail.scores && detail.scores[p.playerId] != null" class="dg-score">{{ detail.scores[p.playerId] }}</span>
                  <span v-if="detail.winner && detail.winner.playerId === p.playerId" class="dg-crown">🏆</span>
                </div>
              </div>
            </div>
          </div>

          <div class="dg-block">
            <div class="dg-title">
              事件时间线（{{ filteredEvents.length }}）
              <span class="ev-filters">
                <button v-for="f in eventFilters" :key="f.value" class="ev-filter"
                  :class="{ active: eventFilter === f.value }" @click="eventFilter = f.value">{{ f.label }}</button>
              </span>
            </div>
            <div class="timeline">
              <div v-for="(e, i) in filteredEvents" :key="i" class="tl-row" :class="e.type">
                <span class="tl-time">{{ fmtTime(e.t) }}</span>
                <span class="tl-delta">+{{ delta(e.t) }}s</span>
                <span class="tl-text">{{ e.text }}</span>
                <button v-if="e.data" class="tl-more" @click="toggle(i)">{{ expanded[i] ? '收起' : '详情' }}</button>
                <pre v-if="expanded[i]" class="tl-data">{{ pretty(e.data) }}</pre>
              </div>
              <div v-if="!filteredEvents.length" class="empty-hint">暂无事件</div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { bbGetMinigameReplays, bbGetMinigameReplay, bbDeleteMinigameReplay } from '../../../services/bbApi'
import BBAvatar from '../../../components/bigbrother/BBAvatar.vue'

const list = ref<any[]>([])
const detail = ref<any>(null)
const filterGameType = ref('')
const eventFilter = ref('all')
const expanded = ref<Record<number, boolean>>({})

const eventFilters = [
  { value: 'all', label: '全部' },
  { value: 'answer', label: '作答' },
  { value: 'round', label: '回合' },
  { value: 'eliminate', label: '出局' },
  { value: 'finish', label: '结果' }
]

const filteredEvents = computed(() => {
  const evs = detail.value?.events || []
  if (eventFilter.value === 'all') return evs
  if (eventFilter.value === 'finish') return evs.filter((e: any) => e.type === 'finish' || e.type === 'game_end' || e.type === 'game_stop')
  return evs.filter((e: any) => e.type === eventFilter.value)
})

function gameTypeLabel(t: string) {
  return ({ hoh: 'HOH', veto: '否决权', bbbbb: 'BBBB', bbbb: 'BBBB', finale: '终局' } as Record<string, string>)[t] || t
}
function fmtDate(t: string) { return t ? new Date(t).toLocaleString('zh-CN') : '' }
function fmtTime(t: number) {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}
function delta(t: number) {
  const start = detail.value?.startedAt ? new Date(detail.value.startedAt).getTime() : t
  return ((t - start) / 1000).toFixed(1)
}
function pretty(d: any) { try { return JSON.stringify(d, null, 2) } catch { return String(d) } }
function toggle(i: number) { expanded.value = { ...expanded.value, [i]: !expanded.value[i] } }

async function loadList() {
  try {
    list.value = await bbGetMinigameReplays({ gameType: filterGameType.value || undefined, limit: 200 })
  } catch { list.value = [] }
}
async function openReplay(id: string) {
  try { detail.value = await bbGetMinigameReplay(id); expanded.value = {} } catch (e: any) { alert(e?.message || '加载失败') }
}
async function removeReplay(id: string) {
  if (!confirm('确定删除该复盘记录？')) return
  try { await bbDeleteMinigameReplay(id); detail.value = null; await loadList() } catch (e: any) { alert(e?.message || '删除失败') }
}

onMounted(loadList)
</script>

<style scoped>
.mg-replay { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.filters { margin-left: auto; display: flex; gap: 10px; }
.bb-input { padding: 8px 12px; background: #0a0a1a; border: 1px solid #00ff8833; border-radius: 6px; color: #e0e0e0; font-size: 13px; }
.replay-layout { display: grid; grid-template-columns: 320px 1fr; gap: 16px; align-items: start; }
.list-panel { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 12px; padding: 12px; max-height: 80vh; overflow-y: auto; }
.replay-item { padding: 10px 12px; border: 1px solid #ffffff10; border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: all 0.15s; }
.replay-item:hover { border-color: #4488ff66; }
.replay-item.active { border-color: #4488ff; background: #4488ff12; }
.ri-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.ri-name { font-size: 13px; color: #e0e0e0; font-weight: 600; }
.ri-type { font-size: 11px; color: #4488ff; }
.ri-meta { font-size: 12px; color: #8a8aa5; }
.ri-winner { font-size: 12px; color: #ffaa00; margin-top: 4px; }
.ri-winner.none { color: #666; }
.detail-panel { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 12px; padding: 18px; min-width: 0; }
.detail-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; gap: 12px; }
.dh-title { font-size: 18px; font-weight: 700; color: #e0e0e0; }
.dh-sub { font-size: 13px; color: #8a8aa5; margin-top: 4px; }
.detail-grid { display: flex; gap: 16px; flex-wrap: wrap; }
.dg-block { margin-bottom: 16px; }
.dg-title { font-size: 14px; color: #00ff88; font-weight: 600; margin-bottom: 10px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.dg-players { display: flex; flex-wrap: wrap; gap: 8px; }
.dg-player { display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: #ffffff06; border: 1px solid #ffffff10; border-radius: 8px; font-size: 13px; color: #ddd; }
.dg-player.winner { border-color: #ffaa00; background: #ffaa0012; }
.dg-score { color: #8a8aa5; font-size: 12px; }
.dg-crown { font-size: 14px; }
.ev-filters { display: flex; gap: 6px; }
.ev-filter { background: transparent; border: 1px solid #ffffff22; color: #aaa; border-radius: 6px; padding: 2px 10px; font-size: 12px; cursor: pointer; }
.ev-filter.active { border-color: #00ff88; color: #00ff88; }
.timeline { display: flex; flex-direction: column; gap: 4px; max-height: 60vh; overflow-y: auto; }
.tl-row { display: flex; align-items: center; gap: 10px; padding: 6px 10px; background: #ffffff05; border-radius: 6px; font-size: 13px; flex-wrap: wrap; }
.tl-row.eliminate { background: #ff444414; }
.tl-row.finish, .tl-row.game_end, .tl-row.game_stop { background: #ffaa0014; }
.tl-row.round { background: #4488ff12; }
.tl-time { color: #666; font-size: 11px; font-variant-numeric: tabular-nums; }
.tl-delta { color: #4488ff; font-size: 11px; font-variant-numeric: tabular-nums; min-width: 48px; }
.tl-text { color: #ddd; flex: 1; }
.tl-more { background: transparent; border: 1px solid #ffffff22; color: #aaa; border-radius: 4px; padding: 1px 8px; font-size: 11px; cursor: pointer; }
.tl-data { flex-basis: 100%; margin: 4px 0 0; padding: 8px; background: #0a0a1a; border-radius: 6px; color: #9fd8b8; font-size: 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
.empty-hint { color: #666; font-size: 13px; padding: 24px 0; text-align: center; }
.bb-btn { background: transparent; border: 1px solid #00ff8844; color: #00ff88; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.bb-btn:hover { background: #00ff8822; }
.bb-btn-danger { border-color: #ff444466; color: #ff4444; }
.bb-btn-danger:hover { background: #ff444422; }
</style>
