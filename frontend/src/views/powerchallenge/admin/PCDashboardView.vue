<template>
  <div class="pc-dashboard">
    <div class="page-header">
      <h1>📊 控制台</h1>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-value">{{ stats.total }}</div>
        <div class="stat-label">总玩家</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🟢</div>
        <div class="stat-value">{{ stats.active }}</div>
        <div class="stat-label">活跃玩家</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">💪</div>
        <div class="stat-value">{{ poolCount }}</div>
        <div class="stat-label">题池数量</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📝</div>
        <div class="stat-value">{{ questionCount }}</div>
        <div class="stat-label">题目总数</div>
      </div>
    </div>

    <div class="quick-actions">
      <h3>快捷操作</h3>
      <div class="action-buttons">
        <router-link to="/games/powerchallenge/admin/live" class="bb-btn bb-btn-primary">🎮 比赛控制台</router-link>
        <router-link to="/games/powerchallenge/admin/players" class="bb-btn bb-btn-primary">👥 管理玩家</router-link>
        <router-link to="/games/powerchallenge/admin/question-pools" class="bb-btn">💪 管理题目池</router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { pcGetPlayerStats, pcGetPools } from '../../../services/pcApi'

const stats = ref({ total: 0, active: 0 })
const poolCount = ref(0)
const questionCount = ref(0)

async function loadData() {
  try {
    const s = await pcGetPlayerStats()
    stats.value = s.data || s
    const pools = await pcGetPools()
    poolCount.value = pools.filter((p: any) => p.enabled).length
    questionCount.value = pools.reduce((acc: number, p: any) => acc + p.questions.length, 0)
  } catch {}
}

onMounted(loadData)
</script>

<style scoped>
.pc-dashboard { max-width: 1000px; margin: 0 auto; padding: 24px; }
.page-header h1 { font-size: 24px; color: #e0e0e0; margin: 0 0 24px; }
.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
.stat-card { background: #141430; border: 1px solid #ffffff12; border-radius: 12px; padding: 24px; text-align: center; }
.stat-icon { font-size: 32px; margin-bottom: 8px; }
.stat-value { font-size: 36px; font-weight: 700; color: #ffaa00; }
.stat-label { color: #888; font-size: 13px; margin-top: 4px; }
.quick-actions h3 { color: #aaa; font-size: 14px; margin-bottom: 12px; }
.action-buttons { display: flex; gap: 12px; }
</style>
