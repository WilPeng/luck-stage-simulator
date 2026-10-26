<template>
  <div class="minigame catch-mistress">
    <div v-if="finished" class="cm-finished">
      <div class="cm-finish-icon">🏆</div>
      <h2>比赛结束！</h2>
      <div v-if="winner" class="cm-winner">{{ winner.playerName }} 获胜！</div>
      <div v-else class="cm-winner none">无胜者</div>
      <div class="cm-final-list">
        <div v-for="p in players" :key="p.playerId" class="cm-final-row" :class="{ me: p.playerId === myId, out: !p.alive }">
          <span class="cm-final-name">{{ p.playerName }}</span>
          <span class="cm-final-loc">{{ p.choice != null ? locationText(p.choice) : '未选择' }}</span>
          <span class="cm-final-state" :class="{ win: p.playerId === (winner?.playerId || state.winnerId), out: !p.alive }">
            {{ p.playerId === (winner?.playerId || state.winnerId) ? '获胜' : (p.alive ? '存活' : '淘汰') }}
          </span>
        </div>
      </div>
    </div>

    <div v-else-if="!started" class="cm-waiting">
      <div class="cm-finish-icon">🕵️</div>
      <h2>{{ gameTitle || '抓小三' }}</h2>
      <p>本场共有 {{ totalLocations }} 个藏身地点。每位选手秘密选择 1 个藏身地点，随后按随机顺序逐一揭开地点。被揭开藏身点的选手立即淘汰，躲到最后的人获胜。</p>
      <p class="cm-rule-note">特别规则：若多人选择同一地点，且这是最后唯一未揭开的地点，则最先揭开该地点的选手获胜。</p>
      <div v-if="countdown > 0" class="countdown-big">{{ countdown }}</div>
      <p v-else class="waiting-text">等待管理员开始比赛...</p>
    </div>

    <div v-else class="cm-playing">
      <div class="cm-header">
        <span class="cm-phase">{{ phaseLabel }}</span>
        <span class="cm-alive">存活 {{ aliveCount }} / {{ players.length }} 人</span>
        <span v-if="phase === 'hiding' || phase === 'revealing'" class="cm-timer" :class="{ urgent: secondsLeft <= 5 }">
          {{ phase === 'hiding' ? '选点' : '行动' }} {{ secondsLeft }}s
        </span>
      </div>

      <div v-if="!myAlive && !finished" class="cm-spectator">你已被淘汰，进入观战模式</div>

      <div v-if="phase === 'hiding'" class="cm-turn-banner">
        <template v-if="state.canHide">
          {{ myChoice == null ? '请选择一个藏身地点' : '已选择藏身地点，等待其他选手...' }}
          <span v-if="myChoice != null" class="cm-my-pick">你的藏身点：{{ locationText(myChoice) }}</span>
        </template>
        <template v-else>等待其他选手选择藏身地点...</template>
      </div>

      <div v-else-if="phase === 'revealing'" class="cm-turn-banner" :class="{ mine: isMyTurn }">
        <template v-if="isMyTurn">轮到你行动，请揭开一个地点</template>
        <template v-else-if="myAlive">等待 <strong>{{ currentTurnName }}</strong> 揭开地点...</template>
        <template v-else>{{ currentTurnName }} 正在揭开地点...</template>
        <span v-if="myChoice != null" class="cm-my-pick">你的藏身点：{{ locationText(myChoice) }}</span>
      </div>

      <div class="cm-board">
        <button
          v-for="loc in locations"
          :key="loc.id"
          class="cm-cell"
          :class="{
            revealed: revealedSet.has(loc.id),
            mine: myChoice === loc.id && !revealedSet.has(loc.id),
            selectable: canClick(loc.id),
            danger: revealedSet.has(loc.id) && isMyLocationCaught(loc.id)
          }"
          :disabled="!canClick(loc.id)"
          @click="onLocationClick(loc.id)"
        >
          <div class="cm-cell-top">
            <span class="cm-cell-icon">{{ loc.icon }}</span>
            <span class="cm-cell-index">#{{ loc.id + 1 }}</span>
          </div>
          <div class="cm-cell-name">{{ loc.name }}</div>
          <div v-if="cellNote(loc.id)" class="cm-cell-note" :class="{ win: logByLocation[loc.id]?.special }">
            {{ cellNote(loc.id) }}
          </div>
          <div v-else-if="myChoice === loc.id && !revealedSet.has(loc.id)" class="cm-cell-note mine">你的藏身处</div>
          <div v-else-if="!revealedSet.has(loc.id)" class="cm-cell-note dim">未揭开</div>
        </button>
      </div>

      <div v-if="lastReveal" class="cm-last" :class="{ empty: lastReveal.empty, special: lastReveal.special }">
        <template v-if="lastReveal.special">
          {{ lastReveal.byName }} 揭开最后的藏身点 {{ lastReveal.locationName }}，率先揭开者获胜！
        </template>
        <template v-else-if="lastReveal.empty">
          {{ lastReveal.byName }} 揭开了 {{ lastReveal.locationName }}，无人被抓住
        </template>
        <template v-else>
          {{ lastReveal.byName }} 揭开了 {{ lastReveal.locationName }}，
          {{ eliminatedNames(lastReveal.eliminated) }} 被淘汰
        </template>
      </div>

      <div class="cm-lower">
        <div class="cm-players">
          <div class="cm-section-title">选手状态</div>
          <div class="cm-player-list">
            <div v-for="p in players" :key="p.playerId" class="cm-player" :class="{ me: p.playerId === myId, out: !p.alive }">
              <span class="cm-player-name">{{ p.playerName }}</span>
              <span v-if="p.playerId === myId" class="cm-me-tag">我</span>
              <span class="cm-player-state">{{ p.alive ? '存活' : '淘汰' }}</span>
            </div>
          </div>
        </div>

        <div class="cm-log">
          <div class="cm-section-title">揭晓记录（{{ revealLog.length }}）</div>
          <div class="cm-log-list">
            <div v-for="(r, i) in revealLog.slice().reverse()" :key="i" class="cm-log-row" :class="{ special: r.special, empty: r.empty }">
              <span class="cm-log-loc">{{ r.locationName }}</span>
              <span class="cm-log-by">{{ r.byName }}</span>
              <span class="cm-log-result">
                <template v-if="r.special">率先揭开最后地点，获胜</template>
                <template v-else-if="r.empty">无人被抓住</template>
                <template v-else>{{ eliminatedNames(r.eliminated) }} 淘汰</template>
              </span>
            </div>
            <div v-if="!revealLog.length" class="cm-empty">尚未揭开任何地点</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useMinigameSocket } from '../../../composables/useMinigameSocket'
