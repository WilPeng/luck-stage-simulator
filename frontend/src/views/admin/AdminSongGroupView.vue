<template>
  <div class="admin-song-group">
    <div class="page-header">
      <h1>🎵 按歌分组管理</h1>
      <p class="subtitle">第{{ currentRound }}公演 · 选手按歌选组，同歌自动成组</p>
    </div>

    <div class="stat-cards">
      <div class="stat-card">
        <span class="stat-value">{{ songOptions.length }}</span>
        <span class="stat-label">歌曲/队伍数</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ assignedCount }}</span>
        <span class="stat-label">已入组选手</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ totalPlayers - assignedCount }}</span>
        <span class="stat-label">未入组</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ allFull ? '已满员' : '招募中' }}</span>
        <span class="stat-label">状态</span>
      </div>
    </div>

    <div class="action-bar">
      <t-button theme="primary" :loading="loading" @click="loadAll">刷新</t-button>
      <t-tag v-if="songReleased" theme="success" variant="light">选歌已开放</t-tag>
      <t-tag v-else theme="default" variant="light">选歌未开放</t-tag>
    </div>

    <div class="song-teams-list">
      <div
        v-for="opt in songOptions"
        :key="opt.songId"
        class="song-team-card"
        :class="{ full: opt.memberCount >= opt.maxMembers }"
      >
        <div class="song-team-header">
          <span class="song-team-icon">🎵</span>
          <div class="song-team-info">
            <span class="song-team-name">{{ opt.songName }}</span>
            <span class="song-team-style">{{ opt.style }}</span>
          </div>
          <span class="song-team-count">{{ opt.memberCount }}/{{ opt.maxMembers }} 人</span>
          <t-tag v-if="opt.memberCount >= opt.maxMembers" theme="success" size="small">已满员</t-tag>
          <t-tag v-else theme="warning" variant="light" size="small">招募中</t-tag>
        </div>

        <div class="song-team-members">
          <div v-for="member in getTeamMembers(opt.teamId)" :key="member.playerId" class="member-chip">
            <span class="chip-avatar">{{ getAvatarIcon(member.player?.name) }}</span>
            <span class="chip-name">{{ member.player?.name || '未知' }}</span>
            <span v-if="member.playerId === getTeamCaptainId(opt.teamId)" class="chip-badge">👑</span>
          </div>
          <div v-if="getTeamMembers(opt.teamId).length === 0" class="no-members">暂无成员</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useTeamStore } from '../../stores/teamStore'
import { getSongGroupOptions, getConcurrentReleaseStatus } from '../../services/api'
import type { SongGroupOption } from '../../services/api'

const route = useRoute()
const teamStore = useTeamStore()

const currentRound = computed(() => parseInt(route.params.round as string) || 1)
const loading = ref(false)
const songOptions = ref<SongGroupOption[]>([])
const songReleased = ref(false)
const totalPlayers = ref(0)

const assignedCount = computed(() => songOptions.value.reduce((s, o) => s + o.memberCount, 0))
const allFull = computed(() => songOptions.value.length > 0 && songOptions.value.every(o => o.memberCount >= o.maxMembers))

function getAvatarIcon(name?: string): string {
  const icons = ['🌟', '🎤', '💃', '✨', '🎵', '🎭', '🎨', '🎪']
  if (!name) return '🎤'
  return icons[name.charCodeAt(0) % icons.length]
}

function getTeamMembers(teamId: string | null) {
  if (!teamId) return []
  const team = teamStore.teams.find(t => t.id === teamId)
  return team?.members || []
}

function getTeamCaptainId(teamId: string | null): string | null {
  if (!teamId) return null
  const team = teamStore.teams.find(t => t.id === teamId)
  return team?.captainId || null
}

async function loadAll() {
  loading.value = true
  try {
    await teamStore.fetchTeams(`round-${currentRound.value}`)
    const [songRes, release] = await Promise.all([
      getSongGroupOptions(`round-${currentRound.value}`),
      getConcurrentReleaseStatus(`round-${currentRound.value}`)
    ])
    songOptions.value = songRes.options || []
    songReleased.value = !!release?.teamReleased || !!release?.songReleased
    // 计算总选手数
    totalPlayers.value = songRes.options?.reduce((s, o) => s + o.memberCount, 0) || 0
  } catch (e) {
    console.error('[AdminSongGroup] 加载失败:', e)
  } finally {
    loading.value = false
  }
}

onMounted(loadAll)
</script>

<style scoped lang="scss">
.admin-song-group {
  padding: 16px;
  min-height: 100%;
}

.page-header {
  margin-bottom: 20px;
  h1 { margin: 0 0 6px; font-size: 22px; color: var(--text-primary); }
  .subtitle { margin: 0; font-size: 13px; color: var(--text-secondary); }
}

.stat-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
  margin-bottom: 16px;

  .stat-card {
    background: var(--card-bg);
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);

    .stat-value { font-size: 24px; font-weight: 800; color: #667eea; }
    .stat-label { font-size: 12px; color: var(--text-tertiary); margin-top: 4px; }
  }
}

.action-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.song-teams-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.song-team-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);

  &.full {
    border-color: rgba(43, 164, 113, 0.4);
  }

  .song-team-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;

    .song-team-icon { font-size: 24px; }
    .song-team-info {
      flex: 1;
      display: flex;
      flex-direction: column;

      .song-team-name { font-size: 16px; font-weight: 700; }
      .song-team-style { font-size: 12px; color: var(--text-tertiary); }
    }
    .song-team-count { font-size: 14px; font-weight: 600; }
  }

  .song-team-members {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;

    .member-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: var(--hover-bg);
      border-radius: 20px;

      .chip-avatar { font-size: 14px; }
      .chip-name { font-size: 13px; }
      .chip-badge { font-size: 12px; }
    }

    .no-members {
      color: var(--text-tertiary);
      font-size: 13px;
      padding: 8px 0;
    }
  }
}
</style>
