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
const { connected, progress, events, winner, connect, joinRoom } = useMinigameSocket(roomRef)

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
</style>
