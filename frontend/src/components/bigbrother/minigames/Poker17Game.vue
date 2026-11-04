<template>
  <div class="poker17">
    <div v-if="combinedError" class="p17-error">⚠️ {{ combinedError }}</div>

    <!-- 倒计时 -->
    <div v-if="showCountdown" class="p17-countdown">
      <div class="p17-countdown-label">比赛即将开始</div>
      <div class="p17-countdown-value">{{ Math.ceil(countdown) }}</div>
    </div>

    <!-- 同步牌局 -->
    <div v-else-if="showSyncing" class="p17-countdown">
      <div class="p17-countdown-label">正在同步牌局…</div>
    </div>

    <!-- 牌桌 -->
    <div v-else-if="gs" class="p17-table">
      <div class="p17-topbar">
        <div class="p17-round">第 {{ gs.round }} / {{ gs.totalRounds }} 局</div>
        <div class="p17-phase">{{ gs.phaseLabel }}</div>
        <div class="p17-pot">底池 <strong>{{ gs.pot }}</strong></div>
      </div>

      <!-- 对手 -->
      <div class="p17-player opponent" :class="{ active: gs.turnPlayerId === opponentId }">
        <BBAvatar :name="opponentName" :avatar="avatarOf(opponentId)" size="md" />
        <div class="p17-player-info">
          <div class="p17-player-name">{{ opponentName }}</div>
          <div class="p17-player-chips">🪙 {{ chipsOf(opponentId) }}</div>
        </div>
        <div class="p17-player-bet" v-if="betsOf(opponentId)">下注 {{ betsOf(opponentId) }}</div>
        <div class="p17-opponent-hand">
          <template v-if="!opponentHandRevealed">
            <div v-for="n in opponentHandCount" :key="n" class="p17-card back">🂠</div>
          </template>
          <template v-else>
            <div v-for="(card, i) in opponentHand" :key="'o' + i" class="p17-card" :class="card.color">
              <span class="rank">{{ card.joker ? 'J' : card.rank }}</span>
              <span class="suit">{{ card.joker ? '🃏' : card.suit }}</span>
            </div>
          </template>
        </div>
      </div>

      <div class="p17-center">
        <div class="p17-pot-big">🪙 {{ gs.pot }}</div>
        <div class="p17-status">{{ statusHint }}</div>
        <div v-if="gs.currentBet > 0 && (gs.phase === 'bet1' || gs.phase === 'bet2')" class="p17-current-bet">
          当前需跟注 {{ gs.action.callAmount }}
        </div>
      </div>

      <!-- 自己 -->
      <div class="p17-player me" :class="{ active: gs.turnPlayerId === myId }">
        <BBAvatar :name="myName" :avatar="avatarOf(myId)" size="md" />
        <div class="p17-player-info">
          <div class="p17-player-name">{{ myName }}<span class="p17-me">（你）</span></div>
          <div class="p17-player-chips">🪙 {{ chipsOf(myId) }}</div>
        </div>
        <div class="p17-player-bet" v-if="betsOf(myId)">下注 {{ betsOf(myId) }}</div>
      </div>

      <!-- 自己的手牌 -->
      <div class="p17-hand-wrap">
        <div class="p17-hand">
          <div
            v-for="(card, index) in myHand"
            :key="card.id"
            class="p17-card hand-card"
            :class="[
              card.color,
              { joker: card.joker, selected: selectedIndices.includes(index), selectable: canSelectCards }
            ]"
            @click="toggleCard(index)"
          >
            <span class="rank">{{ card.joker ? 'JOKER' : card.rank }}</span>
            <span class="suit">{{ card.joker ? '🃏' : card.suit }}</span>
          </div>
          <div v-if="!myHand.length" class="p17-no-hand">等待发牌…</div>
        </div>
        <div v-if="phase === 'exchange' && gs.exchange.isMyTurn" class="p17-exchange-hint">
          点击手牌选择交换 · 已选 {{ selectedIndices.length }} / {{ gs.exchange.maxSelectable }} 张
          · 剩余牌堆 {{ gs.exchange.remainingDeck }} 张
        </div>
      </div>

      <!-- 操作区 -->
      <div class="p17-controls">
        <!-- 切牌 -->
        <template v-if="phase === 'cut'">
          <div class="p17-ctrl-title">切牌阶段</div>
          <p class="p17-ctrl-desc">双方各有一次切牌机会，切牌只改变牌堆顺序，不会公开牌面。</p>
          <div class="p17-btn-row">
            <button v-if="gs.cut.canCut" class="p17-btn primary" @click="cutDeck">✂️ 切牌（随机）</button>
            <span v-else class="p17-muted">你已切牌，等待对手…</span>
            <span class="p17-muted">对手：{{ gs.cut.done[opponentId] ? '已切牌' : '未切牌' }}</span>
          </div>
        </template>

        <!-- 第一 / 第二轮下注 -->
        <template v-else-if="phase === 'bet1' || phase === 'bet2'">
          <div class="p17-ctrl-title">
            {{ phase === 'bet1' ? '第一轮下注' : '第二轮下注' }}
            <span class="p17-turn-tag" :class="{ mine: isMyTurn }">{{ isMyTurn ? '轮到你' : '等待对手' }}</span>
          </div>
          <template v-if="isMyTurn">
            <div class="p17-bet-meta">
              <span v-if="available.includes('bet')">最低下注 {{ action.minBet }} · 最高 {{ action.maxBet }}</span>
              <span v-else-if="available.includes('raise')">加注范围 {{ action.raiseMin }} - {{ action.raiseMax }}（个人累计上限 30）</span>
              <span v-else-if="available.includes('call')">需跟注 {{ action.callAmount }}</span>
            </div>
            <div v-if="showWager" class="p17-wager">
              <input v-model.number="wager" type="range" :min="wagerMin" :max="wagerMax" :step="wagerStep" />
              <span class="p17-wager-value">{{ wager }}</span>
            </div>
            <div class="p17-btn-row">
              <button v-if="available.includes('check')" class="p17-btn" @click="doCheck">过牌 Check</button>
              <button v-if="available.includes('bet')" class="p17-btn primary" @click="doBet">下注 {{ wager }}</button>
              <button v-if="available.includes('call')" class="p17-btn primary" @click="doCall">跟注 {{ action.callAmount }}</button>
              <button v-if="available.includes('raise')" class="p17-btn" @click="doRaise">加注到 {{ wager }}</button>
              <button v-if="available.includes('fold')" class="p17-btn danger" @click="doFold">弃牌 Fold</button>
            </div>
          </template>
          <p v-else class="p17-muted">等待 {{ opponentName }} 行动…</p>
        </template>

        <!-- 换牌 -->
        <template v-else-if="phase === 'exchange'">
          <div class="p17-ctrl-title">
            换牌阶段
            <span class="p17-turn-tag" :class="{ mine: gs.exchange.isMyTurn }">{{ gs.exchange.isMyTurn ? '轮到你' : '等待对手' }}</span>
          </div>
          <p class="p17-ctrl-desc">
            本局剩余牌堆 {{ gs.exchange.remainingDeck }} 张 · 双方合计最多换 7 张。
            <template v-if="gs.exchange.done[myId]">你已换牌，等待对手…</template>
            <template v-else-if="gs.exchange.isMyTurn">你最多可换 {{ gs.exchange.maxSelectable }} 张。</template>
            <template v-else>等待对手换牌…</template>
          </p>
          <div class="p17-btn-row">
            <button v-if="gs.exchange.isMyTurn" class="p17-btn primary" @click="confirmExchange">
              确认换牌（{{ selectedIndices.length }} 张）
            </button>
          </div>
        </template>

        <!-- 本局结算 -->
        <template v-else-if="phase === 'round_result'">
          <div class="p17-ctrl-title">第 {{ gs.round }} 局结算</div>
          <div v-if="lastResult" class="p17-result">
            <div v-if="lastResult.type === 'showdown'" class="p17-showdown">
              <div class="p17-showdown-row" :class="{ winner: lastResult.winnerIds.includes(myId) }">
                <div class="p17-showdown-name">{{ myName }}</div>
                <div class="p17-showdown-cards">
                  <span v-for="(c, i) in resultHand(myId)" :key="'m' + i" class="p17-mini-card" :class="c.color">{{ cardText(c) }}</span>
                </div>
                <div class="p17-showdown-type">{{ evalName(myId) }}</div>
                <div class="p17-showdown-delta" :class="deltaClass(myId)">{{ deltaText(myId) }}</div>
              </div>
              <div class="p17-vs">VS</div>
              <div class="p17-showdown-row" :class="{ winner: lastResult.winnerIds.includes(opponentId) }">
                <div class="p17-showdown-name">{{ opponentName }}</div>
                <div class="p17-showdown-cards">
                  <span v-for="(c, i) in resultHand(opponentId)" :key="'o' + i" class="p17-mini-card" :class="c.color">{{ cardText(c) }}</span>
                </div>
                <div class="p17-showdown-type">{{ evalName(opponentId) }}</div>
                <div class="p17-showdown-delta" :class="deltaClass(opponentId)">{{ deltaText(opponentId) }}</div>
              </div>
              <div class="p17-result-summary">
                {{ lastResult.winnerNames.join('、') }} 赢得全部底池 {{ lastResult.pot }} 枚（含双方底注）
              </div>
            </div>
            <div v-else-if="lastResult.type === 'fold'" class="p17-result-simple">
              <div class="p17-result-icon">🏳️</div>
              <div>
                <strong>{{ lastResult.folderName }}</strong> 弃牌，<strong>{{ lastResult.winnerNames.join('、') }}</strong>
                赢得全部底池 {{ lastResult.pot }} 枚（含双方底注）。
              </div>
            </div>
            <div v-else class="p17-result-simple">
              <div class="p17-result-icon">🤝</div>
              <div>双方连续过牌，本局 No Contest；双方底注共 {{ lastResult.refundedAnte }} 枚已退还。</div>
            </div>
          </div>
          <div class="p17-btn-row">
            <button v-if="gs.canNextRound" class="p17-btn primary" @click="nextRound">继续下一局</button>
            <span v-else class="p17-muted">第10局结束，正在结算比赛…</span>
          </div>
        </template>
      </div>

      <!-- 比赛结束 -->
      <div v-if="matchOver" class="p17-match-over">
        <div class="p17-final-title">🏆 比赛结束</div>
        <div class="p17-final-players">
          <div v-for="p in finalPlayers" :key="p.playerId" class="p17-final-player" :class="{ winner: p.isWinner }">
            <BBAvatar :name="p.playerName" :avatar="avatarOf(p.playerId)" size="sm" />
            <div class="p17-final-name">{{ p.playerName }}<span v-if="p.playerId === myId">（你）</span></div>
            <div class="p17-final-chips">最终筹码 <strong>{{ p.chips }}</strong></div>
            <div class="p17-final-net" :class="p.net >= 0 ? 'up' : 'down'">
              净收益 {{ p.net >= 0 ? '+' : '' }}{{ p.net }}
            </div>
            <div v-if="p.isWinner" class="p17-final-badge">获胜</div>
          </div>
        </div>
        <div class="p17-final-winner">
          {{ finalResult?.isTie ? '双方并列获胜' : `${finalResult?.winnerNames?.join('、') || winner?.playerName || ''} 最终获胜` }}
        </div>
        <div v-if="finalDecisionText" class="p17-final-reason">{{ finalDecisionText }}</div>
        <div class="p17-final-total">
          双方总筹码 {{ finalResult?.totalChips ?? gs.totalChips ?? 200 }} 枚
        </div>
      </div>
    </div>

    <div v-else class="p17-countdown">
      <div class="p17-countdown-label">等待比赛数据…</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import BBAvatar from '../BBAvatar.vue'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import { useMinigameSocket } from '../../../composables/useMinigameSocket'
