<template>
  <Teleport to="body">
    <Transition name="mgs-fade">
      <div v-if="open" class="mgs-overlay" @click.self="close">
        <div class="mgs-modal">
          <div class="mgs-header">
            <div class="mgs-header-left">
              <span class="mgs-header-icon">🎮</span>
              <h3>{{ title }}</h3>
            </div>
            <button class="mgs-close" @click="close" aria-label="关闭">✕</button>
          </div>
          <div class="mgs-body">
            <MinigameSelector :selectedId="null" :showTitle="false" @select="onSelect" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import MinigameSelector from './MinigameSelector.vue'

const props = withDefaults(defineProps<{ open: boolean; title?: string }>(), {
  title: '选择小游戏'
})
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'select', id: string): void
}>()

function close() {
  emit('update:open', false)
}

function onSelect(id: string) {
  emit('select', id)
  close()
}
</script>

<style scoped>
.mgs-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(4, 6, 20, 0.72);
  backdrop-filter: blur(6px);
}

.mgs-modal {
  width: min(1040px, 94vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(165deg, #17173a 0%, #0d0d24 100%);
  border: 1px solid #00ff8833;
  border-radius: 18px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.65), 0 0 50px rgba(0, 255, 136, 0.06);
  overflow: hidden;
  animation: mgs-pop 0.22s cubic-bezier(0.34, 1.4, 0.64, 1);
}

@keyframes mgs-pop {
  from { opacity: 0; transform: translateY(14px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.mgs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 28px;
  border-bottom: 1px solid #ffffff12;
  background: linear-gradient(180deg, #1c1c44 0%, transparent 100%);
  flex-shrink: 0;
}

.mgs-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mgs-header-icon {
  font-size: 22px;
  line-height: 1;
}

.mgs-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #eaeaff;
  letter-spacing: 0.3px;
}

.mgs-close {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 1px solid #ffffff14;
  background: #ffffff08;
  color: #9a9ab5;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.mgs-close:hover {
  background: #ff44441f;
  border-color: #ff444455;
  color: #ff6b6b;
}

.mgs-body {
  padding: 24px 28px 30px;
  overflow-y: auto;
  flex: 1;
}

.mgs-body::-webkit-scrollbar {
  width: 8px;
}
.mgs-body::-webkit-scrollbar-track {
  background: transparent;
}
.mgs-body::-webkit-scrollbar-thumb {
  background: #00ff8833;
  border-radius: 4px;
}
.mgs-body::-webkit-scrollbar-thumb:hover {
  background: #00ff8855;
}

.mgs-fade-enter-active,
.mgs-fade-leave-active {
  transition: opacity 0.18s ease;
}
.mgs-fade-enter-from,
.mgs-fade-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  .mgs-overlay { padding: 0; }
  .mgs-modal {
    width: 100vw;
    max-height: 100vh;
    height: 100vh;
    border-radius: 0;
    border: none;
  }
  .mgs-header { padding: 16px 18px; }
  .mgs-body { padding: 18px; }
}
</style>
