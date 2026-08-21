<template>
  <div class="bb-stage">
    <div class="page-header">
      <h1>赛季设置</h1>
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
        <span class="value">{{ roundConfigs.length }}</span>
      </div>
      <div class="status-actions">
        <button class="bb-btn bb-btn-sm" @click="handleNextStage">推进到下一阶段</button>
      </div>
    </div>

    <!-- 赛季配置 4 列表格 -->
    <div class="config-card">
      <div class="config-header">
        <h3>赛季配置</h3>
        <button class="bb-btn bb-btn-primary" @click="handleSaveConfig" :disabled="saving">
          {{ saving ? '保存中...' : '💾 保存配置' }}
        </button>
      </div>
      <p class="config-hint">
        赛季开始前可编辑全部内容；赛季开始后，已完成的轮次将被锁定，仅可编辑未来轮次的 twist。
      </p>

      <!-- Jury Size & Final Size 设置 -->
      <div class="jury-size-row" :class="{ locked: isSeasonActive }">
        <span class="jury-size-label">Jury 人数：</span>
        <input
          v-model.number="jurySize"
          type="number"
          class="bb-input-sm jury-size-input"
          :disabled="isSeasonActive"
          min="0"
          max="20"
          placeholder="7"
        />
        <span class="jury-size-divider">|</span>
        <span class="jury-size-label">Final 人数：</span>
        <input
          v-model.number="finalSize"
          type="number"
          class="bb-input-sm jury-size-input"
          :disabled="isSeasonActive"
          min="1"
          max="10"
          placeholder="2"
        />
        <span class="jury-size-hint">（赛季开始前设置，最后 {{ finalSize }} 人进入决赛不淘汰，再往前 {{ jurySize }} 个淘汰者为陪审团）</span>
      </div>
      <p class="auto-gen-hint">
        💡 淘汰者名次和陪审团状态会根据在线房客数（{{ totalHouseguests }}人）、Jury人数（{{ jurySize }}人）和Final人数（{{ finalSize }}人）自动计算
      </p>

      <div class="config-table-wrapper">
        <table class="config-table">
          <thead>
            <tr>
              <th class="col-round">轮次</th>
              <th class="col-twist">Twist（反转/变数）</th>
              <th class="col-rank">淘汰者名次</th>
              <th class="col-jury">陪审团</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(cfg, idx) in roundConfigs" :key="cfg.round"
              :class="{ locked: isRoundLocked(cfg.round) }">
              <td class="col-round">
                <span class="round-label">第{{ cfg.round }}周</span>
                <span v-if="isRoundLocked(cfg.round)" class="lock-icon">🔒</span>
              </td>
              <td class="col-twist">
                <div class="twist-tags-row">
                  <span v-for="tid in cfg.twists" :key="tid" class="twist-tag" :title="getTwistName(tid)">
                    <span class="tag-icon">{{ getTwistIcon(tid) }}</span>
                    <span class="tag-name">{{ getTwistName(tid) }}</span>
                    <button v-if="!isRoundLocked(cfg.round)" class="tag-remove" @click="removeTwist(idx, tid)">×</button>
                  </span>
                  <button v-if="!isRoundLocked(cfg.round)" class="add-twist-btn" @click="openTwistPicker(idx)">
                    + 添加 Twist
                  </button>
                </div>
              </td>
              <td class="col-rank">
                <span class="rank-value" :class="{ auto: true, noevict: getEvictCount(cfg.round) === 0 }">{{ getEliminationRankRange(cfg.round) }}</span>
              </td>
              <td class="col-jury">
                <span class="jury-badge" :class="{ yes: isJuryRound(cfg.round), no: !isJuryRound(cfg.round) }">
                  {{ isJuryRound(cfg.round) ? '👨‍⚖️ 是' : '否' }}
                </span>
              </td>
              <td class="col-actions">
                <button
                  v-if="!isRoundLocked(cfg.round)"
                  class="action-btn insert"
                  @click="insertRoundAfter(cfg.round)"
                  title="在此后插入轮次"
                >+ 插入</button>
                <button
                  v-if="!isRoundLocked(cfg.round)"
                  class="action-btn delete"
                  @click="deleteRound(cfg.round)"
                  title="删除此轮次"
                >删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="add-round-row">
        <button class="bb-btn" @click="addRound">+ 在末尾添加轮次</button>
      </div>
    </div>

    <!-- Twist 选择弹窗 -->
    <Teleport to="body">
      <div v-if="twistPickerOpen" class="bb-modal-overlay" @click.self="closeTwistPicker">
        <div class="bb-modal twist-picker-modal">
          <div class="bb-modal-header">
            <h3>为第{{ pickerRoundLabel }}周选择 Twist</h3>
            <button class="close-btn" @click="closeTwistPicker">✕</button>
          </div>
          <div class="bb-modal-body">
            <div class="twist-options">
              <label v-for="twist in allTwistDefs" :key="twist.id" class="twist-option">
                <input
                  type="checkbox"
                  :checked="pickerSelected.has(twist.id)"
                  @change="togglePickerTwist(twist.id)"
                />
                <span class="twist-option-icon">{{ twist.icon }}</span>
                <span class="twist-option-name">{{ twist.name }}</span>
                <span class="twist-option-desc">{{ twist.description }}</span>
              </label>
            </div>
            <div class="form-actions">
              <button class="bb-btn" @click="closeTwistPicker">取消</button>
              <button class="bb-btn bb-btn-primary" @click="confirmTwistPicker">确认</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 手动设置进度 -->
    <div class="stage-control">
      <h3>手动设置进度</h3>
      <div class="control-form">
        <div class="form-group">
          <label>轮次</label>
          <input v-model.number="setRound" type="number" class="bb-input" min="1" :max="roundConfigs.length" />
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

    <!-- 赛程矩阵预览 -->
    <div class="matrix-section">
      <h3>赛程矩阵预览</h3>
      <div class="matrix-table-wrapper">
        <table class="matrix-table">
          <thead>
            <tr>
              <th>轮次</th>
              <th v-for="s in stageOptions" :key="s.value" class="stage-header">{{ s.label }}</th>
              <th class="twist-info-col">Twist</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in matrixRounds" :key="r">
              <td class="round-cell">第{{ r }}周</td>
              <td v-for="s in stageOptions" :key="s.value"
                class="stage-cell"
                :class="getCellClass(r, s.value)"
                @click="navigateToStage(r, s.value)">
                <span class="cell-dot" :class="getCellClass(r, s.value)"></span>
                <span class="cell-status">{{ getCellText(r, s.value) }}</span>
              </td>
              <td class="twist-info-cell">
                <span v-if="getRoundTwists(r).length > 0" class="twist-tags-preview">
                  <span v-for="tid in getRoundTwists(r)" :key="tid" class="twist-tag-mini" :title="getTwistName(tid)">
                    {{ getTwistIcon(tid) }}
                  </span>
                </span>
                <span v-else class="no-twist">-</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useBbSeasonStore } from '../../../stores/bbSeasonStore'
