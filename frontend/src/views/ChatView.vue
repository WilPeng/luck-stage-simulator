<template>
  <div class="chat-room">
    <div class="chat-header">
      <h3 class="chat-title">乘风聊天室</h3>
      <div class="chat-actions">
        <t-input
          v-model="searchKeyword"
          placeholder="搜索消息..."
          clearable
          @change="handleSearch"
          style="width: 200px"
        />
        <t-button
          v-if="authStore.isAdmin"
          theme="danger"
          variant="outline"
          @click="handleClearAll"
        >
          清空聊天
        </t-button>
      </div>
    </div>

    <div class="chat-messages" ref="messagesContainer">
      <t-loading :loading="chatStore.loading && chatStore.messages.length === 0" text="加载中...">
        <div v-if="chatStore.messages.length === 0" class="empty-state">
          <t-icon name="chat" size="48px" />
          <p>暂无消息，快来聊天吧！</p>
        </div>
        <div v-else class="message-list">
          <div
            v-for="message in reversedMessages"
            :key="message.id"
            class="message-item"
            :class="{ 'is-mine': message.senderId === authStore.currentUser?.id }"
          >
            <div class="message-avatar">
              <t-avatar
                :image="getAvatarUrl(message.senderAvatar)"
                :alt="message.senderName"
                size="40px"
              >
                {{ message.senderName ? message.senderName.charAt(0) : '?' }}
              </t-avatar>
            </div>
            <div class="message-content">
              <div class="message-header">
                <span class="sender-name">{{ message.senderName }}</span>
                <t-tag
                  :theme="message.senderRole === 'admin' ? 'primary' : 'success'"
                  size="small"
                  variant="light"
                >
                  {{ message.senderRole === 'admin' ? '管理员' : '选手' }}
                </t-tag>
                <span class="message-time">{{ formatTime(message.createdAt) }}</span>
              </div>
              <div class="message-text">{{ message.content }}</div>
              <div class="message-actions" v-if="canDelete(message)">
                <t-button
                  theme="danger"
                  variant="text"
                  size="small"
                  @click="handleDelete(message.id)"
                >
                  删除
                </t-button>
              </div>
            </div>
          </div>
        </div>
      </t-loading>

      <div v-if="chatStore.messages.length < chatStore.total" class="load-more">
        <t-button
          theme="primary"
          variant="outline"
          :loading="chatStore.loading"
          @click="handleLoadMore"
        >
          加载更多
        </t-button>
      </div>
    </div>

    <div class="chat-input-area">
      <t-textarea
        v-model="inputMessage"
        placeholder="输入消息..."
        :autosize="{ minRows: 1, maxRows: 4 }"
        @keydown.enter.exact="handleSend"
      />
      <t-button
        theme="primary"
        :disabled="!inputMessage.trim()"
        :loading="sending"
        @click="handleSend"
      >
        发送
      </t-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useChatStore } from '../stores/chatStore'
import { useAuthStore } from '../stores/authStore'
import type { ChatMessage } from '../types/chat'

const chatStore = useChatStore()
const authStore = useAuthStore()

const messagesContainer = ref<HTMLElement | null>(null)
const inputMessage = ref('')
const searchKeyword = ref('')
const sending = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null

// 反转消息列表，让最新的消息在底部
const reversedMessages = computed(() => {
  return [...chatStore.messages].reverse()
})

// 获取头像URL
function getAvatarUrl(avatar?: string): string {
  if (!avatar) return ''
  // 如果是完整URL直接返回
  if (avatar.startsWith('http://') || avatar.startsWith('https://')) {
    return avatar
  }
  // 否则拼接服务器地址
  return `https://luck-stage-simulator.onrender.com${avatar}`
}

