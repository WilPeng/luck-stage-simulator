<template>
  <div class="elimination-page">
    <!-- 晋级恭喜（仅未被淘汰的选手） -->
    <div v-if="!isEliminated && !isInDanger" class="congrats-section">
      <div class="congrats-glow"></div>
      <div class="congrats-icon">🏆</div>
      <h1>恭喜！你成功晋级</h1>
      <p class="congrats-text">你的表现出色，成功晋级下一轮！</p>
    </div>

    <!-- 危险名单提示（在危险名单中但未淘汰） -->
    <div v-if="isInDanger" class="danger-self-section">
      <div class="danger-glow"></div>
      <div class="danger-icon">⚠️</div>
      <h1>你已进入危险名单</h1>
      <p class="danger-text">你在危险名单中排名第 <strong>{{ myDangerRank }}</strong> 位，将参与 PK 淘汰环节</p>
    </div>

    <!-- 淘汰告知（仅当前选手被淘汰时） -->
    <div v-else-if="isEliminated" class="eliminated-self-section">
      <div class="eliminated-glow"></div>
      <div class="eliminated-icon">💔</div>
      <h1>很遗憾，你已被淘汰</h1>
      <p class="eliminated-text">感谢你在这个舞台上的精彩表现，期待未来再见！</p>
    </div>

    <!-- 危险名单 -->
    <div v-if="dangerConfirmed" class="danger-section">
      <div class="section-header">
        <span class="section-badge">⚠️</span>
        <h2>危险名单</h2>
        <span class="section-count">{{ dangerQueue.length }}人</span>
      </div>
      <p class="section-desc">危险名单按个人喜爱度从低到高排序，队首优先发起 PK</p>
      <div class="danger-list">
        <div
          v-for="(entry, idx) in dangerQueue"
          :key="entry.playerId"
          class="danger-item"
          :class="{ 'is-me': entry.playerId === currentUserId, 'is-first': idx === 0 }"
        >
          <div class="danger-avatar" :style="{ background: playerColor(entry.playerId) }">
            {{ entry.playerName?.[0] || '?' }}
          </div>
          <div class="danger-info">
            <span class="danger-name">
              {{ entry.playerName }}
              <t-tag v-if="entry.playerId === currentUserId" theme="danger" variant="light" size="small">我</t-tag>
              <t-tag v-if="idx === 0" theme="warning" variant="light" size="small">队首</t-tag>
            </span>
            <span class="danger-team">{{ entry.teamName || '未组队' }} · 第{{ idx + 1 }}名</span>
          </div>
          <span class="danger-votes">{{ entry.popularityVotes }}票</span>
        </div>
      </div>
      <t-empty v-if="dangerQueue.length === 0" description="危险队列已清空" />
    </div>

    <!-- PK 发起（当前用户是队首时） -->
    <div v-if="isMeChallenger" class="pk-start-section">
      <div class="section-header">
        <span class="section-badge">⚔️</span>
        <h2>发起 PK</h2>
      </div>
      <div class="pk-start-panel">
        <div class="pk-field">
          <span class="field-label">选择 2 名对手</span>
          <div class="opponent-select">
            <t-select v-model="opponentId1" :options="opponentOptions" placeholder="选择第一名对手" clearable />
            <t-select v-model="opponentId2" :options="opponentOptions" placeholder="选择第二名对手" clearable />
          </div>
        </div>
        <div class="pk-field">
          <span class="field-label">PK 属性</span>
          <t-radio-group v-model="pkAttribute" variant="default-filled">
            <t-radio-button value="vocal">🎤 声乐</t-radio-button>
            <t-radio-button value="dance">💃 舞蹈</t-radio-button>
            <t-radio-button value="charm">✨ 魅力</t-radio-button>
          </t-radio-group>
        </div>
        <t-button theme="primary" block :disabled="!canStartPk" :loading="pkStarting" @click="handleStartPk">
          发起 PK
        </t-button>
      </div>
    </div>

    <!-- PK 进行中（等待投票/裁定） -->
    <div v-if="pendingPk" class="pk-active-section">
      <div class="section-header">
        <span class="section-badge">🗳️</span>
        <h2>第 {{ pendingPk.pkIndex }} 场 PK</h2>
        <span class="section-count">{{ attributeName(pendingPk.attribute) }}</span>
      </div>
      <div class="pk-players">
        <div
          v-for="p in pendingPk.players"
          :key="p.playerId"
          class="pk-player"
          :style="{ borderColor: playerColor(p.playerId) }"
        >
          <span class="pk-player-name">{{ p.playerName }}</span>
          <span class="pk-player-team">{{ p.teamName || '未组队' }}</span>
          <span v-if="p.votes > 0" class="pk-player-votes">{{ p.votes }}票</span>
          <span v-else class="pk-player-waiting">等待评审投票...</span>
        </div>
      </div>
      <p class="pk-tip">投票结果公布后由管理员裁定安全 / 待定 / 淘汰</p>
    </div>

    <!-- PK 记录（谁 vs 谁，票数，查票区） -->
    <div v-if="pkHistory.length > 0" class="pk-history-section">
      <div class="section-header">
        <span class="section-badge">📋</span>
        <h2>PK 记录</h2>
      </div>
      <div class="pk-history-list">
        <div v-for="pk in pkHistory" :key="pk.id" class="pk-history-item">
          <div class="pk-history-head">
            <span class="pk-index">第 {{ pk.pkIndex }} 场</span>
            <span class="pk-attribute">{{ attributeName(pk.attribute) }}</span>
            <span class="pk-status" :class="pk.status">{{ pk.status === 'resolved' ? '已裁定' : '进行中' }}</span>
          </div>
          <div class="pk-history-players">
            <div v-for="p in pk.players" :key="p.playerId" class="pk-history-player">
              <span class="pk-history-name">{{ p.playerName }}</span>
              <span v-if="p.votes > 0" class="pk-history-votes">{{ p.votes }}票</span>
              <span v-if="p.decision" class="pk-history-decision" :class="p.decision">
                {{ decisionText(p.decision) }}
              </span>
            </div>
          </div>
          <!-- 查票区 -->
          <div class="pk-check-votes">
            <span class="check-title">评审投票查票（{{ pk.voteDetails?.length || 0 }} 人）</span>
            <div class="check-seats">
              <span
                v-for="seat in pk.voteDetails || []"
                :key="seat.seatNumber"
                class="check-seat"
                :style="{ background: playerColor(seat.playerId) }"
                :title="`${seat.seatNumber}号评审 → ${playerNameById(seat.playerId)}`"
              >
                {{ seat.seatNumber }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 淘汰名单 -->
    <div class="eliminated-section">
      <div class="section-header">
        <span class="section-badge">❌</span>
        <h2>淘汰名单</h2>
        <span class="section-count">{{ eliminatedPlayers.length }}人</span>
      </div>

      <div v-if="eliminatedPlayers.length === 0" class="empty-state">
        <span class="empty-icon">🎉</span>
        <span class="empty-text">本轮无人淘汰</span>
      </div>

      <div v-else class="eliminated-list">
        <div v-for="player in eliminatedPlayers" :key="player.id" class="eliminated-item">
          <div class="player-avatar">{{ getAvatar(player.name) }}</div>
          <div class="player-info">
            <span class="player-name">{{ player.name }}</span>
            <span class="player-team">{{ getTeamName(player.teamId) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { useAuthStore } from '../../stores/authStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useTeamStore } from '../../stores/teamStore'
import { useEliminationStore } from '../../stores/eliminationStore'

const route = useRoute()
const authStore = useAuthStore()
const playerStore = usePlayerStore()
const teamStore = useTeamStore()
const store = useEliminationStore()

const currentRound = computed(() => Number(route.params.round) || 1)
const currentUserId = computed(() => authStore.currentUser?.id || '')

const opponentId1 = ref('')
const opponentId2 = ref('')
const pkAttribute = ref<'vocal' | 'dance' | 'charm'>('vocal')
const pkStarting = ref(false)

const isEliminated = computed(() => {
  const user = playerStore.users.find(u => u.id === currentUserId.value)
  return user?.status === 'eliminated'
})

const eliminatedPlayers = computed(() => {
  return playerStore.users.filter(u => u.status === 'eliminated')
})

// 危险名单相关
const dangerConfirmed = computed(() => !!store.dangerStatus?.confirmed)
const dangerQueue = computed(() => store.pkQueue)
const pendingPk = computed(() => store.currentPk)
const pkHistory = computed(() => store.pkHistory)

const myDangerRank = computed(() => {
  const idx = dangerQueue.value.findIndex(e => e.playerId === currentUserId.value)
  return idx >= 0 ? idx + 1 : null
})

const isInDanger = computed(() => myDangerRank.value !== null)

const isMeChallenger = computed(() => {
  return dangerQueue.value[0]?.playerId === currentUserId.value
})

const opponentOptions = computed(() => {
  const ids = new Set([opponentId2.value])
  return dangerQueue.value
    .filter(e => e.playerId !== dangerQueue.value[0]?.playerId)
    .filter(e => !ids.has(e.playerId))
    .map(e => ({ label: `${e.playerName}（${e.popularityVotes}票）`, value: e.playerId }))
})

const canStartPk = computed(() => {
  return dangerQueue.value.length >= 3 && !!opponentId1.value && !!opponentId2.value && opponentId1.value !== opponentId2.value
})

function getAvatar(name?: string): string {
  const icons = ['🌟', '🎤', '💃', '✨', '🎵', '🎭']
  if (!name) return '🎤'
  return icons[name.charCodeAt(0) % icons.length]
}

function getTeamName(teamId?: string): string {
  if (!teamId) return '未组队'
  const team = teamStore.getTeamById(teamId)
  return team?.name || '未知队伍'
}

// 危险区选手颜色（按队列顺序分配固定色板）
const COLOR_PALETTE = ['#e74c3c', '#f39c12', '#27ae60', '#2980b9', '#8e44ad', '#16a085', '#c0392b', '#d35400', '#2c3e50', '#7f8c8d']
const colorMap = new Map<string, string>()

function playerColor(playerId: string): string {
  if (!colorMap.has(playerId)) {
    const idx = dangerQueue.value.findIndex(e => e.playerId === playerId)
    colorMap.set(playerId, COLOR_PALETTE[(idx >= 0 ? idx : colorMap.size) % COLOR_PALETTE.length])
  }
  return colorMap.get(playerId) || '#95a5a6'
}

function playerNameById(playerId: string): string {
  const entry = dangerQueue.value.find(e => e.playerId === playerId)
  if (entry) return entry.playerName
  const pk = pkHistory.value.find(p => p.players.some(x => x.playerId === playerId))
  return pk?.players.find(x => x.playerId === playerId)?.playerName || playerId
}

function attributeName(attr: string): string {
  const map: Record<string, string> = { vocal: '🎤 声乐', dance: '💃 舞蹈', charm: '✨ 魅力' }
  return map[attr] || attr
}

function decisionText(d: string): string {
  const map: Record<string, string> = { safe: '🟢 安全', pending: '🟡 待定', eliminated: '🔴 淘汰' }
  return map[d] || d
}

async function handleStartPk() {
  if (!canStartPk.value) {
    MessagePlugin.warning('请选择 2 名不同的对手')
    return
  }
  pkStarting.value = true
  try {
    await store.doStartPk({
      round: currentRound.value,
      challengerId: dangerQueue.value[0].playerId,
      opponentIds: [opponentId1.value, opponentId2.value],
      attribute: pkAttribute.value
    })
    opponentId1.value = ''
    opponentId2.value = ''
    MessagePlugin.success('PK 已发起')
    await loadAll()
  } catch (e: any) {
    MessagePlugin.error(e.message || '发起 PK 失败')
  } finally {
    pkStarting.value = false
  }
}

async function loadAll() {
  try {
    await Promise.all([
      store.fetchDangerStatus(currentRound.value),
      store.fetchPkQueue(currentRound.value),
      store.fetchPkHistory(currentRound.value)
    ])
  } catch (e) {
    console.warn('[PlayerElimination] 加载失败:', e)
  }
}

onMounted(async () => {
  await Promise.all([
    playerStore.fetchAllUsers(),
    teamStore.fetchTeams()
  ])
  await loadAll()
})
</script>

<style lang="scss" scoped>
.elimination-page {
  min-height: 100vh;
  padding: 24px 20px;
  background: var(--bg-primary);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  gap: 24px;
}

// ===== 晋级恭喜 =====
.congrats-section {
  text-align: center;
  position: relative;
  padding: 60px 20px 40px;

  .congrats-glow {
    position: absolute;
    top: 20px; left: 50%;
    width: 220px; height: 220px;
    transform: translateX(-50%);
    background: radial-gradient(circle, rgba(255, 215, 0, 0.12) 0%, transparent 70%);
    border-radius: 50%;
    pointer-events: none;
  }

  .congrats-icon {
    font-size: 72px;
    margin-bottom: 16px;
    animation: float 3s ease-in-out infinite;
  }

  h1 {
    font-size: 28px;
    font-weight: 800;
    margin: 0 0 12px;
    background: linear-gradient(135deg, #ffd700, #ff6b6b);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .congrats-text {
    font-size: 16px;
    color: var(--text-secondary);
    margin: 0;
  }
}

// ===== 危险名单提示 =====
.danger-self-section {
  text-align: center;
  position: relative;
  padding: 50px 20px 30px;
  background: rgba(231, 76, 60, 0.06);
  border: 1px solid rgba(231, 76, 60, 0.3);
  border-radius: 16px;

  .danger-icon {
    font-size: 60px;
    margin-bottom: 12px;
  }

  h1 {
    font-size: 26px;
    font-weight: 800;
    color: #e74c3c;
    margin: 0 0 10px;
  }

  .danger-text {
    font-size: 15px;
    color: var(--text-secondary);

    strong {
      color: #e74c3c;
      font-size: 18px;
    }
  }
}

// ===== 淘汰告知 =====
.eliminated-self-section {
  text-align: center;
  position: relative;
  padding: 60px 20px 40px;

  .eliminated-icon {
    font-size: 72px;
    margin-bottom: 16px;
    animation: fadePulse 3s ease-in-out infinite;
  }

  h1 {
    font-size: 28px;
    font-weight: 800;
    color: #e74c3c;
    margin: 0 0 12px;
  }

  .eliminated-text {
    font-size: 16px;
    color: var(--text-tertiary);
    margin: 0;
  }
}

// ===== 通用区块 =====
.section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;

  .section-badge {
    font-size: 20px;
  }

  h2 {
    font-size: 18px;
    font-weight: 700;
    margin: 0;
    flex: 1;
  }

  .section-count {
    font-size: 13px;
    color: var(--text-muted);
    background: rgba(231, 76, 60, 0.15);
    padding: 2px 10px;
    border-radius: 10px;
  }
}

.section-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin: -8px 0 14px;
}

.danger-section,
.pk-history-section,
.pk-active-section,
.pk-start-section,
.eliminated-section {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 20px;
}

// ===== 危险名单 =====
.danger-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.danger-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  background: rgba(231, 76, 60, 0.06);
  border: 1px solid rgba(231, 76, 60, 0.15);
  border-radius: 12px;

  &.is-first {
    background: rgba(231, 76, 60, 0.14);
    border-color: rgba(231, 76, 60, 0.4);
  }

  &.is-me {
    border-color: #e74c3c;
    box-shadow: 0 0 0 2px rgba(231, 76, 60, 0.2);
  }

  .danger-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .danger-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;

    .danger-name {
      font-size: 15px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .danger-team {
      font-size: 12px;
      color: var(--text-muted);
    }
  }

  .danger-votes {
    font-size: 13px;
    font-weight: 600;
    color: #e74c3c;
  }
}

// ===== PK 发起 =====
.pk-start-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;

  .pk-field {
    .field-label {
      display: block;
      font-size: 13px;
      color: var(--text-secondary);
      margin-bottom: 8px;
      font-weight: 600;
    }
  }

  .opponent-select {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
}

// ===== PK 进行中 =====
.pk-players {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;

  .pk-player {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 14px 8px;
    background: var(--table-hover-bg);
    border-radius: 10px;
    border: 2px solid transparent;
    text-align: center;

    .pk-player-name {
      font-size: 15px;
      font-weight: 700;
    }

    .pk-player-team {
      font-size: 11px;
      color: var(--text-secondary);
    }

    .pk-player-votes {
      font-size: 18px;
      font-weight: 800;
      color: #e74c3c;
    }

    .pk-player-waiting {
      font-size: 12px;
      color: var(--text-muted);
    }
  }
}

.pk-tip {
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
  margin: 12px 0 0;
}

// ===== PK 记录 =====
.pk-history-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pk-history-item {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px;

  .pk-history-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;

    .pk-index {
      font-size: 14px;
      font-weight: 700;
    }

    .pk-attribute {
      font-size: 12px;
      color: var(--text-secondary);
    }

    .pk-status {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 8px;

      &.resolved { background: rgba(39, 174, 96, 0.15); color: #27ae60; }
      &.voting { background: rgba(243, 156, 18, 0.15); color: #f39c12; }
    }
  }

  .pk-history-players {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-bottom: 12px;
  }

  .pk-history-player {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 10px;
    background: var(--table-hover-bg);
    border-radius: 8px;

    .pk-history-name {
      font-size: 13px;
      font-weight: 600;
    }

    .pk-history-votes {
      font-size: 15px;
      font-weight: 800;
      color: #0052d9;
    }

    .pk-history-decision {
      font-size: 11px;
      padding: 1px 8px;
      border-radius: 8px;

      &.safe { background: rgba(39, 174, 96, 0.15); color: #27ae60; }
      &.pending { background: rgba(243, 156, 18, 0.15); color: #f39c12; }
      &.eliminated { background: rgba(231, 76, 60, 0.15); color: #e74c3c; }
    }
  }

  .pk-check-votes {
    .check-title {
      display: block;
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 8px;
    }

    .check-seats {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
      max-height: 120px;
      overflow-y: auto;
    }

    .check-seat {
      width: 22px;
      height: 22px;
      border-radius: 4px;
      color: #fff;
      font-size: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
  }
}

// ===== 淘汰名单 =====
.eliminated-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.eliminated-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  background: rgba(231, 76, 60, 0.08);
  border: 1px solid rgba(231, 76, 60, 0.2);
  border-radius: 12px;

  .player-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: linear-gradient(135deg, #e74c3c, #c0392b);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    flex-shrink: 0;
  }

  .player-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;

    .player-name {
      font-size: 15px;
      font-weight: 600;
    }

    .player-team {
      font-size: 12px;
      color: var(--text-muted);
    }
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 0;

  .empty-icon { font-size: 48px; opacity: 0.5; }
  .empty-text { font-size: 14px; color: var(--text-muted); }
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

@keyframes fadePulse {
  0%, 100% { opacity: 0.8; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.05); }
}

@media (max-width: 768px) {
  .congrats-section { padding: 40px 16px 32px; .congrats-icon { font-size: 56px; } h1 { font-size: 24px; } }
  .eliminated-self-section { padding: 40px 16px 32px; .eliminated-icon { font-size: 56px; } h1 { font-size: 24px; } }
  .danger-section, .pk-history-section, .pk-active-section, .pk-start-section, .eliminated-section { padding: 16px; }
}
</style>
