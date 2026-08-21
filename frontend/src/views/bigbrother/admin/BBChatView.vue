<template>
  <div class="bb-chat-admin">
    <div class="page-header">
      <h1>聊天室</h1>
      <div class="header-actions">
        <span class="ws-status" :class="{ connected: wsConnected }">
          {{ wsConnected ? '🟢 在线' : '🔴 离线' }}
        </span>
        <button class="bb-btn bb-btn-danger" @click="clearPublicMessages">清空群聊</button>
      </div>
    </div>

    <div class="chat-layout">
      <!-- 左侧栏 -->
      <aside class="chat-sidebar">
        <!-- 群聊入口 -->
        <div
          class="sidebar-item"
          :class="{ active: activeChat === 'public' }"
          @click="switchToChat('public')"
        >
          <div class="sidebar-avatar public-avatar">📢</div>
          <div class="sidebar-info">
            <div class="sidebar-name">集体聊天</div>
            <div class="sidebar-preview">{{ publicPreview }}</div>
          </div>
          <span v-if="unreadCounts['public'] > 0" class="unread-badge">
            {{ unreadCounts['public'] > 99 ? '99+' : unreadCounts['public'] }}
          </span>
        </div>

        <div class="sidebar-divider">
          <span>私聊监控</span>
        </div>

        <!-- 所有私聊对话 -->
        <div
          v-for="conv in privateConversations"
          :key="conv.pairKey"
          class="sidebar-item"
          :class="{ active: activeChat === conv.pairKey }"
          @click="switchToChat(conv.pairKey)"
        >
          <div class="sidebar-avatar">{{ conv.displayName[0] }}</div>
          <div class="sidebar-info">
            <div class="sidebar-name">{{ conv.displayName }}</div>
            <div class="sidebar-preview">{{ conv.lastMessage || '暂无私聊' }}</div>
          </div>
          <span v-if="unreadCounts[conv.pairKey] > 0" class="unread-badge">
            {{ unreadCounts[conv.pairKey] > 99 ? '99+' : unreadCounts[conv.pairKey] }}
          </span>
        </div>

        <div v-if="privateConversations.length === 0" class="sidebar-empty">
          暂无私聊记录
        </div>
      </aside>

      <!-- 右侧主区域 -->
      <section class="chat-main">
        <div class="chat-header">
          <span class="chat-title">{{ activeChat === 'public' ? '📢 集体聊天' : '💬 ' + activeTargetName }}</span>
          <button
            v-if="activeChat !== 'public'"
            class="back-btn"
            @click="switchToChat('public')"
          >
            返回群聊
          </button>
        </div>

        <div class="chat-container" ref="chatContainer" @scroll="onScroll">
          <!-- 加载更多 -->
          <div v-if="hasMoreMessages" class="load-more-area">
            <button class="load-more-btn" @click="loadMore" :disabled="loadingMore">
              {{ loadingMore ? '加载中...' : '查看历史聊天记录' }}
            </button>
          </div>
          <TransitionGroup name="msg">
            <div
              v-for="msg in currentMessages"
              :key="msg.id"
              class="chat-message"
              :class="{ mine: msg.senderId === currentUserId }"
            >
              <BBAvatar :name="msg.senderName" :avatar="msg.senderAvatar" size="sm" />
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
          </TransitionGroup>
          <div v-if="currentMessages.length === 0" class="empty-chat">暂无消息</div>
        </div>

        <div v-if="activeChat === 'public'" class="chat-input">
          <input
            v-model="newMessage"
            class="bb-input"
            placeholder="输入群聊消息..."
            @keyup.enter="sendPublicMessage"
          />
          <button class="bb-btn" @click="sendPublicMessage" :disabled="!newMessage.trim() || !wsConnected">
            发送
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { io, Socket } from 'socket.io-client'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import { bbGetAllPrivateChats } from '../../../services/bbApi'
import BBAvatar from '../../../components/bigbrother/BBAvatar.vue'
import type { BBChatMessage } from '../../../types/bigbrother'

const authStore = useBbAuthStore()
const currentUserId = computed(() => authStore.currentUser?.id)

const wsConnected = ref(false)
const socket = ref<Socket | null>(null)
const chatContainer = ref<HTMLElement | null>(null)
const newMessage = ref('')

const activeChat = ref<'public' | string>('public')
const activeTargetName = ref('')

const publicMessages = ref<BBChatMessage[]>([])
const privateMessagesMap = ref<Record<string, BBChatMessage[]>>({})
const privateConversations = ref<any[]>([])
const unreadCounts = ref<Record<string, number>>({ public: 0 })

// 分页信息
const pageInfoMap = ref<Record<string, { total: number; page: number; hasMore: boolean }>>({})
const loadingMore = ref(false)

