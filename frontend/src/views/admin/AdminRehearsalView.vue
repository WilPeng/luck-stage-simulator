<template>
  <div class="admin-rehearsal">
    <t-card class="rehearsal-card" :bordered="false">
      <div class="page-head">
        <div>
          <h1>彩排管理</h1>
          <p>第 {{ roundIndex }} 公演 · 查看各队彩排情况，或批量生成彩排结果</p>
        </div>
        <div class="page-head-actions">
          <t-tag :theme="released ? 'success' : 'default'" variant="light">
            {{ released ? '彩排已对选手开放' : '彩排尚未开放' }}
          </t-tag>
          <t-button variant="outline" :loading="loading" @click="loadData">刷新</t-button>
          <t-button
            theme="primary"
            :loading="rolling"
            :disabled="unrehearsedTeams.length === 0"
            @click="handleRollAll"
          >
            🎭 为未彩排队伍批量彩排（{{ unrehearsedTeams.length }}）
          </t-button>
        </div>
      </div>
    </t-card>

    <t-card title="彩排结果" :bordered="false" class="rehearsal-card">
      <t-table
        row-key="id"
        :data="results"
        :loading="loading"
        :empty="'暂无彩排结果'"
        size="small"
      >
        <t-table-column title="队伍" cell="teamName" min-width="120">
          <template #default-cell="{ row }">
            {{ teamNameOf(row) }}
          </template>
        </t-table-column>
        <t-table-column title="彩排事件" min-width="140">
          <template #default-cell="{ row }">
            <div class="event-cell">
              <span class="event-name">{{ row.eventName }}</span>
              <span class="event-desc">{{ row.description }}</span>
            </div>
          </template>
        </t-table-column>
        <t-table-column title="加成" min-width="160">
          <template #default-cell="{ row }">
            <div class="bonus-cell">
              <t-tag
                v-for="(value, key) in row.bonus"
                :key="key"
                :theme="Number(value) >= 0 ? 'success' : 'danger'"
                variant="light"
                size="small"
              >
                {{ bonusLabel(String(key)) }} {{ Number(value) > 0 ? `+${value}` : value }}
              </t-tag>
            </div>
          </template>
        </t-table-column>
        <t-table-column title="彩排时间" cell="createdAt" min-width="160" />
        <t-table-column title="操作" width="80">
          <template #default-cell="{ row }">
            <t-popconfirm content="确定删除该彩排结果？" @confirm="handleDelete(row)">
              <t-button theme="danger" variant="text" size="small">删除</t-button>
            </t-popconfirm>
          </template>
        </t-table-column>
      </t-table>
    </t-card>

    <t-card v-if="unrehearsedTeams.length > 0" title="尚未彩排的队伍" :bordered="false" class="rehearsal-card">
      <div class="pending-grid">
        <div v-for="team in unrehearsedTeams" :key="team.id" class="pending-item">
          <span class="pending-icon">🎭</span>
          <span class="pending-name">{{ team.name }}</span>
        </div>
      </div>
    </t-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { useSeasonStore } from '../../stores/seasonStore'
import {
  getRehearsalResultsAPI,
  getRoundTeams,
  rollAllRehearsals,
  deleteRehearsalResult,
  getConcurrentReleaseStatus
} from '../../services/api'
import type { RehearsalResult } from '../../types/performance'
import type { RoundTeam } from '../../types/round'

const route = useRoute()
const seasonStore = useSeasonStore()

const loading = ref(false)
const rolling = ref(false)
const results = ref<RehearsalResult[]>([])
const teams = ref<RoundTeam[]>([])
const released = ref(false)

const roundIndex = computed(() => {
  const n = parseInt(route.params.round as string, 10)
  return isNaN(n) ? 1 : n
})
const roundId = computed(() => `round-${roundIndex.value}`)

const unrehearsedTeams = computed(() => {
  const doneIds = new Set(results.value.map(r => r.teamId))
  return teams.value.filter(t => !doneIds.has(t.id))
})

function teamNameOf(row: RehearsalResult): string {
  const fromRow = (row as any).teamName
  if (fromRow) return fromRow
  return teams.value.find(t => t.id === row.teamId)?.name || row.teamId
}

function bonusLabel(key: string): string {
  const map: Record<string, string> = {
    vocal: '🎤',
    dance: '💃',
    charm: '✨',
    team: '👥 团队',
    each: '🎯 每人'
  }
  return map[key] || key
}

async function loadData() {
  loading.value = true
  try {
    const [rehearsals, roundTeams, releaseStatus] = await Promise.all([
      getRehearsalResultsAPI(String(roundId.value)),
      getRoundTeams(roundId.value),
      getConcurrentReleaseStatus(roundId.value)
    ])
    results.value = rehearsals || []
    teams.value = roundTeams || []
    released.value = !!releaseStatus?.rehearsalReleased
  } catch (e: any) {
    MessagePlugin.error(e.message || '加载彩排数据失败')
  } finally {
    loading.value = false
  }
}

async function handleRollAll() {
  rolling.value = true
  try {
    const created = await rollAllRehearsals(roundId.value)
    MessagePlugin.success(`已为 ${created?.length ?? 0} 支队伍生成彩排结果`)
    await loadData()
  } catch (e: any) {
    MessagePlugin.error(e.message || '批量彩排失败')
  } finally {
    rolling.value = false
  }
}

async function handleDelete(row: RehearsalResult) {
  try {
    await deleteRehearsalResult(row.id)
    MessagePlugin.success('已删除')
    await loadData()
  } catch (e: any) {
    MessagePlugin.error(e.message || '删除失败')
  }
}

onMounted(() => {
  seasonStore.fetchConcurrentRelease(roundIndex.value).catch(() => {})
  loadData()
})
</script>

<style lang="scss" scoped>
.admin-rehearsal {
  min-height: 100%;
  padding: 12px;
  background: var(--bg-primary);
}

.rehearsal-card {
  margin-bottom: 12px;
  border-radius: 8px;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  h1 {
    margin: 0 0 4px;
    color: var(--text-primary);
    font-size: 22px;
    line-height: 1.25;
  }

  p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.6;
  }
}

.page-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.event-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;

  .event-name {
    font-weight: 600;
    color: var(--text-primary);
  }

  .event-desc {
    font-size: 12px;
    color: var(--text-tertiary);
  }
}

.bonus-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.pending-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pending-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px dashed var(--border-color);
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 13px;
}
</style>
