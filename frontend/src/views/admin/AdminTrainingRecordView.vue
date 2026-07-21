<template>
  <div class="admin-training-records">
    <PerformanceRoundBar />

    <div class="round-selector">
      <label>当前轮次：</label>
      <t-select v-model="currentRound" :options="roundOptions" @change="onRoundChange" style="width: 120px" />
    </div>

    <div class="page-header">
      <div>
        <h1>训练记录</h1>
        <p>查看所有选手的训练记录和属性变动</p>
      </div>
      <t-button theme="primary" variant="outline" :loading="loading" @click="loadData">
        刷新
      </t-button>
    </div>

    <t-card :bordered="false" class="filter-card">
      <div class="filter-grid">
        <t-select v-model="selectedUserId" clearable placeholder="筛选选手">
          <t-option
            v-for="player in playerOptions"
            :key="player.id"
            :value="player.id"
            :label="player.name"
          />
        </t-select>
        <t-input v-model="keyword" clearable placeholder="搜索选手或卡牌" />
      </div>
    </t-card>

    <div class="stats-grid">
      <t-card :bordered="false" class="stat-card">
        <span class="stat-value">{{ playerOptions.length }}</span>
        <span class="stat-label">选手数</span>
      </t-card>
      <t-card :bordered="false" class="stat-card">
        <span class="stat-value">{{ filteredRecords.length }}</span>
        <span class="stat-label">记录数</span>
      </t-card>
      <t-card :bordered="false" class="stat-card">
        <span class="stat-value">{{ trainedPlayerCount }}</span>
        <span class="stat-label">已训练</span>
      </t-card>
    </div>

    <t-loading :loading="loading" text="加载中...">
      <t-card :bordered="false" class="section-card">
        <template #title>
          <div class="section-title">
            <span>属性变动汇总</span>
            <t-tag theme="primary" variant="light">{{ filteredSummaries.length }} 人</t-tag>
          </div>
        </template>

        <div class="summary-list">
          <div v-for="summary in filteredSummaries" :key="summary.user.id" class="summary-item">
            <div class="summary-main">
              <div>
                <span class="player-name">{{ summary.user.name }}</span>
                <span class="player-code">{{ summary.user.loginCode }}</span>
              </div>
              <t-tag size="small" :theme="summary.recordCount > 0 ? 'success' : 'default'" variant="light">
                {{ summary.recordCount }} 次
              </t-tag>
            </div>

            <div class="attr-line">
              <span>当前 Vocal {{ summary.user.attributes?.vocal || 0 }}</span>
              <span>Dance {{ summary.user.attributes?.dance || 0 }}</span>
              <span>Charm {{ summary.user.attributes?.charm || 0 }}</span>
            </div>

            <div class="change-line">
              <span :class="effectClass(summary.totalEffect.vocal)">Vocal {{ formatEffect(summary.totalEffect.vocal) }}</span>
              <span :class="effectClass(summary.totalEffect.dance)">Dance {{ formatEffect(summary.totalEffect.dance) }}</span>
              <span :class="effectClass(summary.totalEffect.charm)">Charm {{ formatEffect(summary.totalEffect.charm) }}</span>
            </div>
          </div>
        </div>

        <t-empty v-if="filteredSummaries.length === 0" description="暂无选手数据" />
      </t-card>

      <t-card :bordered="false" class="section-card">
        <template #title>
          <div class="section-title">
            <span>训练明细</span>
            <t-tag theme="primary" variant="light">{{ filteredRecords.length }} 条</t-tag>
          </div>
        </template>

        <div class="record-list">
          <div v-for="record in filteredRecords" :key="record.id" class="record-item">
            <div class="record-main">
              <div>
                <span class="record-user">{{ recordUserName(record) }}</span>
                <span class="record-card">{{ record.cardName }}</span>
              </div>
              <span class="record-time">{{ formatTime(record.createdAt) }}</span>
            </div>

            <div class="change-line">
              <span :class="effectClass(record.effect?.vocal)">Vocal {{ formatEffect(record.effect?.vocal) }}</span>
              <span :class="effectClass(record.effect?.dance)">Dance {{ formatEffect(record.effect?.dance) }}</span>
              <span :class="effectClass(record.effect?.charm)">Charm {{ formatEffect(record.effect?.charm) }}</span>
            </div>

            <div v-if="record.attributesAfter" class="after-line">
              训练后：Vocal {{ record.attributesAfter.vocal }} / Dance {{ record.attributesAfter.dance }} / Charm {{ record.attributesAfter.charm }}
            </div>
          </div>
        </div>

        <t-empty v-if="filteredRecords.length === 0" description="暂无训练记录" />
      </t-card>
    </t-loading>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { usePlayerStore } from '../../stores/playerStore'
import { useTrainingCardStore } from '../../stores/trainingCardStore'
import { useSeasonStore } from '../../stores/seasonStore'
import PerformanceRoundBar from '../../components/common/PerformanceRoundBar.vue'
import type { TrainingRecord } from '../../types/training'
import type { User } from '../../types/user'

interface PlayerTrainingSummary {
  user: User
  recordCount: number
  totalEffect: {
    vocal: number
    dance: number
    charm: number
  }
}

const playerStore = usePlayerStore()
const trainingStore = useTrainingCardStore()
const seasonStore = useSeasonStore()

