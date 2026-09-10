<template>
  <div class="bb-veto-player">
    <div class="page-header">
      <h1>否决权竞争</h1>
      <span class="round-tag">第{{ roundNum }}周</span>
      <span v-if="isHistory" class="history-tag">历史记录</span>
      <span v-else-if="isFuture" class="future-tag">未开始</span>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <span>加载中...</span>
    </div>

    <!-- 小游戏模式 -->
    <div v-else-if="showMinigame" class="minigame-section">
      <component :is="gameComponent" :roomId="activeRoom.roomId"
        :participants="activeRoom.participants" @finished="onMinigameFinished" />
    </div>

    <!-- 等待进入比赛：room 已创建且我是参与者，但尚未开始 -->
    <div v-else-if="activeRoom && isParticipant" class="veto-card empty">
      <p>🎮 否决权比赛房间已就绪，等待管理员开始比赛...</p>
    </div>

    <!-- 已有结果 -->
    <template v-else-if="veto">
      <!-- 所有参与者展示 -->
      <div v-if="veto.participants && veto.participants.length > 0" class="participants-section">
        <div class="section-title">
          <span class="section-icon">🎲</span>
          <span>POV 参与者（{{ veto.participants.length }}人）</span>
          <span v-if="veto.winnerId" class="has-winner-tag">已有获胜者</span>
        </div>
        <div class="participant-grid">
          <div v-for="p in veto.participants" :key="p.playerId" class="participant-card"
            :class="{
              winner: p.playerId === veto.winnerId,
              hoh: p.playerId === hohId,
              nominee: nomineeIds.includes(p.playerId),
              picked: p.source === 'picked',
              self: p.playerId === myId
            }">
            <div class="p-avatar-wrap">
              <span class="p-avatar">{{ (p.playerName || '?').charAt(0) }}</span>
              <span v-if="p.playerId === veto.winnerId" class="p-crown">🏆</span>
            </div>
            <div class="p-name">{{ p.playerName }}</div>
            <div class="p-tags">
              <span v-if="p.playerId === hohId" class="p-tag hoh-tag">HOH</span>
              <span v-if="nomineeIds.includes(p.playerId)" class="p-tag nom-tag">提名</span>
              <span v-if="p.source === 'drawn'" class="p-tag drawn-tag">抽中</span>
              <span v-if="p.source === 'picked'" class="p-tag picked-tag">
                自选自 {{ getPickerName(p.pickedBy) }}
              </span>
              <span v-if="p.source === 'default' && p.playerId !== hohId && !nomineeIds.includes(p.playerId)" class="p-tag default-tag">必定</span>
              <span v-if="p.playerId === veto.winnerId" class="p-tag winner-tag">🏆 获胜者</span>
              <span v-if="p.playerId === myId" class="p-tag self-tag">我</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 获胜者展示 -->
      <div v-if="veto.winnerId" class="veto-card winner-card">
        <div class="veto-icon">🛡️</div>
        <div class="veto-info">
          <div class="veto-label">否决权获得者</div>
          <div class="veto-winner">{{ veto.winnerName }}</div>
          <div v-if="isMe(veto.winnerName)" class="me-badge">恭喜你赢得了否决权！</div>
        </div>
      </div>
    </template>

    <!-- 自选区域：仅 HOH/被抽中的提名者可见 -->
    <div v-if="showPickSection" class="pick-section">
      <div class="pick-header">
        <span class="pick-icon">🎯</span>
        <div class="pick-header-text">
          <div class="pick-title">你被抽中参加 POV，请选择一名房客加入！</div>
          <div class="pick-subtitle">作为 {{ myPickRole === 'hoh' ? 'HOH' : '被提名者' }}，你可以额外选 1 人参加否决权竞争</div>
        </div>
      </div>
      <div v-if="myPickedPlayer" class="pick-done">
        <span class="pick-done-icon">✅</span>
        <span>你已选择：<strong>{{ myPickedPlayer }}</strong></span>
      </div>
      <div v-else class="pick-form">
        <select v-model="selectedPickId" class="pick-select">
          <option value="">-- 请选择一名房客 --</option>
          <option v-for="opt in pickableOptions" :key="opt.playerId" :value="opt.playerId">
            {{ opt.playerName }}
          </option>
        </select>
        <button class="bb-btn bb-btn-pick" :disabled="!selectedPickId || picking" @click="confirmPick">
          {{ picking ? '确认中...' : '确认自选' }}
        </button>
      </div>
    </div>

    <!-- 等待中 -->
    <div v-if="!veto && !activeRoom" class="veto-card empty">
      <p>否决权竞争尚未进行，等待管理员开始</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, markRaw, type Component } from 'vue'
