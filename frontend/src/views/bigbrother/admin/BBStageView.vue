<template>
  <div class="bb-stage">
    <div class="page-header">
      <h1>赛程矩阵</h1>
      <div class="header-actions">
        <button class="bb-btn bb-btn-danger" @click="handleResetSeason">全部重新开始</button>
        <button class="bb-btn" @click="fetchData">刷新</button>
      </div>
    </div>

    <div class="current-status">
      <div class="status-item">
        <span class="label">当前轮次</span>
        <span class="value">{{ seasonStore.currentRoundNumber }}</span>
      </div>
      <div class="status-item">
        <span class="label">当前阶段</span>
        <span class="value stage">{{ seasonStore.stageName }}</span>
      </div>
      <div class="status-item">
        <span class="label">总轮次</span>
        <span class="value">{{ seasonStore.totalRounds }}</span>
      </div>
      <div class="status-actions">
        <button class="bb-btn bb-btn-sm" @click="handleNextStage">推进到下一阶段</button>
      </div>
    </div>

    <div class="stage-control">
      <h3>手动设置进度</h3>
      <div class="control-form">
        <div class="form-group">
          <label>轮次</label>
          <input v-model.number="setRound" type="number" class="bb-input" min="1" :max="seasonStore.totalRounds" />
        </div>
        <div class="form-group">
          <label>阶段</label>
          <select v-model="setStage" class="bb-select">
            <option v-for="s in stageOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
          </select>
        </div>
        <button class="bb-btn bb-btn-primary" @click="handleSetStage">设置</button>
      </div>
    </div>

    <div class="matrix-section">
      <h3>赛程矩阵</h3>
      <div class="matrix-table-wrapper">
        <table class="matrix-table">
          <thead>
            <tr>
              <th>轮次</th>
              <th v-for="s in stageOptions" :key="s.value" class="stage-header">{{ s.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rounds" :key="r">
              <td class="round-cell">第{{ r }}周</td>
              <td v-for="s in stageOptions" :key="s.value"
                class="stage-cell"
                :class="getCellClass(r, s.value)"
                @click="navigateToStage(r, s.value)">
                <span class="cell-dot" :class="getCellClass(r, s.value)"></span>
                <span class="cell-status">{{ getCellText(r, s.value) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useBbSeasonStore } from '../../../stores/bbSeasonStore'
import { BB_STAGE_NAME, type BBStageType } from '../../../types/bigbrother'

const router = useRouter()
const seasonStore = useBbSeasonStore()

const setRound = ref(1)
const setStage = ref<BBStageType>('hoh_competition')

const stageOptions = computed(() => {
  return Object.entries(BB_STAGE_NAME).map(([value, label]) => ({ value, label }))
})

const rounds = computed(() => {
  return Array.from({ length: seasonStore.totalRounds }, (_, i) => i + 1)
})

async function fetchData() {
  await seasonStore.fetchProgress()
  setRound.value = seasonStore.currentRoundNumber
  setStage.value = seasonStore.currentStage
}

function getCellClass(round: number, stage: string) {
  return seasonStore.getStageStatus(round, stage as BBStageType)
}

function getCellText(round: number, stage: string) {
  const status = seasonStore.getStageStatus(round, stage as BBStageType)
  const map: Record<string, string> = { completed: '已完成', current: '当前', future: '未开始' }
  return map[status] || ''
}

function navigateToStage(round: number, stage: string) {
  if (seasonStore.getStageStatus(round, stage as BBStageType) === 'future') return
  const stageRoutes: Record<string, string> = {
    hoh_competition: 'hoh', nomination: 'nomination', veto_competition: 'veto',
    veto_ceremony: 'veto', replacement_nom: 'nomination', eviction_vote: 'eviction', eviction: 'eviction'
  }
  router.push(`/games/bigbrother/admin/round/${round}/${stageRoutes[stage] || 'hoh'}`)
}

async function handleSetStage() {
  try {
    await seasonStore.setStage(setRound.value, setStage.value)
    await fetchData()
  } catch (e: any) { alert(e.message) }
}

async function handleNextStage() {
  try {
    await seasonStore.nextStage()
    await fetchData()
  } catch (e: any) { alert(e.message) }
}

async function handleResetSeason() {
  if (!confirm('确定要全部重新开始吗？\n此操作将清除所有比赛数据，重置为第1周。')) return
  try {
    await seasonStore.resetSeason()
    await fetchData()
    alert('赛季已重置')
  } catch (e: any) { alert(e.message) }
}

onMounted(fetchData)
</script>

<style scoped>
.bb-stage { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.bb-btn {
  background: transparent; border: 1px solid #00ff8844; color: #00ff88;
  padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s;
}
.bb-btn:hover { background: #00ff8822; }
.bb-btn-primary { background: #00ff8822; border-color: #00ff88; }
.bb-btn-sm { padding: 6px 16px; font-size: 13px; }
.bb-btn-danger { border-color: #ff4444; color: #ff4444; }
.bb-btn-danger:hover { background: #ff444422; }
.bb-input {
  background: #0f0f2e; border: 1px solid #00ff8822; color: #e0e0e0;
  padding: 8px 12px; border-radius: 6px; font-size: 14px; outline: none; width: 100%;
}
.bb-select {
  background: #0f0f2e; border: 1px solid #00ff8822; color: #e0e0e0;
  padding: 8px 12px; border-radius: 6px; font-size: 14px; outline: none; cursor: pointer; width: 100%;
}
.current-status {
  display: flex; align-items: center; gap: 24px;
  background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px;
  padding: 16px 20px; margin-bottom: 20px;
}
.status-item { display: flex; flex-direction: column; gap: 4px; }
.status-item .label { font-size: 11px; color: #888; text-transform: uppercase; }
.status-item .value { font-size: 20px; font-weight: 700; color: #fff; }
.status-item .value.stage { font-size: 16px; color: #00ff88; }
.status-actions { margin-left: auto; }
.stage-control {
  background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px;
  padding: 20px; margin-bottom: 20px;
}
.stage-control h3 { margin: 0 0 12px; font-size: 16px; color: #e0e0e0; }
.control-form { display: flex; gap: 12px; align-items: flex-end; }
.control-form .form-group { flex: 1; }
.control-form .form-group label { display: block; font-size: 12px; color: #888; margin-bottom: 4px; }
.matrix-section h3 { font-size: 16px; color: #e0e0e0; margin: 0 0 12px; }
.matrix-table-wrapper { overflow-x: auto; }
.matrix-table { width: 100%; border-collapse: collapse; }
.matrix-table th, .matrix-table td {
  padding: 10px 12px; text-align: center; border: 1px solid #00ff8811; font-size: 13px;
}
.matrix-table th { color: #888; font-weight: 500; font-size: 12px; background: #0f0f2e; }
.matrix-table .stage-header { min-width: 80px; }
.round-cell { color: #aaa; font-weight: 500; background: #0f0f2e; }
.stage-cell { cursor: pointer; transition: all 0.2s; }
.stage-cell:hover { background: #00ff8808; }
.stage-cell.completed { color: #00ff88; }
.stage-cell.current { color: #ffaa00; background: #ffaa0008; }
.stage-cell.future { color: #444; cursor: not-allowed; }
.cell-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
.cell-dot.completed { background: #00ff88; }
.cell-dot.current { background: #ffaa00; animation: pulse 2s infinite; }
.cell-dot.future { background: #333; }
.cell-status { vertical-align: middle; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
</style>
