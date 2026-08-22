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
      <t-col :span="24">
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
    </t-row>

    <t-row :gutter="16" style="margin-top: 16px">
      <!-- 训练配置 -->
      <t-col :xs="24" :sm="8">
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
      <t-col :xs="24" :sm="8">
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
      <t-col :xs="24" :sm="8">
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, reactive, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useRoute } from 'vue-router'
import { useSeasonStore } from '../../stores/seasonStore'
import { usePlayerStore } from '../../stores/playerStore'
import { updateTeamSetup, updateRound, getTrainingConfig, getRoundTeams } from '../../services/api'

const route = useRoute()
const seasonStore = useSeasonStore()
const playerStore = usePlayerStore()

const currentRound = computed(() => parseInt(route.params.round as string) || seasonStore.currentRoundNumber)
const saving = ref(false)

// 配置数据
const config = reactive({
  teamCount: 5,
  teamSizes: [6, 6, 6, 6, 6] as number[],
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

// 是否可保存（仅需队伍结构与人数匹配）
const canSave = computed(() => {
  return totalMembers.value === availablePlayers.value
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

// 保存配置（只保存队伍结构与训练等参数；选曲在选歌页面进行）
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
  config.trainingTimesAllowed = 5
  config.eliminationCount = 5
  config.dangerLineRatio = 0.2
}

// 加载数据
async function loadData() {
  await Promise.all([
    seasonStore.fetchProgress(),
    playerStore.fetchUsers({ pageSize: 1000 })
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
  max-width: 1800px;
  margin: 0 auto;
  padding: 8px 4px;
  min-height: 100%;
  width: 100%;
}

.stage-card {
  border-radius: 14px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
  border: 1px solid var(--card-border);
}

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 12px;

  h1 {
    margin: 0 0 4px;
    font-size: 22px;
    font-weight: 700;
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
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.config-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

// 队伍结构：响应式多列，宽屏自动增多，窄屏回单列
.team-structure {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.team-size-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--bg-primary);
  border-radius: 10px;
  border: 1px solid var(--border-color);

  .team-label {
    font-size: 14px;
    color: var(--text-primary);
    font-weight: 500;
  }

  :deep(.t-input-number) {
    width: 90px;
  }
}

.config-summary {
  display: flex;
  gap: 32px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
  flex-wrap: wrap;
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
  gap: 12px;

  :deep(.t-input-number) {
    width: 120px;
  }
}

.actions-bar {
  margin-top: 24px;
  display: flex;
  gap: 12px;
  justify-content: center;
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
    gap: 20px;
  }

  .actions-bar {
    flex-direction: column;
    align-items: stretch;

    :deep(.t-button) {
      width: 100%;
    }
  }
}

@media (max-width: 480px) {
  .admin-preparation {
    padding: 4px 0;
  }

  .config-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>