<template>
  <div class="bb-hoh-player">
    <div class="page-header">
      <h1>HOH 竞争</h1>
      <span class="round-tag">第{{ roundNum }}周</span>
      <span v-if="isHistory" class="history-tag">历史记录</span>
      <span v-else-if="isFuture" class="future-tag">未开始</span>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <span>加载中...</span>
    </div>

    <!-- 小游戏模式：有活跃房间且玩家在参与者中 -->
    <div v-else-if="showMinigame" class="minigame-section">
      <component :is="gameComponent" :roomId="activeRoom.roomId"
        :participants="activeRoom.participants" @finished="onMinigameFinished" />
    </div>

    <!-- 已有结果 -->
    <div v-else-if="currentHoh" class="hoh-announcement">
      <div class="hoh-card" :class="{ 'is-me': isMe(currentHoh.winnerName) }">
        <div class="hoh-crown">👑</div>
        <div class="hoh-body">
          <div class="hoh-label">一家之主（HOH）</div>
          <div class="hoh-name">
            {{ currentHoh.winnerName }}
            <span v-if="isMe(currentHoh.winnerName)" class="me-badge">我</span>
          </div>
          <div class="hoh-desc" v-if="!isHistory">
            {{ isMe(currentHoh.winnerName) ? '恭喜！你是本周的 HOH，请前往提名页面选择两名被提名人。' : `${currentHoh.winnerName} 成为了本周的 HOH，将负责提名两名房客面临淘汰。` }}
          </div>
        </div>
      </div>
    </div>

    <!-- 上一轮 HOH 不能连任 -->
    <div v-else-if="isPrevHoh" class="hoh-card prev-hoh">
      <div class="hoh-crown">👑</div>
      <div class="hoh-body">
        <div class="hoh-label">不能连任</div>
        <div class="hoh-hint">你上一轮是 HOH，不能参加本轮 HOH 竞争，请等待 HOH 竞争结果。</div>
      </div>
    </div>

    <!-- 等待中 -->
    <div v-else class="hoh-card pending">
      <div class="hoh-crown">👑</div>
      <div class="hoh-body">
        <div class="hoh-label">HOH 竞争尚未进行</div>
        <div class="hoh-hint">等待管理员开启 HOH 竞争</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, markRaw, type Component } from 'vue'
import { useRoute } from 'vue-router'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import { useBbSeasonStore } from '../../../stores/bbSeasonStore'
import { bbGetHohHistory, bbGetActiveMinigameRoom, bbRunHohCompetition, bbGetHohEligible } from '../../../services/bbApi'
import ClickSpeedGame from '../../../components/bigbrother/minigames/ClickSpeedGame.vue'
import MemoryMatchGame from '../../../components/bigbrother/minigames/MemoryMatchGame.vue'
import QuickMathGame from '../../../components/bigbrother/minigames/QuickMathGame.vue'
import BalanceBarGame from '../../../components/bigbrother/minigames/BalanceBarGame.vue'
import DiceDuelGame from '../../../components/bigbrother/minigames/DiceDuelGame.vue'
import CustomGamePlayer from '../../../components/bigbrother/minigames/CustomGamePlayer.vue'
import type { BBHohRecord, MinigameRoom } from '../../../types/bigbrother'

const route = useRoute()
const authStore = useBbAuthStore()
const seasonStore = useBbSeasonStore()

const roundNum = computed(() => Number(route.params.round) || 1)
const isHistory = computed(() => seasonStore.isStageCompleted(roundNum.value, 'hoh_competition'))
const isFuture = computed(() => seasonStore.getStageStatus(roundNum.value, 'hoh_competition') === 'future')
const isCurrentRound = computed(() => roundNum.value === seasonStore.currentRoundNumber)

const currentHoh = ref<BBHohRecord | null>(null)
const activeRoom = ref<MinigameRoom | null>(null)
const gameComponent = ref<Component | null>(null)
const loading = ref(true)
const isPrevHoh = ref(false)

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

function isMe(name: string): boolean {
  return name === myName.value
}

