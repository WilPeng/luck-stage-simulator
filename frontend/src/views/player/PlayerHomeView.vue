<template>
  <div class="player-home">
    <div class="welcome-section">
      <h1>欢迎回来，<span class="player-name">{{ currentUser?.name }}</span></h1>
      <p class="season-info">{{ seasonStore.season?.name }}</p>
    </div>

    <!-- 4 个状态卡片 -->
    <div class="grid-container">
      <div class="info-card stage-card">
        <div class="card-icon">🎯</div>
        <div class="card-content">
          <h3>当前阶段</h3>
          <span class="stage-tag" :class="seasonStore.season?.currentStage">{{ seasonStore.stageName }}</span>
        </div>
      </div>

      <div class="info-card team-card">
        <div class="card-icon">👥</div>
        <div class="card-content">
          <h3>我的队伍</h3>
          <span class="team-name">{{ currentTeam?.name || '尚未组队' }}</span>
          <span class="team-role">{{ isCaptain ? '队长' : '队员' }}</span>
        </div>
      </div>

      <div class="info-card status-card" :class="currentUser?.status">
        <div class="card-icon">🛡️</div>
        <div class="card-content">
          <h3>当前状态</h3>
          <span class="status-text" :class="currentUser?.status">{{ statusText }}</span>
        </div>
      </div>

      <div class="info-card training-card">
        <div class="card-icon">💪</div>
        <div class="card-content">
          <h3>剩余训练次数</h3>
          <span class="training-count">{{ remainingTraining }}</span>
          <span class="training-hint">今日已训练 {{ trainingCount }} 次</span>
        </div>
      </div>
    </div>

    <!-- 属性面板 + 当前任务 -->
    <div class="section-row">
      <div class="card attribute-card">
        <div class="card-header">
          <span class="header-icon">📊</span>
          <span class="header-title">属性面板</span>
        </div>
        <div class="attribute-list">
          <div class="attr-row">
            <span class="attr-icon">🎤</span>
            <div class="attr-content">
              <div class="attr-header">
                <span class="attr-name">Vocal</span>
                <span class="attr-value">{{ currentUser?.attributes.vocal }}</span>
              </div>
              <div class="attr-bar-track">
                <div class="attr-bar vocal" :style="{ width: `${currentUser?.attributes.vocal}%` }"></div>
              </div>
            </div>
          </div>

          <div class="attr-row">
            <span class="attr-icon">💃</span>
            <div class="attr-content">
              <div class="attr-header">
                <span class="attr-name">Dance</span>
                <span class="attr-value">{{ currentUser?.attributes.dance }}</span>
              </div>
              <div class="attr-bar-track">
                <div class="attr-bar dance" :style="{ width: `${currentUser?.attributes.dance}%` }"></div>
              </div>
            </div>
          </div>

          <div class="attr-row">
            <span class="attr-icon">✨</span>
            <div class="attr-content">
              <div class="attr-header">
                <span class="attr-name">Charm</span>
                <span class="attr-value">{{ currentUser?.attributes.charm }}</span>
              </div>
              <div class="attr-bar-track">
                <div class="attr-bar charm" :style="{ width: `${currentUser?.attributes.charm}%` }"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card task-card">
        <div class="card-header">
          <span class="header-icon">📋</span>
          <span class="header-title">当前任务</span>
        </div>
        <div class="task-body">
          <div class="task-icon">📋</div>
          <div class="task-info">
            <p class="task-stage">当前阶段：{{ seasonStore.stageName }}</p>
            <p class="task-desc">{{ currentTask }}</p>
          </div>
        </div>
        <button class="task-btn" @click="goToTask">立即前往</button>
      </div>
    </div>

    <!-- 最近操作 -->
    <div class="card recent-card">
      <div class="card-header">
        <span class="header-icon">📜</span>
        <span class="header-title">最近操作</span>
      </div>
      <div class="log-list" v-if="recentLogs.length > 0">
        <div v-for="log in recentLogs" :key="log.id" class="log-item">
          <span class="log-time">{{ log.createdAt }}</span>
          <span class="log-detail">{{ log.detail }}</span>
        </div>
      </div>
      <div class="empty-logs" v-else>
        <p>暂无操作记录</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/authStore'
