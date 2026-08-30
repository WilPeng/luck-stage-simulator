<template>
  <div class="player-concurrent">
    <div class="page-header">
      <h1>⚡ 并发行动中心</h1>
      <p class="subtitle">第{{ currentRound }}公演 · 组队、选歌、训练、抽取发挥值可同时进行</p>
    </div>

    <div class="actions-grid">
      <!-- 组队 / 按歌分组 / 意向队长入口（按分组模式跳转） -->
      <router-link
        :to="`${gamePrefix}/player/round/${currentRound}/${groupingMode === 'song' ? 'song-group' : groupingMode === 'captain_choice' ? 'captain-choice' : 'team'}`"
        class="action-card"
      >
        <span class="action-icon">{{ groupingMode === 'song' ? '🎵' : groupingMode === 'captain_choice' ? '🤝' : '👥' }}</span>
        <span class="action-title">{{ groupingMode === 'song' ? '按歌分组' : groupingMode === 'captain_choice' ? '选择意向队长' : '组队' }}</span>
        <span class="action-desc">
          {{ groupingMode === 'song' ? '选手直接选歌，同歌自动成组' : groupingMode === 'captain_choice' ? '选择你的意向队长' : '申请入队或管理队伍' }}
        </span>
        <span class="action-arrow">→</span>
      </router-link>

      <!-- 选歌（按歌分组时已并入组队；其余模式显示队长抢选） -->
      <router-link
        v-if="groupingMode !== 'song'"
        :to="`${gamePrefix}/player/round/${currentRound}/song-selection`"
        class="action-card"
      >
        <span class="action-icon">🎵</span>
        <span class="action-title">选歌</span>
        <span class="action-desc">队长为队伍抢选歌曲</span>
        <span class="action-arrow">→</span>
      </router-link>

      <router-link
        :to="`${gamePrefix}/player/round/${currentRound}/training`"
        class="action-card"
      >
        <span class="action-icon">💪</span>
        <span class="action-title">训练</span>
        <span class="action-desc">翻开卡牌提升属性</span>
        <span class="action-arrow">→</span>
      </router-link>

      <router-link
        :to="`${gamePrefix}/player/round/${currentRound}/performance-draw`"
        class="action-card"
        :class="{ 'not-released': !isPerformanceReleased }"
      >
        <span class="action-icon">🎲</span>
        <span class="action-title">抽取发挥值</span>
        <span class="action-desc">{{ isPerformanceReleased ? '每位选手各自抽取公演发挥值' : '管理员尚未开放（未开放）' }}</span>
        <span class="action-arrow">→</span>
      </router-link>
    </div>

    <div class="progress-section">
      <h2 class="section-title">当前进度</h2>
      <div class="progress-list">
        <div class="progress-item" :class="{ done: hasTeam }">
          <span class="progress-icon">{{ hasTeam ? '✓' : '○' }}</span>
          <span class="progress-label">{{ groupingMode === 'song' ? '已选择歌曲成组' : '已加入队伍' }}</span>
        </div>
        <div class="progress-item" :class="{ done: hasSong }">
          <span class="progress-icon">{{ hasSong ? '✓' : '○' }}</span>
          <span class="progress-label">{{ groupingMode === 'song' ? '已加入歌曲小组' : '队伍已选歌' }}</span>
        </div>
        <div class="progress-item" :class="{ done: trainingCompleted }">
          <span class="progress-icon">{{ trainingCompleted ? '✓' : '○' }}</span>
          <span class="progress-label">个人训练完成</span>
        </div>
        <div class="progress-item" :class="{ done: perfValueDrawn }">
          <span class="progress-icon">{{ perfValueDrawn ? '✓' : '○' }}</span>
          <span class="progress-label">已抽取发挥值</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/authStore'
import { useTeamStore } from '../../stores/teamStore'
import { useSongStore } from '../../stores/songStore'
import { getPlayerPerformanceStatus, getConcurrentReleaseStatus, getGroupingMode } from '../../services/api'
import type { ConcurrentReleaseStatusResponse } from '../../types/season'

