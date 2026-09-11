<template>
  <div class="room-chat">
    <div class="chat-header">
      <div class="chat-room-info">
        <span class="chat-room-icon">{{ roomIcon }}</span>
        <span class="chat-room-name">{{ roomName }}</span>
      </div>
      <div class="chat-presence">
        <span class="presence-dot" :class="{ online: connected }"></span>
        <span class="presence-text">{{ presenceCount }}人在房间</span>
      </div>
    </div>

    <!-- 玩家列表 -->
    <div class="presence-bar">
      <div v-for="p in presencePlayers" :key="p.playerId" class="presence-player">
        <BBAvatar :name="p.playerName" :avatar="p.avatar" size="sm" />
        <span class="presence-player-name">{{ p.playerName }}</span>
      </div>
      <div v-if="presencePlayers.length === 0" class="presence-empty">暂无其他人</div>
    </div>

    <!-- 消息列表 -->
    <div class="messages-container" ref="messagesContainer">
      <div v-if="loading" class="loading-more">加载中...</div>
      <div v-if="hasMore && !loading" class="load-more" @click="$emit('load-more')">
        ↑ 加载更多
      </div>

      <div v-for="msg in messages" :key="msg.id" class="message"
        :class="{ 'system-msg': msg.senderId === 'system', 'self-msg': msg.senderId === currentUserId }">
        <template v-if="msg.senderId === 'system'">
          <div class="system-text">{{ msg.content }}</div>
        </template>
        <template v-else>
          <div class="msg-row">
            <BBAvatar :name="msg.senderName" :avatar="msg.senderAvatar" size="sm" />
            <div class="msg-body">
              <div class="msg-header">
                <span class="msg-sender" :class="{ admin: msg.senderRole === 'admin' }">{{ msg.senderName }}</span>
                <span class="msg-time">{{ formatTime(msg.createdAt) }}</span>
              </div>
              <div class="msg-content">{{ msg.content }}</div>
            </div>
          </div>
        </template>
      </div>

      <div v-if="messages.length === 0" class="empty-messages">
        <span class="empty-icon">💬</span>
        <span>还没有消息，说点什么吧</span>
      </div>
    </div>

    <!-- 输入框 -->
    <div class="chat-input">
      <input
        v-model="inputText"
        type="text"
        :placeholder="`在${roomName}中发言...`"
        class="msg-input"
        @keydown.enter="handleSend"
      />
      <button class="send-btn" :disabled="!inputText.trim()" @click="handleSend">
        发送
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import BBAvatar from '../BBAvatar.vue'
import type { HouseMessage, HousePlayer } from '../../../composables/useHouseSocket'

const props = defineProps<{
  roomId: string
  roomName: string
  roomIcon: string
  messages: HouseMessage[]
  presencePlayers: HousePlayer[]
  connected: boolean
  hasMore: boolean
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'send', content: string): void
  (e: 'load-more'): void
}>()

const authStore = useBbAuthStore()
const currentUserId = computed(() => authStore.currentUser?.id || '')
const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

const presenceCount = computed(() => props.presencePlayers.length)

function handleSend() {
  const text = inputText.value.trim()
  if (!text) return
  emit('send', text)
  inputText.value = ''
}

function formatTime(t: string) {
  if (!t) return ''
  const d = new Date(t)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

watch(() => props.messages.length, scrollToBottom)
onMounted(scrollToBottom)

import { computed } from 'vue'
</script>

<style scoped>
.room-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f0f2e;
  border: 1px solid #00ff8822;
  border-radius: 12px;
  overflow: hidden;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #ffffff08;
  background: #141430;
}
.chat-room-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.chat-room-icon { font-size: 18px; }
.chat-room-name { font-size: 15px; font-weight: 600; color: #e0e0e0; }
.chat-presence {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #888;
}
.presence-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #666;
}
.presence-dot.online { background: #00ff88; }

.presence-bar {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid #ffffff08;
  flex-wrap: wrap;
  min-height: 34px;
  align-items: center;
}
.presence-player {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #aaa;
}
.presence-player-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #00ff8888;
}
.presence-player-name {
  color: #ccc;
}
.presence-empty {
  font-size: 11px;
  color: #555;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.load-more {
  text-align: center;
  color: #00ff88;
  font-size: 12px;
  cursor: pointer;
  padding: 4px;
}
.load-more:hover { text-decoration: underline; }

.loading-more {
  text-align: center;
  color: #666;
  font-size: 12px;
  padding: 4px;
}

.message {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.msg-row { display: flex; gap: 8px; align-items: flex-start; }
.msg-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.system-msg {
  align-items: center;
}
.system-text {
  font-size: 11px;
  color: #666;
  background: #ffffff06;
  padding: 2px 10px;
  border-radius: 10px;
}
.msg-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.msg-sender {
  font-size: 12px;
  font-weight: 600;
  color: #00ff88;
}
.msg-sender.admin { color: #ffaa00; }
.msg-time {
  font-size: 10px;
  color: #555;
}
.msg-content {
  font-size: 14px;
  color: #ddd;
  line-height: 1.5;
  word-break: break-word;
}

.self-msg .msg-sender { color: #66aaff; }

.empty-messages {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 32px 0;
  color: #555;
  font-size: 13px;
}
.empty-icon { font-size: 24px; opacity: 0.4; }

.chat-input {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid #ffffff08;
  background: #141430;
}
.msg-input {
  flex: 1;
  padding: 8px 12px;
  background: #0a0a1a;
  border: 1px solid #ffffff15;
  border-radius: 8px;
  color: #e0e0e0;
  font-size: 13px;
  outline: none;
}
.msg-input:focus { border-color: #00ff8866; }
.msg-input::placeholder { color: #555; }

.send-btn {
  padding: 8px 16px;
  background: #00ff8822;
  border: 1px solid #00ff8844;
  border-radius: 8px;
  color: #00ff88;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.send-btn:hover:not(:disabled) { background: #00ff8833; border-color: #00ff88; }
.send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