import { useSeasonStore } from '../../stores/seasonStore'
import { useTeamStore } from '../../stores/teamStore'
import { useLogStore } from '../../stores/logStore'

const authStore = useAuthStore()
const seasonStore = useSeasonStore()
const teamStore = useTeamStore()
const logStore = useLogStore()
const router = useRouter()

const currentUser = computed(() => authStore.currentUser)
const isCaptain = computed(() => authStore.isCaptain)
const currentTeam = computed(() => teamStore.getTeamById(currentUser.value?.teamId || ''))
const trainingCount = computed(() => currentUser.value?.trainingCount || 0)
const remainingTraining = computed(() => Math.max(0, 5 - trainingCount.value))

const statusText = computed(() => {
  switch (currentUser.value?.status) {
    case 'active': return '安全'
    case 'danger': return '危险'
    case 'eliminated': return '已淘汰'
    default: return '未知'
  }
})

const currentTask = computed(() => {
  switch (seasonStore.season?.currentStage) {
    case 'team': return '请前往组队页面申请入队或邀请队员'
    case 'song': return '请查看歌曲池并选择公演歌曲'
    case 'training': return `你还有 ${remainingTraining.value} 次训练机会，请前往训练页面完成翻牌`
    case 'rehearsal': return '等待队长开启彩排'
    case 'performance': return '公演即将开始，请做好准备'
    case 'elimination': return '查看淘汰结果'
    default: return '当前阶段暂无任务'
  }
})

const recentLogs = computed(() => {
  if (!currentUser.value) return []
  return logStore.getLogsByUserId(currentUser.value.id).slice(0, 5)
})

function goToTask() {
  const link = taskLink.value
  router.push(link)
}

const taskLink = computed(() => {
  switch (seasonStore.season?.currentStage) {
    case 'team': return '/player/team'
    case 'song': return '/player/song'
    case 'training': return '/player/training'
    case 'rehearsal': return '/player/rehearsal'
    case 'performance': return '/player/performance'
    case 'elimination': return '/player/elimination'
    default: return '/player/home'
  }
})

onMounted(async () => {
  await teamStore.fetchTeams()
  await logStore.fetchLogs()
})
</script>

<style lang="scss" scoped>
.player-home {
  color: #333;
}

