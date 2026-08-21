<template>
  <div class="player-concurrent">
    <div class="page-header">
      <h1>⚡ 并发行动中心</h1>
      <p class="subtitle">第{{ currentRound }}公演 · 组队、选歌、训练可同时进行</p>
    </div>

    <div class="actions-grid">
      <router-link
        :to="`${gamePrefix}/player/round/${currentRound}/team`"
        class="action-card"
      >
        <span class="action-icon">👥</span>
        <span class="action-title">组队</span>
        <span class="action-desc">申请入队或管理队伍</span>
        <span class="action-arrow">→</span>
      </router-link>

      <router-link
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
    </div>

    <div class="progress-section">
      <h2 class="section-title">当前进度</h2>
      <div class="progress-list">
        <div class="progress-item" :class="{ done: hasTeam }">
          <span class="progress-icon">{{ hasTeam ? '✓' : '○' }}</span>
          <span class="progress-label">已加入队伍</span>
        </div>
        <div class="progress-item" :class="{ done: hasSong }">
          <span class="progress-icon">{{ hasSong ? '✓' : '○' }}</span>
          <span class="progress-label">队伍已选歌</span>
        </div>
        <div class="progress-item" :class="{ done: trainingCompleted }">
          <span class="progress-icon">{{ trainingCompleted ? '✓' : '○' }}</span>
          <span class="progress-label">个人训练完成</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/authStore'
import { useTeamStore } from '../../stores/teamStore'
import { useSongStore } from '../../stores/songStore'

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
  return songStore.teamSongs.some(ts => ts.teamId === myTeam.value!.id)
})
const trainingCompleted = computed(() => {
  // 简单判断：训练次数达到要求，这里从 authStore 当前用户读取
  const user = authStore.currentUser
  if (!user) return false
  const drawsPerPlayer = 3 // 默认值，实际可从赛季配置读取
  return (user.trainingCount || 0) >= drawsPerPlayer
})

onMounted(() => {
  teamStore.fetchTeams(String(currentRound.value))
  songStore.fetchRoundSongs(String(currentRound.value))
})
</script>

<style lang="scss" scoped>
.player-concurrent {
  padding: 16px;
  min-height: 100%;
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
