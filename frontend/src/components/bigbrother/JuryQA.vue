<template>
  <div class="jury-chat">
    <div class="jc-head">
      <div class="jc-title">🎤 陪审团问答室</div>
      <div class="jc-sub">冠军投票前，陪审团向决赛选手提问，决赛选手作答</div>
    </div>

    <div ref="messagesEl" class="jc-messages">
      <div v-if="!questions.length" class="jc-empty">
        <span class="jc-empty-icon">💬</span>
        <span>暂无提问，陪审团可以开始提问</span>
      </div>

      <div v-for="q in questions" :key="q.id" class="jc-thread">
        <!-- 陪审团提问（左侧气泡） -->
        <div class="jc-row left">
          <BBAvatar :name="q.juryName" size="sm" />
          <div class="jc-bubble question">
            <div class="jc-meta">
              <span class="jc-name">{{ q.juryName }}</span>
              <span class="jc-role">陪审团</span>
              <span class="jc-time">{{ fmt(q.createdAt) }}</span>
            </div>
            <div class="jc-text">{{ q.question }}</div>
          </div>
        </div>

        <!-- 决赛选手回答（右侧气泡） -->
        <div v-if="q.answer" class="jc-row right">
          <div class="jc-bubble answer">
            <div class="jc-meta">
              <span class="jc-name">{{ q.answerByName || '决赛选手' }}</span>
              <span class="jc-role finalist">决赛选手</span>
              <span class="jc-time">{{ fmt(q.answeredAt) }}</span>
            </div>
            <div class="jc-text">{{ q.answer }}</div>
          </div>
          <BBAvatar :name="q.answerByName || '决赛选手'" size="sm" />
        </div>

        <div v-else class="jc-pending" :class="{ actionable: isFinalist }">
          {{ isFinalist ? '⬇ 请在下方输入框回答这个问题' : '等待决赛选手回答…' }}
        </div>
      </div>
    </div>

    <div v-if="isJury || isFinalist" class="jc-composer">
      <div v-if="isFinalist && pendingQuestion" class="jc-replying">
        正在回答：<span>{{ pendingQuestion.question }}</span>
      </div>
      <div class="jc-input-row">
        <input
          v-model="newMessage"
          class="jc-input"
          :placeholder="placeholder"
          :disabled="!canSend || sending"
          @keyup.enter="send"
        />
        <button class="jc-send" :disabled="!canSend || !newMessage.trim() || sending" @click="send">
          {{ sending ? '发送中…' : (isJury ? '提问' : '回答') }}
        </button>
      </div>
    </div>
    <div v-else class="jc-readonly">只有陪审团与决赛选手可以发言</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue'
import { bbGetJuryQA, bbAskJuryQuestion, bbAnswerJuryQuestion } from '../../services/bbApi'
import { useBbRefresh } from '../../composables/useBbRefresh'
import BBAvatar from './BBAvatar.vue'

const props = defineProps<{ isJury?: boolean; isFinalist?: boolean }>()

const questions = ref<any[]>([])
const newMessage = ref('')
const sending = ref(false)
const messagesEl = ref<HTMLElement | null>(null)

// 决赛选手先回答最早一条未回答的问题
const pendingQuestion = computed(() => questions.value.find(q => !q.answer) || null)
const canSend = computed(() => {
  if (props.isJury) return true
  return !!props.isFinalist && !!pendingQuestion.value
})
const placeholder = computed(() => {
  if (props.isJury) return '以陪审团身份向决赛选手提问…'
  if (props.isFinalist) {
    return pendingQuestion.value ? '输入你的回答…' : '暂无可回答的问题'
  }
  return '只有陪审团与决赛选手可以发言'
})

