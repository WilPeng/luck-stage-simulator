<template>
  <div class="admin-danger-confirm">
    <t-card class="danger-card" :bordered="false">
      <div class="page-head">
        <div>
          <h1>确认危险名单</h1>
          <p>第 {{ roundIndex }} 公演 · 从本场选手中选择进入淘汰环节的危险名单</p>
        </div>
        <div class="page-head-actions">
          <t-tag :theme="dangerStatus?.confirmed ? 'success' : 'warning'" variant="light" size="large">
            {{ dangerStatus?.confirmed ? '危险名单已确认' : '尚未确认危险名单' }}
          </t-tag>
          <t-button variant="outline" :loading="loading" @click="loadData">刷新</t-button>
        </div>
      </div>
    </t-card>

    <!-- 已确认名单展示 -->
    <t-card v-if="dangerStatus?.confirmed" title="已确认的危险名单" :bordered="false" class="danger-card">
      <div class="confirmed-info">
        <t-alert theme="success" style="margin-bottom: 16px">
          <template #message>
            危险名单共 {{ dangerStatus.playerIds.length }} 人，已按个人喜爱度从低到高排序。进入淘汰环节后，将从队首开始进行 3 人 PK。
          </template>
        </t-alert>
        <div class="queue-list">
          <div v-for="(entry, idx) in dangerStatus.queue" :key="entry.playerId" class="queue-item">
            <span class="queue-order">{{ idx + 1 }}</span>
            <span class="queue-name">{{ entry.playerName }}</span>
            <span class="queue-team">{{ entry.teamName || '未组队' }}</span>
            <span class="queue-votes">
              <span class="votes-label">喜爱度</span>
              <span class="votes-value">{{ entry.popularityVotes }}票</span>
            </span>
          </div>
        </div>
      </div>
    </t-card>

    <!-- 选择危险选手 -->
    <t-card v-else title="选择危险选手" :bordered="false" class="danger-card">
      <div class="selection-toolbar">
        <div class="selection-hint">
          <span class="hint-icon">⚠️</span>
          <span>已选择 <strong>{{ selectedIds.length }}</strong> 人进入危险名单，请根据喜爱度排名（低排名优先）选择</span>
        </div>
        <div class="selection-actions">
          <t-button variant="outline" @click="selectAllDanger">全选危险区</t-button>
          <t-button theme="primary" :disabled="selectedIds.length === 0" :loading="saving" @click="handleConfirm">
            确认危险名单 ({{ selectedIds.length }})
          </t-button>
        </div>
      </div>

      <div class="player-list">
        <div
          v-for="player in rankedPlayers"
          :key="player.playerId"
          class="player-item"
          :class="{ selected: selectedIds.includes(player.playerId) }"
          @click="toggleSelect(player.playerId)"
        >
          <div class="player-rank">
            <span class="rank-num">{{ player.rank }}</span>
            <span class="rank-label">喜爱度排名</span>
          </div>
          <div class="player-info">
            <span class="player-name">{{ player.playerName }}</span>
            <span class="player-team">{{ player.teamName || '未组队' }}</span>
          </div>
          <div class="player-votes">
            <span class="votes-value">{{ player.popularityVotes }}</span>
            <span class="votes-label">票</span>
          </div>
          <div class="player-check">
            <t-checkbox :checked="selectedIds.includes(player.playerId)" />
          </div>
        </div>
      </div>

      <t-empty v-if="rankedPlayers.length === 0" description="暂无选手数据，请先完成公演结算并释放喜爱度排名" />
    </t-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { useEliminationStore } from '../../stores/eliminationStore'
import { usePerformanceStore } from '../../stores/performanceStore'

const route = useRoute()
const store = useEliminationStore()
const performanceStore = usePerformanceStore()

const loading = ref(false)
const saving = ref(false)
const selectedIds = ref<string[]>([])

const roundIndex = computed(() => {
  const val = route.params.round as string
  const n = parseInt(val, 10)
  return isNaN(n) ? 1 : n
})

const dangerStatus = computed(() => store.dangerStatus)

