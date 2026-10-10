<template>
  <div class="mg-observer">
    <div class="obs-header">
      <span class="obs-title">👁 实时观战</span>
      <span v-if="room" class="obs-name">{{ room.minigameName || room.minigameId }}</span>
      <span class="obs-status" :class="status">{{ statusText }}</span>
      <span class="obs-conn" :class="{ on: connected }">{{ connected ? '● 已连接' : '○ 连接中…' }}</span>
    </div>

    <div v-if="!roomId" class="obs-empty">暂无进行中的比赛</div>
    <template v-else>
      <div class="obs-players">
        <div
          v-for="p in playerRows"
          :key="p.playerId"
          class="obs-player"
          :class="{ winner: isWinner(p.playerId), done: p.done }"
        >
          <BBAvatar :name="p.playerName" :avatar="p.avatar" size="sm" />
          <span class="op-name">{{ p.playerName }}</span>
          <span class="op-label">{{ p.label || p.score }}</span>
          <div v-if="p.max" class="op-bar"><div class="op-fill" :style="{ width: pct(p) + '%' }"></div></div>
          <span v-if="isWinner(p.playerId)" class="op-badge">🏆</span>
          <span v-else-if="p.done" class="op-badge done">✓</span>
        </div>
        <div v-if="!playerRows.length" class="op-empty">等待选手状态…</div>
      </div>

      <div v-if="adminView" class="obs-admin">
        <div class="obs-admin-title">🔎 完整局面（管理员视角 · 含隐藏信息）</div>

        <!-- 出包魔法师 -->
        <template v-if="Array.isArray(adminView.players) && adminView.tower">
          <div class="oa-players">
            <div v-for="p in adminView.players" :key="p.playerId" class="oa-p"
              :class="{ turn: p.isTurn, dead: !p.alive }">
              <BBAvatar :name="p.name" size="sm" />
              <div class="oa-body">
                <div class="oa-line1">
                  <span class="oa-name">{{ p.name }}</span>
                  <span v-if="p.isTurn" class="oa-turn">🎯 行动</span>
                  <span v-if="!p.alive" class="oa-dead">出局</span>
                </div>
                <div class="oa-stats">❤ {{ p.hp }}/{{ p.maxHp }} · 🦉 {{ p.owls?.length || 0 }} · ⭐ {{ p.scoreTotal }}</div>
                <div class="oa-hand">
                  <span v-for="(c, i) in p.hand" :key="i" class="oa-card">{{ c }}</span>
                  <span v-if="!p.hand || !p.hand.length" class="oa-none">无牌</span>
                </div>
              </div>
            </div>
          </div>
          <div class="oa-tower">
            <span v-for="(t, id) in adminView.tower" :key="id" class="oa-tower-item">
              法术{{ id }} 余 {{ t.remaining }}/{{ t.total }}
            </span>
          </div>
        </template>

        <!-- Stay or Fold -->
        <template v-else-if="adminView.scores && adminView.estimates !== undefined">
          <div class="oa-sub">第 {{ adminView.round }} 轮 · {{ phaseLabel(adminView.phase) }} · 目标 {{ adminView.target }} · 真实数量 {{ adminView.trueCount }}</div>
          <div class="oa-list">
            <div v-for="p in playerRows" :key="p.playerId" class="oa-row">
              <span class="oa-name">{{ p.playerName }}</span>
              <span>估算 {{ adminView.estimates?.[p.playerId] ?? '-' }}</span>
              <span>选择 {{ adminView.decisions?.[p.playerId] || '-' }}</span>
              <span>差值 {{ adminView.diffs?.[p.playerId] ?? '-' }}</span>
              <span>分 {{ adminView.scores?.[p.playerId] ?? 0 }}</span>
              <span :class="{ 'oa-dead': adminView.eliminated?.includes(p.playerId) }">
                {{ adminView.eliminated?.includes(p.playerId) ? '淘汰' : (adminView.alive?.includes(p.playerId) ? '存活' : '-') }}
              </span>
            </div>
          </div>
        </template>

        <pre v-else-if="!isGenericView" class="oa-json">{{ pretty(adminView) }}</pre>

        <!-- 通用：摘要 + 每位选手字段 -->
        <template v-else>
          <div v-if="summaryEntries.length" class="oa-summary">
            <div v-for="e in summaryEntries" :key="e.k" class="oa-srow">
              <span class="oa-sk">{{ e.k }}</span>
              <span class="oa-sv">{{ e.text }}</span>
            </div>
          </div>
          <div class="oa-list">
            <div v-for="p in playerRows" :key="p.playerId" class="oa-p2">
              <div class="oa-p2-head">
                <BBAvatar :name="p.playerName" size="sm" />
                <span class="oa-name">{{ p.playerName }}</span>
                <span class="oa-label2">{{ p.label || '' }}</span>
              </div>
              <div class="oa-fields">
                <span v-for="(val, k) in (adminView.players[p.playerId] || {})" :key="k" class="oa-f">
                  <b>{{ k }}：</b>{{ fmtVal(val) }}
                </span>
                <span v-if="!Object.keys(adminView.players[p.playerId] || {}).length" class="oa-none">—</span>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div class="obs-events">
        <div class="events-title">📜 实时事件流（{{ events.length }}）</div>
        <div class="events-scroll">
          <div v-for="(e, i) in events" :key="i" class="ev-row" :class="e.type">
            <span class="ev-time">{{ fmtTime(e.t) }}</span>
            <span class="ev-text">{{ e.text }}</span>
          </div>
          <div v-if="!events.length" class="ev-empty">等待事件…</div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch, nextTick, ref } from 'vue'
