<template>
  <div class="attribute-bar">
    <div class="bar-header">
      <span class="attr-name">{{ name }}</span>
      <span class="attr-value">{{ value }}</span>
    </div>
    <div class="bar-track">
      <div 
        class="bar-fill" 
        :class="colorClass"
        :style="{ width: `${Math.min(value, 100)}%` }"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  name: string
  value: number
  type?: 'vocal' | 'dance' | 'charm'
}>()

const colorClass = computed(() => {
  switch (props.type) {
    case 'vocal': return 'vocal'
    case 'dance': return 'dance'
    case 'charm': return 'charm'
    default: return 'vocal'
  }
})
</script>

<style lang="scss" scoped>
.attribute-bar {
  margin-bottom: 12px;
}

.bar-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}

.attr-name {
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
}

.attr-value {
  color: #fff;
  font-weight: 600;
  font-size: 14px;
}

.bar-track {
  height: 8px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
  
  &.vocal {
    background: linear-gradient(90deg, #ff6b6b, #ee5a24);
  }
  
  &.dance {
    background: linear-gradient(90deg, #4ecdc4, #44a08d);
  }
  
  &.charm {
    background: linear-gradient(90deg, #a29bfe, #6c5ce7);
  }
}
</style>