const publicPreview = computed(() => {
  const msgs = publicMessages.value
  return msgs.length > 0 ? msgs[msgs.length - 1].content : '暂无消息'
})

const currentMessages = computed(() => {
  if (activeChat.value === 'public') return publicMessages.value
  return privateMessagesMap.value[activeChat.value] || []
})

const currentPageInfo = computed(() => {
  const key = activeChat.value
  return pageInfoMap.value[key] || { total: 0, page: 1, hasMore: false }
})

const hasMoreMessages = computed(() => {
  return currentPageInfo.value.hasMore
})

function getApiBase() {
  const base = ((import.meta as any).env?.VITE_API_BASE || '').replace(/\/$/, '') || ''
  return base || 'http://localhost:3000'
}

function getToken(): string | null {
  const key = 'bigbrother_token'
  return localStorage.getItem(key) || sessionStorage.getItem(key)
}

function initWebSocket() {
  const token = getToken()
  if (!token) return

  const wsUrl = getApiBase()

  const s = io(`${wsUrl}/bigbrother-chat`, {
    auth: { token },
    transports: ['websocket', 'polling']
  })

  s.on('connect', () => { wsConnected.value = true })
  s.on('disconnect', () => { wsConnected.value = false })

  s.on('chat:history', (res: { messages: BBChatMessage[]; total: number; page: number; pageSize: number; hasMore: boolean }) => {
    if (Array.isArray(res)) {
      publicMessages.value = res
      scrollToBottom()
      return
    }
    publicMessages.value = res.messages || []
    pageInfoMap.value['public'] = { total: res.total || 0, page: res.page || 1, hasMore: res.hasMore || false }
    if (activeChat.value === 'public') scrollToBottom()
  })

  s.on('chat:message', (msg: BBChatMessage) => {
    publicMessages.value.push(msg)
    if (activeChat.value === 'public') {
      scrollToBottom()
    } else {
      unreadCounts.value['public'] = (unreadCounts.value['public'] || 0) + 1
    }
  })

  // 管理员接收所有私聊消息
  s.on('chat:private-message', (msg: BBChatMessage) => {
    const pairKey = [msg.senderId, msg.targetId].filter(Boolean).sort().join('::')
    if (!pairKey) return

    if (!privateMessagesMap.value[pairKey]) {
      privateMessagesMap.value[pairKey] = []
    }
    privateMessagesMap.value[pairKey].push(msg)

    // 更新联系人
    const existingIdx = privateConversations.value.findIndex(c => c.pairKey === pairKey)
    if (existingIdx >= 0) {
      privateConversations.value[existingIdx].lastMessage = msg.content
    }

    if (activeChat.value === pairKey) {
      scrollToBottom()
    } else {
      unreadCounts.value[pairKey] = (unreadCounts.value[pairKey] || 0) + 1
    }
  })

  s.on('chat:delete', ({ messageId }: { messageId: string }) => {
    publicMessages.value = publicMessages.value.filter(m => m.id !== messageId)
    for (const key of Object.keys(privateMessagesMap.value)) {
      privateMessagesMap.value[key] = privateMessagesMap.value[key].filter(m => m.id !== messageId)
    }
  })

  s.on('chat:cleared', ({ chatType }: { chatType: string }) => {
    if (chatType === 'public') publicMessages.value = []
  })

  socket.value = s

  // 加载所有私聊对话
  loadPrivateConversations()
}

async function loadPrivateConversations() {
  const data = await bbGetAllPrivateChats().catch(() => null)
  if (!data) return

  const convs = (data.conversations || []).map((c: any) => {
    const pairKey = [c.user1Id, c.user2Id].sort().join('::')
    const displayName = `${c.user1Name} ↔ ${c.user2Name}`
    const lastMsg = c.messages?.[c.messages.length - 1]
    // 后端返回最近50条，设置分页信息
    const total = c.totalCount !== undefined ? c.totalCount : c.messages?.length || 0
    return {
      pairKey,
      displayName,
      lastMessage: lastMsg?.content || '',
      user1Id: c.user1Id,
      user2Id: c.user2Id,
      user1Name: c.user1Name,
      user2Name: c.user2Name,
      messages: c.messages || [],
      total
    }
  })

  privateConversations.value = convs

  // 预加载最近50条消息到 map，并设置分页信息
  for (const conv of convs) {
    if (conv.messages.length > 0) {
      privateMessagesMap.value[conv.pairKey] = conv.messages
    }
    pageInfoMap.value[conv.pairKey] = {
      total: conv.total || conv.messages.length,
      page: 1,
      hasMore: (conv.total || conv.messages.length) > 50
    }
    if (!(conv.pairKey in unreadCounts.value)) {
      unreadCounts.value[conv.pairKey] = 0
    }
  }
}

