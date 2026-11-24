<template>
  <div class="minigame hide-and-go-veto">
    <!-- 结算 -->
    <div v-if="isFinished" class="hgv-finished">
      <div class="hgv-finish-icon">🃏</div>
      <h2>藏牌寻宝结束！</h2>
      <div v-if="winnerName" class="hgv-winner">
        {{ winnerName }} 赢得否决权！
      </div>
      <div v-else class="hgv-winner none">无胜者</div>
      <div v-if="finishReason" class="hgv-finish-reason">{{ finishReasonText }}</div>

      <div class="hgv-final-stats">
        <span>🃏 翻找 {{ state.totalSearches || 0 }} 处</span>
        <span>🏚️ 房屋破坏度 {{ state.destruction || 0 }}%</span>
        <span>💥 {{ destructionLabel }}</span>
      </div>

      <div class="hgv-final-table">
        <div class="hgv-final-head">
          <span>选手</span>
          <span>藏牌点</span>
          <span>结果</span>
          <span>翻找</span>
          <span>找到</span>
        </div>
        <div
          v-for="p in finalPlayers"
          :key="p.playerId"
          class="hgv-final-row"
          :class="{ winner: p.playerId === winnerId, me: p.playerId === myId, out: p.eliminated && p.playerId !== winnerId }"
        >
          <span class="hf-name">
            {{ p.playerName }}
            <i v-if="p.playerId === myId" class="hgv-me">我</i>
          </span>
          <span class="hf-spot">{{ p.hideSpotName || '未藏' }}</span>
          <span class="hf-state" :class="{ win: p.playerId === winnerId, out: p.eliminated }">
            {{ p.playerId === winnerId ? (finishReason === 'mutual' ? '同归于尽获胜' : '获胜') : (p.eliminated ? `被 ${p.foundByName || '?'} 找到` : '幸存') }}
          </span>
          <span>{{ p.searches }} 次</span>
          <span>{{ p.finds }} 张</span>
        </div>
      </div>

      <div class="hgv-final-house">
        <div class="hgv-section-title">全屋最终藏点公开</div>
        <div v-for="room in rooms" :key="room.id" class="hgv-final-room">
          <div class="hgv-room-head">{{ room.icon }} {{ room.name }}</div>
          <div class="hgv-final-spots">
            <span
              v-for="spot in room.spots"
              :key="spot.id"
              class="hgv-final-spot"
              :class="{ found: spot.searched && spot.found.length, empty: spot.searched && !spot.found.length }"
            >
              <b>{{ spot.icon }} {{ spot.name }}</b>
              <em v-if="finalSpotNames(spot).length">🃏 {{ finalSpotNames(spot).join('、') }}</em>
              <em v-else-if="spot.searched" class="dim">空的</em>
              <em v-else class="dim">未翻</em>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 等待开始 -->
    <div v-else-if="!started" class="hgv-waiting">
      <div class="hgv-finish-icon">🃏</div>
      <h2>{{ gameTitle || '藏否决权牌寻宝赛' }}</h2>
      <p>每位选手秘密选择一个藏点，藏好写有自己名字的否决权卡。随后按随机顺序轮流进屋限时翻找，翻出谁的卡，谁立即淘汰。</p>
      <p class="hgv-rule-note">同一藏点可以藏多张卡，一次全部翻出。允许翻自己的藏点：翻开后自己一定淘汰，但如果这一翻带走所有剩余选手，翻找者获胜。</p>
      <p class="hgv-rule-note">最后一张没被找到的卡的主人，赢得否决权。</p>
      <div v-if="countdown > 0" class="countdown-big"><CountdownDisplay :value="countdown" /></div>
      <p v-else class="hgv-waiting-text">等待管理员开始比赛...</p>
    </div>

    <!-- 进行中 -->
    <div v-else class="hgv-playing">
      <div class="hgv-header">
        <span class="hgv-phase">{{ phaseLabel }}</span>
        <span class="hgv-alive">存活 {{ aliveCount }} / {{ playerCount }} 人</span>
        <span
          v-if="phase === 'hiding' || phase === 'searching'"
          class="hgv-timer"
          :class="{ urgent: secondsLeft <= 5 }"
        >
          {{ phase === 'hiding' ? '藏牌' : (isMyTurn ? '你的回合' : '行动') }} {{ secondsLeft }}s
        </span>
      </div>

      <div v-if="!myAlive && !isFinished" class="hgv-spectator">
        你的卡牌被 {{ state.myFoundBy || '某人' }} 找到了，你已被淘汰，进入观战模式
      </div>

      <div v-if="phase === 'hiding'" class="hgv-banner" :class="{ mine: canHide }">
        <template v-if="canHide">
          {{ selectedSpot ? `已选中：${selectedRoomName} · ${selectedSpot.name}` : '请选择一个藏点藏好你的否决权卡' }}
        </template>
        <template v-else-if="myHideSpot">
          🃏 你的卡已藏在 <strong>{{ myHideSpotName }}</strong>，只有你知道
        </template>
        <template v-else>等待其他选手藏牌...</template>
        <span class="hgv-progress-badge">已藏好 {{ hideSubmittedCount }} / {{ playerCount }}</span>
      </div>

      <div v-else-if="phase === 'searching'" class="hgv-banner" :class="{ mine: isMyTurn }">
        <template v-if="isMyTurn">
          🔦 轮到你进屋！翻找一处藏点
          <span class="hgv-actions-badge">本轮剩余 {{ actionsLeft }} 次</span>
        </template>
        <template v-else-if="myAlive">
          等待 <strong>{{ currentTurnName || '其他选手' }}</strong> 在屋里翻找...
        </template>
        <template v-else>
          {{ currentTurnName || '其他选手' }} 正在屋里翻找...
        </template>
        <span v-if="myHideSpot" class="hgv-progress-badge">🃏 你的卡：{{ myHideSpotName }}</span>
      </div>

      <div class="hgv-house">
        <section v-for="room in rooms" :key="room.id" class="hgv-room">
          <div class="hgv-room-head">
            <span>{{ room.icon }} {{ room.name }}</span>
          </div>
          <div class="hgv-spots">
            <button
              v-for="spot in room.spots"
              :key="spot.id"
              type="button"
              class="hgv-spot"
              :class="spotClass(spot)"
              :disabled="!isSpotClickable(spot)"
              @click="onSpotClick(spot)"
            >
              <span class="hgv-spot-top">
                <span class="hgv-spot-icon">{{ spot.icon }}</span>
                <span v-if="spot.id === myHideSpot" class="hgv-mine-tag">我的</span>
              </span>
              <span class="hgv-spot-name">{{ spot.name }}</span>
              <span v-if="spot.searched" class="hgv-spot-note" :class="{ found: spot.found.length }">
                <template v-if="spot.found.length">🃏 {{ spot.found.map((f: any) => f.playerName).join('、') }}</template>
                <template v-else>💨 空的</template>
              </span>
              <span v-else-if="spot.id === myHideSpot" class="hgv-spot-note mine">🃏 你的卡</span>
              <span v-else class="hgv-spot-note dim">? 未翻</span>
            </button>
          </div>
        </section>
      </div>

      <div v-if="phase === 'hiding' && canHide" class="hgv-hide-bar">
        <button
          type="button"
          class="hgv-confirm"
          :disabled="!selectedSpotId"
          @click="confirmHide"
        >
          {{ selectedSpotId ? '确认藏牌' : '请选择藏点' }}
        </button>
        <span class="hgv-hide-hint">确认后不可更改，其他选手不会看到你的位置。</span>
      </div>

      <div v-if="lastLog" class="hgv-last" :class="{ found: lastLog.found.length, empty: !lastLog.found.length }">
        {{ lastLogText(lastLog) }}
      </div>

      <div class="hgv-lower">
        <div class="hgv-panel">
          <div class="hgv-section-title">选手状态</div>
          <div class="hgv-player-list">
            <div
              v-for="p in players"
              :key="p.playerId"
              class="hgv-player"
              :class="{ me: p.playerId === myId, out: p.eliminated }"
            >
              <span class="hgv-player-name">{{ p.playerName }}</span>
              <span v-if="p.playerId === myId" class="hgv-me-tag">我</span>
              <span v-if="p.playerId === winnerId" class="hgv-player-state win">🏆 获胜</span>
              <span v-else-if="p.eliminated" class="hgv-player-state out">被 {{ p.foundByName || '?' }} 找到</span>
              <span v-else class="hgv-player-state">存活</span>
            </div>
          </div>
        </div>

        <div class="hgv-panel">
          <div class="hgv-section-title">翻找记录（{{ searchLog.length }}）</div>
          <div class="hgv-log-list">
            <div
              v-for="(log, i) in searchLog.slice().reverse()"
              :key="i"
              class="hgv-log-row"
              :class="{ found: log.found.length, empty: !log.found.length }"
            >
              <span class="hgv-log-place">{{ log.roomName }}·{{ log.spotName }}</span>
              <span class="hgv-log-by">{{ log.playerName }}</span>
              <span class="hgv-log-result">
                <template v-if="log.found.length">翻出 {{ log.found.map((f: any) => f.playerName).join('、') }}</template>
                <template v-else>空的</template>
                <i v-if="log.auto" class="hgv-auto">超时</i>
              </span>
            </div>
            <div v-if="!searchLog.length" class="hgv-empty">还没有人开始翻找</div>
          </div>
        </div>
      </div>

      <div class="hgv-destruction">
        <div class="hgv-destruction-head">
          <span>🏚️ 房屋破坏度</span>
          <span>{{ state.destruction || 0 }}% · {{ destructionLabel }}</span>
        </div>
        <div class="hgv-destruction-bar">
          <div class="hgv-destruction-fill" :style="{ width: (state.destruction || 0) + '%' }"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useMinigameSocket } from '../../../composables/useMinigameSocket'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import CountdownDisplay from './CountdownDisplay.vue'

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