import { useRoute } from 'vue-router'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import { useBbSeasonStore } from '../../../stores/bbSeasonStore'
import { bbGetVetoHistory, bbGetActiveMinigameRoom, bbRunVetoCompetition, bbGetCurrentHoh, bbGetCurrentNomination, bbPickVetoParticipant, bbGetVetoPickable } from '../../../services/bbApi'
import ClickSpeedGame from '../../../components/bigbrother/minigames/ClickSpeedGame.vue'
import MemoryMatchGame from '../../../components/bigbrother/minigames/MemoryMatchGame.vue'
import QuickMathGame from '../../../components/bigbrother/minigames/QuickMathGame.vue'
import BalanceBarGame from '../../../components/bigbrother/minigames/BalanceBarGame.vue'
import DiceDuelGame from '../../../components/bigbrother/minigames/DiceDuelGame.vue'
import KlotskiGame from '../../../components/bigbrother/minigames/KlotskiGame.vue'
import SwingPointerGame from '../../../components/bigbrother/minigames/SwingPointerGame.vue'
import MinorityGame from '../../../components/bigbrother/minigames/MinorityGame.vue'
import SpotDifferenceGame from '../../../components/bigbrother/minigames/SpotDifferenceGame.vue'
import ReactionGame from '../../../components/bigbrother/minigames/ReactionGame.vue'
import SequenceMemoryGame from '../../../components/bigbrother/minigames/SequenceMemoryGame.vue'
import CustomGamePlayer from '../../../components/bigbrother/minigames/CustomGamePlayer.vue'
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
const hohId = ref('')
const nomineeIds = ref<string[]>([])
const pickablePlayers = ref<{ playerId: string; playerName: string }[]>([])
const loading = ref(true)

const myId = computed(() => authStore.currentUser?.id || '')
const myName = computed(() => authStore.currentUser?.name || '')

const isParticipant = computed(() => {
  if (!activeRoom.value?.participants) return false
  return activeRoom.value.participants.some(p => p.playerId === myId.value)
})

const showMinigame = computed(() => {
  if (!activeRoom.value || activeRoom.value.status === 'finished') return false
  if (!activeRoom.value.participants) return false
  return isParticipant.value
})

const gameComponentMap: Record<string, Component> = {
  'click-speed': markRaw(ClickSpeedGame),
  'memory-match': markRaw(MemoryMatchGame),
  'quick-math': markRaw(QuickMathGame),
  'balance-bar': markRaw(BalanceBarGame),
  'dice-duel': markRaw(DiceDuelGame),
  'klotski': markRaw(KlotskiGame),
  'swing-pointer': markRaw(SwingPointerGame),
  'minority': markRaw(MinorityGame),
  'spot-difference': markRaw(SpotDifferenceGame),
  'reaction': markRaw(ReactionGame),
  'sequence-memory': markRaw(SequenceMemoryGame)
}

function isMe(name: string): boolean { return name === myName.value }

// ===== 自选逻辑 =====
const selectedPickId = ref('')
const picking = ref(false)

// 当前用户是否为可自选的 HOH/被抽中的提名者（通过 API 判断）
const myCanPick = computed(() => {
  return pickablePlayers.value.length > 0
})

const myPickRole = computed<'hoh' | 'nominee' | ''>(() => {
  if (myId.value === hohId.value) return 'hoh'
  if (nomineeIds.value.includes(myId.value)) return 'nominee'
  return ''
})

// 我已经自选了谁
const myPickedPlayer = computed(() => {
  if (!veto.value || !myCanPick.value) return ''
  const picked = veto.value.participants?.find(p => p.source === 'picked' && p.pickedBy === myId.value)
  return picked?.playerName || ''
})

// 可选池：从 API 获取
const pickableOptions = computed(() => {
  return pickablePlayers.value
})

function getPickerName(pickedBy?: string): string {
  if (!pickedBy) return ''
  const p = veto.value?.participants?.find(pp => pp.playerId === pickedBy)
  return p?.playerName || ''
}