const loading = ref(false)
const selectedUserId = ref('')
const keyword = ref('')
const currentRound = computed({
  get: () => seasonStore.currentRoundIndex,
  set: (val: number) => seasonStore.setCurrentRoundIndex(val)
})

const roundOptions = computed(() => {
  const max = Math.max(seasonStore.season?.currentRound || 1, 1)
  return Array.from({ length: max }, (_, i) => ({ label: `第 ${i + 1 }次公演`, value: i + 1 }))
})

function onRoundChange() {
  // currentRound 已自动同步到 store
  loadData()
}

const playerOptions = computed(() => playerStore.users.filter(user => user.role !== 'admin'))

const summaries = computed<PlayerTrainingSummary[]>(() => {
  return playerOptions.value.map(user => {
    const records = trainingStore.records.filter(record => record.userId === user.id)
    return {
      user,
      recordCount: records.length,
      totalEffect: records.reduce((sum, record) => ({
        vocal: sum.vocal + (record.effect?.vocal || 0),
        dance: sum.dance + (record.effect?.dance || 0),
        charm: sum.charm + (record.effect?.charm || 0)
      }), { vocal: 0, dance: 0, charm: 0 })
    }
  })
})

const filteredSummaries = computed(() => {
  const text = keyword.value.trim().toLowerCase()
  return summaries.value.filter(summary => {
    const matchesUser = !selectedUserId.value || summary.user.id === selectedUserId.value
    const matchesText = !text ||
      summary.user.name.toLowerCase().includes(text) ||
      summary.user.loginCode.toLowerCase().includes(text)
    return matchesUser && matchesText
  })
})

const filteredRecords = computed<TrainingRecord[]>(() => {
  const text = keyword.value.trim().toLowerCase()
  return trainingStore.records.filter(record => {
    const userName = recordUserName(record).toLowerCase()
    const cardName = (record.cardName || '').toLowerCase()
    const matchesUser = !selectedUserId.value || record.userId === selectedUserId.value
    const matchesText = !text || userName.includes(text) || cardName.includes(text)
    return matchesUser && matchesText
  })
})

const trainedPlayerCount = computed(() => {
  return summaries.value.filter(summary => summary.recordCount > 0).length
})

function recordUserName(record: TrainingRecord): string {
  return record.userName || playerStore.getPlayerById(record.userId)?.name || record.userId
}

function effectClass(value?: number): string {
  if (!value) return 'neutral'
  return value > 0 ? 'positive' : 'negative'
}

function formatEffect(value?: number): string {
  if (!value) return '0'
  return value > 0 ? `+${value}` : `${value}`
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

async function loadData(): Promise<void> {
  loading.value = true
  try {
    await Promise.all([
      seasonStore.fetchPerformanceRound(),
      playerStore.fetchUsers({ pageSize: 1000 })
    ])
    await trainingStore.fetchRecords({ round: seasonStore.currentRoundNumber, pageSize: 1000 })
  } catch (e: any) {
    MessagePlugin.error(e.message || '训练记录加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<style lang="scss" scoped>
.admin-training-records {
  min-height: 100%;
  padding: 12px;
  background: var(--bg-primary);
}

.round-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 10px 12px;
  background: var(--card-bg);
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);

  label {
    font-size: 13px;
    color: var(--text-secondary);
    white-space: nowrap;
    font-weight: 500;
  }
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;

  h1 {
    margin: 0 0 4px;
    font-size: 20px;
    line-height: 1.25;
    color: var(--text-primary);
  }

  p {
    margin: 0;
    font-size: 12px;
    color: var(--text-secondary);
  }
}

.filter-card,
.section-card {
  margin-bottom: 12px;
  border-radius: 10px;

  :deep(.t-card) {
    border-radius: 10px;
  }
}

.filter-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.stat-card {
  border-radius: 10px;

  :deep(.t-card__body) {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 14px;
  }
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #0052d9;
}

.stat-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.section-title,
.summary-main,
.record-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.summary-list,
.record-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.summary-item,
.record-item {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--card-bg);
  padding: 12px;
  transition: transform 0.15s;

  &:active {
    transform: scale(0.99);
  }
}

.player-name,
.record-user {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.player-code,
.record-time,
.after-line {
  font-size: 11px;
  color: var(--text-secondary);
}

.record-card {
  display: block;
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-secondary);
}

.attr-line,
.change-line {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.attr-line span,
.change-line span {
  font-size: 11px;
  line-height: 1;
  padding: 5px 7px;
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-secondary);
}

.change-line .positive {
  color: #16823a;
  background: #e8f7ed;
}

.change-line .negative {
  color: #c9353f;
  background: #fdecee;
}

.change-line .neutral {
  color: var(--text-secondary);
}

.after-line {
  margin-top: 8px;
}

@media (max-width: 480px) {
  .admin-training-records {
    padding: 10px;
  }

  .page-header {
    flex-direction: column;

    h1 {
      font-size: 18px;
    }
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }

  .stat-value {
    font-size: 18px;
  }

  .summary-item,
  .record-item {
    padding: 10px;
  }

  .player-name,
  .record-user {
    font-size: 13px;
  }
}

@media (min-width: 768px) {
  .admin-training-records {
    padding: 20px;
  }

  .filter-grid {
    grid-template-columns: 180px minmax(0, 1fr);
  }

  .stats-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