import { useMinigameSocket } from '../../composables/useMinigameSocket'
import BBAvatar from './BBAvatar.vue'

const props = defineProps<{
  roomId: string | null
  room?: any
}>()

const roomRef = ref<string | null>(props.roomId)
const { connected, progress, events, winner, adminView, connect, joinRoom } = useMinigameSocket(roomRef)

function phaseLabel(p: string) {
  return ({ show: '展示', estimate: '估算', reveal: '公布估算', decide: 'Stay/Fold', resolve: '结算' } as Record<string, string>)[p] || p || ''
}
function pretty(d: any) { try { return JSON.stringify(d, null, 2) } catch { return String(d) } }

const isGenericView = computed(() => {
  const av: any = adminView.value
  return !!(av && av.players && !Array.isArray(av.players) && typeof av.players === 'object'
    && !(av.scores && av.estimates !== undefined))
})
const summaryEntries = computed(() => {
  const s = adminView.value?.summary
  if (!s || typeof s !== 'object') return []
  return Object.entries(s).map(([k, v]) => ({ k, text: fmtVal(v) }))
})
function fmtVal(v: any): string {
  if (v == null || v === '') return '—'
  if (Array.isArray(v)) return v.length ? v.join('、') : '—'
  if (typeof v === 'object') { try { return JSON.stringify(v) } catch { return '—' } }
  return String(v)
}

const status = computed(() => progress.value?.status || props.room?.status || '')
const statusText = computed(() => ({
  waiting: '等待开始',
  countdown: '倒计时',
  playing: '进行中',
  paused: '已暂停',
  finished: '已结束'
} as Record<string, string>)[status.value] || status.value || '')

const playerRows = computed(() => {
  const pr = progress.value
  if (!pr) return []
  const states = pr.states || {}
  return (pr.participants || []).map((p: any) => ({
    playerId: p.playerId,
    playerName: p.playerName,
    avatar: p.avatar || null,
    ...(states[p.playerId] || {})
  }))
})