import {
  BB_STAGE_NAME, type BBStageType, type BBTwistId,
  type BBRoundConfig, type BBTwistDef, getAllTwistDefs
} from '../../../types/bigbrother'
import {
  bbGetSeasonConfig, bbSaveSeasonConfig, bbUpdateRound, bbGetHouseguestStats
} from '../../../services/bbApi'

const router = useRouter()
const seasonStore = useBbSeasonStore()

const setRound = ref(1)
const setStage = ref<BBStageType>('hoh_competition')
const saving = ref(false)
const isSeasonStarted = ref(false)
const jurySize = ref(7)
const finalSize = ref(2) // 最终不淘汰进入决赛的人数
const totalHouseguests = ref(0) // 在线房客总人数

// 轮次配置
const roundConfigs = ref<BBRoundConfig[]>([])
const allTwistDefs = ref<BBTwistDef[]>([])

// Twist 选择弹窗
const twistPickerOpen = ref(false)
const pickerRoundIdx = ref(-1)
const pickerSelected = reactive<Set<string>>(new Set())

const stageOptions = computed(() => {
  return Object.entries(BB_STAGE_NAME).map(([value, label]) => ({ value, label }))
})

const matrixRounds = computed(() => {
  return Array.from({ length: roundConfigs.value.length }, (_, i) => i + 1)
})