// 格式化时间
function formatTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`

  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 判断是否可以删除消息
function canDelete(message: ChatMessage): boolean {
  // 管理员可以删除任意消息
  if (authStore.isAdmin) return true
  // 选手只能删除自己的消息
  return message.senderId === authStore.currentUser?.id
}

// 发送消息
async function handleSend(e?: KeyboardEvent) {
  // 如果是回车键且按下了 Shift，则不发送（换行）
  if (e && e.shiftKey) return
  if (e) e.preventDefault()

  const content = inputMessage.value.trim()
  if (!content) return

  sending.value = true
  try {
    const success = await chatStore.sendMessage(content)
    if (success) {
      inputMessage.value = ''
      MessagePlugin.success('发送成功')
      scrollToBottom()
    } else {
      MessagePlugin.error('发送失败')
    }
  } catch (error) {
    MessagePlugin.error('发送失败')
  } finally {
    sending.value = false
  }
}

// 删除消息
async function handleDelete(messageId: string) {
  try {
    const success = await chatStore.deleteMessage(messageId)
    if (success) {
      MessagePlugin.success('删除成功')
    } else {
      MessagePlugin.error('删除失败')
    }
  } catch (error) {
    MessagePlugin.error('删除失败')
  }
}

// 清空所有消息
async function handleClearAll() {
  try {
    await chatStore.clearAllMessages()
    MessagePlugin.success('已清空所有消息')
  } catch (error) {
    MessagePlugin.error('清空失败')
  }
}

// 搜索消息
function handleSearch() {
  chatStore.fetchMessages(1, 50, searchKeyword.value)
}

// 加载更多
async function handleLoadMore() {
  await chatStore.loadMore(searchKeyword.value)
}

// 滚动到底部
function scrollToBottom() {
  if (messagesContainer.value) {
    setTimeout(() => {
      messagesContainer.value!.scrollTop = messagesContainer.value!.scrollHeight
    }, 100)
  }
}

// 轮询检查新消息
function startPolling() {
  pollTimer = setInterval(async () => {
    await chatStore.checkUnread()
    if (chatStore.unreadCount > 0) {
      await chatStore.fetchMessages(1, 50, searchKeyword.value)
      chatStore.resetUnread()
      scrollToBottom()
    }
  }, 10000) // 每10秒检查一次
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

onMounted(async () => {
  await chatStore.fetchMessages(1, 50, searchKeyword.value)
  scrollToBottom()
  startPolling()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<style lang="scss" scoped>
.chat-room {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 120px);
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;

  .chat-title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .chat-actions {
    display: flex;
    gap: 12px;
    align-items: center;

    :deep(.t-input) {
      background: rgba(255, 255, 255, 0.9);
    }
  }
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: #f9fafb;

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #9ca3af;

    p {
      margin-top: 12px;
      font-size: 14px;
    }
  }

  .message-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .message-item {
    display: flex;
    gap: 12px;
    animation: fadeIn 0.3s ease-in;

    &.is-mine {
      flex-direction: row-reverse;

      .message-content {
        align-items: flex-end;

        .message-text {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: #fff;
          border-radius: 12px 0 12px 12px;
        }

        .message-header {
          flex-direction: row-reverse;
        }
      }
    }

    .message-avatar {
      flex-shrink: 0;
    }

    .message-content {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-width: 60%;

      .message-header {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;

        .sender-name {
          font-weight: 600;
          color: #1f2937;
        }

        .message-time {
          color: #9ca3af;
          font-size: 12px;
        }
      }

      .message-text {
        padding: 10px 14px;
        background: #fff;
        border-radius: 0 12px 12px 12px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        word-break: break-word;
        white-space: pre-wrap;
        line-height: 1.5;
      }

      .message-actions {
        display: flex;
        gap: 8px;
      }
    }
  }

  .load-more {
    display: flex;
    justify-content: center;
    margin-top: 16px;
  }
}

.chat-input-area {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #e5e7eb;
  background: #fff;

  :deep(.t-textarea) {
    flex: 1;
  }

  .t-button {
    align-self: flex-end;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

// 移动端适配
@media (max-width: 768px) {
  .chat-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;

    .chat-actions {
      width: 100%;
      flex-direction: column;

      :deep(.t-input) {
        width: 100% !important;
      }
    }
  }

  .message-item {
    .message-content {
      max-width: 75% !important;
    }
  }
}
</style>
