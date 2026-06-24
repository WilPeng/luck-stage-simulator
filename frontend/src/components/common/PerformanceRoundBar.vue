<template>
  <t-card class="round-bar" :bordered="false">
    <div class="round-head">
      <div>
        <div class="round-title">{{ roundTitle }}</div>
        <div class="round-subtitle">当前流程：{{ statusText }}</div>
      </div>
      <t-tag :theme="hasStarted ? 'primary' : 'warning'" variant="light">
        {{ hasStarted ? `第 ${roundNumber} 次公演` : '赛季准备中' }}
      </t-tag>
    </div>

    <div class="round-stats">
      <div class="round-stat">
        <span class="stat-value">{{ activePlayerCount ?? '-' }}</span>
        <span class="stat-label">剩余选手</span>
      </div>
      <div class="round-stat">
        <span class="stat-value">{{ teamCount ?? '-' }}</span>
        <span class="stat-label">本轮队伍</span>
      </div>
      <div class="round-stat">
        <span class="stat-value">{{ teamSizesText }}</span>
        <span class="stat-label">分组人数</span>
      </div>
      <div class="round-stat">
        <span class="stat-value">-</span>
        <span class="stat-label">可选曲目</span>
      </div>
      <div class="round-stat">
        <span class="stat-value">-</span>
        <span class="stat-label">本轮淘汰</span>
      </div>
    </div>
  </t-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useSeasonStore } from '../../stores/seasonStore'
import { useTeamStore } from '../../stores/teamStore'
import { usePlayerStore } from '../../stores/playerStore'

const seasonStore = useSeasonStore()
const teamStore = useTeamStore()
const playerStore = usePlayerStore()

const activePlayerCount = ref<number | null>(null)
const teamCount = ref<number | null>(null)
const teamSizes = ref<number[]>([])

const round = computed(() => seasonStore.season)
const roundNumber = computed(() => seasonStore.currentRoundNumber)
const hasStarted = computed(() => roundNumber.value > 0)
const roundTitle = computed(() => {
  if (!hasStarted.value) return '赛季准备中'
  return round.value?.name || `第 ${roundNumber.value} 次公演`
})
const teamSizesText = computed(() => {
  return teamSizes.value.length ? teamSizes.value.join('/') : '-'
})

const statusText = computed(() => {
  const map: Record<string, string> = {
    setup: '轮次配置',
    team: '组队阶段',
    song: '选歌阶段',
    training: '训练阶段',
    rehearsal: '彩排阶段',
    performance: '公演结算',
    elimination: '淘汰阶段',
    completed: '已完成'
  }
  return map[seasonStore.season?.currentStage || ''] || '未开始'
})

async function loadRoundData() {
  try {
    // 获取活跃选手数（排除管理员）
    await playerStore.fetchUsers({ pageSize: 1000 })
    activePlayerCount.value = playerStore.users.filter(u => u.role !== 'admin').length
    
    // 获取当前轮次的队伍信息
    if (roundNumber.value > 0) {
      await teamStore.fetchTeams(roundNumber.value)
      teamCount.value = teamStore.teams.length
      teamSizes.value = teamStore.teams.map(t => t.maxMembers)
    } else {
      teamCount.value = null
      teamSizes.value = []
    }
  } catch (e) {
    console.error('Failed to load round data:', e)
  }
}

// 监听轮次变化，重新获取数据
watch(roundNumber, () => {
  loadRoundData()
})

onMounted(async () => {
  if (!seasonStore.season) {
    await seasonStore.fetchSeason()
  }
  await loadRoundData()
})
</script>

<style scoped lang="scss">
.round-bar {
  margin-bottom: 16px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f0f5ff 0%, #fff 100%);
  box-shadow: 0 2px 12px rgba(0, 82, 204, 0.06);
  overflow: hidden;
}

.round-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(0, 82, 204, 0.08);
  margin-bottom: 14px;
}

.round-title {
  color: #1a1a2e;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: 0.3px;
}

.round-subtitle {
  margin-top: 4px;
  color: #6b7280;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;

  &::before {
    content: '';
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #00a870;
  }
}

.round-stats {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.round-stat {
  min-width: 0;
  padding: 10px 6px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(0, 82, 204, 0.06);
  text-align: center;
  transition: transform 0.15s;

  &:active {
    transform: scale(0.97);
  }
}

.stat-value {
  display: block;
  color: #0052d9;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.stat-label {
  display: block;
  margin-top: 3px;
  color: #86909c;
  font-size: 11px;
  letter-spacing: 0.5px;
}

@media (max-width: 768px) {
  .round-bar {
    border-radius: 10px;
  }

  .round-stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .round-head {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .round-title {
    font-size: 15px;
  }

  .stat-value {
    font-size: 15px;
  }

  .stat-label {
    font-size: 10px;
  }
}

@media (max-width: 480px) {
  .round-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .round-stat {
    padding: 8px 4px;
  }
}
</style>
