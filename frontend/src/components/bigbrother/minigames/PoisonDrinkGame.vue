<template>
  <div class="minigame poison-drink">
    <div v-if="finished" class="game-finished">
      <div class="game-icon">🍷</div>
      <h2>毒酒游戏结束！</h2>
      <div class="winner-info">
        <span class="winner-name">{{ winner?.playerName || winnerNameFallback || '无胜者' }}</span>
        <span v-if="winner || winnerNameFallback" class="winner-label">获得本轮胜利！</span>
      </div>
      <div class="final-board">
        <div
          v-for="(p, i) in finalRanking"
          :key="p.playerId"
          class="final-row"
          :class="{ me: p.playerId === myId, top: i === 0 && p.alive }"
        >
          <span class="rank-no">{{ i + 1 }}</span>
          <span class="rank-name">{{ p.playerName }}</span>
          <span class="rank-hp">{{ '❤️'.repeat(Math.max(0, p.hp)) || '💀' }}</span>
          <span class="rank-status">{{ p.alive ? '存活' : '淘汰' }}</span>
        </div>
      </div>
    </div>

    <div v-else-if="!started" class="game-waiting">
      <div class="game-icon">🍷</div>
      <h2>毒酒</h2>
      <p>每位玩家初始 <strong>3 点生命</strong>，座位顺序随机生成后固定，庄家随机产生。</p>
      <p>每轮根据存活人数生成同样数量的酒杯，其中随机 <strong>1 ~ N-1 杯有毒</strong>，只有庄家知道毒酒位置。</p>
      <p>庄家把酒杯分配给所有存活玩家；非庄家玩家秘密选择「不动 / 顺时针 1 格 / 顺时针 2 格」，全部选完后统一揭晓。</p>
      <p>喝到毒酒生命 -1，生命归零淘汰；最后存活者获胜。</p>
      <div v-if="countdown > 0" class="countdown-big"><CountdownDisplay :value="countdown" /></div>
      <p v-else class="waiting-text">等待管理员开始比赛...</p>
    </div>

    <div v-else class="game-playing">
      <div class="game-header">
        <span>第 {{ state.round }} 轮</span>
        <span class="dealer-tag">庄家：{{ dealerName }}</span>
        <span class="phase-tag" :class="phase">{{ phaseLabel }}</span>
        <span class="timer" :class="{ urgent: secondsLeft <= 5 }">⏱ {{ secondsLeft }}s</span>
      </div>

      <div class="players-board">
        <div
          v-for="p in state.players || []"
          :key="p.playerId"
          class="p-card"
          :class="{ me: p.playerId === myId, dead: !p.alive, dealer: p.isDealer }"
        >
          <div class="p-top">
            <span class="p-name">{{ p.playerName }}</span>
            <span v-if="p.isDealer" class="crown" title="庄家">👑</span>
          </div>
          <div class="p-hp">{{ '❤️'.repeat(Math.max(0, p.hp)) || '💀' }}</div>
          <div v-if="p.cup" class="p-cup">
            <span class="cup-emoji">{{ p.cup.emoji }}</span>
            <span class="cup-name">{{ p.cup.name }}</span>
          </div>
          <div v-if="state.phase === 'rotate' && p.alive && !p.isDealer" class="p-rot">
            {{ p.playerId === myId ? (p.rotation != null ? `已选择 ${p.rotation} 格` : '尚未选择') : (p.rotation != null ? '已选择' : '选择中') }}
          </div>
          <div v-if="!p.alive" class="p-dead">已淘汰</div>
        </div>
      </div>

      <!-- 分配阶段 -->
      <div v-if="state.phase === 'assign'" class="phase-area">
        <template v-if="state.my?.canAssign">
          <div class="section-title">你是庄家：分配酒杯（☠️ 为毒酒，仅你可见）</div>
          <div class="cup-pool">
            <div v-for="c in state.dealerCups || []" :key="c.id" class="cup-chip" :class="{ poison: c.poison }">
              <span class="cup-emoji">{{ c.emoji }}</span>
              <span class="cup-name">{{ c.name }}</span>
              <span v-if="c.poison" class="poison-mark">☠️</span>
            </div>
          </div>
          <div class="assign-list">
            <div v-for="p in alivePlayers" :key="p.playerId" class="assign-row">
              <span class="assign-name">{{ p.playerName }}</span>
              <select v-model="assignDraft[p.playerId]" class="bb-select">
                <option value="">选择酒杯</option>
                <option
                  v-for="c in state.dealerCups || []"
                  :key="c.id"
                  :value="c.id"
                  :disabled="cupUsedByOther(p.playerId, c.id)"
                >{{ c.emoji }} {{ c.name }}{{ c.poison ? ' ☠️' : '' }}</option>
              </select>
            </div>
          </div>
          <div class="assign-actions">
            <button class="bb-btn" @click="randomAssign">随机分配</button>
            <button class="bb-btn bb-btn-primary" :disabled="!allAssigned" @click="confirmAssign">确认分配</button>
          </div>
        </template>
        <template v-else>
          <div class="waiting-msg">庄家正在分配酒杯，请稍候…</div>
          <div class="cup-pool">
            <div v-for="c in state.cups || []" :key="c.id" class="cup-chip">
              <span class="cup-emoji">{{ c.emoji }}</span>
              <span class="cup-name">{{ c.name }}</span>
            </div>
          </div>
        </template>
      </div>

      <!-- 转盘阶段 -->
      <div v-else-if="state.phase === 'rotate'" class="phase-area">
        <template v-if="state.my?.canRotate">
          <div class="section-title">选择你的转盘操作（选择将保密，直到所有人完成）</div>
          <div v-if="state.my.myCup" class="my-cup">
            你的酒杯：<span class="cup-emoji">{{ state.my.myCup.emoji }}</span>
            <strong>{{ state.my.myCup.name }}</strong>
          </div>
          <div class="rotate-buttons">
            <button class="rotate-btn" @click="chooseRotation(0)">不动<small>0 格</small></button>
            <button class="rotate-btn" @click="chooseRotation(1)">顺时针<small>1 格</small></button>
            <button class="rotate-btn" @click="chooseRotation(2)">顺时针<small>2 格</small></button>
          </div>
        </template>
        <template v-else-if="state.my?.isDealer">
          <div class="waiting-msg">你是庄家，本轮不参与转盘操作，等待其他玩家选择…</div>
          <div class="submit-count">{{ chosenCount }} / {{ rotatorCount }} 人已选择</div>
        </template>
        <template v-else-if="state.my && !state.my.alive">
          <div class="waiting-msg">你已被淘汰，观战中…</div>
        </template>
        <template v-else>
          <div class="waiting-msg">等待其他玩家选择转盘操作…</div>
          <div class="submit-count">{{ chosenCount }} / {{ rotatorCount }} 人已选择</div>
        </template>
      </div>

      <!-- 结算阶段 -->
      <div v-else-if="state.phase === 'reveal' && state.lastResult" class="phase-area">
        <div class="section-title">第 {{ state.lastResult.round }} 轮结算 · 转盘累计 {{ state.lastResult.totalRotation }} 格</div>
        <div class="reveal-list">
          <div
            v-for="r in state.lastResult.rows"
            :key="r.playerId"
            class="reveal-row"
            :class="{ me: r.playerId === myId, poison: r.poison, out: r.eliminated }"
          >
            <span class="rr-name">{{ r.playerName }}</span>
            <span class="rr-cup">{{ r.emoji }} {{ r.drinkName }}</span>
            <span class="rr-tag" :class="r.poison ? 'bad' : 'good'">{{ r.poison ? '☠️ 毒酒' : '✅ 安全' }}</span>
            <span class="rr-hp">{{ r.hpBefore }} → {{ r.hpAfter }}</span>
            <span v-if="r.rotation != null" class="rr-rot">旋转 {{ r.rotation }} 格</span>
            <span v-if="r.eliminated" class="rr-out">出局</span>
          </div>
        </div>
        <div class="next-hint">下一轮 {{ secondsLeft }} 秒后开始…</div>
      </div>

      <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useMinigameSocket } from '../../../composables/useMinigameSocket'
