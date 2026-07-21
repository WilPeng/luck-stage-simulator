<template>
  <div class="admin-preparation">
    <t-card class="stage-card" :bordered="false">
      <div class="page-head">
        <div>
          <h1>预先准备</h1>
          <p>配置第 {{ currentRound }} 公演的参数</p>
        </div>
        <div class="page-head-actions">
          <t-button variant="outline" @click="loadData">
            刷新
          </t-button>
        </div>
      </div>
    </t-card>

    <t-row :gutter="16">
      <!-- 队伍结构配置 -->
      <t-col :span="12">
        <t-card title="队伍结构" :bordered="false" class="stage-card">
          <template #subtitle>
            <t-tag theme="primary" variant="light">第 {{ currentRound }} 公演</t-tag>
          </template>
          <div class="config-section">
            <div class="config-header">
              <span class="config-label">设置本轮队伍数量</span>
              <t-input-number
                v-model="config.teamCount"
                :min="1"
                :max="20"
                theme="normal"
                @change="handleTeamCountChange"
              />
            </div>

            <div class="team-structure">
              <div
                v-for="(size, index) in config.teamSizes"
                :key="index"
                class="team-size-item"
              >
                <span class="team-label">{{ getTeamLabel(index) }}</span>
                <t-input-number
                  v-model="config.teamSizes[index]"
                  :min="1"
                  :max="10"
                  theme="normal"
                />
              </div>
            </div>

            <div class="config-summary">
              <div class="summary-item">
                <span class="summary-label">队伍总数</span>
                <span class="summary-value">{{ config.teamCount }} 队</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">人员总数</span>
                <span class="summary-value">{{ totalMembers }} 人</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">可用选手</span>
                <span class="summary-value">{{ availablePlayers }} 人</span>
              </div>
            </div>

            <t-alert v-if="totalMembers !== availablePlayers" theme="warning" style="margin-top: 16px">
              人员总数与可用选手数不匹配，请调整队伍人数
            </t-alert>
          </div>
        </t-card>
      </t-col>

      <!-- 歌曲配置 -->
      <t-col :span="12">
        <t-card title="歌曲池配置" :bordered="false" class="stage-card">
          <template #subtitle>
            <t-tag theme="primary" variant="light">第 {{ currentRound }} 公演</t-tag>
          </template>
          <div class="config-section">
            <div class="config-header">
              <span class="config-label">选择本轮歌曲池</span>
              <t-button size="small" @click="showSongDialog = true">
                添加歌曲
              </t-button>
            </div>

            <div v-if="selectedSongs.length > 0" class="song-pool">
              <div
                v-for="song in selectedSongs"
                :key="song.id"
                class="song-item"
              >
                <span class="song-name">{{ song.name }}</span>
                <span class="song-difficulty">难度 {{ song.difficulty }}</span>
                <button class="remove-btn" @click="removeSong(song.id)">×</button>
              </div>
            </div>
            <div v-else class="empty-songs">
              <span>暂未选择歌曲</span>
            </div>

            <div class="config-summary">
              <div class="summary-item">
                <span class="summary-label">歌曲数量</span>
                <span class="summary-value">{{ selectedSongs.length }} 首</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">队伍数量</span>
                <span class="summary-value">{{ config.teamCount }} 队</span>
              </div>
            </div>

            <t-alert v-if="selectedSongs.length < config.teamCount" theme="warning" style="margin-top: 16px">
              歌曲数量应不少于队伍数量
            </t-alert>
          </div>
        </t-card>
      </t-col>
    </t-row>

    <t-row :gutter="16" style="margin-top: 16px">
      <!-- 训练配置 -->
      <t-col :span="8">
        <t-card title="训练配置" :bordered="false" class="stage-card">
          <div class="config-item">
            <span class="config-label">每人训练次数</span>
            <t-input-number
              v-model="config.trainingTimesAllowed"
              :min="0"
              :max="20"
              theme="normal"
            />
          </div>
        </t-card>
      </t-col>

      <!-- 公演配置 -->
      <t-col :span="8">
        <t-card title="公演配置" :bordered="false" class="stage-card">
          <div class="config-item">
            <span class="config-label">淘汰人数</span>
            <t-input-number
              v-model="config.eliminationCount"
              :min="0"
              :max="20"
              theme="normal"
            />
          </div>
        </t-card>
      </t-col>

      <!-- 危险线配置 -->
      <t-col :span="8">
        <t-card title="危险线配置" :bordered="false" class="stage-card">
          <div class="config-item">
            <span class="config-label">危险线比例</span>
            <t-input-number
              v-model="config.dangerLineRatio"
              :min="0"
              :max="1"
              :step="0.1"
              theme="normal"
              :decimal="2"
            />
          </div>
        </t-card>
      </t-col>
    </t-row>

    <!-- 保存按钮 -->
    <div class="actions-bar">
      <t-button
        theme="primary"
        size="large"
        :loading="saving"
        :disabled="!canSave"
        @click="handleSave"
      >
        保存配置
      </t-button>
      <t-button
        variant="outline"
        size="large"
        @click="handleReset"
      >
        重置
      </t-button>
    </div>

    <!-- 歌曲选择弹窗 -->
    <t-dialog
      v-model:visible="showSongDialog"
      header="选择歌曲"
      width="600px"
    >
      <div class="song-selector">
        <t-input
          v-model="songSearch"
          placeholder="搜索歌曲"
          style="margin-bottom: 16px"
        />
        <div class="song-list">
          <div
            v-for="song in filteredSongs"
            :key="song.id"
            class="song-option"
            :class="{ selected: isSongSelected(song.id) }"
            @click="toggleSong(song)"
          >
            <span class="song-name">{{ song.name }}</span>
            <span class="song-info">{{ song.type }} | 难度 {{ song.difficulty }}</span>
            <t-tag v-if="isSongSelected(song.id)" theme="primary" size="small">已选</t-tag>
          </div>
        </div>
      </div>
      <template #footer>
        <t-button @click="showSongDialog = false">取消</t-button>
        <t-button theme="primary" @click="confirmSongSelection">确定</t-button>
      </template>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, reactive, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useRoute } from 'vue-router'