import {
  bbGetActiveHouseguests,
  type Poker17RoomPlayer
} from '../../../services/bbApi'

const props = withDefaults(defineProps<{
  roomId: string
  participants?: Poker17RoomPlayer[]
  gameTitle?: string
}>(), {
  participants: () => [],
  gameTitle: '17 Poker'
})

const emit = defineEmits<{
  (e: 'finished', winner: { playerId: string; playerName: string }): void
}>()

const authStore = useBbAuthStore()
const myId = computed(() => authStore.currentUser?.id || '')
const myName = computed(() => authStore.currentUser?.name || '我')

const activeRoomId = ref<string | null>(props.roomId)
const selectedIndices = ref<number[]>([])
const wager = ref(5)
const finishedEmitted = ref(false)
const avatarDirectory = ref<Record<string, string | null>>({})

const {
  gameState: gs, countdown, participants: sockParticipants,
  winner, scores, finished, error, connect, joinRoom, sendAction, disconnect
} = useMinigameSocket(activeRoomId)

const phase = computed(() => gs.value?.phase || '')
const action = computed(() => gs.value?.action || {
  available: [], minBet: 0, maxBet: 0, callAmount: 0, raiseMin: 0, raiseMax: 0, maxSelectable: 0
})
const available = computed<string[]>(() => action.value.available || [])
const myHand = computed<any[]>(() => gs.value?.myHand || [])
const opponentId = computed(() => {
  const players = gs.value?.players || []
  const other = players.find((p: any) => p.playerId !== myId.value)
  return other?.playerId || ''
})
const opponentName = computed(() => {
  const other = (gs.value?.players || []).find((p: any) => p.playerId === opponentId.value)
  return other?.playerName || '对手'
})
const opponentHand = computed<any[]>(() => gs.value?.opponentHand || [])
const opponentHandCount = computed(() => gs.value?.opponentHandCount ?? 0)
const opponentHandRevealed = computed(() => Array.isArray(gs.value?.opponentHand) && gs.value.opponentHand.length > 0)
const isMyTurn = computed(() => !!gs.value && gs.value.turnPlayerId === myId.value)
const lastResult = computed(() => gs.value?.lastResult || null)
const finalResult = computed(() => gs.value?.finalResult || null)
const matchOver = computed(() => !!gs.value?.matchOver || !!finished.value)
const inGame = computed(() => !!gs.value?.phase)
const showCountdown = computed(() => !inGame.value && countdown.value > 0)
const showSyncing = computed(() => !inGame.value && !showCountdown.value && !matchOver.value)

