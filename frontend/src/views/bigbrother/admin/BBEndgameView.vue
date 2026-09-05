<template>
  <div class="bb-endgame">
    <div class="page-header">
      <h1>终局（F3 / 冠军投票）</h1>
      <div class="header-actions">
        <button class="bb-btn bb-btn-warn" @click="resetEndgame"
          :disabled="!isEndgameActive">↺ 重新开始终局</button>
        <button class="bb-btn" @click="refresh">刷新</button>
      </div>
    </div>

    <div class="status-banner">
      <div class="status-item">
        <span class="label">当前轮次</span>
        <span class="value">{{ status?.currentRound ?? '-' }}</span>
      </div>
      <div class="status-item">
        <span class="label">阶段</span>
        <span class="value stage">{{ stageText }}</span>
      </div>
      <div class="status-item">
        <span class="label">赛季状态</span>
        <span class="value">{{ status?.status === 'finished' ? '🏆 已结束' : '进行中' }}</span>
      </div>
    </div>

    <!-- F3 阶段 -->
    <div v-if="status && isFinal3Stage" class="section-card">
      <h3>🏁 F3 终局（3 人 → FHOH）</h3>
      <p class="hint">规则：三轮小游戏。R1 三人 → 胜者进 R3；R2 另两人 → 胜者进 R3；R3 两人决出 FHOH。FHOH 再从其余两人中带走 1 人进 FTC。</p>

      <div v-if="!status.fhoh" class="f3-active">
        <div class="players-inline">
          <span v-for="p in status.activePlayers" :key="p.playerId" class="player-chip">
            {{ p.name }}
          </span>
        </div>

        <div class="round-step">
          <div class="step-head">
            <span class="step-badge">第 1 场</span>
            <span class="step-desc">3 人挑战 → 胜者进第 3 场</span>
          </div>
          <div v-if="final3Winners['1']" class="step-done">✅ 胜者：{{ final3Winners['1'].name }}</div>
          <div v-else class="candidate-btns">
            <button v-for="p in status.activePlayers" :key="p.playerId"
              class="cand-btn" @click="runFinal3Round(1, p)">
              🏆 {{ p.name }}
            </button>
            <button class="cand-btn random" @click="runFinal3Round(1, null)">🎲 随机</button>
            <button class="cand-btn room" @click="openRoomPicker(1)">🎮 用小游戏</button>
          </div>
        </div>

        <div v-if="final3Winners['1']" class="round-step">
          <div class="step-head">
            <span class="step-badge">第 2 场</span>
            <span class="step-desc">R1 落败的两人挑战 → 胜者进第 3 场</span>
          </div>
          <div v-if="final3Winners['2']" class="step-done">✅ 胜者：{{ final3Winners['2'].name }}</div>
          <div v-else class="candidate-btns">
            <button v-for="p in losersOfRound1" :key="p.playerId"
              class="cand-btn" @click="runFinal3Round(2, p)">
              🏆 {{ p.name }}
            </button>
            <button class="cand-btn random" @click="runFinal3Round(2, null)">🎲 随机</button>
            <button class="cand-btn room" @click="openRoomPicker(2)">🎮 用小游戏</button>
          </div>
        </div>

        <div v-if="final3Winners['2']" class="round-step">
          <div class="step-head">
            <span class="step-badge">第 3 场（终极 HOH）</span>
            <span class="step-desc">R1 胜者 vs R2 胜者 → 胜者 = FHOH</span>
          </div>
          <div v-if="status.fhoh" class="step-done">👑 FHOH：{{ status.fhoh.name }}</div>
          <div v-else class="candidate-btns">
            <button v-for="p in final3Finalists" :key="p.playerId"
              class="cand-btn" @click="runFinal3Round(3, p)">
              🏆 {{ p.name }}
            </button>
            <button class="cand-btn room" @click="openRoomPicker(3)">🎮 用小游戏</button>
          </div>
        </div>

        <!-- 小游戏房间状态（F3 玩家在其 Finale 页加入） -->
        <div v-if="activeRoom" class="room-status" :class="activeRoom.status">
          <span class="room-badge">第 {{ roomPickerRound }} 场房间</span>
          <span class="room-info">{{ activeRoom.minigameId }} · {{ activeRoom.participants.length }}人 · {{ statusText }}</span>
          <button v-if="activeRoom.status === 'waiting'" class="bb-btn bb-btn-primary" @click="startRoom">▶ 开始比赛</button>
          <button v-if="roomWinner && !roomRoundRegistered" class="bb-btn bb-btn-primary"
            @click="registerRoomWinner">✅ 登记胜者 {{ roomWinner.playerName }}</button>
        </div>
      </div>

      <!-- FHOH 选择 FTC -->
      <div v-if="status.fhoh && status.finalTwo.length < 2" class="fhoh-pick">
        <h4>👑 {{ status.fhoh.name }} 请选择带谁进 FTC</h4>
        <div class="candidate-btns">
          <button v-for="p in pickCandidates" :key="p.playerId"
            class="cand-btn pick" @click="fhohPick(p)">
            ➕ {{ p.name }}（进决赛）
          </button>
        </div>
        <p class="hint-warn">未选择的 1 人将成为最后一位陪审团成员。</p>
      </div>

      <div v-if="status.finalTwo.length === 2" class="final-two">
        <div class="ftc-title">🏆 决赛二人（FTC）</div>
        <div class="players-inline">
          <span v-for="p in status.finalTwo" :key="p.playerId" class="player-chip final">
            {{ p.playerName }}
          </span>
        </div>
        <div v-if="status.lastJury" class="last-jury">最后一位陪审团：{{ status.lastJury.name }}</div>
        <button class="bb-btn bb-btn-primary" @click="goNext">进入冠军投票周（第 {{ status.championRound }} 周）</button>
      </div>
    </div>

    <!-- 冠军投票阶段 -->
    <div v-if="status && isChampionVoteStage" class="section-card">
      <h3>🏆 冠军投票（陪审团二选一）</h3>
      <div v-if="status.finalTwo.length === 2" class="finalists-vote">
        <div v-for="p in status.finalTwo" :key="p.playerId" class="finalist-vote-card">
          <div class="finalist-name">{{ p.playerName }}</div>
          <div class="finalist-votes">
            <span class="votes-num">{{ status.championVotes?.[p.playerId] || 0 }}</span>
            <span class="votes-label">票</span>
          </div>
        </div>
      </div>
      <div class="jury-board">
        <div class="board-title">陪审团（{{ (status.juryPlayers || []).length }} 人）</div>
        <div class="jury-chips">
          <span v-for="j in status.juryPlayers" :key="j.playerId" class="player-chip jury">
            {{ j.name }}
          </span>
        </div>
      </div>

      <!-- 管理员逐人代投冠军票 -->
      <div v-if="status.finalTwo.length === 2 && !status.champion" class="jury-vote-admin">
        <div class="board-title">逐陪审代投（点击该陪审投给谁）</div>
        <div v-if="!juryVotes.length" class="hint">暂无陪审成员</div>
        <div v-for="jv in juryVotes" :key="jv.juryId" class="jury-vote-row" :class="{ done: jv.voted }">
          <span class="jury-vote-name">{{ jv.juryName }}</span>
          <div class="jury-vote-btns">
            <button v-for="p in status.finalTwo" :key="p.playerId" class="cand-btn"
              :class="{ active: jv.targetId === p.playerId }"
              @click="adminCastJuryVote(jv.juryId, p.playerId, p.playerName)">
              {{ p.playerName }}
            </button>
          </div>
          <span v-if="jv.voted" class="jury-voted-tag">已投：{{ jv.targetName }}</span>
        </div>
      </div>

      <div v-if="status.finalTwo.length === 2 && !status.champion" class="action-row">
        <button class="bb-btn bb-btn-primary" @click="resolveChampion">🏆 结算冠军</button>
      </div>

      <div v-if="status.champion" class="champion-card">
        <div class="champ-icon">🏆</div>
        <div class="champ-info">
          <div class="champ-label">冠军</div>
          <div class="champ-name">{{ status.champion.name }}</div>
        </div>
        <button class="bb-btn bb-btn-primary" @click="goNext">结束赛季</button>
      </div>
    </div>

    <!-- 提前提示 -->
    <div v-if="!isFinal3Stage && !isChampionVoteStage" class="section-card empty">
      <p v-if="!status" class="hint">加载中…</p>
      <template v-else>
        <p>当前阶段不是终局（F3/冠军）。当普通淘汰轮结束后存活到达 3 人即自动进入此处。</p>
        <p v-if="status.final3Round" class="hint">F3 将在第 {{ status.final3Round }} 周开始。</p>
      </template>
    </div>

    <!-- 选择小游戏弹窗 -->
    <Teleport to="body">
      <div v-if="roomPickerOpen" class="bb-modal-overlay" @click.self="closeRoomPicker">
        <div class="bb-modal">
          <div class="bb-modal-header">
            <h3>为第 {{ roomPickerRound }} 场选小游戏</h3>
            <button class="close-btn" @click="closeRoomPicker">✕</button>
          </div>
          <div class="bb-modal-body">
            <MinigameSelector :selectedId="null" @select="onRoomMinigameSelect" />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useBbSeasonStore } from '../../../stores/bbSeasonStore'
