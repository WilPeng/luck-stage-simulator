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
          <div class="system-text">
            <span>{{ msg.content }}</span>
            <span class="system-time">{{ formatTime(msg.createdAt) }}</span>
          </div>
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

    <!-- 聊天框内弹出邀请提示 -->
    <div v-if="hohInvite || moveInvite" class="chat-invites">
      <div v-if="hohInvite" class="chat-invite">
        <div class="ci-icon">👑</div>
        <div class="ci-body">
          <div class="ci-title">{{ hohInvite.hohName }} 邀请你进入 HOH Room</div>
          <div class="ci-actions">
            <button class="ci-btn primary" @click="$emit('accept-hoh-invite')">接受</button>
            <button class="ci-btn" @click="$emit('decline-hoh-invite')">拒绝</button>
          </div>
        </div>
      </div>
      <div v-if="moveInvite" class="chat-invite">
        <div class="ci-icon">👥</div>
        <div class="ci-body">
          <div class="ci-title">{{ moveInvite.inviterName }} 邀请你一同前往 {{ moveInvite.roomName }}</div>
          <div class="ci-actions">
            <button class="ci-btn primary" @click="$emit('accept-move-invite')">同意</button>
            <button class="ci-btn" @click="$emit('decline-move-invite')">拒绝</button>
          </div>
        </div>
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
  active?: boolean
  hohInvite?: { hohName: string; hohId: string; roomId: string } | null
  moveInvite?: { inviterId: string; inviterName: string; targetRoomId: string; roomName: string } | null
}>()

const emit = defineEmits<{
  (e: 'send', content: string): void
  (e: 'load-more'): void
  (e: 'accept-hoh-invite'): void
  (e: 'decline-hoh-invite'): void
  (e: 'accept-move-invite'): void
  (e: 'decline-move-invite'): void
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
  const p = (n: number) => n.toString().padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

let prevFirstId = ''
let prevLastId = ''
let prevScrollHeight = 0
let prevScrollTop = 0
let prevNearBottom = true

watch(() => props.messages.length, () => {
  const el = messagesContainer.value
  if (el) {
    prevScrollHeight = el.scrollHeight
    prevScrollTop = el.scrollTop
    prevNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }
  const firstId = props.messages[0]?.id || ''
  const lastId = props.messages[props.messages.length - 1]?.id || ''
  const hadMessages = !!prevLastId
  const appended = hadMessages && !!lastId && lastId !== prevLastId
  const prepended = hadMessages && !appended && !!firstId && firstId !== prevFirstId

  nextTick(() => {
    const container = messagesContainer.value
    if (container) {
      if (prepended) {
        // 加载更早的消息时保持当前阅读位置，不跳回底部
        container.scrollTop = prevScrollTop + (container.scrollHeight - prevScrollHeight)
      } else if (appended) {
        // 正在向上翻阅时，不被新消息拉回底部
        if (prevNearBottom) container.scrollTop = container.scrollHeight
      } else if (!hadMessages) {
        container.scrollTop = container.scrollHeight
      }
    }
    prevFirstId = firstId
    prevLastId = lastId
  })
})
watch(() => props.active, (v) => { if (v) scrollToBottom() })
onMounted(() => {
  scrollToBottom()
  prevFirstId = props.messages[0]?.id || ''
  prevLastId = props.messages[props.messages.length - 1]?.id || ''
})

import { computed } from 'vue'
</script>

<style scoped>
.room-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 100%;
  min-height: 0;
  background: #1b1130;
  border: 1px solid #b39bff22;
  border-radius: 12px;
  overflow: hidden;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #ffffff08;
  background: #1e1436;
  flex-shrink: 0;
}
.chat-room-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.chat-room-icon { font-size: 18px; }
.chat-room-name { font-size: 15px; font-weight: 600; color: #ece7fb; }
.chat-presence {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #8f83b8;
}
.presence-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6b5f92;
}
.presence-dot.online { background: #b39bff; }

.presence-bar {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid #ffffff08;
  flex-wrap: wrap;
  min-height: 34px;
  align-items: center;
  flex-shrink: 0;
}
.presence-player {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #a99bd0;
}
.presence-player-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #b39bff88;
}
.presence-player-name {
  color: #cfc4ea;
}
.presence-empty {
  font-size: 11px;
  color: #5c5182;
}

.messages-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  scrollbar-width: thin;
  scrollbar-color: #b39bff55 transparent;
}
.messages-container::-webkit-scrollbar { width: 6px; }
.messages-container::-webkit-scrollbar-track { background: transparent; }
.messages-container::-webkit-scrollbar-thumb { background: #b39bff44; border-radius: 3px; }
.messages-container::-webkit-scrollbar-thumb:hover { background: #b39bff66; }

.load-more {
  text-align: center;
  color: #b39bff;
  font-size: 12px;
  cursor: pointer;
  padding: 4px;
}
.load-more:hover { text-decoration: underline; }

.loading-more {
  text-align: center;
  color: #6b5f92;
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
  color: #6b5f92;
  background: #ffffff06;
  padding: 2px 10px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.system-time { color: #4b416b; font-size: 10px; }
.msg-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.msg-sender {
  font-size: 12px;
  font-weight: 600;
  color: #b39bff;
}
.msg-sender.admin { color: #e6c988; }
.msg-time {
  font-size: 10px;
  color: #5c5182;
}
.msg-content {
  font-size: 14px;
  color: #ddd;
  line-height: 1.5;
  word-break: break-word;
}

.self-msg .msg-row {
  flex-direction: row-reverse;
}
.self-msg .msg-body {
  align-items: flex-end;
  text-align: right;
}
.self-msg .msg-header {
  justify-content: flex-end;
}
.self-msg .msg-content {
  text-align: right;
}
.self-msg .msg-sender { color: #66aaff; }

.empty-messages {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 32px 0;
  color: #5c5182;
  font-size: 13px;
}
.empty-icon { font-size: 24px; opacity: 0.4; }

.chat-invites {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid #ffffff08;
  background: #1e1436;
  flex-shrink: 0;
}
.chat-invite {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border: 1px solid #e6c98866;
  background: #e6c98814;
  border-radius: 10px;
}
.ci-icon { font-size: 20px; line-height: 1.2; flex-shrink: 0; }
.ci-body { flex: 1; min-width: 0; }
.ci-title { font-size: 13px; color: #ece7fb; line-height: 1.5; }
.ci-actions { display: flex; gap: 8px; margin-top: 8px; }
.ci-btn {
  padding: 5px 14px;
  border-radius: 6px;
  border: 1px solid #ffffff22;
  background: transparent;
  color: #cfc4ea;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.ci-btn:hover { background: #ffffff10; }
.ci-btn.primary { border-color: #b39bff66; background: #b39bff22; color: #b39bff; }
.ci-btn.primary:hover { background: #b39bff33; }

.chat-input {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid #ffffff08;
  background: #1e1436;
  flex-shrink: 0;
}
.msg-input {
  flex: 1;
  padding: 8px 12px;
  background: #120a22;
  border: 1px solid #ffffff15;
  border-radius: 8px;
  color: #ece7fb;
  font-size: 13px;
  outline: none;
}
.msg-input:focus { border-color: #b39bff66; }
.msg-input::placeholder { color: #5c5182; }

.send-btn {
  padding: 8px 16px;
  background: #b39bff22;
  border: 1px solid #b39bff44;
  border-radius: 8px;
  color: #b39bff;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.send-btn:hover:not(:disabled) { background: #b39bff33; border-color: #b39bff; }
.send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
