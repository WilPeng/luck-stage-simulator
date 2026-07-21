<template>
  <div class="admin-dashboard">
    <t-row :gutter="[24, 24]">
      <t-col :xs="12" :md="8" :lg="4">
        <t-card class="stat-card" :bordered="false">
          <div class="stat-content">
            <div class="stat-icon-wrapper primary">
              <span class="emoji-icon">👥</span>
            </div>
            <div class="stat-info">
              <span class="stat-value">{{ totalPlayers }}</span>
              <span class="stat-label">玩家总数</span>
            </div>
          </div>
        </t-card>
      </t-col>

      <t-col :xs="12" :md="8" :lg="4">
        <t-card class="stat-card" :bordered="false">
          <div class="stat-content">
            <div class="stat-icon-wrapper success">
              <span class="emoji-icon">✅</span>
            </div>
            <div class="stat-info">
              <span class="stat-value">{{ loggedInPlayers }}</span>
              <span class="stat-label">已登录人数</span>
            </div>
          </div>
        </t-card>
      </t-col>

      <t-col :xs="12" :md="8" :lg="4">
        <t-card class="stat-card" :bordered="false">
          <div class="stat-content">
            <div class="stat-icon-wrapper warning">
              <span class="emoji-icon">🏆</span>
            </div>
            <div class="stat-info">
              <span class="stat-value">{{ teamCount }}</span>
              <span class="stat-label">队伍数量</span>
            </div>
          </div>
        </t-card>
      </t-col>

      <t-col :xs="12" :md="8" :lg="4">
        <t-card class="stat-card" :bordered="false">
          <div class="stat-content">
            <div class="stat-icon-wrapper info">
              <span class="emoji-icon">📅</span>
            </div>
            <div class="stat-info">
              <span class="stat-value stage-name">{{ currentStageName }}</span>
              <span class="stat-label">当前阶段</span>
            </div>
          </div>
        </t-card>
      </t-col>

      <t-col :xs="12" :md="8" :lg="4">
        <t-card class="stat-card" :bordered="false">
          <div class="stat-content">
            <div class="stat-icon-wrapper purple">
              <span class="emoji-icon">📈</span>
            </div>
            <div class="stat-info">
              <span class="stat-value">{{ trainedPlayers }}</span>
              <span class="stat-label">已完成训练人数</span>
            </div>
          </div>
        </t-card>
      </t-col>

      <t-col :xs="12" :md="8" :lg="4">
        <t-card class="stat-card" :bordered="false">
          <div class="stat-content">
            <div class="stat-icon-wrapper danger">
              <span class="emoji-icon">⚠️</span>
            </div>
            <div class="stat-info">
              <span class="stat-value">{{ eliminatedPlayers }}</span>
              <span class="stat-label">已淘汰人数</span>
            </div>
          </div>
        </t-card>
      </t-col>
    </t-row>

    <t-row :gutter="[24, 24]" class="dashboard-main">
      <t-col :xs="24" :lg="12">
        <t-card title="阶段进度" :bordered="false">
          <template #actions>
            <t-tag :theme="seasonStore.season?.status === 'running' ? 'primary' : 'default'" variant="light">
              {{ completedStages }} / {{ totalStages }} 已完成
            </t-tag>
          </template>
          <div class="timeline">
            <div
              v-for="stage in stageList"
              :key="stage.type"
              class="timeline-item"
              :class="stage.status"
            >
              <div class="timeline-dot"></div>
              <div class="timeline-content">
                <span class="timeline-name">{{ stage.name }}</span>
                <t-tag
                  v-if="stage.status === 'completed'"
                  theme="success"
                  variant="light"
                  size="small"
                >
                  已完成
                </t-tag>
                <t-tag
                  v-else-if="stage.status === 'active'"
                  theme="primary"
                  variant="light"
                  size="small"
                >
                  进行中
                </t-tag>
                <t-tag
                  v-else
                  theme="default"
                  variant="light"
                  size="small"
                >
                  未开始
                </t-tag>
              </div>
            </div>
          </div>
        </t-card>
      </t-col>

      <t-col :xs="24" :lg="12">
        <t-card title="最近操作日志" :bordered="false">
          <template #actions>
            <t-button theme="primary" variant="text" size="small" @click="goToLogs()">
              查看全部
            </t-button>
          </template>
          <t-list v-if="recentLogs.length > 0" :split="false">
            <t-list-item v-for="log in recentLogs" :key="log.id">
              <div class="log-item">
                <span class="log-time">{{ formatTime(log.createdAt) }}</span>
                <span class="log-user">{{ log.userName }}</span>
                <span class="log-action">{{ log.detail }}</span>
              </div>
            </t-list-item>
          </t-list>
          <t-empty v-else description="暂无操作日志" />
        </t-card>
      </t-col>
    </t-row>

    <t-card title="队伍排名预览" :bordered="false">
      <template #actions>
        <t-button theme="primary" variant="text" size="small" @click="goToPerformance()">
          查看公演详情
        </t-button>
      </template>
      <t-table
        v-if="sortedResults.length > 0"
        :data="sortedResults.slice(0, 5)"
        :columns="rankingColumns"
        row-key="id"
        :bordered="false"
        hover
        stripe
      >
        <template #rank="{ row }">
          <t-tag :theme="row.rank <= 3 ? 'warning' : 'default'" variant="light">
            {{ row.rank }}
          </t-tag>
        </template>
        <template #teamName="{ row }">
          {{ getTeamName(row.teamId) }}
        </template>
        <template #finalScore="{ row }">
          <span class="score-text">{{ row.finalScore }}</span>
        </template>
      </t-table>
      <t-empty v-else description="暂无排名数据" />
    </t-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePlayerStore } from '../../stores/playerStore'
