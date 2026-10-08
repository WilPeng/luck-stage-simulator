<template>
  <div class="bb-finale-player">
    <div class="page-header">
      <h1>终局</h1>
      <span v-if="isFinal3" class="stage-tag">F3 终局 · 第{{ roundNum }}周</span>
      <span v-else-if="isChampionVote" class="stage-tag champ">冠军投票</span>
    </div>

    <!-- F3：参与小游戏 -->
    <template v-if="isFinal3">
      <!-- F3 三轮胜者进度 -->
      <div class="f3-progress">
        <div v-for="r in [1, 2, 3]" :key="r" class="f3-round" :class="{ done: !!final3Winners[String(r)] }">
          <div class="f3-round-label">第 {{ r }} 场</div>
          <div class="f3-round-winner">{{ final3Winners[String(r)]?.name || '待决出' }}</div>
        </div>
      </div>

      <!-- FHOH 选择带入决赛的选手 -->
      <div v-if="iAmFhoh && round3Done && !finalTwo.length" class="fhoh-pick">
        <div class="fhoh-title">你是最终 HOH（FHOH）</div>
        <p class="fhoh-desc">请选择一位选手与你一同进入决赛（另一位将成为最后一位陪审员）。</p>
        <div class="fhoh-candidates">
          <button v-for="p in pickCandidates" :key="p.playerId" class="fhoh-candidate" @click="pickPartner(p)">
            <span class="fhoh-avatar">{{ p.name.charAt(0) }}</span>
            <span class="fhoh-name">{{ p.name }}</span>
          </button>
        </div>
      </div>
      <div v-else-if="iAmFhoh && finalTwo.length === 2" class="fhoh-pick done">
        <div class="fhoh-title">你已选择进入决赛</div>
        <p class="fhoh-desc">决赛二人：{{ finalTwo.map(f => f.playerName).join(' vs ') }}</p>
      </div>

      <div v-if="showLobby" class="minigame-section">
        <MinigameLobby :roomId="activeRoom.roomId" :gameTitle="activeRoom.minigameName"
          :participants="activeRoom.participants" :myId="myId" />
      </div>
      <div v-else-if="activeRoom && inMe(activeRoom)" class="minigame-section">
        <div class="game-stage-tip">第 {{ currentGameStageText }} 场挑战</div>
        <component :is="gameComponent" :roomId="activeRoom.roomId"
          :participants="activeRoom.participants" :gameTitle="activeRoom.minigameName" @finished="onMinigameFinished" />
      </div>
      <div v-else-if="!iAmFhoh || (round3Done && finalTwo.length)" class="pending-card">
        <div class="pending-icon">🎮</div>
        <div class="pending-title">等待下一场挑战</div>
        <div class="pending-desc">管理员正在安排 F3 小游戏，请耐心等待</div>
      </div>
    </template>

    <!-- 冠军投票 / 冠军揭晓 -->
    <template v-else-if="isChampionVote">
      <JuryQA :isJury="isJury" :isFinalist="isFinalist" />

      <!-- 逐句揭晓（仅新句播放动画） -->
      <div v-if="revealSegments.length" class="reveal-panel">
        <div class="reveal-title">🏆 冠军揭晓</div>
        <TransitionGroup name="reveal" tag="div" class="reveal-lines">
          <div v-for="(seg, i) in revealSegments" :key="seg.juryId || `champ-${i}`"
            class="reveal-line" :class="{ champion: seg.kind === 'champion' }">
            {{ seg.text }}
          </div>
        </TransitionGroup>
      </div>

      <div v-if="championWinner" class="champion-result">
        🏆 冠军：{{ championWinner.name }}
      </div>

      <div v-else-if="finalTwo.length === 2" class="vote-section">
        <div class="vote-title">🏆 陪审团冠军投票</div>
        <p v-if="isFinalist" class="note">你是决赛选手，无需投票。</p>
        <p v-else-if="!isJury" class="note">只有陪审团成员可以投冠军票。</p>

        <div class="finalist-cards">
          <div v-for="p in finalTwo" :key="p.playerId"
            class="finalist-card" :class="{ chosen: myVote?.targetId === p.playerId }"
            @click="askVote(p)">
            <div class="finalist-avatar">{{ p.playerName.charAt(0) }}</div>
            <div class="finalist-name">{{ p.playerName }}</div>
            <div class="finalist-action">
              {{ myVote?.targetId === p.playerId ? '✅ 已投票' : '点此投票' }}
            </div>
          </div>
        </div>
      </div>
      <div v-else class="pending-card">
        <div class="pending-title">决赛二人尚未确定</div>
      </div>
    </template>

    <div v-else class="pending-card">
      <div class="pending-title">当前不是终局阶段</div>
    </div>

    <!-- 投票确认弹窗 -->
    <div v-if="confirmTarget" class="confirm-mask" @click.self="confirmTarget = null">
      <div class="confirm-box">
        <div class="confirm-text">确定要把冠军票投给 <b>{{ confirmTarget.playerName }}</b> 吗？</div>
        <div class="confirm-note">投票后不可更改。</div>
        <div class="confirm-actions">
          <button class="btn-cancel" @click="confirmTarget = null">取消</button>
          <button class="btn-ok" @click="confirmVote">确认投票</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, markRaw, type Component } from 'vue'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import { useBbSeasonStore } from '../../../stores/bbSeasonStore'