async function confirmPick() {
  if (!selectedPickId.value || picking.value || !myCanPick.value) return
  picking.value = true
  try {
    const result = await bbPickVetoParticipant(myId.value, selectedPickId.value) as any
    veto.value = result as BBVetoRecord
    selectedPickId.value = ''
    // 刷新 pickable 数据
    await loadPickable()
  } catch (e: any) {
    alert(e?.message || '自选失败')
  } finally {
    picking.value = false
  }
}

async function loadPickable() {
  try {
    const res = await bbGetVetoPickable()
    if (res.canPick) {
      pickablePlayers.value = res.pickablePlayers || []
    } else {
      pickablePlayers.value = []
    }
  } catch {}
}

// 显示自选区域的条件：从 API 获取 canPick 信息
const showPickSection = computed(() => {
  if (pickablePlayers.value.length === 0) return false
  if (myPickedPlayer.value) return false  // 已选过
  if (veto.value?.winnerId) return false  // 已有获胜者
  if (activeRoom.value) return false      // 已进入小游戏
  return true
})

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

// 加载 HOH 和提名信息
async function loadHohAndNom() {
  try {
    const hoh = await bbGetCurrentHoh()
    hohId.value = (hoh as any)?.winnerId || ''
  } catch {}
  try {
    const nom = await bbGetCurrentNomination()
    nomineeIds.value = (nom as any)?.nomineeIds || []
  } catch {}
}

onMounted(async () => {
  // 加载 Veto 历史
  try {
    const history = await bbGetVetoHistory()
    const roundKey = `round-${roundNum.value}`
    const rec = history.find(h => h.roundId === roundKey)
    if (rec && rec.winnerId) veto.value = rec
    // 即使没有获胜者，也加载参与者列表（如果有）
    if (rec && !rec.winnerId && rec.participants?.length) veto.value = rec
  } catch {}

  await loadHohAndNom()
  await loadPickable()

  // 检查活跃的小游戏房间
  let pollTimer: ReturnType<typeof setInterval> | null = null

  const checkRoom = async () => {
    try {
      const room = await bbGetActiveMinigameRoom('veto')
      if (room) {
        activeRoom.value = room
        if (room.minigameId?.startsWith('custom-')) {
          gameComponent.value = markRaw(CustomGamePlayer)
        } else {
          gameComponent.value = gameComponentMap[room.minigameId] || null
        }
      } else {
        activeRoom.value = null
      }
    } catch {}

    if (veto.value?.winnerId) {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
      return
    }
  }

  await checkRoom()
  if (!veto.value?.winnerId) {
    pollTimer = setInterval(checkRoom, 2000)
  }

  // 如果需要自选，轮询 veto 记录以获取最新状态
  let pickPollTimer: ReturnType<typeof setInterval> | null = null
  if (!veto.value?.winnerId && !activeRoom.value) {
    pickPollTimer = setInterval(async () => {
      try {
        const history = await bbGetVetoHistory()
        const roundKey = `round-${roundNum.value}`
        const rec = history.find(h => h.roundId === roundKey)
        if (rec) veto.value = rec
      } catch {}
      // 同时刷新 pickable 数据
      await loadPickable()
    }, 3000)
  }

  loading.value = false

  onUnmounted(() => {
    if (pollTimer) clearInterval(pollTimer)
    if (pickPollTimer) clearInterval(pickPollTimer)
  })
})
</script>

