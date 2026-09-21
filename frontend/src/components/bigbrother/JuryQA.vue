<template>
  <div class="jury-qa">
    <div class="jq-title">🎤 陪审团问答</div>
    <p class="jq-sub">冠军投票前，陪审团向决赛选手提问，决赛选手作答。</p>

    <div v-if="isJury" class="jq-ask">
      <input v-model="newQuestion" class="bb-input" placeholder="向决赛选手提问…" @keyup.enter="ask" />
      <button class="bb-btn" :disabled="!newQuestion.trim() || asking" @click="ask">{{ asking ? '提交中…' : '提问' }}</button>
    </div>

    <div class="jq-list">
      <div v-for="q in questions" :key="q.id" class="jq-item">
        <div class="jq-q">
          <BBAvatar :name="q.juryName" size="sm" />
          <div class="jq-q-body">
            <div class="jq-meta"><span class="jq-jury">{{ q.juryName }}</span><span class="jq-time">{{ fmt(q.createdAt) }}</span></div>
            <div class="jq-question">{{ q.question }}</div>
          </div>
        </div>
        <div v-if="q.answer" class="jq-a">
          <span class="jq-a-label">{{ q.answerByName || '决赛选手' }} 回答：</span>
          <span>{{ q.answer }}</span>
        </div>
        <div v-else-if="isFinalist" class="jq-answer-form">
          <input v-model="answers[q.id]" class="bb-input" placeholder="你的回答…" @keyup.enter="answer(q.id)" />
          <button class="bb-btn" :disabled="!answers[q.id] || answeringId === q.id" @click="answer(q.id)">
            {{ answeringId === q.id ? '提交中…' : '回答' }}
          </button>
        </div>
        <div v-else class="jq-pending">等待选手回答…</div>
      </div>
      <div v-if="!questions.length" class="jq-empty">暂无提问</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { bbGetJuryQA, bbAskJuryQuestion, bbAnswerJuryQuestion } from '../../services/bbApi'
import { useBbRefresh } from '../../composables/useBbRefresh'
import BBAvatar from './BBAvatar.vue'

defineProps<{ isJury?: boolean; isFinalist?: boolean }>()

const questions = ref<any[]>([])
const newQuestion = ref('')
const asking = ref(false)
const answers = reactive<Record<string, string>>({})
const answeringId = ref<string | null>(null)

function fmt(t: string) {
  if (!t) return ''
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

async function load() {
  try { questions.value = await bbGetJuryQA() || [] } catch { questions.value = [] }
}

async function ask() {
  if (!newQuestion.value.trim() || asking.value) return
  asking.value = true
  try { await bbAskJuryQuestion(newQuestion.value.trim()); newQuestion.value = ''; await load() } catch (e: any) { alert(e?.message || '提问失败') } finally { asking.value = false }
}
async function answer(id: string) {
  const text = answers[id]
  if (!text || answeringId.value) return
  answeringId.value = id
  try { await bbAnswerJuryQuestion(id, text); answers[id] = ''; await load() } catch (e: any) { alert(e?.message || '回答失败') } finally { answeringId.value = null }
}

useBbRefresh(load)
onMounted(load)
</script>

<style scoped>
.jury-qa { background: #0f0f2e; border: 1px solid #aa44ff44; border-radius: 12px; padding: 18px; margin-bottom: 18px; }
.jq-title { font-size: 16px; font-weight: 700; color: #aa44ff; margin-bottom: 4px; }
.jq-sub { font-size: 13px; color: #8a8aa5; margin: 0 0 14px; }
.jq-ask { display: flex; gap: 8px; margin-bottom: 14px; }
.bb-input { flex: 1; padding: 10px 14px; background: #0a0a1a; border: 1px solid #aa44ff44; border-radius: 8px; color: #e0e0e0; font-size: 14px; outline: none; }
.jq-list { display: flex; flex-direction: column; gap: 12px; }
.jq-item { background: #ffffff06; border: 1px solid #ffffff12; border-radius: 10px; padding: 12px 14px; }
.jq-q { display: flex; gap: 10px; }
.jq-q-body { flex: 1; }
.jq-meta { display: flex; gap: 8px; font-size: 12px; margin-bottom: 4px; }
.jq-jury { color: #aa44ff; font-weight: 600; }
.jq-time { color: #666; margin-left: auto; }
.jq-question { color: #e6e6f5; font-size: 14px; line-height: 1.5; }
.jq-a { margin-top: 10px; margin-left: 40px; padding: 8px 12px; background: #00ff8812; border-left: 3px solid #00ff88; border-radius: 4px; color: #cfe; font-size: 14px; }
.jq-a-label { color: #00ff88; font-weight: 600; margin-right: 6px; }
.jq-answer-form { display: flex; gap: 8px; margin-top: 10px; margin-left: 40px; }
.jq-pending { margin-top: 8px; margin-left: 40px; font-size: 12px; color: #666; }
.jq-empty { color: #666; font-size: 13px; padding: 16px; text-align: center; }
.bb-btn { background: transparent; border: 1px solid #aa44ff66; color: #aa44ff; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; }
.bb-btn:hover:not(:disabled) { background: #aa44ff22; }
.bb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