import { useBbRefresh } from '../../../composables/useBbRefresh'
import { bbGetEndgameStatus, bbChampionVote, bbFhohPick } from '../../../services/bbApi'
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
import JigsawGame from '../../../components/bigbrother/minigames/JigsawGame.vue'
import MissingNumberGame from '../../../components/bigbrother/minigames/MissingNumberGame.vue'
import AbracaGame from '../../../components/bigbrother/minigames/AbracaGame.vue'
import DescribeGuessGame from '../../../components/bigbrother/minigames/DescribeGuessGame.vue'
import StayOrFoldGame from '../../../components/bigbrother/minigames/StayOrFold.vue'
import MinigameLobby from '../../../components/bigbrother/MinigameLobby.vue'
import JuryQA from '../../../components/bigbrother/JuryQA.vue'
import type { MinigameRoom, BBEndgameStatus } from '../../../types/bigbrother'

const authStore = useBbAuthStore()
const seasonStore = useBbSeasonStore()

const myId = computed(() => authStore.currentUser?.id || '')
const activeRoom = ref<MinigameRoom | null>(null)
const gameComponent = ref<Component | null>(null)
const eg = ref<BBEndgameStatus | null>(null)
const myVote = ref<{ targetId: string; targetName: string } | null>(null)
const confirmTarget = ref<{ playerId: string; playerName: string } | null>(null)

const roundNum = computed(() => seasonStore.currentRoundNumber)
const isFinal3 = computed(() => seasonStore.currentStage === 'final3')
const isChampionVote = computed(() => seasonStore.currentStage === 'champion_vote')
const finalTwo = computed(() => eg.value?.finalTwo || [])
const final3Winners = computed(() => (eg.value?.final3Winners || {}) as Record<string, { playerId: string; name: string }>)
const isFinalist = computed(() => finalTwo.value.some(f => f.playerId === myId.value))
const isJury = computed(() => (eg.value?.juryPlayers || []).some(j => j.playerId === myId.value))
const round3Done = computed(() => !!final3Winners.value['3'])
const iAmFhoh = computed(() => !!eg.value?.fhoh && eg.value.fhoh.playerId === myId.value)
const pickCandidates = computed(() => {
  const fhohId = eg.value?.fhoh?.playerId
  return (eg.value?.activePlayers || []).filter(p => p.playerId !== fhohId)
})