import { useTeamStore } from '../../stores/teamStore'
import { useSeasonStore } from '../../stores/seasonStore'
import { useLogStore } from '../../stores/logStore'
import { usePerformanceStore } from '../../stores/performanceStore'
import type { User } from '../../types/user'

const router = useRouter()
const route = useRoute()
const playerStore = usePlayerStore()
const teamStore = useTeamStore()
const seasonStore = useSeasonStore()
const logStore = useLogStore()
const performanceStore = usePerformanceStore()

function goToLogs() {
  router.push(`/games/${route.params.gameId}/admin/logs`)
}

function goToPerformance() {
  router.push(`/games/${route.params.gameId}/admin/performance`)
}

const totalPlayers = computed(() => playerStore.getPlayers().length)
const loggedInPlayers = computed(() => playerStore.users.filter((u: User) => u.hasLogin).length)
const teamCount = computed(() => teamStore.teams.length)
const currentStageName = computed(() => seasonStore.stageName)
const trainedPlayers = computed(() => playerStore.users.filter((u: User) => u.trainingCount && u.trainingCount > 0).length)
const eliminatedPlayers = computed(() => playerStore.users.filter((u: User) => u.status === 'eliminated').length)

const stageList = computed(() => seasonStore.getStageList())
const completedStages = computed(() => stageList.value.filter(s => s.status === 'completed').length)
const totalStages = computed(() => stageList.value.length)
const recentLogs = computed(() => logStore.getRecentLogs(5))
const sortedResults = computed(() => [...performanceStore.teamResults].sort((a, b) => a.rank - b.rank))

const rankingColumns = [
  { colKey: 'rank', title: '排名', width: '80' },
  { colKey: 'teamName', title: '队伍名称' },
  { colKey: 'finalScore', title: '总分', width: '120' }
]

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getTeamName(teamId: string): string {
  const team = teamStore.getTeamById(teamId)
  return team?.name || '未知队伍'
}

onMounted(async () => {
  await playerStore.fetchAllUsers()
  await teamStore.fetchTeams()
  await seasonStore.fetchSeason()
  await logStore.fetchLogs()
  await performanceStore.fetchTeamResults()
})
</script>

<style lang="scss" scoped>
.admin-dashboard {
  background: var(--bg-primary);
  padding: 24px;
  min-height: 100%;
}

.stat-card {
  :deep(.t-card__body) {
    padding: 20px;
  }
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon-wrapper {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;

  &.primary {
    background: rgba(0, 82, 217, 0.1);
    color: #0052d9;
  }

  &.success {
    background: rgba(46, 204, 113, 0.1);
    color: #2ecc71;
  }

  &.warning {
    background: rgba(243, 156, 18, 0.1);
    color: #f39c12;
  }

  &.info {
    background: rgba(52, 152, 219, 0.1);
    color: #3498db;
  }

  &.purple {
    background: rgba(155, 89, 182, 0.1);
    color: #9b59b6;
  }

  &.danger {
    background: rgba(231, 76, 60, 0.1);
    color: #e74c3c;
  }
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;

  &.stage-name {
    font-size: 20px;
  }
}

.stat-label {
  font-size: 14px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.dashboard-main {
  margin-top: 24px;
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.timeline-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  background: var(--hover-bg);
  transition: all 0.3s;

  &.completed {
    background: rgba(46, 204, 113, 0.08);

    .timeline-dot {
      background: #2ecc71;
    }
  }

  &.active {
    background: rgba(0, 82, 217, 0.08);
    border: 1px solid rgba(0, 82, 217, 0.2);

    .timeline-dot {
      background: #0052d9;
      animation: pulse 2s infinite;
    }
  }

  &.pending {
    opacity: 0.6;

    .timeline-dot {
      background: #bdc3c7;
    }
  }
}

@keyframes pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(0, 82, 217, 0.4);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(0, 82, 217, 0);
  }
}

.timeline-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.timeline-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.timeline-name {
  font-weight: 500;
  color: var(--text-primary);
}

.log-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  font-size: 14px;
}

.log-time {
  color: var(--text-secondary);
  font-size: 13px;
  white-space: nowrap;
}

.log-user {
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
}

.log-action {
  color: var(--text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.score-text {
  font-weight: 600;
  color: #0052d9;
}

@media (max-width: 768px) {
  .admin-dashboard {
    padding: 16px;
  }

  .stat-value {
    font-size: 22px;

    &.stage-name {
      font-size: 16px;
    }
  }
}
</style>