import { useBbAuthStore } from '../../../stores/bbAuthStore'

const props = defineProps<{
  roomId: string
  participants: { playerId: string; playerName: string }[]
  gameTitle?: string
}>()
const emit = defineEmits<{ (e: 'finished', winner: { playerId: string; playerName: string }): void }>()

const authStore = useBbAuthStore()
const myId = computed(() => authStore.currentUser?.id || '')

const roomIdRef = ref(props.roomId)
const { gameState, countdown, winner, finished, connect, sendAction, disconnect } = useMinigameSocket(roomIdRef)
const submitting = ref(false)

const state = computed<any>(() => gameState.value || {})
const started = computed(() => !!state.value.started)
const phase = computed(() => state.value.phase || 'idle')
const players = computed<any[]>(() => Array.isArray(state.value.players) ? state.value.players : [])
const locations = computed<any[]>(() => Array.isArray(state.value.locations) ? state.value.locations : [])
const totalLocations = computed(() => state.value.totalLocations || 40)
const revealedSet = computed(() => new Set<number>(Array.isArray(state.value.revealed) ? state.value.revealed : []))
const revealLog = computed<any[]>(() => Array.isArray(state.value.revealLog) ? state.value.revealLog : [])
const logByLocation = computed<Record<number, any>>(() => {
  const map: Record<number, any> = {}
  for (const r of revealLog.value) map[r.location] = r
  return map
})
const lastReveal = computed(() => state.value.lastReveal || null)
const myChoice = computed(() => state.value.myChoice ?? null)
const myAlive = computed(() => state.value.myAlive !== false)
const aliveCount = computed(() => state.value.aliveCount || 0)
const secondsLeft = computed(() => state.value.secondsLeft || 0)
const currentTurnName = computed(() => state.value.currentTurnName || '')
const isMyTurn = computed(() => !!state.value.isMyTurn)
const phaseLabel = computed(() => {
  if (phase.value === 'hiding') return '选择藏身地点'
  if (phase.value === 'revealing') return '揭开地点'
  return '准备中'
})

