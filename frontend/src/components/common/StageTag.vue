<template>
  <span class="stage-tag" :class="stageClass">
    {{ stageName }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { StageType } from '../../types/season'
import { STAGE_MAP } from '../../types/season'

const props = defineProps<{
  stage: StageType
}>()

const stageName = computed(() => STAGE_MAP[props.stage])

const stageClass = computed(() => props.stage)
</script>

<style lang="scss" scoped>
.stage-tag {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  
  &.login {
    background: #95a5a6;
    color: #fff;
  }
  
  &.initial_luck {
    background: #9b59b6;
    color: #fff;
  }
  
  &.captain {
    background: #3498db;
    color: #fff;
  }
  
  &.team {
    background: #4ecdc4;
    color: #fff;
  }
  
  &.song {
    background: #a29bfe;
    color: #fff;
  }
  
  &.training {
    background: linear-gradient(135deg, #ff6b6b, #ee5a24);
    color: #fff;
  }
  
  &.rehearsal {
    background: #fdcb6e;
    color: #2c3e50;
  }
  
  &.performance {
    background: linear-gradient(135deg, #f39c12, #e74c3c);
    color: #fff;
  }
  
  &.elimination {
    background: #e74c3c;
    color: #fff;
  }
  
  &.review {
    background: #27ae60;
    color: #fff;
  }
}
</style>