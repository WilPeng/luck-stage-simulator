<template>
  <div class="player-history">
    <div class="history-header">
      <h1>我的记录</h1>
      <p class="subtitle">查看你的操作记录与历史公演数据</p>
    </div>

    <!-- ===== 历史公演数据（需求6） ===== -->
    <t-card theme="dark" class="history-card">
      <div class="section-head">
        <h3>📊 历史公演数据</h3>
        <t-select
          v-model="selectedRound"
          :options="roundOptions"
          placeholder="选择轮次查看"
          style="width: 160px"
          size="small"
          @change="loadRoundHistory"
        />
      </div>

      <div v-if="!selectedRound" class="history-hint">选择轮次查看该公演的组队、成绩与淘汰记录</div>

      <div v-else-if="historyLoading" class="history-hint">加载中...</div>

      <div v-else-if="roundHistory" class="round-history">
        <!-- 我的队伍 -->
        <div class="history-block">
          <div class="block-title">🏟️ 第 {{ selectedRound }} 公 · 我的队伍</div>
          <div v-if="myTeams.length === 0" class="block-empty">本轮未组队</div>
          <div v-for="t in myTeams" :key="t.id" class="block-row">
            <span class="row-name">{{ t.name }}</span>
            <span class="row-sub">队长：{{ captainName(t.captainId) }}</span>
          </div>
        </div>

        <!-- 我的成绩 -->
        <div class="history-block">
          <div class="block-title">🏆 第 {{ selectedRound }} 公 · 我的成绩</div>
          <div v-if="myPerformance" class="block-row">
            <span class="row-name">个人分：{{ myPerformance.playerScore ?? myPerformance.finalScore ?? '-' }}</span>
            <span class="row-sub">评级：{{ myPerformance.stageRating || '-' }} · 发挥值：{{ myPerformance.performanceValue ?? '-' }}</span>
          </div>
          <div v-else class="block-empty">本轮暂无成绩</div>
        </div>

        <!-- 全轮队伍排名 -->
        <div class="history-block">
          <div class="block-title">📈 第 {{ selectedRound }} 公 · 队伍排名</div>
          <div v-if="roundHistory.teamPerformances?.length" class="rank-list">
            <div
              v-for="tp in roundHistory.teamPerformances"
              :key="tp.teamId"
              class="rank-row"
            >
              <span class="rank-badge">{{ tp.rank }}</span>
              <span class="row-name">{{ tp.teamName }}</span>
              <span class="row-sub">{{ tp.finalVotes ?? tp.finalScore ?? '-' }}票</span>
            </div>
          </div>
          <div v-else class="block-empty">本轮暂无排名数据</div>
        </div>

        <!-- 本轮淘汰 -->
        <div class="history-block">
          <div class="block-title">❌ 第 {{ selectedRound }} 公 · 淘汰名单</div>
          <div v-if="roundHistory.eliminations?.length" class="block-row">
            <span class="row-name">{{ roundHistory.eliminations.map((e: any) => e.userName || e.playerId).join('、') }}</span>
          </div>
          <div v-else class="block-empty">本轮无人淘汰</div>
        </div>
      </div>
    </t-card>

    <!-- ===== 操作记录 ===== -->
    <t-card v-if="userLogs.length > 0" theme="dark" class="history-card">
      <t-timeline mode="alternate" theme="dark" class="custom-timeline">
        <t-timeline-item 
          v-for="log in userLogs" 
          :key="log.id" 
          :dot-color="getActionColor(log.actionType)"
        >
          <template #label>
            <span class="action-time">{{ log.createdAt }}</span>
          </template>
          <div class="timeline-content" :class="getActionClass(log.actionType)">
            <div class="content-header">
              <span class="action-icon">{{ getActionIcon(log.actionType) }}</span>
              <t-tag :theme="getActionTagTheme(log.actionType)" variant="light" size="small">
                {{ getActionText(log.actionType) }}
              </t-tag>
            </div>
            <p class="content-detail">{{ log.detail }}</p>
          </div>
        </t-timeline-item>
      </t-timeline>
    </t-card>
    
    <t-card v-else theme="dark" class="no-history-card">
      <t-empty title="暂无操作记录" description="完成各项任务后，记录将在这里显示">
        <template #icon>
          <span class="empty-icon">📜</span>
        </template>
      </t-empty>
    </t-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '../../stores/authStore'