import { useSeasonStore } from '../../stores/seasonStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useSongStore } from '../../stores/songStore'
import type { Song } from '../../types/song'
import { updateTeamSetup, updateRound, addRoundSongs, getTrainingConfig, getRoundTeams, getRoundSongs } from '../../services/api'

const route = useRoute()
const seasonStore = useSeasonStore()
const playerStore = usePlayerStore()
const songStore = useSongStore()

const currentRound = computed(() => parseInt(route.params.round as string) || seasonStore.currentRoundNumber)
const saving = ref(false)
const showSongDialog = ref(false)
const songSearch = ref('')

// 配置数据
const config = reactive({
  teamCount: 5,
  teamSizes: [6, 6, 6, 6, 6] as number[],
  songPoolIds: [] as string[],
  trainingTimesAllowed: 5,
  eliminationCount: 5,
  dangerLineRatio: 0.2
})

// 可用选手数量（排除管理员和已淘汰的选手）
const availablePlayers = computed(() => {
  return playerStore.users.filter(u => u.role !== 'admin' && u.status !== 'eliminated').length
})

// 总人数
const totalMembers = computed(() => {
  return config.teamSizes.reduce((sum, size) => sum + size, 0)
})

// 选择的歌曲
const selectedSongs = computed(() => {
  return songStore.songs.filter(song => config.songPoolIds.includes(song.id))
})

// 过滤后的歌曲列表
const filteredSongs = computed(() => {
  if (!songSearch.value) return songStore.songs
  const keyword = songSearch.value.toLowerCase()
  return songStore.songs.filter(song =>
    song.name.toLowerCase().includes(keyword) ||
    song.type.toLowerCase().includes(keyword)
  )
})

// 是否可选
const canSave = computed(() => {
  return totalMembers.value === availablePlayers.value &&
         selectedSongs.value.length >= config.teamCount
})

// 获取队伍标签
function getTeamLabel(index: number): string {
  const labels = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
  return labels[index] ? `第${labels[index]}队` : `队伍 ${index + 1}`
}

// 队伍数量变化
function handleTeamCountChange(value: number) {
  const oldCount = config.teamSizes.length
  if (value > oldCount) {
    for (let i = oldCount; i < value; i++) {
      config.teamSizes.push(4)
    }
  } else if (value < oldCount) {
    config.teamSizes.splice(value)
  }
}

// 检查歌曲是否已选
function isSongSelected(songId: string): boolean {
  return config.songPoolIds.includes(songId)
}

// 切换歌曲选择
function toggleSong(song: Song) {
  const index = config.songPoolIds.indexOf(song.id)
  if (index === -1) {
    config.songPoolIds.push(song.id)
  } else {
    config.songPoolIds.splice(index, 1)
  }
}

// 确认歌曲选择
function confirmSongSelection() {
  showSongDialog.value = false
}

// 移除歌曲
function removeSong(songId: string) {
  const index = config.songPoolIds.indexOf(songId)
  if (index !== -1) {
    config.songPoolIds.splice(index, 1)
  }
}

