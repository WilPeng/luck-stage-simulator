<template>
  <div class="player-song-group">
    <StageStatusView :round="currentRound" stage="teaming">
      <template #current>
        <div class="team-header">
          <h1>🎵 按歌分组</h1>
          <p class="subtitle">选择一首你想演唱的歌曲，选到同一首歌的选手会自动组成一队</p>
        </div>

        <!-- 未开放提示 -->
        <div v-if="!songReleased" class="release-locked-banner">
          <span class="lock-icon">🔒</span>
          <div class="lock-text">
            <div class="lock-title">选歌分组尚未开放</div>
            <div class="lock-desc">请等待管理员开放按歌分组</div>
          </div>
        </div>

        <!-- 我已选歌曲的队伍 -->
        <div v-if="myTeam" class="section-card">
          <div class="section-title-bar"><span class="section-icon">🏠</span><span>我的队伍</span></div>
          <div class="team-card-modern">
            <div class="team-card-header">
              <span class="team-name-large">{{ myTeam.name }}</span>
              <span class="team-capacity">{{ myTeam.members?.length || 0 }} / {{ myTeam.maxMembers }} 人</span>
            </div>
            <div class="member-chips">
              <div v-for="member in myTeam.members" :key="member.playerId" class="member-chip" :class="{ 'chip-captain': member.playerId === myTeam.captainId }">
                <div class="chip-avatar">{{ getAvatarIcon(member.player?.name) }}</div>
                <span class="chip-name">{{ member.player?.name || '未知' }}</span>
                <span v-if="member.playerId === myTeam.captainId" class="chip-badge">👑</span>
              </div>
              <div v-if="!myTeam.members || myTeam.members.length === 0" class="no-data">暂无成员</div>
            </div>
          </div>
        </div>

        <!-- 歌曲选择 -->
        <div class="section-title-bar">
          <span class="section-icon">🎶</span>
          <span>可选择的歌曲</span>
          <span class="sub-count">{{ songOptions.length }} 首</span>
        </div>
        <div class="song-options-grid">
          <div
            v-for="opt in songOptions"
            :key="opt.songId"
            class="song-option-card"
            :class="{
              selected: myTeam && songOptions.find(o => o.teamId === myTeam.id)?.songId === opt.songId,
              full: opt.memberCount >= opt.maxMembers
            }"
          >
            <div class="song-option-icon">🎵</div>
            <div class="song-option-info">
              <span class="song-option-name">{{ opt.songName }}</span>
              <span class="song-option-style">{{ opt.style }}</span>
              <span class="song-option-count">{{ opt.memberCount }}/{{ opt.maxMembers }} 人</span>
            </div>
            <t-button
              v-if="songReleased && !(myTeam && songOptions.find(o => o.teamId === myTeam.id)?.songId === opt.songId)"
              theme="primary"
              size="small"
              :loading="selectingSongId === opt.songId"
              :disabled="opt.memberCount >= opt.maxMembers"
              @click="handleSelectSong(opt)"
            >
              选这首
            </t-button>
            <t-tag v-else-if="myTeam && songOptions.find(o => o.teamId === myTeam.id)?.songId === opt.songId" theme="success" variant="light">已选</t-tag>
            <t-tag v-else theme="default" variant="light">满员</t-tag>
          </div>
        </div>
        <div v-if="songOptions.length === 0" class="empty-tip">暂无可选歌曲</div>
      </template>
    </StageStatusView>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { useAuthStore } from '../../stores/authStore'
import { useTeamStore } from '../../stores/teamStore'
import { usePlayerStore } from '../../stores/playerStore'
import { getConcurrentReleaseStatus, getSongGroupOptions, selectSongForGroup } from '../../services/api'
import type { ConcurrentReleaseStatusResponse } from '../../types/season'
import type { SongGroupOption } from '../../services/api'
import StageStatusView from '../../components/StageStatusView.vue'

const route = useRoute()
const teamStore = useTeamStore()
const playerStore = usePlayerStore()
const authStore = useAuthStore()

const currentRound = computed(() => parseInt(route.params.round as string) || 1)

const releaseStatus = ref<ConcurrentReleaseStatusResponse | null>(null)
const songReleased = ref(false)
const songOptions = ref<SongGroupOption[]>([])
const selectingSongId = ref<string | null>(null)
let releaseTimer: number | undefined

const currentUser = computed(() => authStore.currentUser)

const myTeam = computed(() => {
  if (!currentUser.value) return null
  return teamStore.teams.find(t =>
    t.captainId === currentUser.value!.id ||
    t.members?.some(m => m.playerId === currentUser.value!.id)
  ) || null
})