import { useLogStore } from '../../stores/logStore'
import { useSeasonStore } from '../../stores/seasonStore'
import { usePlayerStore } from '../../stores/playerStore'
import { getSeasonHistory, getRounds } from '../../services/api'

const authStore = useAuthStore()
const logStore = useLogStore()
const seasonStore = useSeasonStore()
const playerStore = usePlayerStore()

const currentUser = computed(() => authStore.currentUser)
const userLogs = computed(() => {
  if (!currentUser.value) return []
  return logStore.logs.filter(log => log.userId === currentUser.value?.id)
})

// ===== 历史公演数据（需求6） =====
const rounds = ref<any[]>([])
const selectedRound = ref<number | undefined>(undefined)
const roundHistory = ref<any>(null)
const historyLoading = ref(false)

const roundOptions = computed(() => {
  return rounds.value.map(r => ({ label: `第${r.index}公演`, value: r.index }))
})

const myTeams = computed(() => {
  if (!roundHistory.value?.teams || !currentUser.value) return []
  const members = roundHistory.value.members || []
  const myMember = members.find((m: any) => m.playerId === currentUser.value?.id)
  if (!myMember) return []
  const teams = roundHistory.value.teams || []
  const team = teams.find((t: any) => t.id === myMember.teamId)
  return team ? [team] : []
})

const myPerformance = computed(() => {
  if (!roundHistory.value?.playerPerformances || !currentUser.value) return null
  return roundHistory.value.playerPerformances.find((p: any) => p.playerId === currentUser.value?.id) || null
})

function captainName(captainId?: string): string {
  if (!captainId) return '未指定'
  const user = playerStore.users.find(u => u.id === captainId)
  return user?.name || captainId
}

async function loadRounds() {
  try {
    rounds.value = await getRounds()
  } catch {
    rounds.value = []
  }
}

async function loadRoundHistory() {
  if (!selectedRound.value) return
  historyLoading.value = true
  try {
    roundHistory.value = await getSeasonHistory(`round-${selectedRound.value}`)
  } catch (e) {
    roundHistory.value = null
  } finally {
    historyLoading.value = false
  }
}

function getActionIcon(actionType: string): string {
  const icons: Record<string, string> = {
    login: '🔐',
    logout: '🚪',
    initial_luck: '🎲',
    apply_team: '📝',
    invite_player: '📩',
    accept_invite: '✓',
    reject_invite: '✗',
    lock_team: '🔒',
    select_song: '🎵',
    training_draw: '🎴',
    performance_calculate: '🏆',
    elimination_generate: '❌',
    stage_change: '📅'
  }
  return icons[actionType] || '📋'
}

function getActionText(actionType: string): string {
  const texts: Record<string, string> = {
    login: '登录系统',
    logout: '退出登录',
    initial_luck: '初始命运',
    apply_team: '申请入队',
    invite_player: '邀请队员',
    accept_invite: '接受邀请',
    reject_invite: '拒绝邀请',
    lock_team: '锁定队伍',
    select_song: '选择歌曲',
    training_draw: '训练翻牌',
    performance_calculate: '公演结算',
    elimination_generate: '淘汰结果',
    stage_change: '阶段变更'
  }
  return texts[actionType] || '未知操作'
}

function getActionClass(actionType: string): string {
  const classes: Record<string, string> = {
    login: 'success',
    logout: 'info',
    initial_luck: 'warning',
    apply_team: 'info',
    invite_player: 'info',
    accept_invite: 'success',
    reject_invite: 'danger',
    lock_team: 'warning',
    select_song: 'info',
    training_draw: 'success',
    performance_calculate: 'success',
    elimination_generate: 'danger',
    stage_change: 'warning'
  }
  return classes[actionType] || 'info'
}

function getActionColor(actionType: string): string {
  const colors: Record<string, string> = {
    success: '#2ecc71',
    danger: '#e74c3c',
    warning: '#f39c12',
    info: '#3498db'
  }
  return colors[getActionClass(actionType)] || colors.info
}

function getActionTagTheme(actionType: string): 'success' | 'danger' | 'warning' | 'primary' | 'default' | 'info' {
  const themes: Record<string, 'success' | 'danger' | 'warning' | 'primary' | 'default' | 'info'> = {
    login: 'success',
    logout: 'info',
    initial_luck: 'warning',
    apply_team: 'info',
    invite_player: 'info',
    accept_invite: 'success',
    reject_invite: 'danger',
    lock_team: 'warning',
    select_song: 'primary',
    training_draw: 'success',
    performance_calculate: 'success',
    elimination_generate: 'danger',
    stage_change: 'warning'
  }
  return themes[actionType] || 'info'
}