const state = computed<any>(() => gameState.value || {})
const started = computed(() => !!state.value.started)
const phase = computed(() => state.value.phase || 'idle')
const rooms = computed<any[]>(() => (Array.isArray(state.value.rooms) ? state.value.rooms : []))
const players = computed<any[]>(() => (Array.isArray(state.value.players) ? state.value.players : []))
const allCards = computed<any[]>(() => (Array.isArray(state.value.allCards) ? state.value.allCards : []))
const searchLog = computed<any[]>(() => (Array.isArray(state.value.searchLog) ? state.value.searchLog : []))
const lastLog = computed<any>(() => searchLog.value[searchLog.value.length - 1] || null)
const myAlive = computed(() => state.value.myAlive !== false)
const myHideSpot = computed(() => state.value.myHideSpot || null)
const myHideSpotName = computed(() => state.value.myHideSpotName || '')
const isMyTurn = computed(() => !!state.value.isMyTurn)
const currentTurnName = computed(() => state.value.currentTurnName || '')
const actionsLeft = computed(() => Number(state.value.actionsLeft) || 0)
const secondsLeft = computed(() => Number(state.value.secondsLeft) || 0)
const aliveCount = computed(() => Number(state.value.aliveCount) || 0)
const playerCount = computed(() => Number(state.value.playerCount) || players.value.length)
const hideSubmittedCount = computed(() => Number(state.value.hideSubmittedCount) || 0)
const destruction = computed(() => Number(state.value.destruction) || 0)
const isFinished = computed(() => finished.value || !!state.value.finished)
const winnerId = computed(() => winner.value?.playerId || state.value.winnerId || '')
const winnerName = computed(() => winner.value?.playerName || state.value.winnerName || '')
const finishReason = computed(() => state.value.finishReason || '')