import { useBbAuthStore } from '../../../stores/bbAuthStore'

const props = defineProps<{ roomId: string; participants: { playerId: string; playerName: string }[]; gameTitle?: string }>()
const emit = defineEmits<{ (e: 'finished', winner: { playerId: string; playerName: string }): void }>()

const authStore = useBbAuthStore()
const myId = computed(() => authStore.currentUser?.id || '')

const roomIdRef = ref(props.roomId)
const { gameState, countdown, winner, finished, connect, sendAction, disconnect } = useMinigameSocket(roomIdRef)

const state = computed<any>(() => gameState.value || {})
const started = computed(() => !!state.value.started)
const phase = computed(() => state.value.phase || 'assign')
const secondsLeft = computed(() => state.value.secondsLeft || 0)
const dealerName = computed(() => state.value.dealerName || '—')

const phaseLabel = computed(() => ({
  assign: '庄家分配酒杯',
  rotate: '转盘操作',
  reveal: '结算中',
  finished: '已结束'
} as Record<string, string>)[phase.value] || phase.value)

const alivePlayers = computed<any[]>(() => (state.value.players || []).filter((p: any) => p.alive))
const chosenCount = computed(() => {
  const list = (state.value.players || []).filter((p: any) => p.alive && !p.isDealer && p.rotation != null)
  return list.length
})
const rotatorCount = computed(() => (state.value.players || []).filter((p: any) => p.alive && !p.isDealer).length)

