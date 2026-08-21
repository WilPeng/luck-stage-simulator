<template>
  <div class="bb-veto-player">
    <div class="page-header">
      <h1>否决权竞争</h1>
      <span class="round-tag">第{{ roundNum }}周</span>
      <span v-if="isHistory" class="history-tag">历史记录</span>
      <span v-else-if="isFuture" class="future-tag">未开始</span>
    </div>

    <!-- 小游戏模式 -->
    <div v-if="showMinigame" class="minigame-section">
      <component :is="gameComponent" :roomId="activeRoom.roomId"
        :participants="activeRoom.participants" @finished="onMinigameFinished" />
    </div>

    <!-- 已有结果 -->
    <div v-else-if="veto" class="veto-card">
      <div class="veto-icon">🛡️</div>
      <div class="veto-info">
        <div class="veto-label">否决权获得者</div>
        <div class="veto-winner">{{ veto.winnerName || '暂无获胜者' }}</div>
        <div v-if="isMe(veto.winnerName)" class="me-badge">恭喜你赢得了否决权！</div>
      </div>
    </div>

    <!-- 等待中 -->
    <div v-else class="veto-card empty">
      <p>否决权竞争尚未进行，等待管理员开始</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, markRaw, type Component } from 'vue'
import { useRoute } from 'vue-router'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import { useBbSeasonStore } from '../../../stores/bbSeasonStore'
import { bbGetVetoHistory, bbGetActiveMinigameRoom, bbRunVetoCompetition } from '../../../services/bbApi'
import ClickSpeedGame from '../../../components/bigbrother/minigames/ClickSpeedGame.vue'
import MemoryMatchGame from '../../../components/bigbrother/minigames/MemoryMatchGame.vue'
import QuickMathGame from '../../../components/bigbrother/minigames/QuickMathGame.vue'
import BalanceBarGame from '../../../components/bigbrother/minigames/BalanceBarGame.vue'
import DiceDuelGame from '../../../components/bigbrother/minigames/DiceDuelGame.vue'
import type { BBVetoRecord, MinigameRoom } from '../../../types/bigbrother'

const route = useRoute()
const authStore = useBbAuthStore()
const seasonStore = useBbSeasonStore()

const roundNum = computed(() => Number(route.params.round) || 1)
const isHistory = computed(() => seasonStore.isStageCompleted(roundNum.value, 'veto_competition'))
const isFuture = computed(() => seasonStore.getStageStatus(roundNum.value, 'veto_competition') === 'future')
const veto = ref<BBVetoRecord | null>(null)
const activeRoom = ref<MinigameRoom | null>(null)
const gameComponent = ref<Component | null>(null)

const myId = computed(() => authStore.currentUser?.id || '')
const myName = computed(() => authStore.currentUser?.name || '')

const showMinigame = computed(() => {
  if (!activeRoom.value || activeRoom.value.status === 'finished') return false
  if (!activeRoom.value.participants) return false
  return activeRoom.value.participants.some(p => p.playerId === myId.value)
})

const gameComponentMap: Record<string, Component> = {
  'click-speed': markRaw(ClickSpeedGame),
  'memory-match': markRaw(MemoryMatchGame),
  'quick-math': markRaw(QuickMathGame),
  'balance-bar': markRaw(BalanceBarGame),
  'dice-duel': markRaw(DiceDuelGame)
}

function isMe(name: string): boolean { return name === myName.value }

async function onMinigameFinished(winner: { playerId: string; playerName: string }) {
  try {
    const result = await bbRunVetoCompetition({
      winnerId: winner.playerId,
      winnerName: winner.playerName,
      minigameId: activeRoom.value?.minigameId || '',
      scores: {}
    })
    veto.value = result as any
    activeRoom.value = null
  } catch (e: any) {
    console.error('记录 Veto 结果失败:', e)
  }
}

onMounted(async () => {
  // 加载 Veto 历史
  try {
    const history = await bbGetVetoHistory()
    const roundKey = `round-${roundNum.value}`
    veto.value = history.find(h => h.roundId === roundKey) || null
  } catch {}

  // 检查活跃的小游戏房间（初始 + 轮询）
  let pollTimer: ReturnType<typeof setInterval> | null = null

  const checkRoom = async () => {
    // 已有结果或房间已结束，停止轮询
    if (veto.value || activeRoom.value?.status === 'finished') {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
      return
    }
    try {
      const room = await bbGetActiveMinigameRoom('veto')
      if (room) {
        activeRoom.value = room
        gameComponent.value = gameComponentMap[room.minigameId] || null
        if (room.status === 'finished' && pollTimer) {
          clearInterval(pollTimer)
          pollTimer = null
        }
      }
    } catch {}
  }

  // 首次检查
  await checkRoom()
  // 每2秒轮询，直到房间出现或已有结果
  if (!veto.value && (!activeRoom.value || activeRoom.value.status !== 'finished')) {
    pollTimer = setInterval(checkRoom, 2000)
  }

  onUnmounted(() => {
    if (pollTimer) clearInterval(pollTimer)
  })
})
</script>

<style scoped>
.bb-veto-player { max-width: 600px; margin: 0 auto; padding: 16px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #00ff8844; }
.history-tag { background: #88888822; color: #aaa; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #88888844; }
.future-tag { background: #44444422; color: #666; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #44444444; }
.minigame-section { margin-bottom: 20px; background: #0f0f2e; border: 1px solid #ffaa0033; border-radius: 12px; overflow: hidden; }
.veto-card { background: linear-gradient(135deg, #0f0f2e, #1a1a3e); border: 1px solid #ffaa00; border-radius: 12px; padding: 24px; display: flex; align-items: center; gap: 20px; margin-top: 16px; }
.veto-card.empty { border-color: #444; }
.veto-card.empty p { text-align: center; color: #666; width: 100%; margin: 0; }
.veto-icon { font-size: 48px; }
.veto-label { font-size: 12px; color: #888; text-transform: uppercase; }
.veto-winner { font-size: 20px; font-weight: 700; color: #ffaa00; }
.me-badge { display: inline-block; margin-top: 8px; background: #00ff88; color: #000; padding: 4px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; }
</style>
