<template>
  <div class="lv-letter-send">
    <div class="page-header">
      <h1>💌 寄信</h1>
    </div>

    <div class="letter-count-card">
      <div class="count-row">
        <span class="label">实名剩余次数</span>
        <span class="value" :class="{ low: (publicCount ?? 0) <= 0 }">{{ publicCount ?? 0 }}</span>
      </div>
      <div class="count-row">
        <span class="label">匿名剩余次数</span>
        <span class="value" :class="{ low: (anonCount ?? 0) <= 0 }">{{ anonCount ?? 0 }}</span>
      </div>
      <span class="hint">寄信次数不足请联系管理员增加</span>
    </div>

    <!-- 寄信表单 -->
    <div class="send-section">
      <div class="form-group">
        <label>收件人</label>
        <select v-model="receiverId" class="lv-select">
          <option value="">请选择收件人</option>
          <option v-for="p in activePlayers" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>

      <div class="form-group">
        <label>信件内容</label>
        <textarea v-model="content" class="lv-textarea" rows="5"
          placeholder="写下你想对TA说的话..."
          maxlength="500"></textarea>
        <span class="char-count">{{ content.length }} / 500</span>
      </div>

      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" v-model="isAnonymous" />
          匿名发送（收件人看不到发件人信息）
        </label>
      </div>

      <button class="lv-btn lv-btn-primary send-btn" @click="handleSend"
        :disabled="!canSend || sending">
        {{ sending ? '发送中...' : '💌 寄出' }}
      </button>

      <div v-if="sendSuccess" class="success-toast">✅ 信件已寄出！</div>
      <div v-if="sendError" class="error-toast">{{ sendError }}</div>
    </div>

    <!-- 已发信件 -->
    <div class="sent-section">
      <h2>已发信件</h2>
      <div v-if="sentLetters.length === 0" class="empty-tip">暂无已发信件</div>
      <div v-for="letter in sentLetters" :key="letter.id" class="sent-card">
        <div class="sent-header">
          <div class="sent-to-row">
            <LvAvatar :name="letter.receiverName" :avatar="letter.receiverAvatar" size="sm" />
            <span class="sent-to">→ {{ letter.receiverName }}</span>
          </div>
          <span class="sent-time">{{ formatTime(letter.createdAt) }}</span>
        </div>
        <div class="sent-content">{{ letter.content }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useLvAuthStore } from '../../../stores/lovevarietyAuthStore'
import { lvGetActivePlayers, lvSendLetter, lvGetSentLetters, lvGetCurrentUser } from '../../../services/lovevarietyApi'
import type { LVLetter } from '../../../types/lovevariety'
import LvAvatar from '../../../components/lovevariety/LvAvatar.vue'

const authStore = useLvAuthStore()

const activePlayers = ref<{ id: string; name: string }[]>([])
const receiverId = ref('')
const content = ref('')
const isAnonymous = ref(false)
const sending = ref(false)
const sendSuccess = ref(false)
const sendError = ref('')
const sentLetters = ref<LVLetter[]>([])

const publicCount = computed(() => authStore.currentUser?.letterPublicCount ?? 0)
const anonCount = computed(() => authStore.currentUser?.letterAnonymousCount ?? 0)

const canSend = computed(() => {
  if (!receiverId.value || !content.value.trim()) return false
  if (isAnonymous.value) return (anonCount.value ?? 0) > 0
  return (publicCount.value ?? 0) > 0
})

async function handleSend() {
  if (!canSend.value) return
  sending.value = true
  sendError.value = ''
  sendSuccess.value = false
  try {
    await lvSendLetter({
      receiverId: receiverId.value,
      content: content.value.trim(),
      isAnonymous: isAnonymous.value
    })
    sendSuccess.value = true
    content.value = ''
    receiverId.value = ''
    isAnonymous.value = false
    // 刷新已发信件和用户信息
    await Promise.all([
      fetchSentLetters(),
      authStore.loginUser(authStore.currentUser?.loginCode || '')
    ])
    setTimeout(() => sendSuccess.value = false, 3000)
  } catch (e: any) {
    sendError.value = e.message || '寄信失败'
  } finally {
    sending.value = false
  }
}