// 保存配置
async function handleSave() {
  saving.value = true
  try {
    const roundId = `round-${currentRound.value}`

    await Promise.all([
      updateTeamSetup({
        roundId,
        teamCount: config.teamCount,
        teamSizes: config.teamSizes
      }),
      updateRound({
        performanceRound: currentRound.value,
        drawsPerPlayer: config.trainingTimesAllowed
      }),
      addRoundSongs({
        roundId,
        songs: config.songPoolIds.map(songId => ({
          songId,
          songType: 'team_show'
        }))
      })
    ])

    MessagePlugin.success('配置已保存')
  } catch (e: any) {
    MessagePlugin.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

// 重置
function handleReset() {
  config.teamCount = 5
  config.teamSizes = [6, 6, 6, 6, 6]
  config.songPoolIds = []
  config.trainingTimesAllowed = 5
  config.eliminationCount = 5
  config.dangerLineRatio = 0.2
}

// 加载数据
async function loadData() {
  await Promise.all([
    seasonStore.fetchProgress(),
    playerStore.fetchUsers({ pageSize: 1000 }),
    songStore.fetchSongs()
  ])

  // 加载已保存的配置
  await loadSavedConfig()
}

// 加载已保存的配置并回填表单
async function loadSavedConfig() {
  const roundId = `round-${currentRound.value}`

  // 1. 加载队伍配置
  try {
    const teams = await getRoundTeams(roundId)
    if (teams && teams.length > 0) {
      config.teamCount = teams.length
      config.teamSizes = teams.map(t => t.maxMembers || t.memberIds?.length || 6)
    }
  } catch (e) {
    console.warn('[Preparation] 加载队伍配置失败:', e)
  }

  // 2. 加载歌曲池
  try {
    const roundSongs = await getRoundSongs(roundId)
    if (roundSongs && roundSongs.length > 0) {
      config.songPoolIds = roundSongs.map(rs => rs.songId)
    }
  } catch (e) {
    console.warn('[Preparation] 加载歌曲池失败:', e)
  }

  // 3. 加载训练配置
  try {
    const trainingConfig = await getTrainingConfig()
    if (trainingConfig?.drawsPerPlayer !== undefined) {
      config.trainingTimesAllowed = trainingConfig.drawsPerPlayer
    }
  } catch (e) {
    console.warn('[Preparation] 加载训练配置失败:', e)
  }
}

onMounted(loadData)

// 切换轮次时重新加载配置
watch(currentRound, () => {
  loadData()
})
</script>

<style lang="scss" scoped>
.admin-preparation {
  max-width: 1400px;
}

.stage-card {
  border-radius: 8px;
}

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;

  h1 {
    margin: 0 0 4px;
    font-size: 20px;
  }

  p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 13px;
  }
}

.page-head-actions {
  display: flex;
  gap: 8px;
}

.config-section {
  padding: 8px 0;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.config-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.team-structure {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.team-size-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--bg-primary);
  border-radius: 6px;

  .team-label {
    font-size: 14px;
    color: var(--text-primary);
  }
}

.song-pool {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.song-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--bg-primary);
  border-radius: 6px;

  .song-name {
    flex: 1;
    font-size: 14px;
  }

  .song-difficulty {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .remove-btn {
    width: 20px;
    height: 20px;
    border: none;
    background: none;
    color: var(--text-tertiary);
    cursor: pointer;
    font-size: 16px;

    &:hover {
      color: #e74c3c;
    }
  }
}

.empty-songs {
  padding: 24px;
  text-align: center;
  color: var(--text-tertiary);
  background: var(--bg-primary);
  border-radius: 6px;
  margin-bottom: 16px;
}

.config-summary {
  display: flex;
  gap: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .summary-label {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .summary-value {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
  }
}

.config-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.actions-bar {
  margin-top: 24px;
  display: flex;
  gap: 12px;
  justify-content: center;
}

.song-selector {
  .song-list {
    max-height: 400px;
    overflow-y: auto;
  }
}

.song-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: var(--bg-primary);
  }

  &.selected {
    border-color: #0052d9;
    background: rgba(0, 82, 217, 0.05);
  }

  .song-name {
    flex: 1;
    font-size: 14px;
    font-weight: 500;
  }

  .song-info {
    font-size: 12px;
    color: var(--text-secondary);
  }
}

@media (max-width: 768px) {
  .t-col {
    margin-bottom: 16px;
  }

  .page-head {
    flex-direction: column;
    gap: 12px;
  }

  .config-summary {
    flex-wrap: wrap;
  }
}
</style>