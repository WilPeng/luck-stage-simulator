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
      <div class="section-head">
        <h2>本轮公演曲目</h2>
        <div class="section-actions">
          <t-button variant="outline" size="small" :loading="adding" @click="openAddDialog">
            ➕ 从歌曲库添加曲目
          </t-button>
          <t-button
            variant="outline"
            size="small"
            theme="success"
            :loading="randomAssigning"
            :disabled="unassignedTeams.length === 0 || unassignedSongs.length === 0"
            @click="handleRandomAssign"
          >
            🎲 一键随机分配剩余歌曲
          </t-button>
          <t-button
            variant="outline"
            size="small"
            theme="danger"
            :disabled="roundSongs.length === 0"
            @click="handleClearRound"
          >
            🗑️ 清空本轮曲目
          </t-button>
        </div>
      </div>
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
            <div v-if="!song.assignedTeamId" class="action-row">
              <t-button
                v-if="!song.released"
                theme="primary"
                block
                @click="releaseSong(song.id)"
              >
                释放
              </t-button>
              <t-button
                v-else
                theme="success"
                block
                @click="openAssignDialog(song)"
              >
                直接分配
              </t-button>
              <t-button
                theme="danger"
                variant="outline"
                size="small"
                @click="handleRemoveSong(song)"
              >
                移出本轮
              </t-button>
            </div>
            <t-button v-else theme="default" block disabled>
              已分配
            </t-button>
          </div>
        </div>
        <t-empty v-if="roundSongs.length === 0" description="本轮还没有曲目，点击右上角从歌曲库添加" />
      </div>
    </div>

    <!-- 添加曲目弹窗 -->
    <t-dialog
      v-model:visible="showAddDialog"
      header="从歌曲库添加本轮曲目"
      width="560px"
      :close-on-overlay-click="false"
      :destroy-on-close="true"
      :footer="false"
    >
      <div class="add-form">
        <div class="add-form-item">
          <label>选择歌曲（可多选）</label>
          <t-select
            v-model="selectedAddSongIds"
            :options="addableSongs"
            multiple
            placeholder="选择要加入本轮公演的歌曲"
            style="width: 100%"
          />
        </div>
        <div class="random-add-bar">
          <span class="random-add-label">🎲 随机选曲：</span>
          <t-input-number
            v-model="randomAddCount"
            :min="1"
            :max="Math.max(addableSongs.length, 1)"
            theme="normal"
            size="small"
            style="width: 80px"
          />
          <span class="random-add-hint">首（曲库可用 {{ addableSongs.length }} 首）</span>
          <t-button
            size="small"
            theme="warning"
            :disabled="addableSongs.length === 0"
            @click="handleRandomAdd"
          >
            随机选 {{ randomAddCount }} 首
          </t-button>
        </div>
        <div v-if="addableSongs.length === 0" class="add-empty">
          歌曲库为空，请先到「歌曲管理」添加歌曲
        </div>
        <div class="assign-form-actions">
          <t-button @click="showAddDialog = false">取消</t-button>
          <t-button
            theme="primary"
            :loading="adding"
            :disabled="selectedAddSongIds.length === 0"
            @click="handleAddSongs"
          >
            添加 ({{ selectedAddSongIds.length }})
          </t-button>
        </div>
      </div>
    </t-dialog>

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

// 添加曲目相关
const showAddDialog = ref(false)
const selectedAddSongIds = ref<string[]>([])
const adding = ref(false)
const randomAddCount = ref(5)

// 一键随机分配相关
const randomAssigning = ref(false)

const teams = computed(() => teamStore.teams)
const roundSongs = computed(() => songStore.roundSongs)

// 可从歌曲库添加的歌曲（排除已在本轮的）
const addableSongs = computed(() => {
  const existingIds = new Set(roundSongs.value.map(rs => rs.songId))
  return songStore.songs
    .filter(s => !existingIds.has(s.id))
    .map(s => ({ label: `${s.name}（${s.style || '未知风格'} · 难度${s.difficulty || '-'}）`, value: s.id }))
})

// 没有选歌的队伍
const teamsWithoutSong = computed(() => {
  return teams.value.filter(team => !getTeamSong(team.id))
})

// 未选歌队伍（用于一键随机分配）
const unassignedTeams = computed(() => teamsWithoutSong.value)

// 未分配的轮次歌曲（用于一键随机分配）
const unassignedSongs = computed(() => {
  return roundSongs.value.filter(rs => !rs.assignedTeamId)
})

function getRoundId(): string {
  const roundFromRoute = parseInt(route.params.round as string) || 0
  return roundFromRoute > 0 ? `round-${roundFromRoute}` : seasonStore.currentRoundId
}

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
    await songStore.releaseSong(roundSongId, getRoundId())
    MessagePlugin.success('歌曲已释放，队长可以抢选')
  } catch (error: any) {
    MessagePlugin.error(error.message || '释放失败')
  }
}

function openAddDialog() {
  selectedAddSongIds.value = []
  showAddDialog.value = true
}

