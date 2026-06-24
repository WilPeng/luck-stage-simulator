<template>
  <div class="stage-status-wrapper">
    <!-- 未开始状态 -->
    <div v-if="status === 'future'" class="stage-future">
      <div class="future-icon">🔒</div>
      <h2 class="future-title">该阶段尚未开放</h2>
      <p class="future-desc">当前处于 {{ currentRoundName }} - {{ currentStageName }}</p>
      <div class="future-status">
        <span class="status-label">状态：</span>
        <t-tag theme="default" variant="light">未开始</t-tag>
      </div>
    </div>

    <!-- 已完成状态 -->
    <div v-else-if="status === 'completed'" class="stage-completed">
      <div class="completed-header">
        <t-tag theme="success" variant="light" size="large">
          ✓ {{ currentRoundName }} - {{ currentStageName }}
        </t-tag>
        <span class="completed-label">（历史记录）</span>
      </div>
      <slot name="completed" />
    </div>

    <!-- 当前状态 -->
    <div v-else class="stage-current">
      <div class="current-header">
        <t-tag theme="primary" variant="light" size="large">
          ● {{ currentRoundName }} - {{ currentStageName }}
        </t-tag>
        <span class="current-label">（进行中）</span>
      </div>
      <slot name="current" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSeasonStore } from '../stores/seasonStore'
import { STAGE_NAMES } from '../types/season'
import type { StageType, StageStatus } from '../types/season'

const props = withDefaults(defineProps<{
  /** 轮次 */
  round: number
  /** 阶段 */
  stage: StageType
  /** 外部传入的状态（可选，如果不传则自动计算） */
  status?: StageStatus
}>(), {
  status: undefined
})

const seasonStore = useSeasonStore()

// 计算当前页面状态
const pageStatus = computed<StageStatus>(() => {
  if (props.status !== undefined) {
    return props.status
  }
  return seasonStore.getStageStatus(props.round, props.stage)
})

// 使用计算属性
const status = computed(() => pageStatus.value)

// 当前轮次名称
const currentRoundName = computed(() => {
  if (props.round === 1) return '一公'
  if (props.round === 2) return '二公'
  if (props.round === 3) return '三公'
  if (props.round === 4) return '四公'
  return `第${props.round}公`
})

// 当前阶段名称
const currentStageName = computed(() => {
  return STAGE_NAMES[props.stage] || props.stage
})
</script>

<style lang="scss" scoped>
.stage-status-wrapper {
  min-height: 100%;
}

// 未开始状态
.stage-future {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  text-align: center;
  padding: 40px;

  .future-icon {
    font-size: 64px;
    margin-bottom: 24px;
    opacity: 0.5;
  }

  .future-title {
    font-size: 24px;
    color: #6b7280;
    margin: 0 0 12px;
  }

  .future-desc {
    color: #9ca3af;
    font-size: 14px;
    margin: 0 0 24px;
  }

  .future-status {
    display: flex;
    align-items: center;
    gap: 8px;

    .status-label {
      color: #6b7280;
    }
  }
}

// 已完成状态
.stage-completed {
  .completed-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 20px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);

    .completed-label {
      color: #9ca3af;
      font-size: 13px;
    }
  }
}

// 当前状态
.stage-current {
  .current-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 20px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(0, 82, 217, 0.3);

    .current-label {
      color: #0052d9;
      font-size: 13px;
    }
  }
}
</style>