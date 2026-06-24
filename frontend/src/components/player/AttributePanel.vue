<template>
  <div class="attribute-panel">
    <h3 class="panel-title">属性面板</h3>
    <div class="attributes">
      <div class="attr-item vocal">
        <div class="attr-icon">🎤</div>
        <div class="attr-info">
          <span class="attr-label">Vocal</span>
          <span class="attr-num">{{ vocal }}</span>
        </div>
        <div class="attr-bar-wrapper">
          <div class="attr-bar" :style="{ width: `${vocal}%` }"></div>
        </div>
      </div>
      
      <div class="attr-item dance">
        <div class="attr-icon">💃</div>
        <div class="attr-info">
          <span class="attr-label">Dance</span>
          <span class="attr-num">{{ dance }}</span>
        </div>
        <div class="attr-bar-wrapper">
          <div class="attr-bar" :style="{ width: `${dance}%` }"></div>
        </div>
      </div>
      
      <div class="attr-item charm">
        <div class="attr-icon">✨</div>
        <div class="attr-info">
          <span class="attr-label">Charm</span>
          <span class="attr-num">{{ charm }}</span>
        </div>
        <div class="attr-bar-wrapper">
          <div class="attr-bar" :style="{ width: `${charm}%` }"></div>
        </div>
      </div>
    </div>
    
    <div class="attr-summary">
      <div class="summary-item">
        <span class="summary-label">属性总和</span>
        <span class="summary-value">{{ total }}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">最高属性</span>
        <span class="summary-value">{{ highestAttr }}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">最低属性</span>
        <span class="summary-value">{{ lowestAttr }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  vocal: number
  dance: number
  charm: number
}>()

const total = computed(() => props.vocal + props.dance + props.charm)

const highestAttr = computed(() => {
  const max = Math.max(props.vocal, props.dance, props.charm)
  if (max === props.vocal) return `Vocal ${max}`
  if (max === props.dance) return `Dance ${max}`
  return `Charm ${max}`
})

const lowestAttr = computed(() => {
  const min = Math.min(props.vocal, props.dance, props.charm)
  if (min === props.vocal) return `Vocal ${min}`
  if (min === props.dance) return `Dance ${min}`
  return `Charm ${min}`
})
</script>

<style lang="scss" scoped>
.attribute-panel {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 24px;
  backdrop-filter: blur(10px);
}

.panel-title {
  color: #fff;
  margin: 0 0 20px 0;
  font-size: 18px;
  font-weight: 600;
}

.attributes {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.attr-item {
  display: flex;
  align-items: center;
  gap: 12px;
  
  &.vocal .attr-bar {
    background: linear-gradient(90deg, #ff6b6b, #ee5a24);
  }
  
  &.dance .attr-bar {
    background: linear-gradient(90deg, #4ecdc4, #44a08d);
  }
  
  &.charm .attr-bar {
    background: linear-gradient(90deg, #a29bfe, #6c5ce7);
  }
}

.attr-icon {
  font-size: 24px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}

.attr-info {
  display: flex;
  justify-content: space-between;
  width: 100px;
}

.attr-label {
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
}

.attr-num {
  color: #fff;
  font-weight: 600;
  font-size: 16px;
}

.attr-bar-wrapper {
  flex: 1;
  height: 8px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  overflow: hidden;
}

.attr-bar {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
}

.attr-summary {
  display: flex;
  justify-content: space-around;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.summary-item {
  text-align: center;
}

.summary-label {
  display: block;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  margin-bottom: 4px;
}

.summary-value {
  color: #fff;
  font-weight: 600;
  font-size: 16px;
}
</style>