import {
  bbGetEndgameStatus, bbFinal3Round, bbFhohPick, bbChampionResult, bbChampionVote, bbResetEndgame,
  bbCreateMinigameRoom, bbStartMinigame, bbGetMinigameRoom
} from '../../../services/bbApi'
import type { BBEndgameStatus } from '../../../types/bigbrother'
import MinigameSelector from '../../../components/bigbrother/minigames/MinigameSelector.vue'

const seasonStore = useBbSeasonStore()
const status = ref<BBEndgameStatus | null>(null)

// F3 小游戏房间
const roomPickerOpen = ref(false)
const roomPickerRound = ref(1)
const activeRoom = ref<any>(null)
const roomWinner = ref<any>(null)
const roomRoundRegistered = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null

const statusText = computed(() => {
  const s = activeRoom.value?.status
  if (s === 'waiting') return '等待中'
  if (s === 'countdown') return '倒计时'
  if (s === 'playing') return '游戏中'
  if (s === 'finished') return '已结束'
  return s || ''
})

const stageText = computed(() => {
  const s = seasonStore.stageName
  if (status.value?.status === 'finished') return '赛季已结束'
  return `${s} · 第${seasonStore.currentRoundNumber}周`
})

const isFinal3Stage = computed(() => seasonStore.currentStage === 'final3')