function locationText(index: number): string {
  const loc = locations.value[index] || (state.value.locations || [])[index]
  return loc ? `${loc.icon} ${loc.name}` : `#${Number(index) + 1}`
}

function cellNote(index: number): string {
  const r = logByLocation.value[index]
  if (!r) return ''
  if (r.special) return `${r.byName} 获胜`
  if (r.empty) return '无人被抓住'
  return `${r.eliminated.map((e: any) => e.playerName).join('、')} 淘汰`
}

function isMyLocationCaught(index: number): boolean {
  return myChoice.value === index && revealedSet.value.has(index)
}

function eliminatedNames(list: any[] | undefined): string {
  return (list || []).map(e => e.playerName).join('、')
}

function canClick(index: number): boolean {
  if (submitting.value || finished.value) return false
  if (revealedSet.value.has(index)) return false
  if (phase.value === 'hiding') return !!state.value.canHide
  if (phase.value === 'revealing') return !!state.value.canReveal
  return false
}

function onLocationClick(index: number) {
  if (!canClick(index)) return
  if (phase.value === 'hiding') {
    if (myChoice.value === index) return
    submitting.value = true
    sendAction({ type: 'hide', location: index })
    setTimeout(() => { submitting.value = false }, 500)
    return
  }
  if (phase.value === 'revealing') {
    const unrevealed = totalLocations.value - (state.value.revealedCount || 0)
    if (index === myChoice.value && unrevealed > 1) {
      if (!window.confirm('这是你自己的藏身地点，揭开后你将被淘汰。确定要揭开吗？')) return
    }
    submitting.value = true
    sendAction({ type: 'reveal', location: index })
    setTimeout(() => { submitting.value = false }, 500)
  }
}

watch(finished, (val) => {
  if (val && winner.value) emit('finished', winner.value)
})

onMounted(() => { connect() })
onUnmounted(() => { disconnect() })
</script>

