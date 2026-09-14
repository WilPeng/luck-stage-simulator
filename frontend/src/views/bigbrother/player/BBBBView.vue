<template>
  <div class="bbbb-player">
    <div class="page-header">
      <h1>🎯 BBBB</h1>
      <span class="round-tag">第{{ roundNum }}周</span>
    </div>

    <div class="rule-bar">
      3 名被提名人进行比赛：胜者安全，其余 2 人进入淘汰投票。
    </div>

    <!-- 比赛进行中：渲染小游戏 -->
    <div v-if="gameComponent" class="minigame-section">
      <component :is="gameComponent" :roomId="activeRoom.roomId" :participants="activeRoom.participants" :gameTitle="activeRoom.minigameName" @finished="onMinigameFinished" />
    </div>

    <div class="card">
      <div class="card-title">被提名人（{{ nominees.length }}）</div>
      <div class="nominee-list">
        <div v-for="n in nominees" :key="n.id" class="nominee" :class="{ safe: bbbbWinnerId === n.id, me: n.id === myId }">
          <BBAvatar :name="n.name" :avatar="n.avatar" size="sm" />
          <span class="nominee-name">{{ n.name }}<span v-if="n.id === myId" class="me-badge">我</span></span>
          <span v-if="bbbbWinnerId === n.id" class="safe-badge">安全</span>
        </div>
        <div v-if="!nominees.length" class="muted">暂无提名</div>
      </div>
      <div v-if="bbbbWinnerId" class="result-note">
        本轮 BBBB 已结束，安全者：{{ winnerName }}
      </div>
    </div>

    <div v-if="!gameComponent" class="waiting">等待管理员开启 BBBB 比赛…</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, markRaw, type Component } from 'vue'
import { useRoute } from 'vue-router'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import { bbGetCurrentNomination, bbGetActiveMinigameRoom, bbSetBbbbWinner } from '../../../services/bbApi'
import BBAvatar from '../../../components/bigbrother/BBAvatar.vue'
import ClickSpeedGame from '../../../components/bigbrother/minigames/ClickSpeedGame.vue'
import MemoryMatchGame from '../../../components/bigbrother/minigames/MemoryMatchGame.vue'
import QuickMathGame from '../../../components/bigbrother/minigames/QuickMathGame.vue'
import BalanceBarGame from '../../../components/bigbrother/minigames/BalanceBarGame.vue'
import DiceDuelGame from '../../../components/bigbrother/minigames/DiceDuelGame.vue'
import PowerChallengeGame from '../../../components/bigbrother/minigames/PowerChallengeGame.vue'
import KlotskiGame from '../../../components/bigbrother/minigames/KlotskiGame.vue'
import SwingPointerGame from '../../../components/bigbrother/minigames/SwingPointerGame.vue'
import MinorityGame from '../../../components/bigbrother/minigames/MinorityGame.vue'
import SpotDifferenceGame from '../../../components/bigbrother/minigames/SpotDifferenceGame.vue'
import ReactionGame from '../../../components/bigbrother/minigames/ReactionGame.vue'
import SequenceMemoryGame from '../../../components/bigbrother/minigames/SequenceMemoryGame.vue'
import CustomGamePlayer from '../../../components/bigbrother/minigames/CustomGamePlayer.vue'

const route = useRoute()
const authStore = useBbAuthStore()
const roundNum = computed(() => Number(route.params.round) || 1)
const myId = computed(() => authStore.currentUser?.id || '')

const nominees = ref<any[]>([])
const bbbbWinnerId = ref<string | null>(null)
const bbbbWinnerName = ref('')
const activeRoom = ref<any>(null)
const gameComponent = ref<Component | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

const winnerName = computed(() => bbbbWinnerName.value || nominees.value.find(n => n.id === bbbbWinnerId.value)?.name || '')

const gameComponentMap: Record<string, Component> = {
  'click-speed': markRaw(ClickSpeedGame),
  'memory-match': markRaw(MemoryMatchGame),
  'quick-math': markRaw(QuickMathGame),
  'balance-bar': markRaw(BalanceBarGame),
  'dice-duel': markRaw(DiceDuelGame),
  'power-challenge': markRaw(PowerChallengeGame),
  'klotski': markRaw(KlotskiGame),
  'swing-pointer': markRaw(SwingPointerGame),
  'minority': markRaw(MinorityGame),
  'spot-difference': markRaw(SpotDifferenceGame),
  'reaction': markRaw(ReactionGame),
  'sequence-memory': markRaw(SequenceMemoryGame)
}

async function fetchData() {
  try {
    const nom = await bbGetCurrentNomination()
    nominees.value = (nom?.nomineeIds || []).map((id: string, i: number) => ({
      id, name: nom.nomineeNames?.[i] || id, avatar: null
    }))
    bbbbWinnerId.value = nom?.bbbbWinnerId || null
    bbbbWinnerName.value = nom?.bbbbWinnerName || ''
  } catch {}

  try {
    const room = await bbGetActiveMinigameRoom('bbbb')
    activeRoom.value = room
    if (room && room.status !== 'finished' && (room.participants || []).some((p: any) => p.playerId === myId.value)) {
      if (room.minigameId?.startsWith('custom-')) gameComponent.value = markRaw(CustomGamePlayer)
      else gameComponent.value = gameComponentMap[room.minigameId] || null
    } else {
      gameComponent.value = null
    }
  } catch {}
}

async function onMinigameFinished(winner: { playerId: string; playerName: string }) {
  try {
    await bbSetBbbbWinner(winner.playerId, winner.playerName)
    await fetchData()
  } catch (e) { console.error(e) }
}

onMounted(() => {
  fetchData()
  pollTimer = setInterval(fetchData, 2500)
})
onUnmounted(() => { if (pollTimer) clearInterval(pollTimer) })
</script>

<style scoped>
.bbbb-player { max-width: 800px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.page-header h1 { font-size: 22px; color: #e0e0e0; margin: 0; }
.round-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; }
.rule-bar { background: #ffaa0014; border: 1px solid #ffaa0044; color: #ffaa00; border-radius: 10px; padding: 12px 18px; margin-bottom: 16px; font-size: 13px; }
.minigame-section { margin-bottom: 16px; background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 12px; overflow: hidden; }
.card { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 16px 20px; }
.card-title { font-size: 15px; color: #e0e0e0; font-weight: 600; margin-bottom: 12px; }
.nominee-list { display: flex; flex-direction: column; gap: 8px; }
.nominee { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #ffffff06; border-radius: 8px; }
.nominee.safe { border: 1px solid #00ff88; }
.nominee.me { background: #00ff8812; }
.nominee-name { flex: 1; color: #ddd; }
.me-badge { background: #00ff88; color: #000; border-radius: 8px; font-size: 11px; padding: 1px 8px; margin-left: 6px; }
.safe-badge { color: #00ff88; font-size: 12px; }
.muted { color: #666; font-size: 13px; }
.result-note { margin-top: 10px; color: #00ff88; font-size: 13px; }
.waiting { text-align: center; color: #666; padding: 24px; }
</style>