const isChampionVoteStage = computed(() => seasonStore.currentStage === 'champion_vote')

// 处于终局流程（F3/冠军/已结束）时允许重来
const isEndgameActive = computed(() => {
  const st = seasonStore.currentStage
  return st === 'final3' || st === 'champion_vote' || status.value?.status === 'finished'
})

const juryVotes = computed(() => status.value?.juryVotes || [])

const final3Winners = computed<Record<string, { playerId: string; name: string }>>(() => (status.value as any)?.final3Winners || {})

const losersOfRound1 = computed(() => {
  if (!status.value) return []
  const w1 = final3Winners.value['1']
  return (status.value.activePlayers || []).filter(p => !w1 || p.playerId !== w1.playerId)
})

const final3Finalists = computed(() => {
  const w1 = final3Winners.value['1']
  const w2 = final3Winners.value['2']
  if (!w1 || !w2) return []
  return (status.value?.activePlayers || []).filter(p => p.playerId === w1.playerId || p.playerId === w2.playerId)
})

const pickCandidates = computed(() => {
  if (!status.value?.fhoh) return []
  return (status.value.activePlayers || []).filter(p => p.playerId !== status.value!.fhoh!.playerId)
})

async function refresh() {
  await seasonStore.fetchProgress()
  try { status.value = await bbGetEndgameStatus() } catch {}
}

async function runFinal3Round(roundIndex: number, winner: { playerId: string; name: string } | null) {
  let target = winner
  if (!target) {
    let pool = status.value?.activePlayers || []
    if (roundIndex === 2) pool = losersOfRound1.value
    if (roundIndex === 3) pool = final3Finalists.value
    if (!pool.length) { alert('无法随机：候选人列表为空'); return }
    target = pool[Math.floor(Math.random() * pool.length)]
  }
  try {
    await bbFinal3Round({ roundIndex, winnerId: target.playerId, winnerName: target.name })
    await refresh()
  } catch (e: any) { alert(e.message) }
}

async function fhohPick(p: { playerId: string; name: string }) {
  try {
    await bbFhohPick(p.playerId, p.name)
    await refresh()
  } catch (e: any) { alert(e.message) }
}

async function resolveChampion() {
  try {
    const r = await bbChampionResult()
    alert(`🏆 冠军产生：${r.data?.champion?.name || r.champion?.name}`)
    await refresh()
  } catch (e: any) { alert(e.message) }
}

// 管理员逐 jury 代投冠军票
async function adminCastJuryVote(juryId: string, targetId: string, targetName: string) {
  try {
    await bbChampionVote(targetId, targetName, juryId, juryVotes.value.find(j => j.juryId === juryId)?.juryName || '')
    await refresh()
  } catch (e: any) { alert(e.message) }
}