async function fetchSentLetters() {
  try {
    sentLetters.value = await lvGetSentLetters()
  } catch {}
}

function formatTime(t: string): string {
  if (!t) return ''
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

onMounted(async () => {
  // 刷新用户信息（获取最新的寄信次数等）
  try {
    const freshUser = await lvGetCurrentUser()
    if (freshUser) authStore.currentUser = freshUser
  } catch {}
  try {
    const list = await lvGetActivePlayers()
    activePlayers.value = list.filter(p => p.id !== authStore.currentUser?.id).map(p => ({ id: p.id, name: p.name }))
  } catch {}
  await fetchSentLetters()
})
</script>

<style scoped>
.lv-letter-send { max-width: 600px; margin: 0 auto; }
.page-header { margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.letter-count-card {
  background: linear-gradient(135deg, #ff69b422, #ff149322);
  border: 1px solid #ff69b4; border-radius: 12px;
  padding: 16px 20px; text-align: center; margin-bottom: 20px;
}
.letter-count-card .count-row { display: flex; justify-content: center; align-items: center; gap: 8px; margin-bottom: 4px; }
.letter-count-card .count-row:last-of-type { margin-bottom: 8px; }
.letter-count-card .label { font-size: 13px; color: #aaa; }
.letter-count-card .value { font-size: 28px; font-weight: 700; color: #ff69b4; min-width: 40px; }
.letter-count-card .value.low { color: #ff4444; }
.letter-count-card .hint { display: block; font-size: 11px; color: #888; margin-top: 4px; }
.send-section {
  background: #1a0f2e; border: 1px solid #ff69b422; border-radius: 10px;
  padding: 20px; margin-bottom: 24px;
}
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 13px; color: #aaa; margin-bottom: 6px; }
.lv-select {
  background: #0a0a1a; border: 1px solid #ff69b422; color: #e0e0e0;
  padding: 10px 12px; border-radius: 6px; font-size: 14px; outline: none; cursor: pointer; width: 100%;
}
.lv-textarea {
  background: #0a0a1a; border: 1px solid #ff69b422; color: #e0e0e0;
  padding: 10px 12px; border-radius: 6px; font-size: 14px; outline: none; width: 100%; resize: vertical;
  font-family: inherit;
}
.lv-textarea:focus { border-color: #ff69b4; }
.char-count { display: block; text-align: right; font-size: 11px; color: #666; margin-top: 4px; }
.checkbox-label {
  display: flex !important; align-items: center; gap: 8px; cursor: pointer;
}
.checkbox-label input[type="checkbox"] { accent-color: #ff69b4; }
.lv-btn {
  background: transparent; border: 1px solid #ff69b444; color: #ff69b4;
  padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s;
}
.lv-btn:hover { background: #ff69b422; }
.lv-btn-primary { background: #ff69b422; border-color: #ff69b4; }
.lv-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.send-btn { display: block; width: 100%; padding: 12px; font-size: 16px; }
.success-toast { text-align: center; color: #00ff88; margin-top: 12px; font-size: 14px; }
.error-toast { text-align: center; color: #ff4444; margin-top: 12px; font-size: 14px; }
.sent-section h2 { font-size: 18px; color: #e0e0e0; margin: 0 0 12px; }
.empty-tip { text-align: center; color: #666; padding: 20px; }
.sent-card {
  background: #1a0f2e; border: 1px solid #ff69b411; border-radius: 8px;
  padding: 12px 16px; margin-bottom: 8px;
}
.sent-header { display: flex; justify-content: space-between; margin-bottom: 6px; }
.sent-to-row { display: flex; align-items: center; gap: 6px; }
.sent-to { font-size: 13px; font-weight: 600; color: #ff69b4; }
.sent-time { font-size: 11px; color: #666; }
.sent-content { font-size: 13px; color: #ccc; line-height: 1.5; }
</style>
