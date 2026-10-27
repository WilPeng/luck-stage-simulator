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

              <!-- 抓小三：选点时长 / 每回合时长 -->
              <template v-if="pendingGame.id === 'catch-mistress'">
                <p class="opt-hint">40 个藏身地点，每位选手秘密选择 1 个；随机顺序逐一揭开，被揭中者淘汰，躲到最后的人获胜。若多人选择同一地点且它是最后唯一未揭开的地点，则最先揭开该地点的选手获胜。</p>
                <div class="opt-row">
                  <label class="opt-label">选点时长(秒)
                    <input v-model.number="options.hideTime" type="number" min="5" max="120" class="opt-number" />
                  </label>
                  <label class="opt-label">每次揭开限时(秒)
                    <input v-model.number="options.turnTime" type="number" min="5" max="120" class="opt-number" />
                  </label>
                </div>
              </template>

              <!-- 少数决：自定义题库（每轮一道题 + 两个选项） -->
              <template v-if="pendingGame.id === 'minority'">
                <p class="opt-hint">每轮限时 15 秒，选手在两道选项中选择一个；多数方与未作答者出局，存活到最后者胜。以下题库按顺序作为每一轮的题目；留空则使用内置题库。</p>
                <div class="opt-questions">
                  <div v-for="(q, i) in options.questions" :key="i" class="opt-question-row">
                    <div class="opt-question-head">
                      <span class="opt-question-no">第 {{ i + 1 }} 轮</span>
                      <button class="opt-remove" type="button" @click="removeMinorityQuestion(i)">删除</button>
                    </div>
                    <input v-model="q.text" class="opt-input" placeholder="问题，如：你更喜欢猫还是狗？" />
                    <div class="opt-question-options">
                      <input v-model="q.optionA" class="opt-input" placeholder="选项 A，如：猫" />
                      <input v-model="q.optionB" class="opt-input" placeholder="选项 B，如：狗" />
                    </div>
                  </div>
                  <button class="opt-add" type="button" @click="addMinorityQuestion">+ 添加一轮题目</button>
                </div>
              </template>

              <!-- 德国心脏病：目标分 / 每轮牌数 / 节奏 -->
              <template v-if="pendingGame.id === 'german-heart'">
                <p class="opt-hint">每轮桌面翻出一组水果牌。恰好出现 5 个相同水果时，最快抢铃者 +1 分；没有 5 个相同水果时抢铃，每次 -3 分（每人每轮仅可抢一次）。先到目标分者胜；或只剩一人得分为正数时获胜。</p>
                <div class="opt-row">
                  <label class="opt-label">目标分
                    <input v-model.number="options.targetPoints" type="number" min="1" max="20" class="opt-number" />
                  </label>
                  <label class="opt-label">每轮限时(秒)
                    <input v-model.number="options.roundTime" type="number" min="2" max="20" class="opt-number" />
                  </label>
                  <label class="opt-label">结算展示(秒)
                    <input v-model.number="options.revealTime" type="number" min="1" max="10" class="opt-number" />
                  </label>
                  <label class="opt-label">每轮牌数
                    <input v-model.number="options.cardCount" type="number" min="8" max="20" class="opt-number" />
                  </label>
                </div>
              </template>

              <!-- 数字占卜术：轮数 / 每轮时长 / 结算展示 -->
              <template v-if="pendingGame.id === 'number-divination'">
                <p class="opt-hint">每人持有数字 1–10，每轮同时打出 1 个未使用过的数字。未重复的数字获得该数字分数，其中最大的数字双倍；重复数字中重复次数最多者，其所有玩家扣除该数字分数。共 N 轮，最终最高分且不并列者获胜。</p>
                <div class="opt-row">
                  <label class="opt-label">轮数
                    <input v-model.number="options.roundCount" type="number" min="1" max="10" class="opt-number" />
                  </label>
                  <label class="opt-label">每轮限时(秒)
                    <input v-model.number="options.roundTime" type="number" min="5" max="120" class="opt-number" />
                  </label>
                  <label class="opt-label">结算展示(秒)
                    <input v-model.number="options.revealTime" type="number" min="2" max="30" class="opt-number" />
                  </label>
                </div>
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
    options.targetPoints = game.id === 'german-heart' ? 5 : 3
    options.roundTime = 5
    options.revealTime = 2
    options.cardCount = 10
    options.gridSize = 400
    options.hideTime = 30
    options.turnTime = 20
    options.questions = [{ text: '', optionA: '', optionB: '' }]
    if (game.id === 'number-divination') {
      options.roundCount = 10
      options.roundTime = 15
      options.revealTime = 5
    }
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
  if (pendingGame.value.id === 'minority') {
    const qs = parseMinorityQuestions(payload.questions)
    if (qs.length) payload.questions = qs
    else delete payload.questions
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

function addMinorityQuestion() {
  if (!Array.isArray(options.questions)) options.questions = []
  options.questions.push({ text: '', optionA: '', optionB: '' })
}

function removeMinorityQuestion(index: number) {
  if (!Array.isArray(options.questions)) return
  options.questions.splice(index, 1)
}

// 解析少数决题库：过滤掉问题或任一选项为空的行
function parseMinorityQuestions(raw: any): { text: string; options: [string, string] }[] {
  if (!Array.isArray(raw)) return []
  return raw.map(q => {
    const text = String(q?.text || '').trim()
    const a = String(q?.optionA || '').trim()
    const b = String(q?.optionB || '').trim()
    if (!text || !a || !b) return null
    return { text, options: [a, b] as [string, string] }
  }).filter(Boolean) as { text: string; options: [string, string] }[]
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
  border: 1px solid #b39bff33;
  border-radius: 18px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.65), 0 0 50px rgba(179, 155, 255, 0.06);
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
  background: #b39bff33;
  border-radius: 4px;
}
.mgs-body::-webkit-scrollbar-thumb:hover {
  background: #b39bff55;
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
.opt-hint { font-size: 13px; color: #b3a6d6; line-height: 1.6; margin: 0; }
.opt-file { color: #cfc4ea; font-size: 13px; }
.opt-loading { color: #b39bff; font-size: 13px; }
.opt-error { color: #ff6b6b; font-size: 13px; margin: 0; }
.opt-preview { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.opt-preview img { width: 220px; height: 220px; object-fit: cover; border-radius: 10px; border: 1px solid #b39bff55; }
.opt-reupload { background: transparent; border: 1px solid #b39bff44; color: #b39bff; padding: 6px 14px; border-radius: 6px; cursor: pointer; }
.opt-label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #bdb3dd; }
.opt-block { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; background: #ffffff08; border: 1px solid #b39bff33; border-radius: 10px; }
.opt-check { display: flex; align-items: center; gap: 8px; font-size: 14px; color: #ddd; cursor: pointer; user-select: none; }
.opt-check input { width: 16px; height: 16px; accent-color: #b39bff; }
.opt-subtitle { font-size: 13px; color: #bdb3dd; font-weight: 600; }
.opt-media-preview { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: #17112a; border: 1px solid #b39bff44; border-radius: 8px; padding: 8px 12px; font-size: 13px; color: #e0d7ff; word-break: break-all; }
.opt-radio-row { display: flex; gap: 18px; flex-wrap: wrap; }
.opt-row { display: flex; flex-wrap: wrap; gap: 16px; }
.opt-number { width: 140px; padding: 8px 12px; background: #17112a; border: 1px solid #b39bff44; border-radius: 6px; color: #ece7fb; }
.opt-textarea { width: 100%; padding: 8px 12px; background: #17112a; border: 1px solid #b39bff44; border-radius: 6px; color: #ece7fb; font-family: inherit; font-size: 13px; resize: vertical; box-sizing: border-box; }
.opt-questions { display: flex; flex-direction: column; gap: 10px; max-height: 320px; overflow-y: auto; padding-right: 4px; }
.opt-question-row { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; background: #ffffff06; border: 1px solid #b39bff22; border-radius: 8px; }
.opt-question-head { display: flex; align-items: center; justify-content: space-between; }
.opt-question-no { font-size: 12px; color: #b39bff; font-weight: 600; }
.opt-question-options { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.opt-input { width: 100%; padding: 8px 12px; background: #17112a; border: 1px solid #b39bff44; border-radius: 6px; color: #ece7fb; font-family: inherit; font-size: 13px; box-sizing: border-box; }
.opt-input:focus { outline: none; border-color: #b39bff; }
.opt-remove { background: transparent; border: none; color: #ff6b6b; font-size: 12px; cursor: pointer; padding: 2px 6px; }
.opt-remove:hover { text-decoration: underline; }
.opt-add { align-self: flex-start; background: transparent; border: 1px dashed #b39bff66; color: #b39bff; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.opt-add:hover { background: #b39bff11; }
.opt-actions { display: flex; gap: 12px; margin-top: 8px; }
.opt-btn { background: transparent; border: 1px solid #b39bff44; color: #b39bff; padding: 8px 20px; border-radius: 6px; cursor: pointer; }
.opt-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.opt-primary { border-color: #b39bff; background: #b39bff22; }

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