const reveal = computed(() => eg.value?.championReveal || null)
const revealSegments = computed(() => reveal.value ? reveal.value.segments.slice(0, reveal.value.released) : [])
const championRevealed = computed(() => !!reveal.value && reveal.value.released >= reveal.value.segments.length && !!reveal.value.championId)
const championWinner = computed(() => {
  if (eg.value?.champion) return eg.value.champion
  if (championRevealed.value && reveal.value) return { playerId: reveal.value.championId!, name: reveal.value.championName }
  return null
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
  'sequence-memory': markRaw(SequenceMemoryGame),
  'jigsaw': markRaw(JigsawGame),
  'missing-number': markRaw(MissingNumberGame),
  'abraca': markRaw(AbracaGame),
  'describe-guess': markRaw(DescribeGuessGame),
  'stay-or-fold': markRaw(StayOrFoldGame)
}

function inMe(room: MinigameRoom): boolean {
  return (room.participants || []).some(p => p.playerId === myId.value)
}

const showLobby = computed(() => !!activeRoom.value && activeRoom.value.status === 'waiting' && inMe(activeRoom.value))

const currentGameStageText = computed(() => {
  const w = final3Winners.value
  if (w['1'] && w['2']) return '3'
  if (w['1']) return '2'
  return '1'
})

async function refreshStatus() {
  try { eg.value = await bbGetEndgameStatus() } catch {}
  myVote.value = (eg.value as any)?.myChampionVote || null
}

function askVote(p: { playerId: string; playerName: string }) {
  if (myVote.value) { alert('你已经投过票'); return }
  if (!isJury.value) { alert('只有陪审团成员可以投票'); return }
  confirmTarget.value = p
}

async function confirmVote() {
  const p = confirmTarget.value
  if (!p) return
  confirmTarget.value = null
  try {
    await bbChampionVote(p.playerId, p.playerName)
    myVote.value = { targetId: p.playerId, targetName: p.playerName }
    await refreshStatus()
  } catch (e: any) { alert(e.message) }
}

async function pickPartner(p: { playerId: string; name: string }) {
  if (!confirm(`确定选择 ${p.name} 与你一同进入决赛吗？另一位将成为最后一位陪审员。`)) return
  try {
    await bbFhohPick(p.playerId, p.name)
    await refreshStatus()
  } catch (e: any) { alert(e.message) }
}

async function onMinigameFinished(_winner: { playerId: string; playerName: string }) {
  // 结果由管理员在小游戏结束后登记，玩家无需处理
  activeRoom.value = null
}

let pollTimer: ReturnType<typeof setInterval> | null = null

useBbRefresh(() => refreshStatus())

onMounted(async () => {
  await seasonStore.fetchProgress()
  await refreshStatus()

  const checkRoom = async () => {
    if (!isFinal3.value) return
    try {
      const room = await bbGetActiveMinigameRoom('finale')
      if (room) {
        activeRoom.value = room
        gameComponent.value = gameComponentMap[room.minigameId] || null
      } else {
        activeRoom.value = null
      }
    } catch {}
  }
  await checkRoom()
  pollTimer = setInterval(async () => {
    await seasonStore.fetchProgress()
    await refreshStatus()
    await checkRoom()
  }, 3000)
})

onUnmounted(() => { if (pollTimer) clearInterval(pollTimer) })
</script>

<style scoped>
.bb-finale-player { max-width: 700px; margin: 0 auto; padding: 16px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.stage-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #00ff8844; }
.stage-tag.champ { background: #ffaa0022; color: #ffaa00; border-color: #ffaa0066; }
.f3-progress { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
.f3-round { background: #0f0f2e; border: 1px solid #333; border-radius: 10px; padding: 12px; text-align: center; }
.f3-round.done { border-color: #00ff8866; background: #00ff8810; }
.f3-round-label { font-size: 12px; color: #888; }
.f3-round-winner { font-size: 15px; font-weight: 600; color: #ccc; margin-top: 4px; }
.f3-round.done .f3-round-winner { color: #00ff88; }
.fhoh-pick { background: #0f0f2e; border: 1px solid #ffaa0066; border-radius: 14px; padding: 20px; margin-bottom: 16px; }
.fhoh-pick.done { border-color: #00ff8866; }
.fhoh-title { font-size: 17px; font-weight: 700; color: #ffaa00; }
.fhoh-pick.done .fhoh-title { color: #00ff88; }
.fhoh-desc { font-size: 13px; color: #999; margin: 6px 0 14px; }
.fhoh-candidates { display: flex; gap: 12px; flex-wrap: wrap; }
.fhoh-candidate {
  display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 96px;
  background: #1a1a3e; border: 2px solid #333; border-radius: 12px; padding: 14px 18px;
  color: #ddd; cursor: pointer; transition: all 0.2s;
}
.fhoh-candidate:hover { border-color: #ffaa00; transform: translateY(-2px); }
.fhoh-avatar { width: 44px; height: 44px; border-radius: 50%; background: #ffaa0022; color: #ffaa00; font-size: 20px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.fhoh-name { font-size: 14px; font-weight: 600; }
.minigame-section { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 12px; overflow: hidden; margin-top: 8px; }
.game-stage-tip { padding: 10px 16px; font-size: 14px; color: #00ff88; background: #00ff8810; border-bottom: 1px solid #00ff8822; font-weight: 600; }
.pending-card {
  background: #0f0f2e; border: 1px dashed #444; border-radius: 14px;
  padding: 48px 24px; text-align: center; margin-top: 8px;
}
.pending-icon { font-size: 40px; }
.pending-title { font-size: 17px; color: #ccc; margin-top: 10px; }
.pending-desc { font-size: 13px; color: #666; margin-top: 6px; }
.reveal-panel { background: #0f0f2e; border: 1px solid #ffaa0055; border-radius: 14px; padding: 20px; margin-bottom: 16px; }
.reveal-title { font-size: 18px; font-weight: 700; color: #ffaa00; margin-bottom: 12px; }
.reveal-lines { display: flex; flex-direction: column; gap: 10px; }
.reveal-line { font-size: 16px; color: #ddd; padding: 10px 14px; background: #16163a; border-radius: 8px; border-left: 3px solid #ffaa0066; }
.reveal-line.champion { font-size: 20px; font-weight: 800; color: #ffaa00; background: #ffaa0010; border-left-color: #ffaa00; }
.reveal-enter-active { transition: all 0.5s ease; }
.reveal-enter-from { opacity: 0; transform: translateY(-8px); }
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
  margin-top: 16px; text-align: center; font-size: 22px; font-weight: 800;
  color: #ffaa00; padding: 14px; background: #ffaa0010; border: 1px solid #ffaa00; border-radius: 10px;
}
.confirm-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.confirm-box { background: #12122e; border: 1px solid #444; border-radius: 14px; padding: 24px; width: min(360px, 90vw); }
.confirm-text { font-size: 16px; color: #eee; }
.confirm-text b { color: #ffaa00; }
.confirm-note { font-size: 12px; color: #888; margin-top: 8px; }
.confirm-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; }
.confirm-actions button { padding: 8px 18px; border-radius: 8px; font-size: 14px; cursor: pointer; border: 1px solid #444; }
.btn-cancel { background: #1a1a3e; color: #ccc; }
.btn-ok { background: #ffaa00; color: #1a1a00; border-color: #ffaa00; font-weight: 600; }
</style>