const selectedSpotId = ref('')
const submitting = ref(false)

const selectedSpot = computed<any>(() => {
  if (!selectedSpotId.value) return null
  for (const room of rooms.value) {
    const found = room.spots.find((s: any) => s.id === selectedSpotId.value)
    if (found) return found
  }
  return null
})
const selectedRoomName = computed(() => {
  if (!selectedSpotId.value) return ''
  const room = rooms.value.find((r: any) => r.spots.some((s: any) => s.id === selectedSpotId.value))
  return room ? room.name : ''
})

const phaseLabel = computed(() => {
  if (phase.value === 'hiding') return '藏牌阶段'
  if (phase.value === 'searching') return '寻宝阶段'
  if (phase.value === 'finished') return '已结束'
  return '准备中'
})
const destructionLabel = computed(() => {
  const pct = destruction.value
  if (pct >= 100) return '房子没了'
  if (pct >= 75) return '惨不忍睹'
  if (pct >= 50) return '一片狼藉'
  if (pct >= 25) return '有点乱了'
  return '屋子还算完整'
})
const finishReasonText = computed(() => {
  if (finishReason.value === 'mutual') return '一记自杀式翻找，和所有剩余选手同归于尽，翻找者获胜！'
  if (finishReason.value === 'timeout') return '时间耗尽，按找到卡牌数判定胜者。'
  if (finishReason.value === 'exhausted') return '所有藏点都被翻完了。'
  return '最后一张没被找到的卡，决定了否决权的归属。'
})

