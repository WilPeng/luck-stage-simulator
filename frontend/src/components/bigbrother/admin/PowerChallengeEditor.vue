<template>
  <div class="pc-editor">
    <div class="editor-header">
      <h3>{{ pool.id ? '编辑题目池' : '新建题目池' }}</h3>
      <button class="bb-btn-xs" @click="$emit('close')">关闭</button>
    </div>

    <div class="editor-body">
      <div class="form-group">
        <label>池名称</label>
        <input v-model="pool.name" class="form-input" placeholder="如：第1周实力大挑战" />
      </div>
      <div class="form-group">
        <label>主题</label>
        <input v-model="pool.theme" class="form-input" placeholder="如：动物大观" />
      </div>

      <div class="form-group">
        <div class="questions-header">
          <label>题目列表</label>
          <button class="bb-btn-xs bb-btn-primary" @click="addQuestion">+ 添加题目</button>
        </div>
        <div v-for="(q, qi) in pool.questions" :key="q.id || qi" class="question-editor">
          <div class="q-field">
            <input v-model="q.text" class="form-input" placeholder="题目内容" />
            <button class="bb-btn-xs btn-danger" @click="removeQuestion(qi)">删除</button>
          </div>
          <div class="options-editor">
            <div v-for="(opt, oi) in q.options" :key="oi" class="option-row">
              <input v-model="q.options[oi]" class="form-input" placeholder="选项" />
              <button v-if="q.options.length > 2" class="bb-btn-xs btn-danger" @click="removeOption(qi, oi)">×</button>
            </div>
            <button class="bb-btn-xs" @click="addOption(qi)">+ 选项</button>
          </div>
          <div class="answer-field">
            <select v-model="q.correctAnswer" class="form-select">
              <option v-for="opt in q.options" :key="opt" :value="opt">{{ opt }}</option>
            </select>
            <span class="answer-label">正确答案</span>
          </div>
        </div>
      </div>
    </div>

    <div class="editor-footer">
      <button class="bb-btn bb-btn-primary" @click="save" :disabled="!canSave">保存</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import type { PowerChallengePool, PowerChallengeQuestion } from '../../../types/bigbrother'

const props = defineProps<{ pool: PowerChallengePool }>()
const emit = defineEmits<{ (e: 'save'): void; (e: 'close'): void }>()

const pool = reactive<PowerChallengePool>({ ...props.pool })

function addQuestion() {
  pool.questions.push({
    id: crypto.randomUUID(),
    text: '',
    options: ['A', 'B'],
    correctAnswer: ''
  })
}

function removeQuestion(qi: number) {
  pool.questions.splice(qi, 1)
}

function addOption(qi: number) {
  const letter = String.fromCharCode(65 + pool.questions[qi].options.length)
  pool.questions[qi].options.push(letter)
}

function removeOption(qi: number, oi: number) {
  pool.questions[qi].options.splice(oi, 1)
  if (pool.questions[qi].correctAnswer && !pool.questions[qi].options.includes(pool.questions[qi].correctAnswer)) {
    pool.questions[qi].correctAnswer = pool.questions[qi].options[0] || ''
  }
}

const canSave = computed(() => {
  if (!pool.theme.trim() || pool.questions.length === 0) return false
  return pool.questions.every(q => q.text.trim() && q.options.length >= 2 && q.correctAnswer)
})

async function save() {
  if (!canSave.value) return
  emit('save')
}
</script>

<style scoped>
.pc-editor { background: #141430; border: 1px solid #ffffff15; border-radius: 12px; padding: 20px; }
.editor-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.editor-header h3 { color: #e0e0e0; margin: 0; font-size: 16px; }
.form-group { margin-bottom: 14px; }
.form-group label { display: block; color: #888; font-size: 12px; margin-bottom: 6px; }
.form-input { width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ffffff15; background: #0f0f2e; color: #e0e0e0; font-size: 13px; box-sizing: border-box; }
.form-select { padding: 6px 10px; border-radius: 8px; border: 1px solid #ffffff15; background: #0f0f2e; color: #e0e0e0; font-size: 13px; }
.questions-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.questions-header label { color: #888; font-size: 12px; }
.question-editor { background: #0f0f2e; border-radius: 8px; padding: 12px; margin-bottom: 10px; }
.q-field { display: flex; gap: 8px; margin-bottom: 8px; }
.q-field .form-input { flex: 1; }
.options-editor { margin-bottom: 6px; }
.option-row { display: flex; gap: 6px; margin-bottom: 4px; }
.option-row .form-input { flex: 1; }
.answer-field { display: flex; align-items: center; gap: 8px; }
.answer-label { color: #888; font-size: 11px; }
.editor-footer { margin-top: 16px; text-align: right; }
</style>