const combinedError = computed(() => error.value || '')

const displayParticipants = computed<Poker17RoomPlayer[]>(() => {
  const live = (sockParticipants.value || []) as Poker17RoomPlayer[]
  if (live.length) return live
  return (props.participants || []) as Poker17RoomPlayer[]
})

const wagerMin = computed(() => {
  if (available.value.includes('raise')) return action.value.raiseMin
  if (available.value.includes('bet')) return action.value.minBet
  return 0
})
const wagerMax = computed(() => {
  if (available.value.includes('raise')) return action.value.raiseMax
  if (available.value.includes('bet')) return action.value.maxBet
  return 0
})
const showWager = computed(() => wagerMax.value > wagerMin.value)
const wagerStep = computed(() => {
  const diff = wagerMax.value - wagerMin.value
  return diff > 0 && diff % 5 === 0 ? 5 : 1
})

const canSelectCards = computed(() => phase.value === 'exchange' && !!gs.value?.exchange?.isMyTurn)
const maxSelectable = computed(() => gs.value?.exchange?.maxSelectable || 0)

const finalDecisionText = computed(() => {
  const fr = finalResult.value
  if (!fr) return ''
  if (fr.endReason === 'chips_zero') {
    const loser = (gs.value?.players || []).find((p: any) => (fr.chips?.[p.playerId] ?? 0) <= 0)
    return `${loser?.playerName || '对手'} 筹码归零，${fr.winnerNames?.[0] || ''} 直接获胜`
  }
  if (fr.endReason === 'round10') return '10局后双方筹码相同，按第10局筹码增加判定胜负'
  if (fr.endReason === 'tie') return '10局后双方筹码相同，且第10局无净增，比赛平局'
  if (fr.endReason === 'chips') return '10局后筹码更多者获胜'
  return ''
})