async function onMinigameFinished(winner: { playerId: string; playerName: string }) {
  // 通知后端记录获胜者
  try {
    const result = await bbRunHohCompetition({
      winnerId: winner.playerId,
      winnerName: winner.playerName,
      minigameId: activeRoom.value?.minigameId || '',
      scores: {}
    })
    currentHoh.value = result
    activeRoom.value = null
  } catch (e: any) {
    console.error('记录 HOH 结果失败:', e)
  }
}

onMounted(async () => {
  // 加载 HOH 历史
  try {
    const history = await bbGetHohHistory()
    const roundKey = `round-${roundNum.value}`
    currentHoh.value = history.find(h => h.roundId === roundKey) || null
  } catch {}

  // 检查当前用户是否为上一轮 HOH（不能连任）
  if (!currentHoh.value && isCurrentRound.value) {
    try {
      const eligible = await bbGetHohEligible()
      if (eligible.excludedHoh && eligible.excludedHoh.id === myId.value) {
        isPrevHoh.value = true
      }
    } catch {}
  }

  // 检查活跃的小游戏房间（初始 + 轮询）
  let pollTimer: ReturnType<typeof setInterval> | null = null

  const checkRoom = async () => {
    // 已有结果或房间已结束，停止轮询
    if (currentHoh.value || activeRoom.value?.status === 'finished') {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
      return
    }
    try {
      const room = await bbGetActiveMinigameRoom('hoh')
      if (room) {
        activeRoom.value = room
        if (room.minigameId?.startsWith('custom-')) {
          gameComponent.value = markRaw(CustomGamePlayer)
        } else {
          gameComponent.value = gameComponentMap[room.minigameId] || null
        }
        // 房间已存在，可以停止轮询（后续由小游戏组件的 socket 处理）
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
  if (!currentHoh.value && (!activeRoom.value || activeRoom.value.status !== 'finished')) {
    pollTimer = setInterval(checkRoom, 2000)
  }

  loading.value = false

  onUnmounted(() => {
    if (pollTimer) clearInterval(pollTimer)
  })
})
</script>

<style scoped>
.bb-hoh-player { max-width: 600px; margin: 0 auto; padding: 16px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #00ff8844; }
.history-tag { background: #88888822; color: #aaa; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #88888844; }
.future-tag { background: #44444422; color: #666; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #44444444; }
.minigame-section { margin-bottom: 20px; background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 12px; overflow: hidden; }
.hoh-announcement { animation: fadeIn 0.4s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.hoh-card { background: linear-gradient(135deg, #0f0f2e, #1a1a3e); border: 1px solid #444; border-radius: 16px; padding: 32px 24px; display: flex; align-items: center; gap: 20px; }
.hoh-card.is-me { border-color: #00ff88; background: linear-gradient(135deg, #0a1a0a, #0f2e1a); box-shadow: 0 0 20px rgba(0, 255, 136, 0.1); }
.hoh-card.pending { border-color: #444; }
.hoh-card.prev-hoh { border-color: #ffaa0044; opacity: 0.8; }
.hoh-crown { font-size: 56px; flex-shrink: 0; }
.hoh-body { flex: 1; }
.hoh-label { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
.hoh-name { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
.hoh-card:not(.is-me) .hoh-name { color: #ffaa00; }
.hoh-card.is-me .hoh-name { color: #00ff88; }
.me-badge { background: #00ff88; color: #000; padding: 2px 12px; border-radius: 8px; font-size: 13px; font-weight: 600; margin-left: 8px; vertical-align: middle; }
.hoh-desc { font-size: 14px; line-height: 1.6; }
.hoh-card:not(.is-me) .hoh-desc { color: #aaa; }
.hoh-card.is-me .hoh-desc { color: #00ff88cc; }
.hoh-hint { color: #666; font-size: 14px; margin-top: 8px; }
.loading-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 20px; color: #888; font-size: 14px; }
.loading-spinner { width: 32px; height: 32px; border: 3px solid #00ff8822; border-top-color: #00ff88; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
