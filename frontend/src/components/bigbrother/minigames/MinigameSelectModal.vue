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
            <template v-if="!pendingGame">
              <MinigameSelector :selectedId="null" :showTitle="false" @select="onSelect" />
            </template>
            <div v-else class="mgs-options">
              <div class="opt-title">
                {{ pendingGame.icon }} {{ pendingGame.name }} · 配置
              </div>

              <!-- 拼图：上传 1:1 图片 -->
              <template v-if="pendingGame.id === 'jigsaw'">
                <p class="opt-hint">上传一张 1:1（正方形）的图片，系统会切成 5×5 共 25 片。建议图片清晰、方形。</p>
                <input ref="fileInput" type="file" accept="image/*" class="opt-file" @change="onImageChange" />
                <div v-if="uploadingImage" class="opt-loading">图片上传中…</div>
                <div v-else-if="options.imageUrl" class="opt-preview">
                  <img :src="previewUrl" alt="拼图预览" />
                  <button class="opt-reupload" @click="triggerFile">重新上传</button>
                </div>
                <p v-if="uploadError" class="opt-error">{{ uploadError }}</p>
              </template>

              <!-- 找出遗失的数字：限时 -->
              <template v-else-if="pendingGame.id === 'missing-number'">
                <p class="opt-hint">设置比赛限时（秒）。限时内无人答对时，提交数字最接近者获胜。</p>
                <label class="opt-label">限时（秒）
                  <input v-model.number="options.timeLimit" type="number" min="10" max="3600" class="opt-number" />
                </label>
              </template>

              <div class="opt-actions">
                <button class="opt-btn" @click="pendingGame = null">返回</button>
                <button class="opt-btn opt-primary" :disabled="!canConfirm" @click="confirmOptions">确定并创建</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import MinigameSelector from './MinigameSelector.vue'
import { bbUploadGameImage } from '../../../services/bbApi'
import type { MinigameDef } from '../../../types/bigbrother'

withDefaults(defineProps<{ open: boolean; title?: string }>(), {
  title: '选择小游戏'
})
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'select', id: string, options?: Record<string, any>): void
}>()

const pendingGame = ref<MinigameDef | null>(null)
const options = reactive<Record<string, any>>({})
const fileInput = ref<HTMLInputElement | null>(null)
const uploadingImage = ref(false)
const uploadError = ref('')

const previewUrl = computed(() => {
  const u = options.imageUrl as string
  if (!u) return ''
  if (/^https?:\/\//.test(u)) return u
  const base = ((import.meta as any).env?.VITE_API_BASE || '').replace(/\/$/, '') || '/api'
  const root = base.replace(/\/api$/, '')
  return `${root}${u.startsWith('/') ? '' : '/'}${u}`
})

const canConfirm = computed(() => {
  if (!pendingGame.value) return false
  if (pendingGame.value.id === 'jigsaw') return !uploadingImage.value && !!options.imageUrl
  return true
})

function close() {
  emit('update:open', false)
}

function onSelect(id: string, game?: MinigameDef) {
  if (game && (id === 'jigsaw' || id === 'missing-number')) {
    pendingGame.value = game
    options.imageUrl = ''
    options.timeLimit = 120
    uploadError.value = ''
    return
  }
  emit('select', id)
  close()
}

function triggerFile() {
  fileInput.value?.click()
}

async function onImageChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files && input.files[0]
  if (!file) return
  uploadingImage.value = true
  uploadError.value = ''
  try {
    const res = await bbUploadGameImage(file)
    options.imageUrl = res.url
  } catch (err: any) {
    uploadError.value = err?.message || '上传失败'
  } finally {
    uploadingImage.value = false
  }
}

function confirmOptions() {
  if (!pendingGame.value || !canConfirm.value) return
  emit('select', pendingGame.value.id, { ...options })
  pendingGame.value = null
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

.mgs-options { display: flex; flex-direction: column; gap: 14px; max-width: 560px; margin: 0 auto; }
.opt-title { font-size: 16px; font-weight: 700; color: #eaeaff; }
.opt-hint { font-size: 13px; color: #8a8aa5; line-height: 1.6; margin: 0; }
.opt-file { color: #bdbdd8; font-size: 13px; }
.opt-loading { color: #00ff88; font-size: 13px; }
.opt-error { color: #ff6b6b; font-size: 13px; margin: 0; }
.opt-preview { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.opt-preview img { width: 220px; height: 220px; object-fit: cover; border-radius: 10px; border: 1px solid #00ff8855; }
.opt-reupload { background: transparent; border: 1px solid #00ff8844; color: #00ff88; padding: 6px 14px; border-radius: 6px; cursor: pointer; }
.opt-label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #bbb; }
.opt-number { width: 140px; padding: 8px 12px; background: #0a1a10; border: 1px solid #00ff8844; border-radius: 6px; color: #e0e0e0; }
.opt-actions { display: flex; gap: 12px; margin-top: 8px; }
.opt-btn { background: transparent; border: 1px solid #00ff8844; color: #00ff88; padding: 8px 20px; border-radius: 6px; cursor: pointer; }
.opt-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.opt-primary { border-color: #00ff88; background: #00ff8822; }

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