const finalPlayers = computed(() => {
  const fr = finalResult.value
  const fallbackChips = scores.value || {}
  return (gs.value?.players || []).map((p: any) => ({
    ...p,
    chips: fr?.chips?.[p.playerId] ?? fallbackChips[p.playerId] ?? p.chips,
    net: fr?.net?.[p.playerId] ?? ((fallbackChips[p.playerId] ?? p.chips) - 100),
    isWinner: fr?.winnerIds?.includes(p.playerId) || winner.value?.playerId === p.playerId
  }))
})

const statusHint = computed(() => {
  if (!gs.value) return ''
  if (gs.value.phase === 'cut') return '切牌中 · 牌面不会公开'
  if (gs.value.phase === 'bet1') return isMyTurn.value ? '轮到你下注' : `等待 ${opponentName.value} 下注`
  if (gs.value.phase === 'exchange') return gs.value.exchange?.isMyTurn ? '轮到你的换牌' : `等待 ${opponentName.value} 换牌`
  if (gs.value.phase === 'bet2') return isMyTurn.value ? '轮到你行动' : `等待 ${opponentName.value} 行动`
  if (gs.value.phase === 'round_result') return '本局结算'
  if (gs.value.phase === 'match_over') return '比赛结束'
  return ''
})

function chipsOf(pid: string): number {
  return Number(gs.value?.chips?.[pid] ?? 0)
}
function betsOf(pid: string): number {
  return Number(gs.value?.bets?.[pid] ?? 0)
}
function avatarOf(pid: string): string | null {
  const p = displayParticipants.value.find(x => x.playerId === pid)
  if (p?.avatar) return p.avatar
  if (pid && avatarDirectory.value[pid]) return avatarDirectory.value[pid]
  if (pid === myId.value && authStore.currentUser?.avatar) return authStore.currentUser.avatar
  const gp = (gs.value?.players || []).find((x: any) => x.playerId === pid)
  return gp?.avatar || null
}