const route = useRoute()
const authStore = useAuthStore()
const teamStore = useTeamStore()
const songStore = useSongStore()

const gamePrefix = computed(() => `/games/${authStore.currentGameId}`)
const currentRound = computed(() => parseInt(route.params.round as string, 10) || 1)
const currentUserId = computed(() => authStore.currentUser?.id || '')

const myTeam = computed(() => {
  return teamStore.teams.find(t => t.members?.some(m => m.playerId === currentUserId.value))
})

const hasTeam = computed(() => !!myTeam.value)
const hasSong = computed(() => {
  if (!myTeam.value) return false
  // 按歌分组模式：已入组即已选歌
  if (groupingMode.value === 'song') return true
  return songStore.teamSongs.some(ts => ts.teamId === myTeam.value!.id)
})
const trainingCompleted = computed(() => {
  // 训练：只要训练过 1 次即视为已参与训练环节（与后端并发统计一致）
  const user = authStore.currentUser
  if (!user) return false
  return (user.trainingCount || 0) > 0
})
const perfValueDrawn = ref(false)
const releaseStatus = ref<ConcurrentReleaseStatusResponse | null>(null)
const isPerformanceReleased = computed(() => !!releaseStatus.value?.performanceReleased)
const groupingMode = ref<'captain' | 'song' | 'captain_choice'>('captain')
let releaseTimer: number | undefined
let progressTimer: number | undefined

onMounted(() => {
  loadGroupingMode()
  teamStore.fetchTeams(String(currentRound.value))
  songStore.fetchRoundSongs(String(currentRound.value))
  checkPerfValueDrawn()
  loadReleaseStatus()
  releaseTimer = window.setInterval(loadReleaseStatus, 8000)
  // 轮询刷新发挥值状态：抽取后回到本页能自动更新
  progressTimer = window.setInterval(checkPerfValueDrawn, 8000)
})

onBeforeUnmount(() => {
  if (releaseTimer) window.clearInterval(releaseTimer)
  if (progressTimer) window.clearInterval(progressTimer)
})

async function loadReleaseStatus() {
  try {
    releaseStatus.value = await getConcurrentReleaseStatus(`round-${currentRound.value}`)
  } catch {
    releaseStatus.value = null
  }
}

async function loadGroupingMode() {
  try {
    groupingMode.value = await getGroupingMode(`round-${currentRound.value}`)
  } catch (e) {
    groupingMode.value = 'captain'
  }
}

async function checkPerfValueDrawn() {
  try {
    const uid = authStore.currentUser?.id
    if (!uid) return
    const status = await getPlayerPerformanceStatus(`round-${currentRound.value}`)
    const me = status?.players?.find(p => p.playerId === uid)
    perfValueDrawn.value = !!me?.generated
  } catch {
    perfValueDrawn.value = false
  }
}
</script>

<style lang="scss" scoped>
.player-concurrent {
  padding: 16px;
  min-height: 100%;
  max-width: 1000px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 20px;

  h1 {
    margin: 0 0 6px;
    font-size: 22px;
    color: var(--text-primary);
  }

  .subtitle {
    margin: 0;
    font-size: 13px;
    color: var(--text-secondary);
  }
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}

.action-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 12px;
  border-radius: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  text-decoration: none;
  transition: all 0.2s;
  position: relative;

  &.not-released {
    opacity: 0.55;
  }

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    border-color: #0052d9;
  }
}

.action-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.action-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.action-desc {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
}

.action-arrow {
  position: absolute;
  top: 12px;
  right: 12px;
  color: var(--text-tertiary);
  font-size: 14px;
}

.progress-section {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid var(--border-color);
}

.section-title {
  margin: 0 0 12px;
  font-size: 16px;
  color: var(--text-primary);
}

.progress-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.progress-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--bg-primary);

  &.done {
    .progress-icon {
      background: #2ba471;
      color: #fff;
    }

    .progress-label {
      color: #2ba471;
    }
  }
}

.progress-icon {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--text-muted);
  color: #fff;
  font-size: 12px;
}

.progress-label {
  font-size: 14px;
  color: var(--text-primary);
}
</style>