const winnerNameFallback = computed(() => {
  const wid = state.value.winnerId
  if (!wid) return ''
  const p = (state.value.players || []).find((x: any) => x.playerId === wid)
  return p ? p.playerName : ''
})

const finalRanking = computed(() => {
  return [...(state.value.players || [])]
    .sort((a: any, b: any) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1
      return (b.hp || 0) - (a.hp || 0)
    })
})

// ===== 分配草稿 =====
const assignDraft = reactive<Record<string, string>>({})
const errorMsg = ref('')
let errorTimer: ReturnType<typeof setTimeout> | null = null

function showError(text: string) {
  errorMsg.value = text
  if (errorTimer) clearTimeout(errorTimer)
  errorTimer = setTimeout(() => { errorMsg.value = '' }, 3000)
}

watch(() => state.value.round, () => {
  for (const k of Object.keys(assignDraft)) delete assignDraft[k]
}, { immediate: true })

watch(alivePlayers, (list) => {
  if (!state.value.my?.canAssign) return
  for (const p of list) {
    if (!(p.playerId in assignDraft)) assignDraft[p.playerId] = ''
  }
  for (const k of Object.keys(assignDraft)) {
    if (!list.some((p: any) => p.playerId === k)) delete assignDraft[k]
  }
}, { immediate: true })

function cupUsedByOther(playerId: string, cupId: string): boolean {
  return Object.entries(assignDraft).some(([pid, cid]) => pid !== playerId && cid === cupId)
}

const allAssigned = computed(() => {
  const cups = state.value.dealerCups || []
  const ids = alivePlayers.value.map((p: any) => assignDraft[p.playerId]).filter(Boolean)
  if (alivePlayers.value.length !== cups.length) return false
  return ids.length === cups.length && new Set(ids).size === cups.length
})

function randomAssign() {
  const cups = [...(state.value.dealerCups || [])]
  for (let i = cups.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cups[i], cups[j]] = [cups[j], cups[i]]
  }
  alivePlayers.value.forEach((p: any, i: number) => {
    assignDraft[p.playerId] = cups[i] ? cups[i].id : ''
  })
}

function confirmAssign() {
  if (!allAssigned.value) return
  const assignments: Record<string, string> = {}
  for (const p of alivePlayers.value) assignments[p.playerId] = assignDraft[p.playerId]
  sendAction({ type: 'assign', assignments })
}

function chooseRotation(rotation: number) {
  sendAction({ type: 'rotate', rotation })
}

watch(() => state.value.actionResult, (r: any) => {
  if (!r) return
  if (r.error) showError(r.error)
})

watch(finished, (val) => {
  if (val && winner.value) emit('finished', winner.value)
})

onMounted(() => { connect() })
onUnmounted(() => {
  if (errorTimer) clearTimeout(errorTimer)
  disconnect()
})
</script>