// 判断赛季是否已开始
const isSeasonActive = computed(() => {
  if (isSeasonStarted.value) return true
  if (seasonStore.currentRoundNumber > 1) return true
  if (seasonStore.currentStage !== 'hoh_competition') return true
  return false
})

function isRoundLocked(round: number): boolean {
  if (!isSeasonActive.value) return false
  return round <= seasonStore.currentRoundNumber
}

// 获取指定轮次的淘汰人数（考虑 twist 影响）
function getEvictCount(round: number): number {
  const cfg = roundConfigs.value.find(c => c.round === round)
  if (cfg?.twists?.includes('triple_offering')) return 2
  // 未来复活 twist 预留：返回 0 表示该轮不产生淘汰者
  // if (cfg?.twists?.includes('resurrection')) return 0
  return 1
}

// 自动计算淘汰者名次范围（考虑 twist 对淘汰人数的影响）
// 第1轮淘汰最高名次（总人数），逐轮递减，三重献祭轮次产生2个名次
function getEliminationRankRange(round: number): string {
  if (totalHouseguests.value <= 0) return '-'
  const evictCount = getEvictCount(round)
  if (evictCount === 0) return '无淘汰'

  // 累计前 (round-1) 轮的总淘汰人数，得到本轮起始名次
  let cumulativeEvicted = 0
  for (let r = 1; r < round; r++) {
    cumulativeEvicted += getEvictCount(r)
  }

  const startRank = totalHouseguests.value - cumulativeEvicted
  const endRank = startRank - evictCount + 1

  if (evictCount === 1) {
    return startRank > 0 ? `第${startRank}名` : '-'
  }
  return startRank > 0 ? `第${startRank}-${endRank}名` : '-'
}

// 自动判断是否为陪审团：
// 规则：淘汰者中，排除 Final 选手（最后 finalSize 个名次）后，
// 剩余淘汰者中最后 jurySize 个淘汰者为陪审团
function isJuryRound(round: number): boolean {
  if (jurySize.value <= 0) return false
  const evictCount = getEvictCount(round)
  if (evictCount === 0) return false // 无淘汰的轮次不产生陪审团

  // 计算该轮淘汰者的名次范围
  let cumulativeBefore = 0
  for (let r = 1; r < round; r++) {
    cumulativeBefore += getEvictCount(r)
  }
  const startRank = totalHouseguests.value - cumulativeBefore
  const endRank = startRank - evictCount + 1

  // Final 选手：名次在 1 ~ finalSize 范围内的不淘汰，不是陪审团
  // 如果该轮所有淘汰者都在 Final 范围内（即 endRank <= finalSize），不是陪审团
  if (endRank <= finalSize.value) return false

  // 从总淘汰人数中排除 Final 选手，计算"有效淘汰总人数"
  let totalEvictedAll = 0
  for (let r = 1; r <= roundConfigs.value.length; r++) {
    totalEvictedAll += getEvictCount(r)
  }
  // 有效淘汰人数 = 总淘汰人数 - finalSize（最后 finalSize 名不淘汰）
  const effectiveEvicted = totalEvictedAll - finalSize.value

  // 从最后一轮往前累计淘汰人数，排除 Final 选手轮次
  let cumulativeFromEnd = 0
  for (let r = roundConfigs.value.length; r >= 1; r--) {
    const ec = getEvictCount(r)
    if (ec === 0) continue
    // 计算该轮淘汰者的结束名次
    let cb = 0
    for (let rr = 1; rr < r; rr++) { cb += getEvictCount(rr) }
    const er = totalHouseguests.value - cb - ec + 1
    // 如果该轮所有淘汰者都是 Final 选手，跳过
    if (er <= finalSize.value) continue
    cumulativeFromEnd += ec
    if (r === round) break
  }
  // 如果从最后一轮（非Final）到当前轮的累计淘汰人数 <= jurySize，则是陪审团
  return cumulativeFromEnd <= jurySize.value
}