.welcome-section {
  margin-bottom: 16px;

  h1 {
    font-size: 20px;
    font-weight: 700;
    margin: 0 0 6px 0;
    background: linear-gradient(135deg, #ffd700, #ff6b6b);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .player-name {
    color: #fff;
    -webkit-text-fill-color: #fff;
  }

  .season-info {
    color: rgba(255, 255, 255, 0.5);
    margin: 0;
    font-size: 12px;
  }
}

/* ── 4 个状态卡片（移动端单列） ── */
.grid-container {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-bottom: 12px;
}

.info-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 14px;
  border-left: 3px solid transparent;

  &.stage-card { border-left-color: #a29bfe; }
  &.team-card { border-left-color: #4ecdc4; }
  &.status-card {
    &.active { border-left-color: #27ae60; }
    &.danger { border-left-color: #f39c12; }
    &.eliminated { border-left-color: #e74c3c; }
  }
  &.training-card { border-left-color: #ff6b6b; }
}

.card-icon {
  font-size: 26px;
  flex-shrink: 0;
}

.card-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;

  h3 {
    margin: 0;
    color: rgba(255, 255, 255, 0.5);
    font-size: 11px;
    font-weight: 500;
  }
}

.stage-tag {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  background: linear-gradient(135deg, #a29bfe, #6c5ce7);
  color: #fff;

  &.training { background: linear-gradient(135deg, #ff6b6b, #ee5a24); }
  &.team { background: linear-gradient(135deg, #4ecdc4, #44a08d); }
  &.song { background: linear-gradient(135deg, #ffd700, #ff6b6b); }
  &.rehearsal { background: linear-gradient(135deg, #a29bfe, #6c5ce7); }
  &.performance { background: linear-gradient(135deg, #ff6b6b, #ee5a24); }
  &.elimination { background: linear-gradient(135deg, #e74c3c, #c0392b); }
}

.team-name {
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.team-role {
  display: inline-block;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.8);
}

.status-text {
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  &.active { color: #2ecc71; }
  &.danger { color: #f39c12; }
  &.eliminated { color: #e74c3c; }
}

.training-count {
  color: #fff;
  font-weight: 700;
  font-size: 22px;
  line-height: 1.1;
}

.training-hint {
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
}

/* ── section-row（属性面板 + 任务卡片） ── */
.section-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

.card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 16px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;

  .header-icon { font-size: 18px; }
  .header-title {
    font-size: 14px;
    font-weight: 600;
    color: #fff;
  }
}

/* ── 属性进度条 ── */
.attribute-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.attr-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.attr-icon { font-size: 18px; }

.attr-content { flex: 1; min-width: 0; }

.attr-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;

  .attr-name { color: rgba(255, 255, 255, 0.7); font-size: 12px; }
  .attr-value { color: #fff; font-weight: 600; font-size: 12px; }
}

.attr-bar-track {
  height: 5px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
  overflow: hidden;
}

.attr-bar {
  height: 100%;
  border-radius: 3px;
  transition: width 0.5s ease;

  &.vocal { background: linear-gradient(90deg, #ff6b6b, #ee5a24); }
  &.dance { background: linear-gradient(90deg, #4ecdc4, #44a08d); }
  &.charm { background: linear-gradient(90deg, #a29bfe, #6c5ce7); }
}

/* ── 任务卡片 ── */
.task-body {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
}

.task-icon { font-size: 28px; }

.task-info { flex: 1; min-width: 0; }

.task-stage {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  margin: 0 0 6px 0;
}

.task-desc {
  color: #fff;
  font-size: 13px;
  margin: 0;
  line-height: 1.5;
}

.task-btn {
  width: 100%;
  padding: 10px;
  background: linear-gradient(135deg, #a29bfe, #6c5ce7);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 15px rgba(108, 92, 231, 0.4);
  }
}

/* ── 最近操作 ── */
.recent-card {
  margin-top: 4px;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.log-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);

  &:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
}

.log-time {
  color: rgba(255, 255, 255, 0.35);
  font-size: 11px;
}

.log-detail {
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  line-height: 1.4;
}

.empty-logs {
  text-align: center;
  padding: 16px;
  color: rgba(255, 255, 255, 0.35);
  font-size: 12px;
}

/* ── 桌面端 (>= 769px) ── */
@media (min-width: 769px) {
  .welcome-section {
    margin-bottom: 24px;

    h1 { font-size: 28px; margin-bottom: 8px; }
    .season-info { font-size: 13px; }
  }

  .grid-container {
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 20px;
  }

  .info-card {
    padding: 20px;
    gap: 16px;
    border-radius: 16px;
    border-left-width: 4px;
  }

  .card-icon { font-size: 30px; }

  .card-content h3 { font-size: 12px; }

  .stage-tag {
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 13px;
  }

  .team-name { font-size: 16px; }

  .team-role {
    padding: 2px 8px;
    border-radius: 8px;
    font-size: 11px;
  }

  .training-count { font-size: 24px; }

  .training-hint { font-size: 12px; }

  .section-row {
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 20px;
  }

  .card {
    padding: 24px;
    border-radius: 16px;
  }

  .card-header {
    margin-bottom: 20px;
    .header-icon { font-size: 20px; }
    .header-title { font-size: 16px; }
  }

  .attribute-list { gap: 16px; }
  .attr-row { gap: 12px; }
  .attr-icon { font-size: 20px; }
  .attr-header {
    .attr-name { font-size: 13px; }
    .attr-value { font-size: 14px; }
  }
  .attr-bar-track { height: 6px; }

  .task-body { margin-bottom: 20px; }
  .task-icon { font-size: 36px; }
  .task-stage { font-size: 13px; margin-bottom: 8px; }
  .task-desc { font-size: 14px; }

  .task-btn {
    padding: 10px 24px;
    border-radius: 10px;
  }

  .log-list { gap: 12px; }
  .log-item {
    flex-direction: row;
    gap: 16px;
    padding-bottom: 12px;
  }
  .log-time { font-size: 12px; white-space: nowrap; }
  .log-detail { font-size: 13px; }
}
</style>
