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
                <div v-if="uploadingImage" class="opt-loading">图片上传中…</div>
                <div v-else-if="options.imageUrl" class="opt-preview">
                  <img :src="previewUrl" alt="拼图预览" />
                  <BBUploadBox accept="image/*" icon="🖼️" label="重新上传" @file="onImageFile" />
                </div>
                <BBUploadBox v-else accept="image/*" icon="🖼️" label="点击或拖拽上传 1:1 图片" hint="支持 JPG / PNG" @file="onImageFile" />
                <p v-if="uploadError" class="opt-error">{{ uploadError }}</p>
              </template>

              <!-- 描述猜谜：M / N / K 配置 + 自定义题目模板 -->
              <template v-if="pendingGame.id === 'describe-guess'">
                <p class="opt-hint">每题呈 M 条描述，每条间隔 K 秒放出；选手任意时刻可作答（每题 1 次）。第 1 条后答对得 M+1 分，之后每多一条 -1 分。共 N 题，总分高者胜。</p>
                <div class="opt-row">
                  <label class="opt-label">每题描述数 M
                    <input v-model.number="options.clueCount" type="number" min="1" max="10" class="opt-number" />
                  </label>
                  <label class="opt-label">题目数 N
                    <input v-model.number="options.questionCount" type="number" min="1" max="30" class="opt-number" />
                  </label>
                  <label class="opt-label">放送间隔 K（秒）
                    <input v-model.number="options.interval" type="number" min="3" max="120" class="opt-number" />
                  </label>
                </div>
                <label class="opt-label">题目模板（每行一道题：答案|描述1|描述2|…）
                  <textarea v-model="options.questionsText" class="opt-textarea" rows="6"
                    placeholder="示例：&#10;太阳|它是一颗恒星|它从东方升起&#10;熊猫|它是中国国宝|它爱吃竹子"></textarea>
                </label>
                <p class="opt-hint">题目内容完全自定义；未填写时使用占位模板。</p>
              </template>

              <!-- Stay or Fold：时长 / 分值 / 散点数量 / 正确答案 -->
              <template v-if="pendingGame.id === 'stay-or-fold'">
                <p class="opt-hint">展示 emoji 散点图 → 估算目标数量 → 公布各自估算 → 决定 Stay/Fold → 公布正确数量并结算。每轮 Stay 中最接近者 +1 分，最远者淘汰；先到目标分者胜。</p>
                <div class="opt-row">
                  <label class="opt-label">展示时长(秒)
                    <input v-model.number="options.showDuration" type="number" min="3" max="60" class="opt-number" />
                  </label>
                  <label class="opt-label">估算时长(秒)
                    <input v-model.number="options.answerWindow" type="number" min="5" max="120" class="opt-number" />
                  </label>
                  <label class="opt-label">决策时长(秒)
                    <input v-model.number="options.decisionWindow" type="number" min="5" max="120" class="opt-number" />
                  </label>
                  <label class="opt-label">目标分
                    <input v-model.number="options.targetPoints" type="number" min="1" max="10" class="opt-number" />
                  </label>
                  <label class="opt-label">散点数量
                    <input v-model.number="options.gridSize" type="number" min="100" max="1600" class="opt-number" />
                  </label>
                </div>
                <label class="opt-label">每轮正确答案（目标 emoji 个数，按行或逗号分隔；留空则随机）
                  <textarea v-model="options.correctCountsText" class="opt-textarea" rows="3"
                    placeholder="例如：&#10;7&#10;5&#10;9"></textarea>
                </label>
              </template>

              <!-- 限时设置：所有游戏通用，可选无限时 -->
              <div class="opt-block">
                <label class="opt-check">
                  <input type="checkbox" v-model="options.noTimeLimit" />
                  <span>无限时</span>
                </label>
                <label v-if="!options.noTimeLimit" class="opt-label">限时（秒）
                  <input v-model.number="options.timeLimit" type="number" min="5" max="7200" class="opt-number" />
                </label>
                <p class="opt-hint">未勾选无限时时，到达限时后自动结算。</p>
              </div>

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
import BBUploadBox from '../BBUploadBox.vue'
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
  if (game) {
    pendingGame.value = game
    options.imageUrl = ''
    options.timeLimit = (game as any).duration || 120
    options.noTimeLimit = false
    options.clueCount = 5
    options.questionCount = 7
    options.interval = 15
    options.showDuration = 8
    options.answerWindow = 25
    options.decisionWindow = 15
    options.targetPoints = 3
    options.gridSize = 400
    uploadError.value = ''
    return
  }
  emit('select', id)
  close()
}

async function onImageFile(file: File) {
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
  const payload: Record<string, any> = { ...options }
  if (payload.noTimeLimit) payload.timeLimit = 0
  delete payload.noTimeLimit
  if (pendingGame.value.id === 'describe-guess') {
    const qs = parseQuestions(payload.questionsText)
    if (qs.length) payload.questions = qs
    delete payload.questionsText
  }
  if (pendingGame.value.id === 'stay-or-fold') {
    const counts = parseCounts(payload.correctCountsText)
    if (counts.length) payload.correctCounts = counts
    delete payload.correctCountsText
  }
  emit('select', pendingGame.value.id, payload)
  pendingGame.value = null
  close()
}

// 解析题目模板：每行“答案|描述1|描述2…”
function parseQuestions(text: string): { answer: string; clues: string[] }[] {
  if (!text) return []
  return String(text).split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const parts = line.split(/[|｜]/).map(s => s.trim())
    const answer = parts.shift() || ''
    return { answer, clues: parts.filter(Boolean) }
  }).filter(q => q.answer && q.clues.length)
}

function parseCounts(text: string): number[] {
  if (!text) return []
  return String(text).split(/[\s,，、]+/).map(s => parseInt(s, 10)).filter(n => Number.isFinite(n) && n >= 0)
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
.opt-block { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; background: #ffffff08; border: 1px solid #00ff8833; border-radius: 10px; }
.opt-check { display: flex; align-items: center; gap: 8px; font-size: 14px; color: #ddd; cursor: pointer; user-select: none; }
.opt-check input { width: 16px; height: 16px; accent-color: #00ff88; }
.opt-subtitle { font-size: 13px; color: #bbb; font-weight: 600; }
.opt-media-preview { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: #0a1a10; border: 1px solid #00ff8844; border-radius: 8px; padding: 8px 12px; font-size: 13px; color: #cfe3ff; word-break: break-all; }
.opt-radio-row { display: flex; gap: 18px; flex-wrap: wrap; }
.opt-row { display: flex; flex-wrap: wrap; gap: 16px; }
.opt-number { width: 140px; padding: 8px 12px; background: #0a1a10; border: 1px solid #00ff8844; border-radius: 6px; color: #e0e0e0; }
.opt-textarea { width: 100%; padding: 8px 12px; background: #0a1a10; border: 1px solid #00ff8844; border-radius: 6px; color: #e0e0e0; font-family: inherit; font-size: 13px; resize: vertical; box-sizing: border-box; }
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
