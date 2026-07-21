<template>
  <div class="lv-dashboard">
    <div class="page-header">
      <h1>仪表盘总览</h1>
      <div class="header-actions">
        <button class="lv-btn" @click="refresh">刷新数据</button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.total }}</div>
          <div class="stat-label">总选手数</div>
        </div>
      </div>
      <div class="stat-card active">
        <div class="stat-icon">✅</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.active }}</div>
          <div class="stat-label">活跃选手</div>
        </div>
      </div>
      <div class="stat-card eliminated">
        <div class="stat-icon">🚪</div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.eliminated }}</div>
          <div class="stat-label">已淘汰</div>
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

    <div class="quick-actions">
      <h2>快捷操作</h2>
      <div class="action-grid">
        <div class="action-card" @click="goTo('/games/lovevariety/admin/players')">
          <span class="action-icon">👥</span>
          <span class="action-text">选手管理</span>
        </div>
        <div class="action-card" @click="goTo('/games/lovevariety/admin/stage')">
          <span class="action-icon">🎯</span>
          <span class="action-text">赛程矩阵</span>
        </div>
        <div class="action-card" @click="goToStage('votes')">
          <span class="action-icon">💌</span>
          <span class="action-text">查看喜爱值</span>
        </div>
        <div class="action-card" @click="calculatePairing()">
          <span class="action-icon">💑</span>
          <span class="action-text">配对结算</span>
        </div>
        <div class="action-card" @click="goToStage('elimination')">
          <span class="action-icon">🚪</span>
          <span class="action-text">淘汰管理</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useLvSeasonStore } from '../../../stores/lovevarietySeasonStore'
import { lvGetPlayerStats, lvCalculatePairing } from '../../../services/lovevarietyApi'

const router = useRouter()
const seasonStore = useLvSeasonStore()

const stats = ref({ total: 0, active: 0, eliminated: 0 })

async function refresh() {
  try {
    stats.value = await lvGetPlayerStats()
  } catch {}
}

function goTo(path: string) {
  router.push(path)
}

function goToStage(stage: string) {
  const round = seasonStore.currentRoundNumber
  router.push(`/games/lovevariety/admin/round/${round}/${stage}`)
}

async function calculatePairing() {
  try {
    const result = await lvCalculatePairing()
    alert(`配对结算完成！${result.singlePlayerName} 成为单身汉，共 ${result.pairs.length} 对组合`)
    const round = seasonStore.currentRoundNumber
    router.push(`/games/lovevariety/admin/round/${round}/pairing`)
  } catch (e: any) {
    alert(e.message || '配对结算失败')
  }
}

onMounted(async () => {
  await seasonStore.fetchProgress()
  await refresh()
})
</script>

<style scoped>
.lv-dashboard { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.lv-btn {
  background: transparent; border: 1px solid #ff69b444; color: #ff69b4;
  padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s;
}
.lv-btn:hover { background: #ff69b422; }
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
.stat-card {
  background: linear-gradient(135deg, #1a0f2e, #2d1b4e);
  border: 1px solid #ff69b422; border-radius: 12px;
  padding: 20px; display: flex; align-items: center; gap: 16px; transition: all 0.3s;
}
.stat-card:hover { border-color: #ff69b4; transform: translateY(-2px); }
.stat-card.active { border-left: 3px solid #00ff88; }
.stat-card.eliminated { border-left: 3px solid #ff4444; }
.stat-card.current-round { border-left: 3px solid #4488ff; }
.stat-card.stage-info { border-left: 3px solid #ff69b4; }
.stat-icon { font-size: 28px; }
.stat-info .stat-value { font-size: 24px; font-weight: 700; color: #fff; }
.stat-info .stat-value.stage-name { font-size: 16px; }
.stat-info .stat-label { font-size: 12px; color: #888; margin-top: 2px; }
.quick-actions h2 { font-size: 18px; font-weight: 600; color: #e0e0e0; margin: 0 0 12px; }
.action-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.action-card {
  background: #1a0f2e; border: 1px solid #ff69b422;
  border-radius: 10px; padding: 20px; text-align: center;
  cursor: pointer; transition: all 0.3s;
}
.action-card:hover { border-color: #ff69b4; transform: translateY(-2px); background: #2d1b4e; }
.action-icon { display: block; font-size: 32px; margin-bottom: 8px; }
.action-text { font-size: 13px; color: #aaa; }
</style>