function fmt(t: string) {
  if (!t) return ''
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

async function scrollToBottom() {
  await nextTick()
  const el = messagesEl.value
  if (el) el.scrollTop = el.scrollHeight
}

async function load() {
  try {
    questions.value = (await bbGetJuryQA()) || []
  } catch {
    questions.value = []
  }
  await scrollToBottom()
}

async function send() {
  const text = newMessage.value.trim()
  if (!text || sending.value || !canSend.value) return
  sending.value = true
  try {
    if (props.isJury) {
      await bbAskJuryQuestion(text)
    } else if (props.isFinalist && pendingQuestion.value) {
      await bbAnswerJuryQuestion(pendingQuestion.value.id, text)
    } else {
      return
    }
    newMessage.value = ''
    await load()
  } catch (e: any) {
    alert(e?.message || '发送失败')
  } finally {
    sending.value = false
  }
}

useBbRefresh(load)
onMounted(load)
</script>

<style scoped>
.jury-chat {
  display: flex;
  flex-direction: column;
  background: #1b1130;
  border: 1px solid #aa44ff44;
  border-radius: 12px;
  margin-bottom: 18px;
  overflow: hidden;
  min-height: 320px;
}
.jc-head {
  padding: 14px 18px;
  border-bottom: 1px solid #ffffff10;
  background: linear-gradient(135deg, #241640, #1b1130);
}
.jc-title { font-size: 16px; font-weight: 700; color: #aa44ff; }
.jc-sub { font-size: 12px; color: #b3a6d6; margin-top: 2px; }

.jc-messages {
  flex: 1;
  max-height: 380px;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.jc-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; color: #6b5f92; font-size: 13px; padding: 48px 0;
}
.jc-empty-icon { font-size: 28px; }

.jc-thread { display: flex; flex-direction: column; gap: 8px; }
.jc-row { display: flex; align-items: flex-end; gap: 8px; }
.jc-row.left { justify-content: flex-start; }
.jc-row.right { justify-content: flex-end; }
.jc-bubble {
  max-width: 76%;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid #ffffff14;
  background: #2a1a4a;
}
.jc-bubble.question { border-bottom-left-radius: 4px; border-color: #aa44ff33; }
.jc-bubble.answer { border-bottom-right-radius: 4px; background: #b39bff18; border-color: #b39bff44; }
.jc-meta { display: flex; align-items: center; gap: 6px; font-size: 11px; margin-bottom: 4px; }
.jc-name { color: #ece7fb; font-weight: 600; }
.jc-role { color: #aa44ff; background: #aa44ff18; border-radius: 6px; padding: 0 6px; }
.jc-role.finalist { color: #b39bff; background: #b39bff18; }
.jc-time { color: #6b5f92; margin-left: auto; }
.jc-text { font-size: 14px; line-height: 1.55; color: #f0ebff; white-space: pre-wrap; word-break: break-word; }
.jc-pending { font-size: 11px; color: #6b5f92; padding-left: 40px; }
.jc-pending.actionable { color: #b39bff; }

.jc-composer { border-top: 1px solid #ffffff10; padding: 12px 14px; background: #160d28; }
.jc-replying {
  font-size: 11px; color: #8f83b8; margin-bottom: 8px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.jc-replying span { color: #b39bff; }
.jc-input-row { display: flex; gap: 8px; }
.jc-input {
  flex: 1; padding: 10px 14px; background: #120a22;
  border: 1px solid #aa44ff44; border-radius: 8px; color: #ece7fb;
  font-size: 14px; outline: none;
}
.jc-input:focus { border-color: #aa44ff; }
.jc-input:disabled { opacity: 0.5; }
.jc-send {
  padding: 10px 22px; border-radius: 8px; cursor: pointer; font-size: 14px;
  background: #aa44ff22; border: 1px solid #aa44ff88; color: #c9a6ff;
}
.jc-send:hover:not(:disabled) { background: #aa44ff33; }
.jc-send:disabled { opacity: 0.4; cursor: not-allowed; }
.jc-readonly { padding: 12px 16px; font-size: 12px; color: #6b5f92; border-top: 1px solid #ffffff10; text-align: center; }
</style>