// 随机从曲库选 N 首加入本轮
async function handleRandomAdd() {
  const pool = addableSongs.value
  const count = Math.min(Math.max(randomAddCount.value, 1), pool.length)
  if (pool.length === 0) {
    MessagePlugin.warning('曲库没有可选的歌曲')
    return
  }
  // 随机打乱并取前 N 首
  const shuffled = pool.map(s => s.value).sort(() => Math.random() - 0.5)
  selectedAddSongIds.value = [...new Set([...selectedAddSongIds.value, ...shuffled.slice(0, count)])]
  MessagePlugin.success(`已随机选中 ${count} 首`)
}

async function handleAddSongs() {
  if (selectedAddSongIds.value.length === 0) {
    MessagePlugin.warning('请选择要添加的歌曲')
    return
  }
  adding.value = true
  try {
    await songStore.addRoundSongs(selectedAddSongIds.value, getRoundId())
    MessagePlugin.success(`已添加 ${selectedAddSongIds.value.length} 首曲目到本轮`)
    showAddDialog.value = false
    await refreshData()
  } catch (error: any) {
    MessagePlugin.error(error.message || '添加失败')
  } finally {
    adding.value = false
  }
}

async function handleRemoveSong(song: RoundSong) {
  if (song.assignedTeamId) {
    MessagePlugin.warning('该歌曲已被队伍选走，不能移出本轮')
    return
  }
  const ok = window.confirm(`确定将「${getSongName(song.songId)}」移出本轮曲目吗？`)
  if (!ok) return
  try {
    await songStore.removeRoundSong(song.id, getRoundId())
    MessagePlugin.success('已移出本轮')
    await refreshData()
  } catch (error: any) {
    MessagePlugin.error(error.message || '移除失败')
  }
}

async function handleClearRound() {
  const ok = window.confirm(`确定清空本轮全部曲目（${roundSongs.value.length} 首）吗？`)
  if (!ok) return
  try {
    await songStore.clearRoundSongs(getRoundId())
    MessagePlugin.success('已清空本轮曲目')
    await refreshData()
  } catch (error: any) {
    MessagePlugin.error(error.message || '清空失败')
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
    await songStore.assignTeamSongs([
      {
        teamId: assignTeamId.value,
        songId: selectedSong.value.songId
      }
    ], getRoundId())
    MessagePlugin.success('分配成功')
    showAssignDialog.value = false
    await refreshData()
  } catch (error: any) {
    MessagePlugin.error(error.message || '分配失败')
  } finally {
    assigning.value = false
  }
}

// 一键随机分配剩余歌曲：把未分配歌曲随机分给未选歌队伍
async function handleRandomAssign() {
  const teams = unassignedTeams.value
  const songs = unassignedSongs.value
  if (teams.length === 0) {
    MessagePlugin.warning('所有队伍都已选歌')
    return
  }
  if (songs.length === 0) {
    MessagePlugin.warning('本轮没有剩余未分配歌曲，请先从歌曲库添加')
    return
  }
  if (songs.length < teams.length) {
    MessagePlugin.warning(`剩余歌曲 ${songs.length} 首不足队伍数 ${teams.length}，将只分配给前 ${songs.length} 个队伍`)
  }

  const assignCount = Math.min(teams.length, songs.length)
  const ok = window.confirm(`一键随机分配：将 ${songs.length} 首剩余歌曲随机分配给 ${teams.length} 个未选歌队伍（本次分配 ${assignCount} 个）？`)
  if (!ok) return

  randomAssigning.value = true
  try {
    // 随机打乱歌曲与队伍
    const shuffledSongs = songs.map(s => s.songId).sort(() => Math.random() - 0.5)
    const shuffledTeams = teams.map(t => t.id).sort(() => Math.random() - 0.5)
    const assignments = []
    for (let i = 0; i < assignCount; i++) {
      assignments.push({ teamId: shuffledTeams[i], songId: shuffledSongs[i] })
    }
    await songStore.assignTeamSongs(assignments, getRoundId())
    MessagePlugin.success(`已随机分配 ${assignCount} 首歌曲`)
    await refreshData()
  } catch (error: any) {
    MessagePlugin.error(error.message || '随机分配失败')
  } finally {
    randomAssigning.value = false
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

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 12px;

  h2 {
    margin: 0;
  }

  .section-actions {
    display: flex;
    gap: 8px;
  }
}

.action-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.add-form {
  padding: 16px 0;

  .add-form-item {
    margin-bottom: 16px;

    label {
      display: block;
      margin-bottom: 8px;
      font-size: 14px;
      font-weight: 500;
      color: var(--text-primary);
    }
  }

  .add-empty {
    font-size: 13px;
    color: var(--text-tertiary);
    padding: 12px;
    background: var(--bg-primary);
    border-radius: 6px;
    margin-bottom: 16px;
  }

  .random-add-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: rgba(243, 156, 18, 0.08);
    border: 1px dashed rgba(243, 156, 18, 0.4);
    border-radius: 8px;
    margin-bottom: 12px;

    .random-add-label {
      font-size: 13px;
      font-weight: 600;
      color: #d35400;
    }

    .random-add-hint {
      font-size: 12px;
      color: var(--text-secondary);
      flex: 1;
    }
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