function switchToChat(chatId: string) {
  activeChat.value = chatId
  unreadCounts.value[chatId] = 0

  if (chatId === 'public') {
    activeTargetName.value = ''
  } else {
    const conv = privateConversations.value.find(c => c.pairKey === chatId)
    activeTargetName.value = conv?.displayName || ''

    // 如果消息未加载（比如之前只加载了联系人列表），从WebSocket分页获取
    if (!privateMessagesMap.value[chatId] && socket.value) {
      socket.value.emit('chat:get-private-history', { targetId: chatId, page: 1, pageSize: 50 }, (res: any) => {
        if (res?.success) {
          privateMessagesMap.value[chatId] = res.data || []
          pageInfoMap.value[chatId] = { total: res.total || 0, page: res.page || 1, hasMore: res.hasMore || false }
          nextTick(() => scrollToBottom())
        }
      })
    }
  }
  nextTick(() => scrollToBottom())
}

function sendPublicMessage() {
  if (!newMessage.value.trim() || !socket.value) return
  socket.value.emit('chat:send-public', { content: newMessage.value.trim() }, (res: any) => {
    if (!res?.success) alert(res?.error || '发送失败')
  })
  newMessage.value = ''
}

function deleteMessage(messageId: string) {
  if (!socket.value) return
  socket.value.emit('chat:delete', { messageId }, (res: any) => {
    if (!res?.success) alert(res?.error || '删除失败')
  })
}

function clearPublicMessages() {
  if (!confirm('确定清空所有群聊消息？')) return
  if (!socket.value) return
  socket.value.emit('chat:clear-public', {}, (res: any) => {
    if (!res?.success) alert(res?.error || '清空失败')
  })
}

function scrollToBottom() {
  nextTick(() => {
    // 使用 requestAnimationFrame 确保 DOM 完全渲染后再滚动
    requestAnimationFrame(() => {
      if (chatContainer.value) {
        chatContainer.value.scrollTop = chatContainer.value.scrollHeight
      }
    })
  })
}

// 加载更多消息
function loadMore() {
  if (loadingMore.value) return
  const chatId = activeChat.value
  const info = pageInfoMap.value[chatId]
  if (!info || !info.hasMore || !socket.value) return

  const nextPage = info.page + 1
  loadingMore.value = true

  const container = chatContainer.value
  const prevScrollHeight = container?.scrollHeight || 0

  if (chatId === 'public') {
    socket.value.emit('chat:load-more-public', { page: nextPage, pageSize: 50 }, (res: any) => {
      loadingMore.value = false
      if (res?.success) {
        publicMessages.value = [...(res.data || []), ...publicMessages.value]
        pageInfoMap.value['public'] = { total: res.total || 0, page: res.page || nextPage, hasMore: res.hasMore || false }
        nextTick(() => {
          if (container) {
            container.scrollTop = container.scrollHeight - prevScrollHeight
          }
        })
      }
    })
  } else {
    socket.value.emit('chat:load-more-private', { targetId: chatId, page: nextPage, pageSize: 50 }, (res: any) => {
      loadingMore.value = false
      if (res?.success) {
        const existing = privateMessagesMap.value[chatId] || []
        privateMessagesMap.value[chatId] = [...(res.data || []), ...existing]
        pageInfoMap.value[chatId] = { total: res.total || 0, page: res.page || nextPage, hasMore: res.hasMore || false }
        nextTick(() => {
          if (container) {
            container.scrollTop = container.scrollHeight - prevScrollHeight
          }
        })
      }
    })
  }
}

// 滚动到顶部时自动加载更多
function onScroll() {
  const el = chatContainer.value
  if (!el || loadingMore.value || !hasMoreMessages.value) return
  if (el.scrollTop <= 30) {
    loadMore()
  }
}