function isWinner(id: string) {
  return winner.value?.playerId === id || progress.value?.winner?.playerId === id
}
function pct(p: any) {
  if (!p.max) return 0
  return Math.min(100, ((p.progress || 0) / p.max) * 100)
}
function fmtTime(t: number) {
  if (!t) return ''
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

onMounted(() => {
  connect()
  nextTick(() => { if (props.roomId) joinRoom(props.roomId) })
})

watch(() => props.roomId, (v) => {
  roomRef.value = v
  if (v) joinRoom(v)
})
</script>

<style scoped>
.mg-observer { background: #0f0f2e; border: 1px solid #4488ff44; border-radius: 12px; padding: 16px; }
.obs-header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.obs-title { font-size: 15px; font-weight: 700; color: #4488ff; }
.obs-name { font-size: 13px; color: #ccc; }
.obs-status { font-size: 12px; padding: 2px 10px; border-radius: 6px; background: #ffffff10; color: #aaa; }
.obs-status.playing { background: #00ff8822; color: #00ff88; }
.obs-status.paused { background: #ffaa0022; color: #ffaa00; }
.obs-status.finished { background: #ff444422; color: #ff4444; }
.obs-conn { margin-left: auto; font-size: 11px; color: #666; }
.obs-conn.on { color: #00ff88; }
.obs-empty, .op-empty, .ev-empty { color: #666; font-size: 13px; padding: 16px 0; text-align: center; }
.obs-players { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; margin-bottom: 14px; }
.obs-player { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: #ffffff06; border: 1px solid #ffffff10; border-radius: 8px; font-size: 13px; color: #ddd; }
.obs-player.winner { border-color: #ffaa00; background: #ffaa0012; }
.obs-player.done { opacity: 0.7; }
.op-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.op-label { color: #8a8aa5; font-size: 12px; }
.op-bar { width: 50px; height: 4px; background: #ffffff14; border-radius: 2px; overflow: hidden; }
.op-fill { height: 100%; background: linear-gradient(90deg, #00ff88, #4488ff); }
.op-badge { font-size: 14px; }
.op-badge.done { color: #00ff88; }
.obs-events { border-top: 1px solid #ffffff10; padding-top: 12px; }
.events-title { font-size: 13px; color: #8a8aa5; margin-bottom: 8px; }
.events-scroll { max-height: 320px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.ev-row { display: flex; gap: 10px; font-size: 13px; padding: 5px 8px; background: #ffffff05; border-radius: 6px; }
.ev-row.eliminate { background: #ff444414; }
.ev-row.finish, .ev-row.game_end { background: #ffaa0014; }
.ev-row.round { background: #4488ff12; }
.ev-time { color: #666; font-size: 11px; font-variant-numeric: tabular-nums; }
.ev-text { color: #ddd; }
.obs-admin { border-top: 1px solid #ffffff10; padding-top: 12px; margin-bottom: 12px; }
.obs-admin-title { font-size: 13px; color: #4488ff; margin-bottom: 10px; font-weight: 600; }
.oa-players { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; }
.oa-p { display: flex; gap: 8px; padding: 8px 10px; background: #ffffff06; border: 1px solid #ffffff12; border-radius: 8px; }
.oa-p.turn { border-color: #00ff88; background: #00ff8810; }
.oa-p.dead { opacity: 0.5; }
.oa-body { flex: 1; min-width: 0; }
.oa-line1 { display: flex; align-items: center; gap: 8px; }
.oa-name { font-size: 13px; color: #e0e0e0; font-weight: 600; }
.oa-turn { font-size: 11px; color: #00ff88; }
.oa-dead { color: #ff6b6b; font-size: 11px; }
.oa-stats { font-size: 12px; color: #9fb3d1; margin: 3px 0; }
.oa-hand { display: flex; flex-wrap: wrap; gap: 4px; }
.oa-card { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 30px; background: #1a1a3e; border: 1px solid #00ff8855; border-radius: 4px; color: #e0e0e0; font-weight: 700; font-size: 12px; }
.oa-none { color: #666; font-size: 12px; }
.oa-tower { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.oa-tower-item { font-size: 11px; color: #cfe3ff; background: #ffffff08; border-radius: 6px; padding: 2px 8px; }
.oa-sub { font-size: 12px; color: #9fb3d1; margin-bottom: 8px; }
.oa-list { display: flex; flex-direction: column; gap: 4px; }
.oa-row { display: flex; flex-wrap: wrap; gap: 10px; font-size: 12.5px; color: #ccc; padding: 5px 8px; background: #ffffff05; border-radius: 6px; }
.oa-json { max-height: 260px; overflow: auto; font-size: 11px; color: #9fd8b8; background: #0a0a1a; border-radius: 6px; padding: 8px; white-space: pre-wrap; word-break: break-all; }
@media (max-width: 480px) {
  .oa-players { grid-template-columns: 1fr; }
}
.oa-summary { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.oa-srow { display: flex; gap: 8px; font-size: 12.5px; color: #ccc; }
.oa-sk { color: #8a8aa5; min-width: 72px; }
.oa-sv { color: #e6e6ff; flex: 1; word-break: break-word; }
.oa-p2 { background: #ffffff06; border: 1px solid #ffffff12; border-radius: 8px; padding: 8px 10px; margin-bottom: 6px; }
.oa-p2-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.oa-label2 { margin-left: auto; font-size: 12px; color: #8a8aa5; }
.oa-fields { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12.5px; color: #cfe3ff; }
.oa-f b { color: #8a8aa5; font-weight: 500; }
</style>