async function loadAvatarDirectory() {
  try {
    const list = await bbGetActiveHouseguests()
    const map: Record<string, string | null> = {}
    for (const h of (list || [])) {
      if (h?.id) map[h.id] = h.avatar || null
    }
    avatarDirectory.value = map
  } catch { /* ignore */ }
}
function cardText(card: any): string {
  if (!card) return ''
  return card.joker ? '🃏' : `${card.rank}${card.suit || ''}`
}
function resultHand(pid: string): any[] {
  const lr = lastResult.value
  if (lr?.hands?.[pid]) return lr.hands[pid]
  if (pid === myId.value) return myHand.value
  return opponentHand.value
}
function evalName(pid: string): string {
  const ev = lastResult.value?.evaluations?.[pid]
  return ev?.categoryName || ''
}
function deltaText(pid: string): string {
  const d = lastResult.value?.chipDeltas?.[pid]
  if (d == null) return ''
  return `${d >= 0 ? '+' : ''}${d}`
}
function deltaClass(pid: string): string {
  const d = lastResult.value?.chipDeltas?.[pid] || 0
  return d > 0 ? 'up' : d < 0 ? 'down' : ''
}

function toggleCard(index: number) {
  if (!canSelectCards.value) return
  const pos = selectedIndices.value.indexOf(index)
  if (pos >= 0) {
    selectedIndices.value.splice(pos, 1)
    return
  }
  if (selectedIndices.value.length >= maxSelectable.value) return
  selectedIndices.value.push(index)
}

function cutDeck() {
  sendAction({ type: 'cut' })
}
function doCheck() {
  sendAction({ type: 'bet', move: 'check' })
}
function doBet() {
  sendAction({ type: 'bet', move: 'bet', amount: wager.value })
}
function doCall() {
  sendAction({ type: 'bet', move: 'call' })
}
function doRaise() {
  sendAction({ type: 'bet', move: 'raise', amount: wager.value })
}
function doFold() {
  if (!window.confirm('确定弃牌吗？')) return
  sendAction({ type: 'bet', move: 'fold' })
}
function confirmExchange() {
  if (!canSelectCards.value) return
  sendAction({ type: 'exchange', indices: selectedIndices.value.slice() })
  selectedIndices.value = []
}
function nextRound() {
  sendAction({ type: 'next_round' })
}