function formatTime(t: string) {
  if (!t) return ''
  const d = new Date(t)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

onMounted(() => { initWebSocket() })
onUnmounted(() => { if (socket.value) socket.value.disconnect() })
</script>

<style scoped>
.bb-chat-admin {
  max-width: 1000px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 120px);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  flex-shrink: 0;
}
.page-header h1 {
  font-size: 22px;
  font-weight: 600;
  color: #e0e0e0;
  margin: 0;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ws-status {
  font-size: 12px;
  color: #888;
}
.ws-status.connected {
  color: #00ff88;
}
.bb-btn {
  background: transparent;
  border: 1px solid #00ff8844;
  color: #00ff88;
  padding: 7px 18px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
}
.bb-btn:hover {
  background: #00ff8822;
}
.bb-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.bb-btn-danger {
  border-color: #ff4444;
  color: #ff4444;
}
.bb-btn-danger:hover {
  background: #ff444422;
}

.chat-layout {
  display: flex;
  flex: 1;
  gap: 0;
  border: 1px solid #00ff8818;
  border-radius: 12px;
  overflow: hidden;
  min-height: 0;
}

.chat-sidebar {
  width: 240px;
  flex-shrink: 0;
  background: #0c0c26;
  border-right: 1px solid #00ff8812;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 6px 0;
}
.chat-sidebar::-webkit-scrollbar {
  width: 4px;
}
.chat-sidebar::-webkit-scrollbar-thumb {
  background: #00ff8833;
  border-radius: 2px;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  border-left: 3px solid transparent;
}
.sidebar-item:hover {
  background: #00ff8806;
}
.sidebar-item.active {
  background: #00ff8810;
  border-left-color: #00ff88;
}

.sidebar-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #4488ff, #2266dd);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  flex-shrink: 0;
}
.public-avatar {
  background: linear-gradient(135deg, #00ff88, #00cc66);
  color: #1a1a3e;
  font-size: 18px;
}

.sidebar-info {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.sidebar-name {
  font-size: 13px;
  font-weight: 500;
  color: #e0e0e0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sidebar-preview {
  font-size: 11px;
  color: #555;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-divider {
  padding: 10px 14px 6px;
  font-size: 11px;
  color: #444;
  text-transform: uppercase;
  letter-spacing: 1px;
  border-top: 1px solid #00ff8810;
  margin-top: 4px;
}

.sidebar-empty {
  text-align: center;
  color: #555;
  padding: 30px 0;
  font-size: 12px;
}

.unread-badge {
  background: #ff4444;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  min-width: 20px;
  height: 18px;
  line-height: 18px;
  text-align: center;
  border-radius: 9px;
  padding: 0 6px;
  flex-shrink: 0;
  animation: badgePulse 0.3s ease-out;
}
@keyframes badgePulse {
  0% { transform: scale(1.4); }
  100% { transform: scale(1); }
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #0f0f2e;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #00ff8812;
  flex-shrink: 0;
}
.chat-title {
  font-size: 15px;
  font-weight: 500;
  color: #e0e0e0;
}
.back-btn {
  background: transparent;
  border: 1px solid #00ff8833;
  color: #00ff88;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}
.back-btn:hover {
  background: #00ff8815;
}

.chat-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.chat-container::-webkit-scrollbar {
  width: 5px;
}
.chat-container::-webkit-scrollbar-thumb {
  background: #00ff8818;
  border-radius: 3px;
}

/* 加载更多 */
.load-more-area {
  display: flex;
  justify-content: center;
  padding: 8px 0 14px;
}
.load-more-btn {
  background: transparent;
  border: 1px solid #00ff8822;
  color: #00ff8888;
  padding: 6px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}
.load-more-btn:hover:not(:disabled) {
  background: #00ff8810;
  color: #00ff88;
  border-color: #00ff8844;
}
.load-more-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 消息动画 */
.msg-enter-active {
  transition: all 0.35s cubic-bezier(0.25, 0.8, 0.25, 1.2);
}
.msg-leave-active {
  transition: all 0.2s ease-in;
}
.msg-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
}
.msg-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.chat-message {
  display: flex;
  gap: 10px;
  padding: 6px 0;
  align-items: flex-start;
}
.chat-message.mine {
  flex-direction: row-reverse;
}

.msg-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: linear-gradient(135deg, #00ff88, #00cc66);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: #1a1a3e;
  flex-shrink: 0;
}
.chat-message.mine .msg-avatar {
  background: linear-gradient(135deg, #4488ff, #2266dd);
}

.msg-content {
  max-width: 65%;
}
.msg-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
}
.msg-name {
  font-size: 12px;
  font-weight: 500;
  color: #ccc;
}
.msg-role {
  font-size: 10px;
  color: #00ff88;
  background: #00ff8815;
  padding: 0 5px;
  border-radius: 3px;
}
.msg-time {
  font-size: 10px;
  color: #555;
}
.msg-text {
  font-size: 13px;
  color: #ccc;
  line-height: 1.5;
  background: #00ff8808;
  padding: 8px 12px;
  border-radius: 10px;
  display: inline-block;
  word-break: break-word;
}
.chat-message.mine .msg-text {
  background: #4488ff12;
}
.msg-delete {
  opacity: 0;
  background: none;
  border: none;
  color: #ff4444;
  cursor: pointer;
  font-size: 12px;
  padding: 4px;
  transition: opacity 0.2s;
}
.chat-message:hover .msg-delete {
  opacity: 1;
}

.empty-chat {
  text-align: center;
  color: #555;
  padding: 80px 0;
  font-size: 13px;
}

.chat-input {
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid #00ff8812;
  flex-shrink: 0;
}
.bb-input {
  background: #0a0a1a;
  border: 1px solid #00ff8818;
  color: #e0e0e0;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  flex: 1;
  outline: none;
  transition: border-color 0.2s;
}
.bb-input:focus {
  border-color: #00ff8866;
}
.bb-input::placeholder {
  color: #444;
}
</style>
