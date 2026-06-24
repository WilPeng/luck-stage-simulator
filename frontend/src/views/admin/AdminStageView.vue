<template>
  <div class="admin-stage">
    <t-card class="stage-card" :bordered="false">
      <div class="page-head">
        <div>
          <h1>赛程控制</h1>
          <p>多轮次赛程矩阵管理 - 状态机模式</p>
        </div>
        <div class="page-head-actions">
          <t-button variant="outline" theme="danger" :loading="resetting" @click="handleResetConfirm">
            重新开始
          </t-button>
          <t-button variant="outline" :loading="loading" @click="loadData">刷新</t-button>
        </div>
      </div>

      <div class="overview-grid">
        <div class="overview-item">
          <span class="overview-value">{{ currentRoundLabel }}</span>
          <span class="overview-label">当前轮次</span>
        </div>
        <div class="overview-item">
          <span class="overview-value">{{ stageName }}</span>
          <span class="overview-label">当前阶段</span>
        </div>
        <div class="overview-item">
          <span class="overview-value">{{ totalRounds }}</span>
          <span class="overview-label">总轮次</span>
        </div>
        <div class="overview-item">
          <span class="overview-value">{{ activePlayerCount }}</span>
          <span class="overview-label">剩余选手</span>
        </div>
      </div>
    </t-card>

    <t-card title="赛程矩阵" :bordered="false" class="stage-card">
      <template #subtitle>
        <t-tag theme="primary" variant="light">状态机模式：所有状态动态计算</t-tag>
      </template>
      <div class="matrix-container">
        <div class="matrix-table">
          <div class="matrix-header">
            <div class="matrix-cell header-cell">环节</div>
            <div
              v-for="round in totalRounds"
              :key="round"
              class="matrix-cell header-cell"
              :class="{ 'current-round': round === currentRoundNumber }"
            >
              第{{ round }}公演
            </div>
          </div>
          <div
            v-for="stage in stageList"
            :key="stage.type"
            class="matrix-row"
          >
            <div class="matrix-cell stage-name">
              {{ stage.name }}
            </div>
            <div
              v-for="round in totalRounds"
              :key="`${round}-${stage.type}`"
              class="matrix-cell"
              :class="getCellClass(round, stage.type)"
              @click="handleCellClick(round, stage.type)"
            >
              <span class="cell-status">
                {{ getCellStatus(round, stage.type) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </t-card>

    <t-card title="快速操作" :bordered="false" class="stage-card">
      <div class="quick-actions">
        <t-button
          theme="primary"
          :disabled="!canGoNextStage"
          :loading="stageChanging"
          @click="handleNextStage"
        >
          进入下一阶段
        </t-button>
        <t-button
          variant="outline"
          :disabled="!canGoNextRound"
          :loading="stageChanging"
          @click="handleNextRound"
        >
          进入下一轮
        </t-button>
      </div>
      <t-alert theme="info" style="margin-top: 16px">
        <template #message>
          <div>状态机说明：</div>
          <ul style="margin: 8px 0 0 0; padding-left: 20px;">
            <li>管理员只控制 <strong>当前轮次 + 当前阶段</strong></li>
            <li>所有页面状态由系统动态计算</li>
            <li>已完成 = 绿色，当前 = 蓝色，未开始 = 灰色</li>
          </ul>
        </template>
      </t-alert>
    </t-card>

    <t-dialog
      v-model:visible="resetDialogVisible"
      header="重置赛季"
      theme="warning"
      :close-on-overlay-click="false"
      @closed="resetting = false"
    >
      <t-alert theme="warning" message="重置赛季将清除所有数据，包括选手状态、队伍、训练记录、公演结果等。此操作不可撤销！" />
      <template #footer>
        <t-button theme="default" @click="resetDialogVisible = false">取消</t-button>
        <t-button theme="warning" :loading="resetting" @click="handleReset">
          确认重置
        </t-button>
      </template>
    </t-dialog>

    <t-dialog
      v-model:visible="confirmDialogVisible"
      header="确认切换"
      :close-on-overlay-click="false"
      @closed="stageChanging = false"
    >
      <div class="confirm-content">
        <p>确定要切换到以下位置吗？</p>
        <div class="confirm-info">
          <div class="info-row">
            <span class="info-label">轮次：</span>
            <span class="info-value">第{{ targetRound }}公演</span>
          </div>
          <div class="info-row">
            <span class="info-label">阶段：</span>
            <span class="info-value">{{ getStageName(targetStage) }}</span>
          </div>
        </div>
        <t-alert theme="info" message="系统将自动计算并标记所有已完成、当前和未开始的阶段。" />
      </div>
      <template #footer>
        <t-button theme="default" @click="confirmDialogVisible = false">取消</t-button>
        <t-button theme="primary" :loading="stageChanging" @click="confirmSwitch">
          确认切换
        </t-button>
      </template>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { useSeasonStore } from '../../stores/seasonStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useTeamStore } from '../../stores/teamStore'
import { useSongStore } from '../../stores/songStore'
import { STAGE_ORDER, STAGE_NAMES, getStageName } from '../../types/season'
import type { StageType, StageStatus } from '../../types/season'

const router = useRouter()
const seasonStore = useSeasonStore()
const playerStore = usePlayerStore()

const loading = ref(false)
const stageChanging = ref(false)
const resetting = ref(false)
const resetDialogVisible = ref(false)
const confirmDialogVisible = ref(false)
const targetRound = ref(1)
const targetStage = ref<StageType>('preparation')

// 计算属性
const currentRoundNumber = computed(() => seasonStore.currentRoundNumber)
const totalRounds = computed(() => seasonStore.totalRounds)
const stageName = computed(() => seasonStore.stageName)
const activePlayerCount = computed(() => seasonStore.season?.activePlayerCount ?? playerStore.users.filter(user => user.role !== 'admin' && user.status !== 'eliminated').length)

const currentRoundLabel = computed(() => {
  if (!seasonStore.hasStartedPerformance) return '未开始'
  return `第${currentRoundNumber.value}公演`
})

const canGoNextStage = computed(() => !!seasonStore.getNextStage())
const canGoNextRound = computed(() => currentRoundNumber.value < totalRounds.value)

// 阶段列表
const stageList = computed(() => {
  return STAGE_ORDER.map(type => ({
    type,
    name: STAGE_NAMES[type]
  }))
})

// 获取单元格状态
function getCellStatus(round: number, stage: StageType): string {
  const status = seasonStore.getStageStatus(round, stage)
  const statusMap: Record<StageStatus, string> = {
    'completed': '已完成',
    'current': '当前',
    'future': '未开始'
  }
  return statusMap[status] || '未开始'
}

// 获取单元格样式类
function getCellClass(round: number, stage: StageType): Record<string, boolean> {
  const status = seasonStore.getStageStatus(round, stage)
  return {
    'cell-completed': status === 'completed',
    'cell-current': status === 'current',
    'cell-pending': status === 'future',
    'cell-clickable': true
  }
}

// 点击单元格
function handleCellClick(round: number, stage: StageType) {
  const status = seasonStore.getStageStatus(round, stage)

  if (status === 'current') {
    MessagePlugin.info('这是当前阶段')
    return
  }

  if (status === 'completed') {
    MessagePlugin.warning('已完成阶段不可切换')
    return
  }

  // 只能切换到当前轮次的下一个阶段，或者下一轮的第一个阶段
  const currentStageIndex = STAGE_ORDER.indexOf(seasonStore.currentStage)
  const targetStageIndex = STAGE_ORDER.indexOf(stage)

  if (round === currentRoundNumber.value) {
    // 当前轮次，只能切换到下一个阶段
    if (targetStageIndex !== currentStageIndex + 1) {
      MessagePlugin.warning('只能切换到下一个阶段')
      return
    }
  } else if (round === currentRoundNumber.value + 1) {
    // 下一轮次，只能切换到第一个阶段
    if (targetStageIndex !== 0) {
      MessagePlugin.warning('下一轮次只能从第一个阶段开始')
      return
    }
  } else {
    MessagePlugin.warning('只能切换到相邻的轮次')
    return
  }

  targetRound.value = round
  targetStage.value = stage
  confirmDialogVisible.value = true
}

// 确认切换
async function confirmSwitch() {
  stageChanging.value = true
  try {
    await seasonStore.setStage(targetRound.value, targetStage.value)
    confirmDialogVisible.value = false
    MessagePlugin.success('阶段已切换')
  } catch (e: any) {
    MessagePlugin.error(e.message || '切换失败')
  } finally {
    stageChanging.value = false
  }
}

// 进入下一阶段
async function handleNextStage() {
  stageChanging.value = true
  try {
    await seasonStore.nextStage()
    MessagePlugin.success('已进入下一阶段')
  } catch (e: any) {
    MessagePlugin.error(e.message || '切换失败')
  } finally {
    stageChanging.value = false
  }
}

// 进入下一轮
async function handleNextRound() {
  if (currentRoundNumber.value >= totalRounds.value) {
    MessagePlugin.warning('已经是最后一轮')
    return
  }

  stageChanging.value = true
  try {
    const nextRound = currentRoundNumber.value + 1
    await seasonStore.setStage(nextRound, 'preparation')
    MessagePlugin.success(`已进入第${nextRound}公演`)
  } catch (e: any) {
    MessagePlugin.error(e.message || '切换失败')
  } finally {
    stageChanging.value = false
  }
}

// 重置确认
function handleResetConfirm() {
  resetDialogVisible.value = true
}

// 重置赛季
async function handleReset() {
  resetting.value = true
  try {
    await seasonStore.resetSeason()
    // 清空前端内存中的队伍和歌曲缓存，避免显示旧数据
    useTeamStore().clearData()
    useSongStore().clearData()
    resetDialogVisible.value = false
    MessagePlugin.success('赛季已重置，跳转到第一公演')
    resetting.value = false
    // 跳转到第一公演预先准备阶段
    router.push('/admin/round/1/preparation')
  } catch (e: any) {
    MessagePlugin.error('重置失败: ' + (e.message || '后端接口异常'))
    resetting.value = false
  }
}

// 加载数据
async function loadData() {
  loading.value = true
  try {
    await seasonStore.fetchProgress()
    await playerStore.fetchUsers({ pageSize: 1000 })
  } catch (e: any) {
    MessagePlugin.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<style lang="scss" scoped>
.admin-stage {
  min-height: 100%;
  padding: 12px;
  background: #f5f7fa;
}

.stage-card {
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
    color: #1f2329;
    font-size: 22px;
    line-height: 1.25;
  }

  p {
    margin: 0;
    color: #6b7280;
    font-size: 13px;
    line-height: 1.6;
  }
}

.page-head-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-top: 16px;
}

.overview-item {
  min-width: 0;
  padding: 12px;
  border-radius: 8px;
  background: #f5f7fa;
}

.overview-value {
  display: block;
  color: #0052d9;
  font-size: 18px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.overview-label {
  display: block;
  margin-top: 4px;
  color: #6b7280;
  font-size: 12px;
}

.matrix-container {
  overflow-x: auto;
  padding: 8px 0;
}

.matrix-table {
  display: inline-block;
  min-width: 100%;
}

.matrix-header {
  display: flex;
  background: #f0f2f5;
  border-radius: 8px 8px 0 0;
  font-weight: 600;
}

.matrix-row {
  display: flex;
  border-bottom: 1px solid #e5e7eb;

  &:last-child {
    border-bottom: none;
  }
}

.matrix-cell {
  flex: 1;
  min-width: 120px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid #e5e7eb;

  &:last-child {
    border-right: none;
  }

  &.header-cell {
    background: #f0f2f5;
    color: #1f2329;
    font-size: 14px;

    &.current-round {
      background: #0052d9;
      color: #fff;
    }
  }

  &.stage-name {
    background: #fafbfc;
    color: #1f2329;
    font-weight: 500;
    justify-content: flex-start;
    min-width: 140px;
  }

  &.cell-clickable {
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background: #f0f6ff;
    }
  }

  &.cell-completed {
    background: #f0fbf6;
    color: #00a870;
  }

  &.cell-current {
    background: #e6f7ff;
    color: #0052d9;
    font-weight: 600;
    position: relative;

    &::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 8px;
      transform: translateY(-50%);
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #0052d9;
      animation: pulse 2s infinite;
    }
  }

  &.cell-pending {
    background: #fff;
    color: #9ca3af;
  }
}

.cell-status {
  font-size: 13px;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

.quick-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.confirm-content {
  p {
    margin: 0 0 16px;
    color: #1f2329;
    font-size: 14px;
  }
}

.confirm-info {
  background: #f5f7fa;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;

  &:not(:last-child) {
    border-bottom: 1px solid #e5e7eb;
  }
}

.info-label {
  color: #6b7280;
  font-size: 14px;
}

.info-value {
  color: #1f2329;
  font-weight: 600;
  font-size: 14px;
}

@media (min-width: 768px) {
  .admin-stage {
    padding: 24px;
  }

  .stage-card {
    max-width: 1200px;
  }
}

@media (max-width: 640px) {
  .page-head {
    flex-direction: column;
  }

  .overview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .matrix-cell {
    min-width: 100px;
    padding: 10px 12px;

    &.stage-name {
      min-width: 120px;
    }
  }

  .quick-actions {
    flex-direction: column;

    .t-button {
      width: 100%;
    }
  }
}
</style>