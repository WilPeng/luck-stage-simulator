<template>
  <div class="lv-stage">
    <div class="page-header">
      <h1>赛程矩阵</h1>
      <div class="header-actions">
        <button v-if="isWaiting" class="lv-btn lv-btn-start" @click="handleStartGame">▶ 开始游戏</button>
        <button class="lv-btn lv-btn-danger" @click="handleResetSeason">全部重新开始</button>
        <button class="lv-btn" @click="fetchData">刷新</button>
      </div>
    </div>

    <div v-if="isWaiting" class="waiting-banner">
      <div class="waiting-icon">⏸</div>
      <div class="waiting-text">游戏已重置，等待管理员开始</div>
      <div class="waiting-hint">点击"开始游戏"按钮后，选手端才能看到其他选手并开始游戏</div>
    </div>

    <div v-else class="current-status">
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
        <button class="lv-btn lv-btn-sm" @click="handleNextStage">推进到下一阶段</button>
      </div>
    </div>

    <div class="stage-control">
      <h3>手动设置进度</h3>
      <div class="control-form">
        <div class="form-group">
          <label>轮次</label>
          <input v-model.number="setRound" type="number" class="lv-input" min="1" :max="seasonStore.totalRounds" />
        </div>
        <div class="form-group">
          <label>阶段</label>
          <select v-model="setStage" class="lv-select">
            <option v-for="s in stageOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
          </select>
        </div>
        <button class="lv-btn lv-btn-primary" @click="handleSetStage">设置</button>
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
              <td class="round-cell">第{{ r }}轮</td>
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
import { useLvSeasonStore } from '../../../stores/lovevarietySeasonStore'
import { LV_STAGE_NAME, type LVStageType } from '../../../types/lovevariety'

const router = useRouter()
const seasonStore = useLvSeasonStore()

const isWaiting = computed(() => seasonStore.currentStage === 'waiting')
const setRound = ref(1)
const setStage = ref<LVStageType>('love_vote')

const stageOptions = computed(() => {
  return Object.entries(LV_STAGE_NAME).map(([value, label]) => ({ value, label }))
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
  if (isWaiting.value) return 'waiting'
  return seasonStore.getStageStatus(round, stage as LVStageType)
}

function getCellText(round: number, stage: string) {
  if (isWaiting.value) return '等待'
  const status = seasonStore.getStageStatus(round, stage as LVStageType)
  const map: Record<string, string> = { completed: '已完成', current: '当前', future: '未开始' }
  return map[status] || ''
}

function navigateToStage(round: number, stage: string) {
  if (isWaiting.value) return
  if (seasonStore.getStageStatus(round, stage as LVStageType) === 'future') return
  const stageRoutes: Record<string, string> = {
    love_vote: 'votes', pairing: 'pairing', elimination: 'elimination'
  }
  router.push(`/games/lovevariety/admin/round/${round}/${stageRoutes[stage] || 'votes'}`)
}

async function handleStartGame() {
  try {
    await seasonStore.setStage(1, 'love_vote')
    await fetchData()
  } catch (e: any) { alert(e.message) }
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
  if (!confirm('确定要全部重新开始吗？\n此操作将清除所有比赛数据，重置为第1轮。')) return
  try {
    await seasonStore.resetSeason()
    await fetchData()
    alert('赛季已重置')
  } catch (e: any) { alert(e.message) }
}

onMounted(fetchData)
</script>

<style scoped>
.lv-stage { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.lv-btn {
  background: transparent; border: 1px solid #ff69b444; color: #ff69b4;
  padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s;
}
.lv-btn:hover { background: #ff69b422; }
.lv-btn-primary { background: #ff69b422; border-color: #ff69b4; }
.lv-btn-sm { padding: 6px 16px; font-size: 13px; }
.lv-btn-danger { border-color: #ff4444; color: #ff4444; }
.lv-btn-danger:hover { background: #ff444422; }
.lv-btn-start { border-color: #00ff88; color: #00ff88; font-weight: 600; }
.lv-btn-start:hover { background: #00ff8822; }
.lv-input {
  background: #1a0f2e; border: 1px solid #ff69b422; color: #e0e0e0;
  padding: 8px 12px; border-radius: 6px; font-size: 14px; outline: none; width: 100%;
}
.lv-select {
  background: #1a0f2e; border: 1px solid #ff69b422; color: #e0e0e0;
  padding: 8px 12px; border-radius: 6px; font-size: 14px; outline: none; cursor: pointer; width: 100%;
}
.waiting-banner {
  text-align: center; padding: 40px 20px;
  background: linear-gradient(135deg, #1a0f2e, #2d1b4e);
  border: 1px dashed #ffaa0044; border-radius: 12px; margin-bottom: 20px;
}
.waiting-icon { font-size: 40px; margin-bottom: 12px; }
.waiting-text { font-size: 18px; font-weight: 600; color: #ffaa00; margin-bottom: 8px; }
.waiting-hint { font-size: 13px; color: #888; }
.current-status {
  display: flex; align-items: center; gap: 24px;
  background: #1a0f2e; border: 1px solid #ff69b422; border-radius: 10px;
  padding: 16px 20px; margin-bottom: 20px;
}
.status-item { display: flex; flex-direction: column; gap: 4px; }
.status-item .label { font-size: 11px; color: #888; text-transform: uppercase; }
.status-item .value { font-size: 20px; font-weight: 700; color: #fff; }
.status-item .value.stage { font-size: 16px; color: #ff69b4; }
.status-actions { margin-left: auto; }
.stage-control {
  background: #1a0f2e; border: 1px solid #ff69b422; border-radius: 10px;
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
  padding: 10px 12px; text-align: center; border: 1px solid #ff69b411; font-size: 13px;
}
.matrix-table th { color: #888; font-weight: 500; font-size: 12px; background: #1a0f2e; }
.matrix-table .stage-header { min-width: 80px; }
.round-cell { color: #aaa; font-weight: 500; background: #1a0f2e; }
.stage-cell { cursor: pointer; transition: all 0.2s; }
.stage-cell:hover { background: #ff69b408; }
.stage-cell.completed { color: #ff69b4; }
.stage-cell.current { color: #ffaa00; background: #ffaa0008; }
.stage-cell.future { color: #444; cursor: not-allowed; }
.stage-cell.waiting { color: #666; cursor: not-allowed; }
.cell-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
.cell-dot.completed { background: #ff69b4; }
.cell-dot.current { background: #ffaa00; animation: pulse 2s infinite; }
.cell-dot.future { background: #333; }
.cell-dot.waiting { background: #555; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
.cell-status { vertical-align: middle; }
</style>
