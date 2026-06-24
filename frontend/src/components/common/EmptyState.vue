<template>
  <div class="empty-state">
    <div class="empty-icon">{{ icon }}</div>
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <button v-if="buttonText" class="empty-btn" @click="$emit('action')">
      {{ buttonText }}
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  icon: string
  title: string
  description: string
  buttonText?: string
}>()

defineEmits<{
  (e: 'action'): void
}>()
</script>

<style lang="scss" scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 20px;
  opacity: 0.5;
}

.empty-state h3 {
  color: rgba(255, 255, 255, 0.8);
  margin: 0 0 12px 0;
  font-size: 18px;
}

.empty-state p {
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
  font-size: 14px;
}

.empty-btn {
  margin-top: 24px;
  padding: 10px 24px;
  background: linear-gradient(135deg, #a29bfe, #6c5ce7);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 15px rgba(108, 92, 231, 0.4);
  }
}
</style>