<style scoped>
.catch-mistress { max-width: 980px; margin: 0 auto; padding: 20px; text-align: center; }
.cm-waiting, .cm-finished { padding: 36px 16px; }
.cm-finish-icon { font-size: 64px; margin-bottom: 14px; }
h2 { color: #ece7fb; margin: 0 0 10px; }
.cm-waiting p { color: #8f83b8; font-size: 14px; line-height: 1.7; max-width: 640px; margin: 0 auto 8px; }
.cm-rule-note { color: #e6c988 !important; font-size: 13px !important; }
.countdown-big { font-size: 72px; font-weight: 700; color: #b39bff; margin: 20px 0; animation: cm-pulse 0.5s infinite; }
@keyframes cm-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.waiting-text { color: #6b5f92; margin-top: 12px; }
.cm-winner { font-size: 26px; font-weight: 700; color: #e6c988; margin-bottom: 16px; }
.cm-winner.none { color: #8f83b8; }
.cm-final-list { max-width: 560px; margin: 0 auto; display: flex; flex-direction: column; gap: 6px; }
.cm-final-row { display: grid; grid-template-columns: 1fr 1.4fr 72px; gap: 10px; align-items: center; background: #211640; border: 1px solid #b39bff22; border-radius: 8px; padding: 8px 12px; font-size: 13px; color: #d6d0ea; text-align: left; }
.cm-final-row.me { border-color: #b39bff66; }
.cm-final-row.out { opacity: 0.55; }
.cm-final-loc { color: #b9c6e6; }
.cm-final-state { text-align: right; color: #b39bff; }
.cm-final-state.out { color: #ff6b6b; }
.cm-final-state.win { color: #e6c988; font-weight: 700; }
.cm-header { display: flex; align-items: center; justify-content: center; gap: 14px; flex-wrap: wrap; margin-bottom: 14px; color: #a99bd0; font-size: 14px; font-weight: 600; }
.cm-phase { color: #b39bff; }
.cm-timer { padding: 2px 10px; border-radius: 999px; background: #b39bff22; color: #b39bff; }
.cm-timer.urgent { background: #ff444422; color: #ff8080; animation: cm-pulse 0.8s infinite; }
.cm-spectator { margin-bottom: 12px; padding: 10px 14px; background: #ff444415; border: 1px solid #ff444455; border-radius: 8px; color: #ff9a9a; font-size: 14px; }
.cm-turn-banner { display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap; background: #17112a; border: 1px solid #b39bff33; border-radius: 10px; padding: 12px 16px; margin-bottom: 14px; color: #d6e4ff; font-size: 15px; }
.cm-turn-banner.mine { border-color: #b39bff; background: #b39bff14; box-shadow: 0 0 24px rgba(179, 155, 255, 0.14); }
.cm-turn-banner strong { color: #b39bff; }
.cm-my-pick { font-size: 12px; color: #e6c988; background: #e6c98812; border: 1px solid #e6c98833; border-radius: 999px; padding: 2px 10px; }
.cm-board { display: grid; grid-template-columns: repeat(auto-fill, minmax(108px, 1fr)); gap: 8px; margin-bottom: 14px; }
.cm-cell { position: relative; display: flex; flex-direction: column; gap: 3px; min-height: 82px; padding: 8px 8px 7px; border-radius: 10px; border: 1px solid #b39bff22; background: #17112a; color: #ece7fb; cursor: default; transition: all 0.15s ease; text-align: left; }
.cm-cell.selectable { cursor: pointer; border-color: #b39bff55; background: #1d1636; }
.cm-cell.selectable:hover { border-color: #b39bff; background: #271b4a; transform: translateY(-1px); box-shadow: 0 4px 16px rgba(179, 155, 255, 0.15); }
.cm-cell.mine { border-color: #e6c98888; background: #221c14; }
.cm-cell.revealed { cursor: default; opacity: 0.9; background: #0f0f1f; border-color: #ffffff12; }
.cm-cell.danger { border-color: #ff444466; background: #2a1118; }
.cm-cell-top { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
.cm-cell-icon { font-size: 20px; line-height: 1; }
.cm-cell-index { font-size: 10px; color: #6b5f92; font-variant-numeric: tabular-nums; }
.cm-cell-name { font-size: 12.5px; font-weight: 600; color: #e0d7ff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cm-cell.revealed .cm-cell-name { color: #8f83b8; }
.cm-cell-note { font-size: 10px; line-height: 1.25; color: #b9c6e6; min-height: 12px; word-break: break-word; }
.cm-cell-note.mine { color: #e6c988; font-weight: 600; }
.cm-cell-note.dim { color: #4b416b; }
.cm-cell-note.win { color: #e6c988; }
.cm-last { max-width: 720px; margin: 0 auto 14px; padding: 10px 16px; border-radius: 9px; background: #ff444414; border: 1px solid #ff444444; color: #ffb0b0; font-size: 14px; }
.cm-last.empty { background: #4488ff10; border-color: #4488ff44; color: #a8c8ff; }
.cm-last.special { background: #e6c98814; border-color: #e6c98855; color: #e6c988; }
.cm-lower { display: grid; grid-template-columns: minmax(200px, 0.8fr) minmax(280px, 1.2fr); gap: 14px; text-align: left; }
.cm-section-title { font-size: 13px; font-weight: 600; color: #b39bff; margin-bottom: 8px; }
.cm-player-list { display: flex; flex-wrap: wrap; gap: 6px; }
.cm-player { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; background: #17112a; border: 1px solid #ffffff10; font-size: 12.5px; color: #d6d0ea; }
.cm-player.me { border-color: #b39bff66; }
.cm-player.out { opacity: 0.45; }
.cm-me-tag { font-size: 10px; padding: 0 5px; border-radius: 4px; background: #b39bff22; color: #b39bff; }
.cm-player-state { color: #8f83b8; }
.cm-player.out .cm-player-state { color: #ff6b6b; }
.cm-log-list { max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; background: #120a22; border: 1px solid #ffffff0d; border-radius: 8px; padding: 6px; }
.cm-log-row { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 6px; background: #ffffff05; font-size: 12px; color: #b9c6e6; }
.cm-log-row.empty { background: #4488ff08; }
.cm-log-row.special { background: #e6c98814; color: #e6c988; }
.cm-log-loc { min-width: 92px; color: #e0d7ff; }
.cm-log-by { min-width: 62px; color: #8f83b8; }
.cm-log-result { flex: 1; word-break: break-word; }
.cm-empty { color: #4b416b; font-size: 12px; text-align: center; padding: 12px; }
@media (max-width: 640px) {
  .catch-mistress { padding: 10px; }
  .cm-board { grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 6px; }
  .cm-cell { min-height: 74px; }
  .cm-lower { grid-template-columns: 1fr; }
  .cm-final-row { grid-template-columns: 1fr auto; }
  .cm-final-loc { grid-column: 1 / -1; }
}
</style>