function getAvatarIcon(name?: string): string {
  const icons = ['🌟', '🎤', '💃', '✨', '🎵', '🎭', '🎨', '🎪']
  if (!name) return '🎤'
  return icons[name.charCodeAt(0) % icons.length]
}

async function loadReleaseStatus() {
  try {
    releaseStatus.value = await getConcurrentReleaseStatus(`round-${currentRound.value}`)
    songReleased.value = !!releaseStatus.value?.teamReleased || !!releaseStatus.value?.songReleased
  } catch (e) {
    releaseStatus.value = null
  }
}

async function loadSongOptions() {
  try {
    const res = await getSongGroupOptions(`round-${currentRound.value}`)
    songOptions.value = res.options || []
    songReleased.value = !!res.songReleased
  } catch (e) {
    songOptions.value = []
  }
}

async function loadAll() {
  await teamStore.fetchTeams(`round-${currentRound.value}`)
  await loadSongOptions()
}

async function handleSelectSong(option: SongGroupOption) {
  if (selectingSongId.value) return
  if (option.memberCount >= option.maxMembers && !myTeam.value?.id) {
    MessagePlugin.warning('该歌曲队伍已满员')
    return
  }
  selectingSongId.value = option.songId
  try {
    await selectSongForGroup(`round-${currentRound.value}`, option.songId)
    MessagePlugin.success(`已加入「${option.songName}」组`)
    await loadAll()
  } catch (e: any) {
    MessagePlugin.error(e.message || '选歌失败')
  } finally {
    selectingSongId.value = null
  }
}

onMounted(async () => {
  await Promise.all([
    playerStore.fetchUsers({ pageSize: 1000 }),
    loadReleaseStatus()
  ])
  await loadAll()
  releaseTimer = window.setInterval(() => {
    loadReleaseStatus()
    loadSongOptions()
  }, 8000)
})

onBeforeUnmount(() => {
  if (releaseTimer) window.clearInterval(releaseTimer)
})
</script>

<style scoped lang="scss">
.player-song-group {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

.team-header {
  margin-bottom: 24px;
  h1 { font-size: 24px; font-weight: 700; margin: 0 0 8px; color: var(--text-primary); }
  .subtitle { color: var(--text-tertiary); font-size: 14px; margin: 0; }
}

.release-locked-banner {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; margin-bottom: 20px;
  background: rgba(255, 215, 0, 0.08);
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 12px;
  .lock-icon { font-size: 24px; }
  .lock-text { flex: 1; }
  .lock-title { font-size: 14px; font-weight: 600; color: #ffd700; }
  .lock-desc { font-size: 12px; color: var(--text-tertiary); }
}

.section-title-bar {
  display: flex; align-items: center; gap: 8px;
  font-size: 16px; font-weight: 600; margin-bottom: 16px;
  .section-icon { font-size: 20px; }
  .sub-count { font-size: 13px; color: var(--text-tertiary); }
}

.section-card {
  background: var(--hover-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
}

.team-card-modern {
  .team-card-header {
    display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;
    .team-name-large { font-size: 17px; font-weight: 700; }
    .team-capacity { font-size: 13px; color: var(--text-tertiary); }
  }
}

.member-chips {
  display: flex; flex-wrap: wrap; gap: 8px;
  .member-chip {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 12px; background: var(--bg-primary); border-radius: 20px;
    .chip-avatar { font-size: 16px; }
    .chip-name { font-size: 13px; }
    .chip-badge { font-size: 12px; }
    &.chip-captain { border: 1px solid #f39c12; }
  }
  .no-data { color: var(--text-tertiary); font-size: 13px; }
}

.song-options-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin-bottom: 20px;

  @media (min-width: 480px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (min-width: 768px) {
    grid-template-columns: repeat(3, 1fr);
  }
}

.song-option-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--hover-bg);
  border: 2px solid var(--border-color);
  border-radius: 12px;
  transition: all 0.2s;

  &.selected {
    border-color: #2ba471;
    background: rgba(43, 164, 113, 0.08);
  }

  &.full {
    opacity: 0.7;
  }

  .song-option-icon { font-size: 28px; }

  .song-option-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;

    .song-option-name { font-size: 15px; font-weight: 700; color: var(--text-primary); }
    .song-option-style { font-size: 12px; color: var(--text-tertiary); }
    .song-option-count { font-size: 12px; color: var(--text-secondary); font-weight: 500; }
  }
}

.empty-tip {
  padding: 32px; text-align: center; color: var(--text-tertiary);
}
</style>
