<template>
  <div class="bb-chat-admin">
    <div class="page-header">
      <h1>聊天室</h1>
      <button class="bb-btn bb-btn-danger" @click="clearMessages">清空消息</button>
    </div>

    <div class="chat-container" ref="chatContainer">
      <div v-for="msg in messages" :key="msg.id" class="chat-message" :class="{ mine: msg.senderId === currentUserId }">
        <div class="msg-avatar">{{ msg.senderName?.[0] || '?' }}</div>
        <div class="msg-content">
          <div class="msg-header">
            <span class="msg-name">{{ msg.senderName }}</span>
            <span class="msg-role" v-if="msg.senderRole === 'admin'">管理员</span>
            <span class="msg-time">{{ formatTime(msg.createdAt) }}</span>
          </div>
          <div class="msg-text">{{ msg.content }}</div>
        </div>
        <button class="msg-delete" @click="deleteMessage(msg.id)" title="删除">✕</button>
      </div>
      <div v-if="messages.length === 0" class="empty-chat">暂无消息</div>
    </div>

    <div class="chat-input">
      <input v-model="newMessage" class="bb-input" placeholder="输入消息..." @keyup.enter="sendMessage" />
      <button class="bb-btn" @click="sendMessage" :disabled="!newMessage.trim()">发送</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { bbGetChatMessages, bbSendChatMessage, bbDeleteChatMessage, bbClearChatMessages } from '../../../services/bbApi'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import type { BBChatMessage } from '../../../types/bigbrother'

const authStore = useBbAuthStore()
const messages = ref<BBChatMessage[]>([])
const newMessage = ref('')
const chatContainer = ref<HTMLElement | null>(null)
const currentUserId = computed(() => authStore.currentUser?.id)

async function fetchMessages() {
  try {
    const result = await bbGetChatMessages({ pageSize: 100 })
    messages.value = (result.messages || []).reverse()
    await nextTick()
    scrollToBottom()
  } catch {}
}

async function sendMessage() {
  if (!newMessage.value.trim()) return
  try {
    await bbSendChatMessage(newMessage.value.trim())
    newMessage.value = ''
    await fetchMessages()
  } catch (e: any) { alert(e.message) }
}

async function deleteMessage(id: string) {
  try {
    await bbDeleteChatMessage(id)
    await fetchMessages()
  } catch {}
}

async function clearMessages() {
  if (!confirm('确定清空所有消息？')) return
  try {
    await bbClearChatMessages()
    await fetchMessages()
  } catch {}
}

function formatTime(t: string) {
  if (!t) return ''
  const d = new Date(t)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function scrollToBottom() {
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  }
}

onMounted(fetchMessages)
</script>

<style scoped>
.bb-chat-admin { max-width: 800px; margin: 0 auto; display: flex; flex-direction: column; height: calc(100vh - 120px); }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.bb-btn { background: transparent; border: 1px solid #00ff8844; color: #00ff88; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
.bb-btn:hover { background: #00ff8822; }
.bb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bb-btn-danger { border-color: #ff4444; color: #ff4444; }
.bb-btn-danger:hover { background: #ff444422; }
.chat-container { flex: 1; overflow-y: auto; padding: 12px; background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; margin-bottom: 12px; }
.chat-message { display: flex; gap: 10px; padding: 8px 0; align-items: flex-start; }
.chat-message.mine { flex-direction: row-reverse; }
.msg-avatar { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #00ff88, #00cc66); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; color: #1a1a3e; flex-shrink: 0; }
.chat-message.mine .msg-avatar { background: linear-gradient(135deg, #4488ff, #2266dd); }
.msg-content { max-width: 70%; }
.msg-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.msg-name { font-size: 13px; font-weight: 500; color: #e0e0e0; }
.msg-role { font-size: 11px; color: #00ff88; background: #00ff8815; padding: 0 6px; border-radius: 4px; }
.msg-time { font-size: 11px; color: #666; }
.msg-text { font-size: 14px; color: #ccc; line-height: 1.5; background: #00ff8808; padding: 8px 12px; border-radius: 8px; display: inline-block; }
.chat-message.mine .msg-text { background: #4488ff15; }
.msg-delete { opacity: 0; background: none; border: none; color: #ff4444; cursor: pointer; font-size: 12px; padding: 4px; transition: opacity 0.2s; }
.chat-message:hover .msg-delete { opacity: 1; }
.empty-chat { text-align: center; color: #666; padding: 60px 0; }
.chat-input { display: flex; gap: 12px; }
.bb-input { background: #0f0f2e; border: 1px solid #00ff8822; color: #e0e0e0; padding: 10px 14px; border-radius: 6px; font-size: 14px; flex: 1; outline: none; }
.bb-input:focus { border-color: #00ff88; }
</style>
