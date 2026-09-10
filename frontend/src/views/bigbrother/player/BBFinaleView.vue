<template>
  <div class="bb-finale-player">
    <div class="page-header">
      <h1>终局</h1>
      <span v-if="isFinal3" class="stage-tag">F3 终局 · 第{{ roundNum }}周</span>
      <span v-else-if="isChampionVote" class="stage-tag champ">冠军投票</span>
    </div>

    <!-- F3：参与小游戏 -->
    <template v-if="isFinal3">
      <div v-if="activeRoom && inMe(activeRoom)" class="minigame-section">
        <div class="game-stage-tip">第 {{ currentGameStageText }} 场挑战</div>
        <component :is="gameComponent" :roomId="activeRoom.roomId"
          :participants="activeRoom.participants" @finished="onMinigameFinished" />
      </div>
      <div v-else class="pending-card">
        <div class="pending-icon">🎮</div>
        <div class="pending-title">等待下一场挑战</div>
        <div class="pending-desc">管理员正在安排 F3 小游戏，请耐心等待</div>
      </div>
    </template>

    <!-- 冠军投票 -->
    <template v-else-if="isChampionVote">
      <div v-if="finalTwo.length === 2" class="vote-section">
        <div class="vote-title">🏆 陪审团冠军投票</div>
        <p v-if="isFinalist" class="note">你是决赛选手，无需投票。</p>
        <p v-else-if="!isJury" class="note">只有陪审团成员可以投冠军票。</p>

        <div class="finalist-cards">
          <div v-for="p in finalTwo" :key="p.playerId"
            class="finalist-card" :class="{ chosen: myVote?.targetId === p.playerId }"
            @click="castVote(p)">
            <div class="finalist-avatar">{{ p.playerName.charAt(0) }}</div>
            <div class="finalist-name">{{ p.playerName }}</div>
            <div class="finalist-action">
              {{ myVote?.targetId === p.playerId ? '✅ 已投票' : '点此投票' }}
            </div>
          </div>
        </div>

        <div v-if="champion" class="champion-result">
          🏆 冠军：{{ champion.name }}
        </div>
      </div>
      <div v-else class="pending-card">
        <div class="pending-title">决赛二人尚未确定</div>
      </div>
    </template>

    <div v-else class="pending-card">
      <div class="pending-title">当前不是终局阶段</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, markRaw, type Component } from 'vue'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import { useBbSeasonStore } from '../../../stores/bbSeasonStore'
import { bbGetEndgameStatus, bbChampionVote } from '../../../services/bbApi'
import { bbGetActiveMinigameRoom } from '../../../services/bbApi'
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
import type { MinigameRoom, BBEndgameStatus } from '../../../types/bigbrother'

const authStore = useBbAuthStore()
const seasonStore = useBbSeasonStore()

const myId = computed(() => authStore.currentUser?.id || '')
const activeRoom = ref<MinigameRoom | null>(null)
const gameComponent = ref<Component | null>(null)
const eg = ref<BBEndgameStatus | null>(null)
const myVote = ref<{ targetId: string; targetName: string } | null>(null)

const roundNum = computed(() => seasonStore.currentRoundNumber)
const isFinal3 = computed(() => seasonStore.currentStage === 'final3')
const isChampionVote = computed(() => seasonStore.currentStage === 'champion_vote')
const finalTwo = computed(() => eg.value?.finalTwo || [])
const champion = computed(() => eg.value?.champion)
const isFinalist = computed(() => finalTwo.value.some(f => f.playerId === myId.value))
const isJury = computed(() => (eg.value?.juryPlayers || []).some(j => j.playerId === myId.value))

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

function inMe(room: MinigameRoom): boolean {
  return (room.participants || []).some(p => p.playerId === myId.value)
}

const currentGameStageText = computed(() => {
  const w = (eg.value as any)?.final3Winners || {}
  if (w['1'] && w['2']) return '3'
  if (w['1']) return '2'
  return '1'
})

async function refreshStatus() {
  try { eg.value = await bbGetEndgameStatus() } catch {}
  myVote.value = (eg.value as any)?.myChampionVote || null
}

async function castVote(p: { playerId: string; playerName: string }) {
  if (myVote.value) { alert('你已经投过票'); return }
  if (!isJury.value) { alert('只有陪审团成员可以投票'); return }
  try {
    await bbChampionVote(p.playerId, p.playerName)
    myVote.value = { targetId: p.playerId, targetName: p.playerName }
    await refreshStatus()
  } catch (e: any) { alert(e.message) }
}

async function onMinigameFinished(_winner: { playerId: string; playerName: string }) {
  // 结果由管理员在小游戏结束后登记，玩家无需处理
  activeRoom.value = null
}

onMounted(async () => {
  await seasonStore.fetchProgress()
  await refreshStatus()

  let pollTimer: ReturnType<typeof setInterval> | null = null
  const checkRoom = async () => {
    if (!isFinal3.value) return
    try {
      const room = await bbGetActiveMinigameRoom('hoh')
      if (room) {
        activeRoom.value = room
        gameComponent.value = gameComponentMap[room.minigameId] || null
      } else {
        activeRoom.value = null
      }
    } catch {}
  }
  await checkRoom()
  if (isFinal3.value) {
    pollTimer = setInterval(async () => {
      await refreshStatus()
      await checkRoom()
    }, 3000)
  }
  onUnmounted(() => { if (pollTimer) clearInterval(pollTimer) })
})
</script>

<style scoped>
.bb-finale-player { max-width: 700px; margin: 0 auto; padding: 16px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.stage-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #00ff8844; }
.stage-tag.champ { background: #ffaa0022; color: #ffaa00; border-color: #ffaa0066; }
.minigame-section { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 12px; overflow: hidden; }
.game-stage-tip { padding: 10px 16px; font-size: 14px; color: #00ff88; background: #00ff8810; border-bottom: 1px solid #00ff8822; font-weight: 600; }
.pending-card {
  background: #0f0f2e; border: 1px dashed #444; border-radius: 14px;
  padding: 48px 24px; text-align: center;
}
.pending-icon { font-size: 40px; }
.pending-title { font-size: 17px; color: #ccc; margin-top: 10px; }
.pending-desc { font-size: 13px; color: #666; margin-top: 6px; }
.vote-section { background: #0f0f2e; border: 1px solid #ffaa0055; border-radius: 14px; padding: 24px; }
.vote-title { font-size: 18px; font-weight: 700; color: #ffaa00; margin-bottom: 6px; }
.note { font-size: 13px; color: #888; margin: 0 0 14px; }
.finalist-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
.finalist-card {
  background: #1a1a3e; border: 2px solid #333; border-radius: 12px; padding: 20px;
  text-align: center; cursor: pointer; transition: all 0.2s;
}
.finalist-card:hover { border-color: #ffaa00; transform: translateY(-2px); }
.finalist-card.chosen { border-color: #00ff88; background: #00ff8810; }
.finalist-avatar {
  width: 56px; height: 56px; margin: 0 auto 10px; border-radius: 50%;
  background: #ffaa0022; color: #ffaa00; font-size: 24px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.finalist-name { font-size: 17px; color: #fff; font-weight: 600; margin-bottom: 12px; }
.finalist-action { font-size: 13px; color: #888; }
.finalist-card.chosen .finalist-action { color: #00ff88; }
.champion-result {
  margin-top: 20px; text-align: center; font-size: 22px; font-weight: 800;
  color: #ffaa00; padding: 14px; background: #ffaa0010; border: 1px solid #ffaa00; border-radius: 10px;
}
</style>