onMounted(async () => {
  await Promise.all([
    logStore.fetchLogs(),
    loadRounds(),
    playerStore.fetchAllUsers()
  ])
})
</script>

<style lang="scss" scoped>
.player-history {
  color: var(--text-primary);
  min-height: 100vh;
  padding: 20px;
  background: var(--bg-primary);
}

@media (max-width: 768px) {
  .player-history {
    min-height: calc(100vh - 56px);
    padding: 16px;
    padding-bottom: 72px;
  }
}

@media (max-width: 480px) {
  .player-history {
    min-height: calc(100vh - 48px);
    padding: 12px;
    padding-bottom: 66px;
  }
}

.history-header {
  margin-bottom: 24px;
  
  h1 {
    font-size: 28px;
    font-weight: 700;
    margin: 0 0 8px 0;
    background: linear-gradient(135deg, #3498db, #2980b9);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  
  .subtitle {
    color: var(--text-tertiary);
    margin: 0;
    font-size: 14px;
  }
}

// ===== 历史公演数据 =====
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 12px;

  h3 {
    margin: 0;
    font-size: 16px;
  }
}

.history-hint {
  color: var(--text-tertiary);
  font-size: 13px;
  padding: 16px 0;
  text-align: center;
}

.round-history {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.history-block {
  background: var(--bg-primary);
  border-radius: 10px;
  padding: 14px;

  .block-title {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 10px;
  }

  .block-empty {
    font-size: 13px;
    color: var(--text-tertiary);
  }

  .block-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px dashed var(--border-color);

    .row-name {
      font-weight: 500;
    }

    .row-sub {
      font-size: 12px;
      color: var(--text-secondary);
      margin-left: auto;
    }
  }
}

.rank-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rank-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--border-color);

  .rank-badge {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: #3498db;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .row-name {
    font-weight: 500;
    flex: 1;
  }

  .row-sub {
    font-size: 12px;
    color: var(--text-secondary);
  }
}

:deep(.t-card) {
  background: var(--card-bg);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  
  .t-card__body {
    padding: 24px;
  }
}

.custom-timeline {
  :deep(.t-timeline-item) {
    padding-bottom: 24px;
    
    &:last-child {
      padding-bottom: 0;
    }
  }
  
  :deep(.t-timeline-item__label) {
    font-size: 12px;
    color: var(--text-tertiary);
  }
  
  :deep(.t-timeline-item__dot) {
    background: transparent;
    border: none;
    
    .t-icon {
      font-size: 20px;
    }
  }
  
  :deep(.t-timeline-item__content) {
    color: var(--text-primary);
  }
}

.timeline-content {
  background: var(--card-bg);
  border-radius: 12px;
  padding: 16px;
  border-left: 3px solid #667eea;
  
  &.success {
    border-left-color: #2ecc71;
  }
  
  &.danger {
    border-left-color: #e74c3c;
  }
  
  &.warning {
    border-left-color: #f39c12;
  }
  
  &.info {
    border-left-color: #3498db;
  }
}

.content-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.action-icon {
  font-size: 20px;
}

.action-time {
  font-size: 12px;
  color: var(--text-tertiary);
}

.content-detail {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.no-history-card {
  max-width: 600px;
  margin: 0 auto;
}

.empty-icon {
  font-size: 64px;
}

:deep(.t-empty) {
  .t-empty__description {
    color: var(--text-tertiary);
  }
}

@media (max-width: 768px) {
  :deep(.t-card__body) {
    padding: 16px;
  }
  
  :deep(.custom-timeline) {
    .t-timeline-item {
      padding-bottom: 16px;
    }
    
    .t-timeline-item__dot {
      display: none;
    }
  }
  
  .timeline-content {
    padding: 12px;
  }
  
  .content-header {
    gap: 8px;
  }

  .history-header {
    margin-bottom: 16px;
    h1 { font-size: 22px; }
    .subtitle { font-size: 13px; }
  }
}

@media (max-width: 480px) {
  .history-header {
    h1 { font-size: 18px; }
    .subtitle { font-size: 12px; }
  }

  .timeline-content {
    padding: 10px;
  }

  .content-detail {
    font-size: 13px;
  }
}
</style>