async function goNext() {
  try {
    await seasonStore.nextStage()
    await refresh()
  } catch (e: any) { alert(e.message) }
}

// 重新开始整个终局（F3 三轮 → 冠军投票）
async function resetEndgame() {
  if (!confirm('确定要重新开始终局吗？\n将清空 F3 三轮结果、FHOH、决赛二人与所有冠军投票，并把赛季进度回退到 F3 阶段。')) return
  try {
    await bbResetEndgame()
    await refresh()
    alert('终局已重置，可重新进行 F3')
  } catch (e: any) { alert(e.message) }
}

// ===== F3 小游戏房间 =====
function participantsForRound(roundIndex: number): { playerId: string; playerName: string; name?: string }[] {
  let pool: { playerId: string; name: string }[] = []
  if (roundIndex === 1) pool = status.value?.activePlayers || []
  else if (roundIndex === 2) pool = losersOfRound1.value
  else if (roundIndex === 3) pool = final3Finalists.value
  return pool.map(p => ({ playerId: p.playerId, playerName: p.name }))
}

function openRoomPicker(roundIndex: number) {
  const parts = participantsForRound(roundIndex)
  if (parts.length < 2) { alert('参与人数不足，无法开局'); return }
  roomPickerRound.value = roundIndex
  roomPickerOpen.value = true
}

function closeRoomPicker() { roomPickerOpen.value = false }

async function onRoomMinigameSelect(minigameId: string) {
  roomPickerOpen.value = false
  const parts = participantsForRound(roomPickerRound.value)
  try {
    const room = await bbCreateMinigameRoom('hoh', minigameId, parts)
    activeRoom.value = room
    roomWinner.value = null
    roomRoundRegistered.value = false
    startPollRoom()
    alert('小游戏房间已创建！请告知存活玩家进入「终局」页加入，房间状态将自动刷新。')
  } catch (e: any) { alert(e.message) }
}

async function startRoom() {
  if (!activeRoom.value) return
  try {
    await bbStartMinigame(activeRoom.value.roomId)
    activeRoom.value = { ...activeRoom.value, status: 'playing' }
  } catch (e: any) { alert(e.message) }
}

function startPollRoom() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(pollRoom, 2500)
}

async function pollRoom() {
  if (!activeRoom.value) return
  try {
    const room = await bbGetMinigameRoom(activeRoom.value.roomId)
    if (!room) { if (pollTimer) { clearInterval(pollTimer); pollTimer = null } activeRoom.value = null; return }
    activeRoom.value = room
    if (room.status === 'finished' && room.winner) {
      roomWinner.value = room.winner
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
    }
  } catch {}
}

async function registerRoomWinner() {
  if (!roomWinner.value) return
  await runFinal3Round(roomPickerRound.value, roomWinner.value)
  roomRoundRegistered.value = true
  activeRoom.value = null
  roomWinner.value = null
}

onUnmounted(() => { if (pollTimer) clearInterval(pollTimer) })

onMounted(refresh)
</script>