<style scoped>
.poison-drink { max-width: 760px; margin: 0 auto; padding: 20px; }
.game-waiting, .game-finished { text-align: center; padding: 40px 20px; }
.game-icon { font-size: 64px; margin-bottom: 16px; }
h2 { color: #ece7fb; margin: 0 0 8px; }
p { color: #8f83b8; font-size: 14px; line-height: 1.7; margin: 4px 0; }
p strong { color: #b39bff; }
.countdown-big { font-size: 72px; font-weight: 700; color: #b39bff; margin: 20px 0; animation: pulse 0.5s infinite; }
@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.waiting-text { color: #6b5f92; margin-top: 12px; }
.game-header { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; color: #a99bd0; font-size: 14px; margin-bottom: 14px; }
.dealer-tag { color: #e6c988; }
.phase-tag { padding: 2px 10px; border-radius: 999px; font-size: 12px; background: #b39bff1a; color: #b39bff; }
.phase-tag.rotate { background: #00c8ff1a; color: #7fd8ff; }
.phase-tag.reveal { background: #e6c9881a; color: #e6c988; }
.timer { margin-left: auto; font-weight: 700; }
.timer.urgent { color: #ff4444; }
.players-board { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin-bottom: 16px; }
.p-card { position: relative; background: #1b1130; border: 1px solid #ffffff14; border-radius: 10px; padding: 10px 12px; color: #ddd; }
.p-card.me { border-color: #b39bff88; box-shadow: 0 0 0 1px #b39bff33; }
.p-card.dead { opacity: 0.45; }
.p-card.dealer { border-color: #e6c98866; }
.p-top { display: flex; align-items: center; gap: 6px; }
.p-name { flex: 1; font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.crown { font-size: 14px; }
.p-hp { margin: 6px 0; font-size: 13px; letter-spacing: 1px; }
.p-cup { display: flex; align-items: center; gap: 6px; background: #ffffff08; border-radius: 6px; padding: 4px 8px; }
.cup-emoji { font-size: 18px; }
.cup-name { font-size: 12px; color: #e0d7ff; }
.p-rot { margin-top: 6px; font-size: 12px; color: #7fd8ff; }
.p-dead { margin-top: 6px; font-size: 12px; color: #ff6b6b; }
.phase-area { background: #17112a; border: 1px solid #b39bff22; border-radius: 12px; padding: 16px; }
.section-title { font-size: 14px; font-weight: 600; color: #e6c988; margin-bottom: 12px; }
.cup-pool { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.cup-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; background: #ffffff08; border: 1px solid #ffffff14; border-radius: 8px; font-size: 12px; color: #e0d7ff; }
.cup-chip.poison { border-color: #ff444466; background: #ff444414; }
.poison-mark { color: #ff6b6b; }
.assign-list { display: flex; flex-direction: column; gap: 8px; }
.assign-row { display: flex; align-items: center; gap: 10px; }
.assign-name { width: 120px; font-size: 14px; color: #e0d7ff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bb-select { flex: 1; padding: 8px 12px; background: #0f0a1c; border: 1px solid #b39bff44; border-radius: 6px; color: #ece7fb; font-size: 13px; outline: none; }
.assign-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }
.bb-btn { background: transparent; border: 1px solid #b39bff44; color: #b39bff; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 14px; }
.bb-btn:hover { background: #b39bff22; }
.bb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bb-btn-primary { background: #b39bff22; border-color: #b39bff; }
.my-cup { font-size: 15px; color: #e0d7ff; margin-bottom: 14px; }
.rotate-buttons { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.rotate-btn { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 18px 10px; border: 2px solid #ffffff1c; border-radius: 12px; background: linear-gradient(160deg, #2e1e52, #1a1233); color: #e2d9ff; font-size: 16px; font-weight: 700; cursor: pointer; }
.rotate-btn:hover { border-color: #b39bff; color: #b39bff; }
.rotate-btn small { font-size: 12px; font-weight: 400; color: #a99bd0; }
.submit-count, .waiting-msg { text-align: center; color: #b3a6d6; font-size: 14px; padding: 10px 0; }
.reveal-list { display: flex; flex-direction: column; gap: 8px; }
.reveal-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 10px 12px; background: #ffffff06; border: 1px solid #ffffff12; border-radius: 8px; font-size: 13px; color: #ddd; }
.reveal-row.me { border-color: #b39bff66; }
.reveal-row.poison { border-color: #ff444466; background: #ff444410; }
.reveal-row.out { opacity: 0.65; }
.rr-name { font-weight: 600; min-width: 70px; }
.rr-cup { color: #e0d7ff; }
.rr-tag { padding: 1px 8px; border-radius: 999px; font-size: 12px; }
.rr-tag.bad { color: #ff6b6b; background: #ff44441a; }
.rr-tag.good { color: #7ee0a0; background: #7ee0a01a; }
.rr-hp { color: #e6c988; }
.rr-rot { color: #7fd8ff; font-size: 12px; }
.rr-out { color: #ff6b6b; margin-left: auto; }
.next-hint { text-align: center; color: #6b5f92; font-size: 12px; margin-top: 12px; }
.error-msg { margin-top: 12px; text-align: center; color: #ff6b6b; background: #ff444414; border: 1px solid #ff444433; border-radius: 8px; padding: 8px; font-size: 13px; }
.winner-name { font-size: 26px; font-weight: 700; color: #e6c988; }
.winner-label { display: block; font-size: 14px; color: #e6c988; margin-top: 4px; }
.final-board { max-width: 420px; margin: 24px auto 0; display: flex; flex-direction: column; gap: 6px; }
.final-row { display: flex; align-items: center; gap: 12px; padding: 8px 14px; border-radius: 10px; background: #ffffff08; border: 1px solid #ffffff10; color: #cfc4ea; font-size: 14px; }
.final-row.me { border-color: #b39bff55; }
.final-row.top { border-color: #e6c98866; background: #e6c98810; color: #e6c988; }
.rank-no { width: 20px; color: #7d6fa6; }
.final-row.top .rank-no { color: #e6c988; }
.rank-name { flex: 1; text-align: left; }
.rank-hp { font-size: 12px; letter-spacing: 1px; }
.rank-status { font-size: 12px; color: #8f83b8; width: 36px; text-align: right; }
@media (max-width: 480px) {
  .poison-drink { padding: 12px; }
  .rotate-buttons { grid-template-columns: 1fr; }
  .assign-row { flex-direction: column; align-items: stretch; }
  .assign-name { width: auto; }
}
</style>
