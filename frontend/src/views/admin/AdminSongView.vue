<template>
  <div class="admin-song-selection">
    <div class="page-header">
      <h1>选歌阶段</h1>
      <div class="header-actions">
        <t-button theme="primary" @click="refreshData">刷新</t-button>
      </div>
    </div>

    <!-- 队伍列表 -->
    <div class="section">
      <h2>队伍信息</h2>
      <div class="teams-grid">
        <div v-for="team in teams" :key="team.id" class="team-card">
          <div class="team-header">
            <div class="team-name">{{ team.name }}</div>
            <div class="team-status">
              <t-tag v-if="getTeamSong(team.id)" theme="success" variant="light">
                已选歌: {{ getSongName(getTeamSong(team.id)!.songId) }}
              </t-tag>
              <t-tag v-else theme="warning" variant="light">未选歌</t-tag>
            </div>
          </div>
          <div class="team-members">
            <div class="captain-info">
              <span class="label">队长:</span>
              <span class="captain-name">{{ getCaptainName(team) }}</span>
            </div>
            <div class="members-list">
              <div v-for="member in team.members" :key="member.id" class="member-item">
                <span class="member-name">{{ member.player?.name }}</span>
                <t-tag v-if="member.playerId === team.captainId" size="small" theme="primary">队长</t-tag>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 歌曲列表 -->
    <div class="section">
      <h2>歌曲列表</h2>
      <div class="songs-grid">
        <div v-for="song in roundSongs" :key="song.id" class="song-card">
          <div class="song-header">
            <div class="song-title">{{ getSongName(song.songId) }}</div>
            <div class="song-status">
              <t-tag v-if="song.assignedTeamId" theme="success" variant="light">
                已被 {{ getTeamName(song.assignedTeamId) }} 选走
              </t-tag>
              <t-tag v-else-if="song.released" theme="warning" variant="light">抢选中</t-tag>
              <t-tag v-else theme="default" variant="light">未释放</t-tag>
            </div>
          </div>
          <div class="song-info">
            <div class="info-item">
              <span class="label">风格:</span>
              <span class="value">{{ getSongStyle(song.songId) }}</span>
            </div>
            <div class="info-item">
              <span class="label">难度:</span>
              <span class="value">{{ getSongDifficulty(song.songId) }}</span>
            </div>
          </div>
          <div class="song-weights">
            <div class="weight-bar">
              <div class="weight-label">Vocal</div>
              <div class="weight-track">
                <div class="weight-fill vocal" :style="{ width: getSongWeightPercent(song.songId, 'vocal') + '%' }"></div>
              </div>
              <span class="weight-value">{{ getSongWeight(song.songId, 'vocal') }}</span>
            </div>
            <div class="weight-bar">
              <div class="weight-label">Dance</div>
              <div class="weight-track">
                <div class="weight-fill dance" :style="{ width: getSongWeightPercent(song.songId, 'dance') + '%' }"></div>
              </div>
              <span class="weight-value">{{ getSongWeight(song.songId, 'dance') }}</span>
            </div>
            <div class="weight-bar">
              <div class="weight-label">Charm</div>
              <div class="weight-track">
                <div class="weight-fill charm" :style="{ width: getSongWeightPercent(song.songId, 'charm') + '%' }"></div>
              </div>
              <span class="weight-value">{{ getSongWeight(song.songId, 'charm') }}</span>
            </div>
          </div>
          <div class="song-actions">
            <t-button
              v-if="!song.released && !song.assignedTeamId"
              theme="primary"
              block
              @click="releaseSong(song.id)"
            >
              释放
            </t-button>
            <template v-else-if="song.released && !song.assignedTeamId">
              <t-button
                theme="success"
                block
                @click="openAssignDialog(song)"
              >
                直接分配
              </t-button>
              <t-tag theme="warning" variant="light" style="margin-top: 8px; display: block; text-align: center;">
                抢选中 - 也可直接分配
              </t-tag>
            </template>
            <t-button
              v-else
              theme="default"
              block
              disabled
            >
              已分配
            </t-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 分配歌曲弹窗 -->
    <t-dialog
      v-model:visible="showAssignDialog"
      header="分配歌曲给队伍"
      width="400px"
      :close-on-overlay-click="false"
      :destroy-on-close="true"
      :footer="false"
    >
      <div class="assign-form">
        <div class="assign-song-info">
          <span class="assign-label">歌曲：</span>
          <span class="assign-song-name">{{ selectedSong?.song?.name || getSongName(selectedSong?.songId || '') }}</span>
        </div>
        <div class="assign-form-item">
          <label>选择队伍</label>
          <t-select v-model="assignTeamId" placeholder="选择要分配的队伍">
            <t-option
              v-for="team in teamsWithoutSong"
              :key="team.id"
              :value="team.id"
              :label="team.name"
            />
          </t-select>
        </div>
        <div class="assign-form-actions">
          <t-button @click="showAssignDialog = false">取消</t-button>
          <t-button theme="primary" :loading="assigning" @click="handleAdminAssign">确认分配</t-button>
        </div>
      </div>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { useTeamStore } from '../../stores/teamStore'