<style scoped>
.bb-endgame { max-width: 900px; margin: 0 auto; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.header-actions { display: flex; gap: 10px; }
.bb-btn-warn { border-color: #ffaa00; color: #ffaa00; }
.bb-btn-warn:hover { background: #ffaa0011; }
.bb-btn-warn:disabled { opacity: .4; cursor: not-allowed; }
.status-banner {
  display: flex; gap: 32px; background: #0f0f2e; border: 1px solid #00ff8822;
  border-radius: 10px; padding: 16px 20px; margin-bottom: 20px;
}
.status-item { display: flex; flex-direction: column; gap: 4px; }
.status-item .label { font-size: 11px; color: #888; text-transform: uppercase; }
.status-item .value { font-size: 20px; font-weight: 700; color: #fff; }
.status-item .value.stage { color: #00ff88; font-size: 15px; }
.section-card {
  background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px;
  padding: 20px; margin-bottom: 20px;
}
.section-card h3 { margin: 0 0 8px; font-size: 18px; color: #e0e0e0; }
.section-card.empty { border-style: dashed; color: #777; }
.hint { font-size: 13px; color: #888; margin: 0 0 16px; line-height: 1.6; }
.hint-warn { font-size: 12px; color: #ffaa00; }
.players-inline { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.player-chip {
  padding: 6px 14px; border-radius: 8px; background: #1a1a3e;
  border: 1px solid #00ff8844; color: #ccc; font-size: 13px;
}
.player-chip.final { border-color: #ffaa00; color: #ffaa00; font-weight: 600; }
.player-chip.jury { border-color: #4488ff66; color: #4488ff; }
.round-step { border-top: 1px solid #00ff8811; padding: 14px 0; }
.step-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.step-badge {
  background: #00ff8822; color: #00ff88; padding: 3px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;
}
.step-desc { font-size: 13px; color: #aaa; }
.step-done { font-size: 14px; color: #00ff88; font-weight: 600; }
.candidate-btns { display: flex; flex-wrap: wrap; gap: 8px; }
.cand-btn {
  background: #1a1a3e; border: 1px solid #00ff8844; color: #e0e0e0;
  padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 14px; transition: all 0.2s;
}
.cand-btn:hover { background: #00ff8822; }
.cand-btn.random { border-style: dashed; color: #888; }
.cand-btn.pick { border-color: #ffaa00; color: #ffaa00; }
.fhoh-pick { border-top: 1px solid #00ff8811; padding: 16px 0; }
.fhoh-pick h4 { color: #ffaa00; margin: 0 0 12px; font-size: 16px; }
.final-two { border-top: 1px solid #ffaa0033; padding: 16px 0; }
.ftc-title { font-size: 15px; color: #ffaa00; font-weight: 700; margin-bottom: 8px; }
.last-jury { font-size: 13px; color: #4488ff; margin: 10px 0; }
.bb-btn {
  background: transparent; border: 1px solid #00ff8844; color: #00ff88;
  padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s;
}
.bb-btn:hover { background: #00ff8822; }
.bb-btn-primary { background: #00ff8822; border-color: #00ff88; }
.finalists-vote { display: flex; gap: 16px; margin-bottom: 16px; }
.finalist-vote-card {
  flex: 1; background: #1a1a3e; border: 1px solid #ffaa0055; border-radius: 10px;
  padding: 16px; text-align: center;
}
.finalist-name { font-size: 16px; color: #ffaa00; font-weight: 600; margin-bottom: 8px; }
.finalist-votes .votes-num { font-size: 32px; font-weight: 800; color: #fff; }
.finalist-votes .votes-label { color: #888; font-size: 13px; margin-left: 4px; }
.jury-board { margin-bottom: 16px; }
.jury-vote-admin {
  margin: 12px 0 16px; padding: 12px; background: #ffffff05;
  border: 1px solid #4488ff44; border-radius: 10px;
}
.jury-vote-row {
  display: flex; align-items: center; gap: 10px; padding: 6px 4px;
  border-bottom: 1px solid #ffffff11; flex-wrap: wrap;
}
.jury-vote-row.done { background: #00ff8808; }
.jury-vote-name { min-width: 90px; font-size: 14px; color: #ccc; }
.jury-vote-btns { display: flex; gap: 8px; }
.jury-vote-btns .cand-btn { padding: 4px 14px; font-size: 13px; }
.jury-vote-btns .cand-btn.active { background: #00ff8822; border-color: #00ff88; color: #00ff88; }
.jury-voted-tag { font-size: 12px; color: #00ff88; }
.board-title { font-size: 13px; color: #888; margin-bottom: 8px; }
.jury-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.action-row { margin: 12px 0; }
.champion-card {
  display: flex; align-items: center; gap: 16px; background: #ffaa0010;
  border: 1px solid #ffaa00; border-radius: 12px; padding: 20px;
}
.champ-icon { font-size: 40px; }
.champ-label { font-size: 12px; color: #ffaa00; text-transform: uppercase; }
.champ-name { font-size: 22px; font-weight: 700; color: #ffaa00; }
.champion-card .bb-btn { margin-left: auto; }
.cand-btn.room { border-color: #4488ff88; color: #4488ff; }
.room-status {
  margin-top: 14px; padding: 12px 16px; background: #ffffff05;
  border: 1px solid #4488ff44; border-radius: 8px; display: flex; align-items: center; gap: 12px;
}
.room-status.finished { border-color: #ffaa00; }
.room-badge { font-size: 12px; font-weight: 700; color: #4488ff; }
.room-info { flex: 1; font-size: 13px; color: #aaa; }
.bb-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.bb-modal { background: #1a1a3e; border: 1px solid #00ff8844; border-radius: 12px; max-width: 90vw; width: 680px; }
.bb-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #00ff8822; }
.bb-modal-header h3 { margin: 0; color: #00ff88; font-size: 16px; }
.close-btn { background: none; border: none; color: #888; cursor: pointer; font-size: 18px; }
.bb-modal-body { padding: 20px; }
</style>
