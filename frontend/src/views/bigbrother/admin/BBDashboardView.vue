<template>
  <div class="bb-dashboard">
    <div class="page-header">
      <h1>仪表盘总览</h1>
      <div class="header-actions">
        <button class="bb-btn" @click="refresh">刷新数据</button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.total }}</div>
          <div class="stat-label">总房客数</div>
        </div>
      </div>
      <div class="stat-card active">
        <div class="stat-icon">✅</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.active }}</div>
          <div class="stat-label">活跃房客</div>
        </div>
      </div>
      <div class="stat-card evicted">
        <div class="stat-icon">🚪</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.evicted }}</div>
          <div class="stat-label">已淘汰</div>
        </div>
      </div>
      <div class="stat-card jury">
        <div class="stat-icon">⚖️</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.jury }}</div>
          <div class="stat-label">陪审团</div>
        </div>
      </div>
      <div class="stat-card current-round">
        <div class="stat-icon">📅</div>
        <div class="stat-info">
          <div class="stat-value">{{ seasonStore.currentRoundNumber }} / {{ seasonStore.totalRounds }}</div>
          <div class="stat-label">当前轮次</div>
        </div>
      </div>
      <div class="stat-card stage-info">
        <div class="stat-icon">🎯</div>
        <div class="stat-info">
          <div class="stat-value stage-name">{{ seasonStore.stageName }}</div>
          <div class="stat-label">当前阶段</div>
        </div>
      </div>
    </div>

    <div class="progress-section">
      <h2>赛程进度</h2>
      <div class="progress-bar-container">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
        </div>
        <div class="progress-label">{{ currentHohName }}</div>
      </div>
    </div>

    <div class="quick-actions">
      <h2>快捷操作</h2>
      <div class="action-grid">
        <div class="action-card" @click="goTo('/games/bigbrother/admin/houseguests')">
          <span class="action-icon">👥</span>
          <span class="action-text">房客管理</span>
        </div>
        <div class="action-card" @click="goTo('/games/bigbrother/admin/stage')">
          <span class="action-icon">🎯</span>
          <span class="action-text">赛程矩阵</span>
        </div>
        <div class="action-card" @click="runHohCompetition()">
          <span class="action-icon">👑</span>
          <span class="action-text">模拟 HOH 竞争</span>
        </div>
        <div class="action-card" @click="goToStage('hoh')">
          <span class="action-icon">📋</span>
          <span class="action-text">管理提名</span>
        </div>
        <div class="action-card" @click="runVetoCompetition()">
          <span class="action-icon">🛡️</span>
          <span class="action-text">模拟否决权竞争</span>
        </div>
        <div class="action-card" @click="goToStage('eviction')">
          <span class="action-icon">🗳️</span>
          <span class="action-text">淘汰投票</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useBbSeasonStore } from '../../../stores/bbSeasonStore'
import { bbGetHouseguestStats, bbRunHohCompetition, bbRunVetoCompetition } from '../../../services/bbApi'

const router = useRouter()
const seasonStore = useBbSeasonStore()

const stats = ref({ total: 0, active: 0, evicted: 0, jury: 0 })
const currentHohName = ref('')

const progressPercent = computed(() => {
  const total = seasonStore.totalRounds
  const current = seasonStore.currentRoundNumber
  return total > 0 ? Math.round((current / total) * 100) : 0
})

async function refresh() {
  try {
    stats.value = await bbGetHouseguestStats()
    const hoh = await (await import('../../../services/bbApi')).bbGetCurrentHoh()
    currentHohName.value = hoh ? `当前 HOH: ${hoh.winnerName}` : '暂无 HOH'
  } catch {}
}

function goTo(path: string) {
  router.push(path)
}

function goToStage(stage: string) {
  const round = seasonStore.currentRoundNumber
  router.push(`/games/bigbrother/admin/round/${round}/${stage}`)
}

async function runHohCompetition() {
  try {
    const result = await bbRunHohCompetition()
    alert(`HOH 竞争完成！${result.winnerName} 获胜！`)
    await refresh()
  } catch (e: any) {
    alert(e.message || 'HOH竞争失败')
  }
}

async function runVetoCompetition() {
  try {
    const result = await bbRunVetoCompetition()
    alert(`否决权竞争完成！${result.winnerName} 获胜！`)
    await refresh()
  } catch (e: any) {
    alert(e.message || '否决权竞争失败')
  }
}

onMounted(async () => {
  await seasonStore.fetchProgress()
  await refresh()
})
</script>

<style scoped>
.bb-dashboard { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.bb-btn {
  background: transparent; border: 1px solid #00ff8844; color: #00ff88;
  padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s;
}
.bb-btn:hover { background: #00ff8822; }
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
.stat-card {
  background: linear-gradient(135deg, #0f0f2e, #1a1a3e);
  border: 1px solid #00ff8822; border-radius: 12px;
  padding: 20px; display: flex; align-items: center; gap: 16px;
  transition: all 0.3s;
}
.stat-card:hover { border-color: #00ff88; transform: translateY(-2px); }
.stat-card.active { border-left: 3px solid #00ff88; }
.stat-card.evicted { border-left: 3px solid #ff4444; }
.stat-card.jury { border-left: 3px solid #ffaa00; }
.stat-card.current-round { border-left: 3px solid #4488ff; }
.stat-card.stage-info { border-left: 3px solid #00ff88; }
.stat-icon { font-size: 28px; }
.stat-info .stat-value { font-size: 24px; font-weight: 700; color: #fff; }
.stat-info .stat-value.stage-name { font-size: 16px; }
.stat-info .stat-label { font-size: 12px; color: #888; margin-top: 2px; }
.progress-section { margin-bottom: 24px; }
.progress-section h2 { font-size: 18px; font-weight: 600; color: #e0e0e0; margin: 0 0 12px; }
.progress-bar-container { display: flex; align-items: center; gap: 12px; }
.progress-bar { flex: 1; height: 12px; background: #1a1a3e; border-radius: 6px; overflow: hidden; }
.progress-fill { height: 100%; background: linear-gradient(90deg, #00ff88, #00cc66); border-radius: 6px; transition: width 0.5s; }
.progress-label { font-size: 13px; color: #00ff88; white-space: nowrap; }
.quick-actions h2 { font-size: 18px; font-weight: 600; color: #e0e0e0; margin: 0 0 12px; }
.action-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.action-card {
  background: #0f0f2e; border: 1px solid #00ff8822;
  border-radius: 10px; padding: 20px; text-align: center;
  cursor: pointer; transition: all 0.3s;
}
.action-card:hover { border-color: #00ff88; transform: translateY(-2px); background: #1a1a3e; }
.action-icon { display: block; font-size: 32px; margin-bottom: 8px; }
.action-text { font-size: 13px; color: #aaa; }
</style>