import { useSongStore } from '../../stores/songStore'
import { useSeasonStore } from '../../stores/seasonStore'
import { getTeams as dsGetTeams } from '../../services/dataService'
import type { RoundTeam } from '../../types/round'
import type { RoundSong } from '../../types/round'

const route = useRoute()
const teamStore = useTeamStore()
const songStore = useSongStore()
const seasonStore = useSeasonStore()

const loading = ref(false)
const showAssignDialog = ref(false)
const selectedSong = ref<RoundSong | null>(null)
const assignTeamId = ref('')
const assigning = ref(false)

const teams = computed(() => teamStore.teams)
const roundSongs = computed(() => songStore.roundSongs)

// 没有选歌的队伍
const teamsWithoutSong = computed(() => {
  return teams.value.filter(team => !getTeamSong(team.id))
})

function getTeamName(teamId: string): string {
  if (!teams.value || teams.value.length === 0) {
    console.warn('[AdminSongView] teams 为空，无法获取队伍名称, teamId:', teamId)
    return '未知队伍'
  }
  const team = teams.value.find(t => t.id === teamId)
  if (!team) {
    console.warn(`[AdminSongView] 未找到队伍: ${teamId}`, teams.value.map(t => t.id))
    return '未知队伍'
  }
  return team.name || '未知队伍'
}

function getCaptainName(team: RoundTeam): string {
  const captain = team.members?.find(m => m.playerId === team.captainId)
  return captain?.player?.name || '未指定'
}

function getTeamSong(teamId: string) {
  return songStore.teamSongs.find(ts => ts.teamId === teamId)
}

function getSongName(songId: string): string {
  const song = songStore.songs.find(s => s.id === songId)
  return song?.name || '未知歌曲'
}

function getSongStyle(songId: string): string {
  const song = songStore.songs.find(s => s.id === songId)
  return song?.style || '-'
}

function getSongDifficulty(songId: string): number {
  const song = songStore.songs.find(s => s.id === songId)
  return song?.difficulty || 0
}

function getSongWeight(songId: string, type: 'vocal' | 'dance' | 'charm'): number {
  const song = songStore.songs.find(s => s.id === songId)
  if (!song) return 0
  const map = { vocal: song.vocalWeight, dance: song.danceWeight, charm: song.charmWeight }
  return map[type] || 0
}

function getSongWeightPercent(songId: string, type: 'vocal' | 'dance' | 'charm'): number {
  const song = songStore.songs.find(s => s.id === songId)
  if (!song) return 0
  const total = song.vocalWeight + song.danceWeight + song.charmWeight
  if (total === 0) return 0
  const map = { vocal: song.vocalWeight, dance: song.danceWeight, charm: song.charmWeight }
  return Math.round((map[type] / total) * 100)
}

async function releaseSong(roundSongId: string) {
  try {
    // 从路由参数获取轮次号，确保使用正确的 roundId
    const roundFromRoute = parseInt(route.params.round as string) || 0
    const roundId = roundFromRoute > 0 ? `round-${roundFromRoute}` : seasonStore.currentRoundId
    await songStore.releaseSong(roundSongId, roundId)
    MessagePlugin.success('歌曲已释放，队长可以抢选')
  } catch (error: any) {
    MessagePlugin.error(error.message || '释放失败')
  }
}

function openAssignDialog(song: RoundSong) {
  selectedSong.value = song
  assignTeamId.value = ''
  showAssignDialog.value = true
}