async function fetchData() {
  await seasonStore.fetchProgress()
  setRound.value = seasonStore.currentRoundNumber
  setStage.value = seasonStore.currentStage

  try {
    const config = await bbGetSeasonConfig()
    roundConfigs.value = config.roundConfigs || []
    allTwistDefs.value = config.allTwists || getAllTwistDefs()
    isSeasonStarted.value = config.isSeasonStarted
    jurySize.value = config.jurySize ?? 7
    finalSize.value = config.finalSize ?? 2
  } catch {
    allTwistDefs.value = getAllTwistDefs()
    const total = seasonStore.totalRounds
    roundConfigs.value = Array.from({ length: total }, (_, i) => ({
      round: i + 1,
      twists: [] as BBTwistId[],
      eliminationRank: null,
      isJury: false
    }))
  }

  // 获取在线房客总人数
  try {
    const stats = await bbGetHouseguestStats()
    totalHouseguests.value = stats.total
  } catch {}
}

// Twist 相关
function getTwistIcon(twistId: string): string {
  return allTwistDefs.value.find(t => t.id === twistId)?.icon || '❓'
}

function getTwistName(twistId: string): string {
  return allTwistDefs.value.find(t => t.id === twistId)?.name || twistId
}

function removeTwist(rowIdx: number, twistId: string) {
  const cfg = roundConfigs.value[rowIdx]
  cfg.twists = cfg.twists.filter(t => t !== twistId)
}

function getRoundTwists(round: number): BBTwistId[] {
  const cfg = roundConfigs.value.find(c => c.round === round)
  return cfg?.twists || []
}

// Twist 选择弹窗
function openTwistPicker(idx: number) {
  pickerRoundIdx.value = idx
  pickerSelected.clear()
  const cfg = roundConfigs.value[idx]
  cfg.twists.forEach(t => pickerSelected.add(t))
  twistPickerOpen.value = true
}

function closeTwistPicker() {
  twistPickerOpen.value = false
}

const pickerRoundLabel = computed(() => {
  if (pickerRoundIdx.value >= 0 && pickerRoundIdx.value < roundConfigs.value.length) {
    return roundConfigs.value[pickerRoundIdx.value].round
  }
  return '?'
})

function togglePickerTwist(twistId: string) {
  if (pickerSelected.has(twistId)) {
    pickerSelected.delete(twistId)
  } else {
    pickerSelected.add(twistId)
  }
}

function confirmTwistPicker() {
  if (pickerRoundIdx.value >= 0) {
    roundConfigs.value[pickerRoundIdx.value].twists = Array.from(pickerSelected) as BBTwistId[]
  }
  closeTwistPicker()
}

// 轮次操作
async function addRound() {
  const newRound = roundConfigs.value.length + 1
  roundConfigs.value.push({ round: newRound, twists: [], eliminationRank: null, isJury: false })
}

async function insertRoundAfter(round: number) {
  try {
    await bbUpdateRound({ insertAfter: round })
    await fetchData()
  } catch (e: any) { alert(e.message) }
}

async function deleteRound(round: number) {
  if (!confirm(`确定要删除第${round}周吗？后续轮次将自动重新编号。`)) return
  try {
    await bbUpdateRound({ deleteRound: round })
    await fetchData()
  } catch (e: any) { alert(e.message) }
}