<style scoped>
.bb-veto-player { max-width: 700px; margin: 0 auto; padding: 16px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #00ff8844; }
.history-tag { background: #88888822; color: #aaa; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #88888844; }
.future-tag { background: #44444422; color: #666; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #44444444; }
.loading-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 20px; color: #888; font-size: 14px; }
.loading-spinner { width: 32px; height: 32px; border: 3px solid #00ff8822; border-top-color: #00ff88; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.minigame-section { margin-bottom: 20px; background: #0f0f2e; border: 1px solid #ffaa0033; border-radius: 12px; overflow: hidden; }

/* 参与者展示区 */
.participants-section {
  background: linear-gradient(135deg, #0f0f2e, #1a1a3e);
  border: 1px solid #00ff8822;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
}
.section-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 15px; font-weight: 600; color: #e0e0e0; margin-bottom: 16px;
}
.section-icon { font-size: 18px; }
.has-winner-tag { margin-left: auto; font-size: 11px; color: #ffaa00; background: #ffaa0015; padding: 2px 10px; border-radius: 8px; }

.participant-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}
.participant-card {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 12px 8px;
  background: #0a0a1a;
  border: 1px solid #ffffff0a;
  border-radius: 10px;
  transition: all 0.2s;
}
.participant-card.winner { border-color: #ffaa00; background: #ffaa0008; }
.participant-card.hoh { border-color: #4488ff33; }
.participant-card.nominee { border-color: #ff444433; }
.participant-card.picked { border-color: #aa44ff33; }
.participant-card.self { border-color: #00ff8844; }

.p-avatar-wrap { position: relative; }
.p-avatar {
  width: 40px; height: 40px; border-radius: 50%;
  background: linear-gradient(135deg, #00ff88, #00cc66);
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 600; color: #0f0f2e;
}
.winner .p-avatar { background: linear-gradient(135deg, #ffaa00, #ff8800); }
.hoh .p-avatar { background: linear-gradient(135deg, #4488ff, #3366cc); }
.nominee .p-avatar { background: linear-gradient(135deg, #ff4444, #cc2222); }
.p-crown { position: absolute; top: -4px; right: -4px; font-size: 14px; }

.p-name { font-size: 12px; color: #ccc; font-weight: 500; text-align: center; }
.winner .p-name { color: #ffaa00; font-weight: 700; }

.p-tags { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; }
.p-tag { font-size: 9px; padding: 1px 5px; border-radius: 3px; font-weight: 500; }
.hoh-tag { background: #4488ff22; color: #4488ff; }
.nom-tag { background: #ff444422; color: #ff4444; }
.drawn-tag { background: #00ff8815; color: #00ff88; }
.picked-tag { background: #aa44ff22; color: #aa44ff; }
.default-tag { background: #4488ff15; color: #4488ff; }
.winner-tag { background: #ffaa0022; color: #ffaa00; }
.self-tag { background: #00ff8822; color: #00ff88; }

/* 获胜者卡片 */
.veto-card {
  background: linear-gradient(135deg, #0f0f2e, #1a1a3e);
  border: 1px solid #ffaa00; border-radius: 12px;
  padding: 24px; display: flex; align-items: center; gap: 20px;
  margin-bottom: 16px;
}
.veto-card.empty { border-color: #444; }
.veto-card.empty p { text-align: center; color: #666; width: 100%; margin: 0; }
.veto-icon { font-size: 48px; }
.veto-label { font-size: 12px; color: #888; text-transform: uppercase; }
.veto-winner { font-size: 20px; font-weight: 700; color: #ffaa00; }
.me-badge { display: inline-block; margin-top: 8px; background: #00ff88; color: #000; padding: 4px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; }

/* 自选区域 */
.pick-section {
  background: linear-gradient(135deg, #1a1a0f, #1a1a2e);
  border: 1px solid #aa44ff44;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
}
.pick-header {
  display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px;
}
.pick-icon { font-size: 28px; }
.pick-header-text { flex: 1; }
.pick-title { font-size: 15px; font-weight: 600; color: #e0e0e0; }
.pick-subtitle { font-size: 12px; color: #888; margin-top: 4px; }

.pick-done {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px;
  background: #00ff8810; border: 1px solid #00ff8833; border-radius: 8px;
  font-size: 14px; color: #00ff88;
}
.pick-done-icon { font-size: 16px; }
.pick-done strong { font-weight: 600; }

.pick-form {
  display: flex; gap: 10px; align-items: center;
}
.pick-select {
  flex: 1;
  background: #0f0f2e; border: 1px solid #aa44ff44; color: #e0e0e0;
  padding: 10px 14px; border-radius: 6px; font-size: 13px; outline: none;
}
.pick-select:focus { border-color: #aa44ff; }
.pick-select option { background: #0f0f2e; color: #e0e0e0; }

.bb-btn { background: transparent; border: 1px solid #00ff8844; color: #00ff88; padding: 10px 24px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px; }
.bb-btn:hover:not(:disabled) { background: #00ff8822; }
.bb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bb-btn-pick { border-color: #aa44ff44; color: #aa44ff; white-space: nowrap; }
.bb-btn-pick:hover:not(:disabled) { background: #aa44ff15; }
</style>