const canHide = computed(() => phase.value === 'hiding' && myAlive.value && !myHideSpot.value && !isFinished.value)

const finalPlayers = computed(() => {
  return [...players.value].sort((a: any, b: any) => {
    if (a.playerId === winnerId.value) return -1
    if (b.playerId === winnerId.value) return 1
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1
    return (b.finds || 0) - (a.finds || 0)
  })
})

function isSpotClickable(spot: any): boolean {
  if (isFinished.value || submitting.value) return false
  if (phase.value === 'hiding') return canHide.value
  if (phase.value === 'searching') return isMyTurn.value && myAlive.value && !spot.searched
  return false
}

function spotClass(spot: any) {
  return {
    clickable: isSpotClickable(spot),
    selected: selectedSpotId.value === spot.id,
    mine: spot.id === myHideSpot.value,
    searched: !!spot.searched,
    found: !!spot.searched && !!spot.found.length,
    empty: !!spot.searched && !spot.found.length
  }
}

function onSpotClick(spot: any) {
  if (!isSpotClickable(spot)) return
  if (phase.value === 'hiding') {
    selectedSpotId.value = spot.id
    return
  }
  if (phase.value === 'searching') {
    if (spot.id === myHideSpot.value) {
      const ok = window.confirm('这是你自己的藏点。翻开后你一定会被淘汰；如果这一翻带走所有剩余选手，你将获胜。确定要翻吗？')
      if (!ok) return
    }
    submitting.value = true
    sendAction({ type: 'search', spotId: spot.id })
    setTimeout(() => { submitting.value = false }, 400)
  }
}

function confirmHide() {
  if (!selectedSpotId.value || submitting.value) return
  submitting.value = true
  sendAction({ type: 'hide', spotId: selectedSpotId.value })
  selectedSpotId.value = ''
  setTimeout(() => { submitting.value = false }, 500)
}

function lastLogText(log: any): string {
  if (!log) return ''
  const prefix = log.auto ? '超时，' : ''
  if (log.found && log.found.length) {
    return `${prefix}${log.playerName} 在 ${log.roomName}·${log.spotName} 翻出了 ${log.found.map((f: any) => f.playerName).join('、')} 的卡牌！`
  }
  return `${prefix}${log.playerName} 翻遍了 ${log.roomName}·${log.spotName}，只有灰尘…`
}

function finalSpotNames(spot: any): string[] {
  if (spot.searched && spot.found && spot.found.length) {
    return spot.found.map((f: any) => f.playerName)
  }
  return allCards.value.filter((c: any) => c.spotId === spot.id).map((c: any) => c.playerName)
}

watch(finished, (val) => {
  if (val && winner.value) emit('finished', winner.value)
})

onMounted(() => { connect() })
onUnmounted(() => { disconnect() })
</script>