// 候选选手：按喜爱度排名升序（低排名优先 = 危险）
const rankedPlayers = computed(() => {
  const rankings = performanceStore.audienceRankings
  return rankings.map((r, idx) => ({
    playerId: r.playerId,
    playerName: r.playerName || r.playerId,
    teamId: r.teamId || null,
    teamName: r.teamName || null,
    popularityVotes: r.votes || 0,
    rank: r.rank ?? idx + 1
  }))
})

function toggleSelect(playerId: string) {
  const idx = selectedIds.value.indexOf(playerId)
  if (idx >= 0) {
    selectedIds.value.splice(idx, 1)
  } else {
    selectedIds.value.push(playerId)
  }
}

// 全选后 50%（危险区）
function selectAllDanger() {
  const half = Math.ceil(rankedPlayers.value.length / 2)
  const dangerIds = rankedPlayers.value.slice(half - 1).map(p => p.playerId)
  const merged = [...new Set([...selectedIds.value, ...dangerIds])]
  selectedIds.value = merged
  MessagePlugin.info(`已选中 ${dangerIds.length} 名危险区选手`)
}

async function handleConfirm() {
  if (selectedIds.value.length === 0) {
    MessagePlugin.warning('请至少选择一名选手')
    return
  }
  saving.value = true
  try {
    await store.doConfirmDanger({ round: roundIndex.value, playerIds: selectedIds.value })
    MessagePlugin.success('危险名单已确认')
    await loadData()
  } catch (e: any) {
    MessagePlugin.error(e.message || '确认失败')
  } finally {
    saving.value = false
  }
}

async function loadData() {
  loading.value = true
  try {
    await store.fetchDangerStatus(roundIndex.value)
    // 加载喜爱度排名
    await performanceStore.fetchAudienceVoteRankings(`round-${roundIndex.value}`)
  } catch (e: any) {
    MessagePlugin.error(e.message || '加载数据失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<style lang="scss" scoped>
.admin-danger-confirm {
  min-height: 100%;
  padding: 12px;
  background: var(--bg-primary);
}

.danger-card {
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
  flex-shrink: 0;
  align-items: center;
}

.confirmed-info {
  .queue-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .queue-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: var(--bg-primary);
    border-radius: 8px;
    border: 1px solid var(--border-color);

    .queue-order {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: #ff6b6b;
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      flex-shrink: 0;
    }

    .queue-name {
      font-size: 14px;
      font-weight: 600;
      flex: 1;
    }

    .queue-team {
      font-size: 12px;
      color: var(--text-secondary);
    }

    .queue-votes {
      display: flex;
      flex-direction: column;
      align-items: flex-end;

      .votes-label {
        font-size: 11px;
        color: var(--text-tertiary);
      }

      .votes-value {
        font-size: 14px;
        font-weight: 600;
        color: #ff6b6b;
      }
    }
  }
}

.selection-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;

  .selection-hint {
    font-size: 13px;
    color: var(--text-secondary);

    strong {
      color: #ff6b6b;
      font-size: 16px;
    }
  }

  .selection-actions {
    display: flex;
    gap: 8px;
  }
}

.player-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.player-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: var(--bg-primary);
  border-radius: 10px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: #0052d9;
  }

  &.selected {
    background: rgba(255, 107, 107, 0.08);
    border-color: #ff6b6b;
  }
}

.player-rank {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 56px;
  flex-shrink: 0;

  .rank-num {
    font-size: 20px;
    font-weight: 800;
    color: #ff6b6b;
  }

  .rank-label {
    font-size: 10px;
    color: var(--text-tertiary);
  }
}

.player-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;

  .player-name {
    font-size: 15px;
    font-weight: 600;
  }

  .player-team {
    font-size: 12px;
    color: var(--text-secondary);
  }
}

.player-votes {
  display: flex;
  align-items: baseline;
  gap: 2px;

  .votes-value {
    font-size: 16px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .votes-label {
    font-size: 12px;
    color: var(--text-tertiary);
  }
}

.player-check {
  flex-shrink: 0;
}
</style>