async function handleAdminAssign() {
  if (!selectedSong.value || !assignTeamId.value) {
    MessagePlugin.warning('请选择队伍')
    return
  }
  
  assigning.value = true
  try {
    // 从路由参数获取轮次号
    const roundFromRoute = parseInt(route.params.round as string) || 0
    const roundId = roundFromRoute > 0 ? `round-${roundFromRoute}` : seasonStore.currentRoundId
    // 调用后端接口直接分配
    // 注意：selectedSong 是 RoundSong，需要用 songId 字段（歌曲库 ID）
    await songStore.assignTeamSongs([
      {
        teamId: assignTeamId.value,
        songId: selectedSong.value.songId
      }
    ], roundId)
    MessagePlugin.success('分配成功')
    showAssignDialog.value = false
    await refreshData()
  } catch (error: any) {
    MessagePlugin.error(error.message || '分配失败')
  } finally {
    assigning.value = false
  }
}

async function refreshData() {
  loading.value = true
  try {
    // 从路由参数获取轮次号，确保不同轮次加载各自的选歌数据
    const roundFromRoute = parseInt(route.params.round as string) || 0
    const roundId = roundFromRoute > 0 ? `round-${roundFromRoute}` : seasonStore.currentRoundId
    if (!roundId) {
      MessagePlugin.error('当前轮次未设置')
      return
    }
    // 先加载队伍数据（getTeamName 依赖于 teams），再并行加载歌曲数据
    await teamStore.fetchTeams(roundId)
    console.log('[AdminSongView] teams loaded:', teams.value.length, 'teams')
    
    // 如果 teams 为空，从 dataService 直接读取（防止 seasonStore 干扰）
    if (teams.value.length === 0) {
      const dsData = dsGetTeams(roundId)
      if (dsData.length > 0) {
        console.log('[AdminSongView] 从 dataService 恢复队伍数据:', dsData.length, 'teams')
        teamStore.teams = dsData
      }
    }
    
    await Promise.all([
      songStore.fetchRoundSongs(roundId),
      songStore.fetchTeamSongs(roundId),
      songStore.fetchSongs()
    ])
    console.log('[AdminSongView] all data loaded')
  } catch (error: any) {
    MessagePlugin.error(error.message || '刷新失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  refreshData()
})
</script>

<style scoped lang="scss">
.admin-song-selection {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;

  h1 {
    font-size: 28px;
    font-weight: 600;
    margin: 0;
  }
}

.section {
  margin-bottom: 40px;

  h2 {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 16px;
  }
}

.teams-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.team-card {
  background: var(--card-bg);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: all 0.3s;

  &:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  }
}

.team-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.team-name {
  font-size: 18px;
  font-weight: 600;
}

.team-members {
  .captain-info {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    padding: 8px 12px;
    background: var(--bg-primary);
    border-radius: 6px;

    .label {
      font-size: 14px;
      color: var(--text-secondary);
    }

    .captain-name {
      font-size: 14px;
      font-weight: 600;
      color: #0052cc;
    }
  }

  .members-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .member-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--bg-primary);
    border-radius: 6px;
    font-size: 14px;

    .member-name {
      color: var(--text-primary);
    }
  }
}

.songs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.song-card {
  background: var(--card-bg);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: all 0.3s;

  &:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  }
}

.song-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.song-title {
  font-size: 18px;
  font-weight: 600;
}

.song-info {
  margin-bottom: 16px;

  .info-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;

    .label {
      font-size: 14px;
      color: var(--text-secondary);
    }

    .value {
      font-size: 14px;
      font-weight: 500;
    }
  }
}

.song-actions {
  margin-top: 16px;
}

.song-weights {
  padding: 12px 0;
  border-top: 1px solid var(--border-color);
  margin-top: 4px;
}

.weight-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;

  &:last-child {
    margin-bottom: 0;
  }
}

.weight-label {
  width: 48px;
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.weight-track {
  flex: 1;
  height: 8px;
  background: var(--progress-bg);
  border-radius: 4px;
  overflow: hidden;
}

.weight-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;

  &.vocal {
    background: linear-gradient(90deg, #e34d59, #f78ba7);
  }

  &.dance {
    background: linear-gradient(90deg, #00a870, #8fd4a0);
  }

  &.charm {
    background: linear-gradient(90deg, #ed7b2f, #ffcbae);
  }
}

.weight-value {
  width: 20px;
  font-size: 12px;
  font-weight: 600;
  text-align: right;
  color: var(--text-primary);
}

.assign-form {
  padding: 16px 0;
}

.assign-song-info {
  margin-bottom: 20px;
  padding: 12px;
  background: var(--bg-primary);
  border-radius: 6px;
}

.assign-label {
  font-size: 14px;
  color: var(--text-secondary);
  margin-right: 8px;
}

.assign-song-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.assign-form-item {
  margin-bottom: 20px;

  label {
    display: block;
    margin-bottom: 8px;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
  }
}

.assign-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}
</style>