// 保存
async function handleSaveConfig() {
  saving.value = true
  try {
    // 自动计算 eliminationRank 和 isJury 后再保存（考虑 twist 对淘汰人数的影响）
    const configsToSave = roundConfigs.value.map(cfg => {
      // 累计前 (cfg.round-1) 轮的总淘汰人数
      let cumulativeEvicted = 0
      for (let r = 1; r < cfg.round; r++) {
        cumulativeEvicted += getEvictCount(r)
      }
      const startRank = totalHouseguests.value > 0 ? totalHouseguests.value - cumulativeEvicted : null
      return {
        ...cfg,
        eliminationRank: startRank,
        isJury: isJuryRound(cfg.round)
      }
    })
    await bbSaveSeasonConfig({ roundConfigs: configsToSave, jurySize: jurySize.value, finalSize: finalSize.value })
    alert('赛季配置已保存')
  } catch (e: any) {
    alert(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

// 赛程矩阵
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
    hoh_competition: 'hoh',
    nomination: 'nomination',
    veto_competition: 'veto-competition',
    veto_ceremony: 'veto-ceremony',
    replacement_nom: 'replacement-nom',
    eviction_vote: 'eviction-vote',
    eviction: 'eviction'
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
.bb-stage { max-width: 1400px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.bb-btn {
  background: transparent; border: 1px solid #00ff8844; color: #00ff88;
  padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s;
}
.bb-btn:hover { background: #00ff8822; }
.bb-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.bb-btn-primary { background: #00ff8822; border-color: #00ff88; }
.bb-btn-sm { padding: 6px 16px; font-size: 13px; }
.bb-btn-danger { border-color: #ff4444; color: #ff4444; }
.bb-btn-danger:hover { background: #ff444422; }
.bb-input {
  background: #0f0f2e; border: 1px solid #00ff8822; color: #e0e0e0;
  padding: 8px 12px; border-radius: 6px; font-size: 14px; outline: none;
}
.bb-input-sm {
  background: #0f0f2e; border: 1px solid #00ff8822; color: #e0e0e0;
  padding: 6px 10px; border-radius: 6px; font-size: 13px; outline: none; width: 80px; text-align: center;
}
.bb-input-sm:disabled { opacity: 0.4; border-color: #333; }
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

/* 配置表格 */
.config-card {
  background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px;
  padding: 20px; margin-bottom: 20px;
}
.config-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.config-header h3 { margin: 0; font-size: 16px; color: #e0e0e0; }
.config-hint { font-size: 12px; color: #888; margin: 0 0 16px; }
.jury-size-row {
  display: flex; align-items: center; gap: 8px; margin-bottom: 16px;
  padding: 10px 14px; background: #0a0a1e; border-radius: 8px;
  border: 1px solid #00ff8822;
}
.jury-size-row.locked { opacity: 0.55; background: #0a0a0f; }
.jury-size-label { font-size: 14px; color: #e0e0e0; font-weight: 500; }
.jury-size-input { width: 60px; }
.jury-size-divider { color: #444; font-size: 14px; }
.jury-size-hint { font-size: 12px; color: #666; }
.auto-gen-hint { font-size: 12px; color: #888; margin: 0 0 16px; padding: 8px 12px; background: #00ff8808; border-radius: 6px; border: 1px solid #00ff8811; }
.config-table-wrapper { overflow-x: auto; }
.config-table { width: 100%; border-collapse: collapse; }
.config-table th, .config-table td {
  padding: 12px 14px; text-align: center; border-bottom: 1px solid #00ff8811; font-size: 13px;
}
.config-table th { color: #888; font-weight: 500; font-size: 12px; background: #0a0a1e; }
.col-round { width: 100px; color: #aaa; font-weight: 500; }
.col-twist { min-width: 350px; }
.col-rank { width: 100px; }
.col-jury { width: 100px; }
.col-actions { width: 140px; }

.config-table tr.locked { opacity: 0.55; }
.config-table tr.locked td { background: #0a0a0f; }
.config-table tr.locked .twist-tag { opacity: 0.7; }

.round-label { font-size: 14px; color: #e0e0e0; }
.lock-icon { margin-left: 6px; font-size: 12px; }

/* Twist 标签 */
.twist-tags-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.twist-tag {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; background: #00ff8811; border: 1px solid #00ff8833;
  border-radius: 6px; font-size: 12px; color: #ccc;
}
.tag-icon { font-size: 14px; }
.tag-name { font-size: 12px; }
.tag-remove {
  background: none; border: none; color: #ff4444; cursor: pointer;
  font-size: 14px; padding: 0 2px; line-height: 1; margin-left: 2px;
}
.tag-remove:hover { color: #ff6666; }
.add-twist-btn {
  background: transparent; border: 1px dashed #00ff8844; color: #00ff88;
  padding: 4px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;
  transition: all 0.2s;
}
.add-twist-btn:hover { background: #00ff8811; border-style: solid; }

/* 名次展示 */
.rank-value { font-size: 13px; color: #e0e0e0; font-weight: 500; }
.rank-value.auto { color: #00ff88; }
.rank-value.noevict { color: #888; }

/* 陪审团展示 */
.jury-badge {
  display: inline-block; padding: 3px 12px; border-radius: 10px; font-size: 12px; font-weight: 500;
}
.jury-badge.yes { background: #00ff8815; color: #00ff88; border: 1px solid #00ff8844; }
.jury-badge.no { color: #555; }

/* 操作按钮 */
.action-btn {
  padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px;
  border: 1px solid #333; background: transparent; color: #888; margin: 0 2px;
  transition: all 0.2s;
}
.action-btn.insert { border-color: #3498db44; color: #3498db; }
.action-btn.insert:hover { background: #3498db22; }
.action-btn.delete { border-color: #ff444444; color: #ff4444; }
.action-btn.delete:hover { background: #ff444422; }

.add-round-row { margin-top: 16px; display: flex; justify-content: center; }

/* Twist 选择弹窗 */
.twist-picker-modal { width: 520px; }
.twist-options { display: flex; flex-direction: column; gap: 8px; max-height: 400px; overflow-y: auto; }
.twist-option {
  display: flex; align-items: center; gap: 10px; padding: 10px 12px;
  background: #0f0f2e; border: 1px solid #00ff8811; border-radius: 8px;
  cursor: pointer; transition: all 0.2s;
}
.twist-option:hover { background: #00ff8808; border-color: #00ff8833; }
.twist-option input[type="checkbox"] { accent-color: #00ff88; width: 16px; height: 16px; }
.twist-option-icon { font-size: 20px; }
.twist-option-name { font-size: 14px; font-weight: 500; color: #e0e0e0; min-width: 100px; }
.twist-option-desc { font-size: 12px; color: #888; flex: 1; }

/* 手动设置进度 */
.stage-control {
  background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px;
  padding: 20px; margin-bottom: 20px;
}
.stage-control h3 { margin: 0 0 12px; font-size: 16px; color: #e0e0e0; }
.control-form { display: flex; gap: 12px; align-items: flex-end; }
.control-form .form-group { flex: 1; }
.control-form .form-group label { display: block; font-size: 12px; color: #888; margin-bottom: 4px; }

/* 赛程矩阵 */
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
.twist-info-col { min-width: 100px; }
.twist-info-cell { text-align: left; padding: 10px 8px; }
.twist-tags-preview { display: flex; gap: 3px; flex-wrap: wrap; }
.twist-tag-mini {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; background: #00ff8811; border: 1px solid #00ff8833;
  border-radius: 4px; font-size: 12px;
}
.no-twist { color: #444; font-size: 12px; }

/* 弹窗 */
.bb-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.bb-modal { background: #1a1a3e; border: 1px solid #00ff8844; border-radius: 12px; max-width: 90vw; }
.bb-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #00ff8822; }
.bb-modal-header h3 { margin: 0; color: #00ff88; font-size: 16px; }
.close-btn { background: none; border: none; color: #888; cursor: pointer; font-size: 18px; }
.bb-modal-body { padding: 20px; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 13px; color: #aaa; margin-bottom: 6px; }
.form-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; }

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
</style>