watch(() => props.roomId, (value) => {
  if (!value || value === activeRoomId.value) return
  activeRoomId.value = value
  selectedIndices.value = []
  wager.value = 5
  finishedEmitted.value = false
  disconnect()
  connect()
  nextTick(() => joinRoom(value))
})

watch(() => [wagerMin.value, wagerMax.value], () => {
  if (wagerMax.value < wager.value) wager.value = wagerMax.value
  if (wager.value < wagerMin.value) wager.value = wagerMin.value
}, { immediate: true })

watch(() => phase.value, () => {
  selectedIndices.value = []
})

watch(myHand, () => {
  selectedIndices.value = selectedIndices.value.filter(i => i < myHand.value.length)
})

watch(finished, (value) => {
  if (value && !finishedEmitted.value) {
    finishedEmitted.value = true
    if (winner.value) emit('finished', winner.value)
  }
})

onMounted(() => {
  loadAvatarDirectory()
  connect()
  nextTick(() => { if (activeRoomId.value) joinRoom(activeRoomId.value) })
})
</script>

<style scoped>
.poker17 { max-width: 860px; margin: 0 auto; color: #ece7fb; }
.p17-error { background: #ff444422; border: 1px solid #ff444466; color: #ffb4b4; padding: 10px 14px; border-radius: 10px; margin-bottom: 12px; font-size: 13px; }

/* 等待房 */
.p17-waiting { text-align: center; padding: 40px 20px; background: linear-gradient(160deg, #1b1130, #241640); border: 1px solid #b39bff33; border-radius: 18px; }
.p17-waiting-icon { font-size: 64px; margin-bottom: 8px; }
.p17-waiting h2 { margin: 0 0 8px; font-size: 26px; color: #f0eadf; letter-spacing: 1px; }
.p17-waiting-sub { color: #9a8cc2; font-size: 14px; margin: 0 0 20px; }
.p17-room-code { display: inline-flex; align-items: center; gap: 10px; background: #0f0920; border: 1px dashed #b39bff55; border-radius: 10px; padding: 8px 14px; margin-bottom: 22px; color: #b3a6d6; font-size: 12px; }
.p17-room-code code { color: #e6c988; font-size: 13px; user-select: all; }
.p17-waiting-players { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; }
.p17-seat { display: flex; align-items: center; gap: 10px; min-width: 200px; padding: 12px 14px; border: 1px solid #ffffff14; border-radius: 12px; background: #ffffff06; text-align: left; }
.p17-seat.online { border-color: #b39bff55; }
.p17-seat.empty { border-style: dashed; opacity: 0.7; }
.p17-empty-avatar { width: 40px; height: 40px; border-radius: 50%; background: #ffffff08; display: flex; align-items: center; justify-content: center; color: #6b5f92; font-size: 20px; }
.p17-seat-name { font-size: 14px; color: #ece7fb; }
.p17-me { color: #b39bff; font-size: 11px; margin-left: 4px; }
.p17-seat-meta { display: flex; gap: 8px; margin-top: 4px; font-size: 11px; color: #8f83b8; }
.p17-host { color: #e6c988; }
.p17-online { color: #7ee0b0; }
.p17-offline { color: #8f83b8; }
.p17-waiting-actions { display: flex; gap: 12px; justify-content: center; align-items: center; flex-wrap: wrap; }
.p17-wait-hint { color: #8f83b8; font-size: 13px; }

/* 通用按钮 */
.p17-btn { background: #ffffff08; border: 1px solid #b39bff44; color: #c9bdf0; padding: 10px 20px; border-radius: 9px; font-size: 14px; cursor: pointer; transition: all 0.18s; }
.p17-btn:hover:not(:disabled) { background: #b39bff18; border-color: #b39bff; color: #ece7fb; }
.p17-btn.primary { background: linear-gradient(135deg, #b39bff33, #7b5cd622); border-color: #b39bff; color: #e3d9ff; font-weight: 600; }
.p17-btn.primary:hover:not(:disabled) { background: #b39bff44; }
.p17-btn.danger { border-color: #ff6b6b55; color: #ff9d9d; }
.p17-btn.danger:hover:not(:disabled) { background: #ff444422; border-color: #ff6b6b; }
.p17-btn.ghost { border-color: #ffffff22; color: #a99bd0; }
.p17-btn:disabled { opacity: 0.45; cursor: not-allowed; }

/* 倒计时 */
.p17-countdown { text-align: center; padding: 90px 20px; }
.p17-countdown-label { color: #b3a6d6; font-size: 16px; }
.p17-countdown-value { font-size: 96px; font-weight: 800; color: #e6c988; line-height: 1.1; animation: p17pulse 0.8s ease-in-out infinite; }
@keyframes p17pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }

/* 牌桌 */
.p17-table { position: relative; background: radial-gradient(ellipse at 50% 30%, #2c1d50 0%, #170e2a 70%); border: 1px solid #b39bff2e; border-radius: 20px; padding: 16px; box-shadow: 0 20px 60px #00000066 inset; }
.p17-topbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 4px 8px 14px; font-size: 13px; color: #b3a6d6; }
.p17-phase { color: #e6c988; font-weight: 600; }
.p17-pot strong { color: #e6c988; }
.p17-player { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; background: #ffffff05; border: 1px solid transparent; transition: border-color 0.2s; }
.p17-player.active { border-color: #e6c98888; background: #e6c9880d; }
.p17-player-info { min-width: 90px; }
.p17-player-name { font-size: 14px; color: #ece7fb; }
.p17-player-chips { font-size: 12px; color: #e6c988; margin-top: 2px; }
.p17-player-bet { margin-left: auto; font-size: 12px; color: #b39bff; background: #b39bff12; padding: 3px 8px; border-radius: 999px; }
.p17-opponent-hand { display: flex; gap: 3px; margin-left: 8px; }
.p17-opponent-hand .p17-card { width: 34px; height: 48px; font-size: 12px; }
.p17-center { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 8px; }
.p17-pot-big { font-size: 26px; font-weight: 800; color: #e6c988; text-shadow: 0 0 18px #e6c98844; }
.p17-status { font-size: 13px; color: #9a8cc2; }
.p17-current-bet { font-size: 12px; color: #b39bff; }

.p17-hand-wrap { margin-top: 14px; }
.p17-hand { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; min-height: 92px; }
.p17-card { width: 62px; height: 88px; border-radius: 8px; background: linear-gradient(160deg, #fdfaf2, #e9e0cc); color: #17112a; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 6px 16px #00000055; border: 1px solid #ffffff55; user-select: none; transition: transform 0.15s, box-shadow 0.15s; }
.p17-card.red { color: #c0392b; }
.p17-card.black { color: #1b1130; }
.p17-card.purple { color: #7b4bd3; }
.p17-card.joker { background: linear-gradient(160deg, #3b2566, #241640); color: #e6c988; border-color: #e6c98866; }
.p17-card .rank { font-size: 20px; font-weight: 800; line-height: 1; }
.p17-card .suit { font-size: 20px; line-height: 1.1; }
.p17-card.hand-card.selectable { cursor: pointer; }
.p17-card.hand-card.selectable:hover { transform: translateY(-5px); box-shadow: 0 12px 22px #00000077; }
.p17-card.hand-card.selected { transform: translateY(-8px); box-shadow: 0 0 0 2px #b39bff, 0 14px 24px #00000088; }
.p17-card.back { background: linear-gradient(160deg, #3d2a68, #251747); color: #b39bff55; align-items: center; justify-content: center; font-size: 22px; border-color: #b39bff33; }
.p17-no-hand { color: #6b5f92; font-size: 13px; padding: 30px; }
.p17-exchange-hint { text-align: center; color: #b39bff; font-size: 12px; margin-top: 8px; }

/* 操作区 */
.p17-controls { margin-top: 16px; background: #110a20cc; border: 1px solid #b39bff22; border-radius: 14px; padding: 14px 16px; }
.p17-ctrl-title { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 600; color: #ece7fb; margin-bottom: 8px; }
.p17-turn-tag { font-size: 11px; font-weight: 500; color: #8f83b8; background: #ffffff08; border-radius: 999px; padding: 2px 9px; }
.p17-turn-tag.mine { color: #e6c988; background: #e6c98818; }
.p17-ctrl-desc { margin: 0 0 10px; font-size: 12px; color: #9a8cc2; line-height: 1.7; }
.p17-muted { color: #8f83b8; font-size: 13px; }
.p17-btn-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.p17-bet-meta { font-size: 12px; color: #b3a6d6; margin-bottom: 8px; }
.p17-wager { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.p17-wager input[type="range"] { flex: 1; accent-color: #b39bff; }
.p17-wager-value { min-width: 44px; text-align: center; color: #e6c988; font-weight: 700; background: #e6c98812; border-radius: 8px; padding: 4px 8px; }

/* 结算 */
.p17-result { margin-bottom: 12px; }
.p17-showdown { display: flex; flex-direction: column; gap: 6px; }
.p17-showdown-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; background: #ffffff05; border: 1px solid transparent; }
.p17-showdown-row.winner { border-color: #e6c98866; background: #e6c9880d; }
.p17-showdown-name { width: 86px; font-size: 13px; color: #ece7fb; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.p17-showdown-cards { display: flex; gap: 4px; flex-wrap: wrap; }
.p17-mini-card { font-size: 12px; padding: 4px 7px; border-radius: 5px; background: #fdfaf2; color: #1b1130; font-weight: 700; }
.p17-mini-card.red { color: #c0392b; }
.p17-mini-card.black { color: #1b1130; }
.p17-mini-card.purple { color: #7b4bd3; }
.p17-showdown-row.winner .p17-mini-card { box-shadow: 0 0 0 2px #e6c988, 0 0 10px #e6c98866; }
.p17-showdown-type { margin-left: auto; font-size: 12px; color: #b39bff; }
.p17-showdown-delta { width: 52px; text-align: right; font-weight: 700; font-size: 13px; }
.p17-vs { text-align: center; color: #6b5f92; font-size: 11px; letter-spacing: 2px; }
.up { color: #7ee0b0; }
.down { color: #ff8d8d; }
.p17-result-summary { text-align: center; margin-top: 8px; font-size: 13px; color: #e6c988; }
.p17-result-simple { display: flex; gap: 12px; align-items: flex-start; font-size: 13px; color: #c9bdf0; line-height: 1.7; }
.p17-result-icon { font-size: 26px; }

/* 比赛结束 */
.p17-match-over { position: absolute; inset: 0; border-radius: 20px; background: rgba(13, 7, 26, 0.92); backdrop-filter: blur(4px); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; z-index: 10; }
.p17-final-title { font-size: 26px; font-weight: 800; color: #e6c988; margin-bottom: 18px; }
.p17-final-players { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; margin-bottom: 16px; }
.p17-final-player { min-width: 190px; padding: 16px; border-radius: 14px; background: #ffffff06; border: 1px solid #ffffff14; text-align: center; }
.p17-final-player.winner { border-color: #e6c988; background: #e6c9880d; }
.p17-final-name { margin-top: 8px; font-size: 14px; color: #ece7fb; }
.p17-final-chips { margin-top: 6px; font-size: 13px; color: #b3a6d6; }
.p17-final-chips strong { color: #e6c988; }
.p17-final-net { margin-top: 4px; font-size: 15px; font-weight: 700; }
.p17-final-badge { margin-top: 8px; display: inline-block; font-size: 11px; color: #1b1130; background: #e6c988; border-radius: 999px; padding: 2px 10px; }
.p17-final-winner { font-size: 16px; color: #ece7fb; margin-bottom: 6px; }
.p17-final-reason { font-size: 12px; color: #b39bff; margin-bottom: 6px; }
.p17-final-total { font-size: 12px; color: #8f83b8; margin-bottom: 18px; }

@media (max-width: 640px) {
  .p17-table { padding: 10px; }
  .p17-card { width: 48px; height: 70px; }
  .p17-card .rank, .p17-card .suit { font-size: 16px; }
  .p17-opponent-hand .p17-card { width: 26px; height: 38px; font-size: 10px; }
  .p17-showdown-name { width: 62px; }
  .p17-showdown-type { margin-left: 0; }
  .p17-showdown-row { flex-wrap: wrap; }
  .p17-topbar { font-size: 12px; }
}
</style>
