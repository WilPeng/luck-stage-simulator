<template>
  <div class="editor-overlay" @click.self="$emit('close')">
    <div class="editor-panel">
      <div class="editor-header">
        <h2>{{ isEdit ? '编辑自定义游戏' : '新建自定义游戏' }}</h2>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="editor-body">
        <!-- 基本信息 -->
        <div class="form-section">
          <h3>基本信息</h3>
          <div class="form-row">
            <label>图标</label>
            <div class="icon-picker">
              <button v-for="e in emojiOptions" :key="e" class="emoji-btn" :class="{ active: form.icon === e }" @click="form.icon = e">{{ e }}</button>
            </div>
          </div>
          <div class="form-row">
            <label>游戏名称 *</label>
            <input v-model="form.name" class="bb-input" placeholder="如：成语接龙" maxlength="30" />
          </div>
          <div class="form-row">
            <label>描述</label>
            <textarea v-model="form.description" class="bb-input" rows="2" placeholder="简要描述游戏规则" maxlength="200"></textarea>
          </div>
          <div class="form-row-inline">
            <div class="form-row">
              <label>游戏类型 *</label>
              <select v-model="form.type" class="bb-input" @change="onTypeChange">
                <option value="quiz">答对赛制</option>
                <option value="score">积分赛制</option>
              </select>
            </div>
            <div class="form-row">
              <label>最少人数</label>
              <input v-model.number="form.playerCount.min" type="number" class="bb-input" min="2" max="20" />
            </div>
            <div class="form-row">
              <label>最多人数</label>
              <input v-model.number="form.playerCount.max" type="number" class="bb-input" min="2" max="20" />
            </div>
          </div>
        </div>

        <!-- 规则设置 -->
        <div class="form-section">
          <h3>规则设置</h3>

          <div class="form-row-inline">
            <div class="form-row">
              <label>提交方式</label>
              <select v-model="form.submitMode" class="bb-input">
                <option value="single">单题提交（逐题作答）</option>
                <option value="batch">全部一起提交</option>
              </select>
            </div>
            <div class="form-row">
              <label>提交次数上限（0=无限）</label>
              <input v-model.number="form.maxAttempts" type="number" class="bb-input" min="0" max="999" />
            </div>
            <div class="form-row">
              <label>提交间隔（秒）</label>
              <input v-model.number="form.cooldownSeconds" type="number" class="bb-input" min="0" max="600" />
            </div>
          </div>

          <div class="form-row-inline">
            <div class="form-row">
              <label>答错反馈</label>
              <select v-model="form.wrongFeedback" class="bb-input">
                <option value="none">不告知</option>
                <option value="count">告知答对数量（不告知具体）</option>
                <option value="reveal">告知正确答案</option>
                <option value="all_correct_only">仅全部答对时告知</option>
              </select>
            </div>
            <div class="form-row">
              <label>答错是否锁定该题</label>
              <select v-model="form.lockOnWrong" class="bb-input">
                <option :value="false">不锁定（可重答）</option>
                <option :value="true">锁定（该题不可再答）</option>
              </select>
            </div>
          </div>

          <template v-if="form.type === 'quiz'">
            <div class="form-row-inline">
              <div class="form-row">
                <label>胜利条件</label>
                <select v-model="form.winCondition" class="bb-input">
                  <option value="all_correct">全部答对（先全部答对者胜）</option>
                  <option value="target_correct">答对指定数量即可</option>
                  <option value="admin_judge">无正确答案（管理员评判）</option>
                  <option value="first_correct">首个答对即胜</option>
                  <option value="most_correct">答对最多者胜</option>
                </select>
              </div>
              <div class="form-row" v-if="form.winCondition === 'target_correct'">
                <label>需答对题数</label>
                <input v-model.number="form.targetCorrect" type="number" class="bb-input" min="1" :max="form.questions.length || 99" />
              </div>
            </div>
            <p v-if="form.winCondition === 'admin_judge'" class="hint-line">管理员评判模式：选手提交后不自动判定，由管理员查看提交并手动选定胜者（题目可不填正确答案）。</p>
          </template>

          <template v-else>
            <div class="form-row-inline">
              <div class="form-row">
                <label>时间限制（秒）</label>
                <input v-model.number="form.timeLimit" type="number" class="bb-input" min="10" max="3600" />
              </div>
              <div class="form-row">
                <label>胜利条件</label>
                <select v-model="form.winCondition" class="bb-input">
                  <option value="highest_score">最高分胜</option>
                  <option value="most_correct">答对最多者胜</option>
                </select>
              </div>
              <div class="form-row">
                <label>计分规则</label>
                <select v-model="form.scoringRule" class="bb-input">
                  <option value="correct_only">仅按答对计分</option>
                  <option value="timed_bonus">答对 + 时间加成</option>
                </select>
              </div>
            </div>
          </template>
        </div>

        <!-- 题目管理 -->
        <div class="form-section">
          <div class="section-header">
            <h3>题目设置 ({{ form.questions.length }}题)</h3>
            <button class="bb-btn-xs btn-add" @click="addQuestion">+ 添加题目</button>
          </div>
          <div v-if="form.questions.length === 0" class="empty-hint">请至少添加一道题目</div>
          <div v-for="(q, qi) in form.questions" :key="q.id" class="question-card">
            <div class="question-header">
              <span class="q-num">Q{{ qi + 1 }}</span>
              <div class="q-actions">
                <button v-if="qi > 0" class="q-btn" @click="moveQuestion(qi, -1)">↑</button>
                <button v-if="qi < form.questions.length - 1" class="q-btn" @click="moveQuestion(qi, 1)">↓</button>
                <button class="q-btn q-btn-del" @click="removeQuestion(qi)">✕</button>
              </div>
            </div>
            <div class="form-row">
              <label>题目文本 *</label>
              <input v-model="q.text" class="bb-input" placeholder="输入题目" />
            </div>
            <div class="form-row">
              <label>选项（每行一个，留空则为开放回答）</label>
              <textarea v-model="q.optionsText" class="bb-input" rows="2" placeholder="选项A&#10;选项B&#10;选项C&#10;选项D" @blur="parseOptions(q)"></textarea>
            </div>
            <div class="form-row-inline">
              <div class="form-row">
                <label>正确答案 {{ isAdminJudge ? '（可留空）' : '*' }}</label>
                <input v-model="q.correctAnswer" class="bb-input" :placeholder="isAdminJudge ? '可留空' : '正确答案'" />
              </div>
              <div class="form-row" style="max-width: 100px;">
                <label>分值</label>
                <input v-model.number="q.points" type="number" class="bb-input" min="1" max="100" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="editor-footer">
        <button class="bb-btn" @click="$emit('close')">取消</button>
        <button class="bb-btn bb-btn-primary" :disabled="!isValid || saving" @click="save">
          {{ saving ? '保存中...' : (isEdit ? '保存修改' : '创建游戏') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { bbCreateCustomGame, bbUpdateCustomGame } from '../../../services/bbApi'
import type { BBCustomGameDef, CustomGameQuestion } from '../../../types/bigbrother'

const props = defineProps<{ game: BBCustomGameDef | null }>()
const emit = defineEmits<{ save: []; close: [] }>()

const isEdit = computed(() => !!props.game?.id)
const saving = ref(false)

const emojiOptions = ['🎮', '🧩', '🎯', '🧠', '⚡', '🎲', '🃏', '🏆', '📚', '🔢', '🔠', '🎪', '🎭', '🎵', '🏃', '💪']

interface QuestionForm extends CustomGameQuestion {
  optionsText: string
}

function createBlankQuestion(idx: number): QuestionForm {
  return {
    id: `q-${Date.now()}-${idx}`,
    text: '',
    options: [],
    optionsText: '',
    correctAnswer: '',
    points: 1
  }
}

const form = reactive({
  name: '',
  description: '',
  icon: '🎮',
  type: 'quiz' as 'quiz' | 'score',
  questions: [] as QuestionForm[],
  submitMode: 'single' as 'single' | 'batch',
  wrongFeedback: 'none' as 'none' | 'count' | 'reveal' | 'all_correct_only',
  lockOnWrong: false,
  targetCorrect: 1,
  cooldownSeconds: 5,
  maxAttempts: 0,
  timeLimit: 120,
  scoringRule: 'correct_only' as 'correct_only' | 'timed_bonus',
  winCondition: 'all_correct' as string,
  playerCount: { min: 2, max: 20 }
})

const isAdminJudge = computed(() => form.type === 'quiz' && form.winCondition === 'admin_judge')

function onTypeChange() {
  form.winCondition = form.type === 'quiz' ? 'all_correct' : 'highest_score'
}

onMounted(() => {
  if (props.game) {
    form.name = props.game.name
    form.description = props.game.description
    form.icon = props.game.icon
    form.type = props.game.type
    form.submitMode = (props.game as any).submitMode || 'single'
    form.wrongFeedback = (props.game as any).wrongFeedback || 'none'
    form.lockOnWrong = !!(props.game as any).lockOnWrong
    form.targetCorrect = (props.game as any).targetCorrect ?? 1
    form.cooldownSeconds = props.game.cooldownSeconds
    form.maxAttempts = props.game.maxAttempts
    form.timeLimit = props.game.timeLimit
    form.scoringRule = props.game.scoringRule
    form.winCondition = props.game.winCondition
    form.playerCount = { ...props.game.playerCount }
    form.questions = props.game.questions.map(q => ({
      ...q,
      optionsText: q.options.join('\n')
    }))
  }
})

function parseOptions(q: QuestionForm) {
  q.options = q.optionsText.split('\n').map(s => s.trim()).filter(Boolean)
}

function addQuestion() {
  form.questions.push(createBlankQuestion(form.questions.length))
}

function removeQuestion(idx: number) {
  form.questions.splice(idx, 1)
}

function moveQuestion(idx: number, dir: -1 | 1) {
  const target = idx + dir
  if (target < 0 || target >= form.questions.length) return
  const temp = form.questions[idx]
  form.questions[idx] = form.questions[target]
  form.questions[target] = temp
}

const isValid = computed(() => {
  if (!form.name.trim()) return false
  if (form.questions.length === 0) return false
  if (form.type === 'quiz' && form.winCondition === 'target_correct') {
    if (!form.targetCorrect || form.targetCorrect < 1) return false
  }
  return form.questions.every(q => {
    if (!q.text.trim()) return false
    if (!isAdminJudge.value && !q.correctAnswer.trim()) return false
    return true
  })
})

async function save() {
  if (!isValid.value || saving.value) return
  saving.value = true
  try {
    const payload: any = {
      name: form.name,
      description: form.description,
      icon: form.icon,
      type: form.type,
      questions: form.questions.map(q => ({
        id: q.id,
        text: q.text,
        options: q.options,
        correctAnswer: q.correctAnswer,
        points: q.points
      })),
      submitMode: form.submitMode,
      wrongFeedback: form.wrongFeedback,
      lockOnWrong: form.lockOnWrong,
      targetCorrect: form.targetCorrect,
      cooldownSeconds: form.cooldownSeconds,
      maxAttempts: form.maxAttempts,
      timeLimit: form.timeLimit,
      scoringRule: form.scoringRule,
      winCondition: form.winCondition,
      playerCount: form.playerCount
    }
    if (isEdit.value) {
      await bbUpdateCustomGame(props.game!.id, payload)
    } else {
      await bbCreateCustomGame(payload)
    }
    emit('save')
  } catch (e) {
    console.error(e)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.editor-overlay { position: fixed; inset: 0; background: #00000088; z-index: 1000; display: flex; justify-content: center; align-items: flex-start; padding: 40px 20px; overflow-y: auto; }
.editor-panel { background: #111a14; border: 1px solid #00ff8833; border-radius: 12px; width: 760px; max-width: 100%; box-shadow: 0 8px 32px #00000066; }
.editor-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid #00ff8822; }
.editor-header h2 { margin: 0; font-size: 20px; color: #e0e0e0; }
.close-btn { background: none; border: none; color: #666; font-size: 20px; cursor: pointer; padding: 4px 8px; }
.close-btn:hover { color: #ff4444; }
.editor-body { padding: 20px 24px; max-height: 65vh; overflow-y: auto; }
.form-section { margin-bottom: 24px; }
.form-section h3 { font-size: 15px; color: #00ff88; margin: 0 0 12px 0; font-weight: 600; }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.section-header h3 { margin: 0; }
.form-row { margin-bottom: 12px; }
.form-row label { display: block; font-size: 13px; color: #888; margin-bottom: 4px; }
.form-row-inline { display: flex; gap: 16px; }
.form-row-inline .form-row { flex: 1; }
.hint-line { color: #6fb98f; font-size: 12px; margin: 2px 0 8px; line-height: 1.5; }
.bb-input { width: 100%; padding: 8px 12px; background: #0a1a10; border: 1px solid #00ff8833; border-radius: 6px; color: #e0e0e0; font-size: 14px; outline: none; box-sizing: border-box; }
.bb-input:focus { border-color: #00ff88; }
select.bb-input { cursor: pointer; }
textarea.bb-input { resize: vertical; font-family: inherit; }
.icon-picker { display: flex; flex-wrap: wrap; gap: 6px; }
.emoji-btn { width: 36px; height: 36px; font-size: 20px; border: 2px solid #00ff8822; border-radius: 6px; background: transparent; cursor: pointer; transition: all 0.15s; }
.emoji-btn:hover { border-color: #00ff8866; }
.emoji-btn.active { border-color: #00ff88; background: #00ff8822; }
.bb-btn { background: transparent; border: 1px solid #00ff8844; color: #00ff88; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
.bb-btn:hover { background: #00ff8822; }
.bb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bb-btn-primary { border-color: #00ff88; background: #00ff8822; }
.bb-btn-xs { padding: 4px 12px; font-size: 12px; border-radius: 4px; border: 1px solid #00ff8833; background: transparent; color: #00ff88; cursor: pointer; }
.bb-btn-xs:hover { background: #00ff8822; }
.btn-add { border-color: #00ff8866; }
.empty-hint { color: #666; font-size: 13px; padding: 12px 0; }
.question-card { border: 1px solid #00ff8822; border-radius: 8px; padding: 12px; margin-bottom: 12px; background: #0a1a1022; }
.question-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.q-num { font-size: 13px; font-weight: 700; color: #00ff88; }
.q-actions { display: flex; gap: 4px; }
.q-btn { width: 24px; height: 24px; border: 1px solid #00ff8833; border-radius: 4px; background: transparent; color: #888; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; }
.q-btn:hover { border-color: #00ff8866; color: #00ff88; }
.q-btn-del:hover { border-color: #ff444466; color: #ff4444; }
.editor-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 24px; border-top: 1px solid #00ff8822; }
</style>