<style scoped>
.hide-and-go-veto { max-width: 1080px; margin: 0 auto; padding: 20px; text-align: center; }
.hgv-waiting, .hgv-finished { padding: 32px 16px; }
.hgv-finish-icon { font-size: 64px; margin-bottom: 12px; }
h2 { color: #ece7fb; margin: 0 0 10px; }
.hgv-waiting p { color: #8f83b8; font-size: 14px; line-height: 1.7; max-width: 680px; margin: 0 auto 8px; }
.hgv-rule-note { color: #e6c988 !important; font-size: 13px !important; }
.countdown-big { font-size: 72px; font-weight: 700; color: #b39bff; margin: 20px 0; animation: hgv-pulse 0.5s infinite; }
.hgv-waiting-text { color: #6b5f92; margin-top: 12px; }
@keyframes hgv-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
.hgv-winner { font-size: 26px; font-weight: 700; color: #e6c988; margin-bottom: 8px; }
.hgv-winner.none { color: #8f83b8; }
.hgv-finish-reason { color: #b9c6e6; font-size: 14px; margin-bottom: 16px; }
.hgv-final-stats { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px 18px; margin-bottom: 18px; color: #cfc4ea; font-size: 13px; }
.hgv-final-table { max-width: 860px; margin: 0 auto 18px; display: flex; flex-direction: column; gap: 4px; text-align: left; }
.hgv-final-head, .hgv-final-row { display: grid; grid-template-columns: 1.1fr 1.5fr 1.7fr 70px 70px; gap: 8px; align-items: center; padding: 7px 10px; font-size: 12.5px; }
.hgv-final-head { color: #8f83b8; border-bottom: 1px solid #ffffff12; font-size: 12px; }
.hgv-final-row { background: #17112a; border: 1px solid #ffffff0d; border-radius: 8px; color: #d6d0ea; }
.hgv-final-row.me { border-color: #b39bff55; }
.hgv-final-row.winner { border-color: #e6c988; background: #e6c98810; }
.hgv-final-row.out { opacity: 0.65; }
.hf-name { color: #ece7fb; font-weight: 600; }
.hf-spot { color: #b9c6e6; }
.hf-state { color: #b39bff; }
.hf-state.win { color: #e6c988; font-weight: 700; }
.hf-state.out { color: #ff8080; }
.hgv-me { font-size: 10px; color: #b39bff; background: #b39bff18; border-radius: 4px; padding: 0 5px; font-style: normal; margin-left: 4px; }
.hgv-final-house { max-width: 980px; margin: 0 auto; text-align: left; }
.hgv-final-room { margin-bottom: 10px; }
.hgv-final-spots { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
.hgv-final-spot { display: flex; flex-direction: column; gap: 2px; padding: 7px 8px; border-radius: 8px; background: #17112a; border: 1px solid #ffffff0d; font-size: 12px; color: #b9c6e6; }
.hgv-final-spot b { color: #e0d7ff; font-weight: 600; }
.hgv-final-spot em { font-style: normal; color: #e6c988; font-size: 11px; word-break: break-word; }
.hgv-final-spot em.dim { color: #4b416b; }
.hgv-final-spot.found { border-color: #ff6b6b44; background: #2a1118; }
.hgv-final-spot.empty { opacity: 0.7; }
.hgv-header { display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; color: #a99bd0; font-size: 13.5px; font-weight: 600; }
.hgv-phase { color: #b39bff; }
.hgv-timer { padding: 2px 10px; border-radius: 999px; background: #b39bff22; color: #b39bff; font-variant-numeric: tabular-nums; }
.hgv-timer.urgent { background: #ff444422; color: #ff8080; animation: hgv-pulse 0.8s infinite; }
.hgv-spectator { margin-bottom: 12px; padding: 10px 14px; background: #ff444415; border: 1px solid #ff444455; border-radius: 8px; color: #ff9a9a; font-size: 14px; }
.hgv-banner { display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap; background: #17112a; border: 1px solid #b39bff33; border-radius: 10px; padding: 11px 16px; margin-bottom: 14px; color: #d6e4ff; font-size: 14.5px; }
.hgv-banner.mine { border-color: #b39bff; background: #b39bff14; box-shadow: 0 0 24px rgba(179, 155, 255, 0.14); }
.hgv-banner strong { color: #b39bff; }
.hgv-progress-badge, .hgv-actions-badge { font-size: 11.5px; color: #e6c988; background: #e6c98812; border: 1px solid #e6c98833; border-radius: 999px; padding: 2px 9px; }
.hgv-house { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; text-align: left; }
.hgv-room { background: #150f28; border: 1px solid #ffffff10; border-radius: 10px; padding: 8px; }
.hgv-room-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; font-weight: 600; color: #cfc4ea; padding: 2px 4px 8px; }
.hgv-spots { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; }
.hgv-spot { display: flex; flex-direction: column; gap: 2px; min-height: 68px; padding: 7px 8px; border-radius: 8px; border: 1px solid #ffffff12; background: #1b1433; color: #ece7fb; text-align: left; cursor: default; transition: all 0.15s ease; }
.hgv-spot.clickable { cursor: pointer; border-color: #b39bff44; }
.hgv-spot.clickable:hover { border-color: #b39bff; background: #251b46; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(179, 155, 255, 0.14); }
.hgv-spot.selected { border-color: #e6c988; background: #2a2415; box-shadow: 0 0 18px rgba(230, 201, 136, 0.18); }
.hgv-spot.mine { border-color: #e6c98866; }
.hgv-spot.searched { background: #100c1d; border-color: #ffffff0a; }
.hgv-spot.found { background: #2a1118; border-color: #ff6b6b44; }
.hgv-spot.empty { opacity: 0.75; }
.hgv-spot-top { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
.hgv-spot-icon { font-size: 17px; line-height: 1; }
.hgv-mine-tag { font-size: 9.5px; color: #e6c988; background: #e6c98818; border-radius: 4px; padding: 0 4px; }
.hgv-spot-name { font-size: 12px; font-weight: 600; color: #e0d7ff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hgv-spot-note { font-size: 10.5px; color: #ff9a9a; min-height: 13px; word-break: break-word; }
.hgv-spot-note.mine { color: #e6c988; }
.hgv-spot-note.dim { color: #4b416b; }
.hgv-spot-note.found { color: #ff9a9a; font-weight: 600; }
.hgv-hide-bar { display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.hgv-confirm { padding: 9px 22px; border-radius: 8px; border: 1px solid #b39bff; background: #b39bff22; color: #ece7fb; font-size: 14px; font-weight: 600; cursor: pointer; }
.hgv-confirm:disabled { opacity: 0.45; cursor: not-allowed; }
.hgv-confirm:not(:disabled):hover { background: #b39bff33; }
.hgv-hide-hint { font-size: 11.5px; color: #6b5f92; }
.hgv-last { max-width: 760px; margin: 0 auto 14px; padding: 9px 14px; border-radius: 8px; font-size: 13.5px; }
.hgv-last.found { background: #ff444414; border: 1px solid #ff444444; color: #ffb0b0; }
.hgv-last.empty { background: #4488ff10; border: 1px solid #4488ff33; color: #a8c8ff; }
.hgv-lower { display: grid; grid-template-columns: minmax(220px, 0.8fr) minmax(280px, 1.2fr); gap: 12px; text-align: left; }
.hgv-panel { background: #150f28; border: 1px solid #ffffff0d; border-radius: 10px; padding: 10px 12px; }
.hgv-section-title { font-size: 12.5px; font-weight: 600; color: #b39bff; margin-bottom: 8px; }
.hgv-player-list { display: flex; flex-wrap: wrap; gap: 6px; }
.hgv-player { display: flex; align-items: center; gap: 6px; padding: 5px 9px; border-radius: 999px; background: #1b1433; border: 1px solid #ffffff10; font-size: 12px; color: #d6d0ea; }
.hgv-player.me { border-color: #b39bff66; }
.hgv-player.out { opacity: 0.55; }
.hgv-me-tag { font-size: 9.5px; padding: 0 4px; border-radius: 4px; background: #b39bff22; color: #b39bff; }
.hgv-player-state { color: #8f83b8; font-size: 11px; }
.hgv-player-state.out { color: #ff8080; }
.hgv-player-state.win { color: #e6c988; }
.hgv-log-list { max-height: 230px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.hgv-log-row { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 6px; background: #ffffff05; font-size: 12px; color: #b9c6e6; }
.hgv-log-row.found { background: #ff444410; }
.hgv-log-place { min-width: 110px; color: #e0d7ff; }
.hgv-log-by { min-width: 54px; color: #8f83b8; }
.hgv-log-result { flex: 1; word-break: break-word; }
.hgv-auto { font-style: normal; color: #e6c988; font-size: 10px; margin-left: 6px; }
.hgv-empty { color: #4b416b; font-size: 12px; text-align: center; padding: 12px; }
.hgv-destruction { margin-top: 12px; text-align: left; }
.hgv-destruction-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; color: #b9c6e6; margin-bottom: 5px; }
.hgv-destruction-bar { height: 8px; background: #ffffff12; border-radius: 4px; overflow: hidden; }
.hgv-destruction-fill { height: 100%; background: linear-gradient(90deg, #b39bff, #ff6b6b); transition: width 0.3s ease; }
@media (max-width: 760px) {
  .hide-and-go-veto { padding: 10px; }
  .hgv-house { grid-template-columns: 1fr; }
  .hgv-lower { grid-template-columns: 1fr; }
  .hgv-final-head, .hgv-final-row { grid-template-columns: 1fr 1fr; }
  .hgv-final-head span:nth-child(4), .hgv-final-head span:nth-child(5), .hgv-final-row span:nth-child(4), .hgv-final-row span:nth-child(5) { display: none; }
}
</style>
