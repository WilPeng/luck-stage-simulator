import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ChatMessage } from '../types/chat'
import {
  getChatMessages as apiGetChatMessages,
  sendChatMessage as apiSendChatMessage,
  deleteChatMessage as apiDeleteChatMessage,
  clearChatMessages as apiClearChatMessages,
  getUnreadChatCount as apiGetUnreadChatCount
} from '../services/api'

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(50)
  const loading = ref(false)
  const unreadCount = ref(0)
  const lastFetchTime = ref<string>(new Date().toISOString())

  // 获取聊天消息列表
  async function fetchMessages(pageNum: number = 1, size: number = 50, keyword: string = ''): Promise<void> {
    loading.value = true
    try {
      const result = await apiGetChatMessages({ page: pageNum, pageSize: size, keyword })
      messages.value = result.list
      total.value = result.total
      page.value = result.page
      pageSize.value = result.pageSize
      lastFetchTime.value = new Date().toISOString()
    } catch (e) {
      messages.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  }

  // 加载更多消息（分页）
  async function loadMore(keyword: string = ''): Promise<void> {
    if (messages.value.length >= total.value) return
    
    loading.value = true
    try {
      const nextPage = page.value + 1
      const result = await apiGetChatMessages({ page: nextPage, pageSize: pageSize.value, keyword })
      messages.value = [...messages.value, ...result.list]
      page.value = nextPage
    } catch (e) {
      console.error('加载更多消息失败', e)
    } finally {
      loading.value = false
    }
  }

  // 发送消息
  async function sendMessage(content: string): Promise<boolean> {
    try {
      await apiSendChatMessage(content)
      // 发送成功后刷新消息列表
      await fetchMessages(1, pageSize.value)
      return true
    } catch (e) {
      console.error('发送消息失败', e)
      return false
    }
  }

  // 删除消息
  async function deleteMessage(messageId: string): Promise<boolean> {
    try {
      await apiDeleteChatMessage(messageId)
      // 删除成功后从列表中移除
      messages.value = messages.value.filter(m => m.id !== messageId)
      total.value = Math.max(0, total.value - 1)
      return true
    } catch (e) {
      console.error('删除消息失败', e)
      return false
    }
  }

  // 清空所有消息（仅管理员）
  async function clearAllMessages(): Promise<boolean> {
    try {
      await apiClearChatMessages()
      messages.value = []
      total.value = 0
      return true
    } catch (e) {
      console.error('清空消息失败', e)
      return false
    }
  }

  // 获取未读消息数
  async function checkUnread(): Promise<void> {
    try {
      const count = await apiGetUnreadChatCount(lastFetchTime.value)
      unreadCount.value = count
    } catch (e) {
      unreadCount.value = 0
    }
  }

  // 重置未读数
  function resetUnread(): void {
    unreadCount.value = 0
    lastFetchTime.value = new Date().toISOString()
  }

  return {
    messages,
    total,
    page,
    pageSize,
    loading,
    unreadCount,
    lastFetchTime,
    fetchMessages,
    loadMore,
    sendMessage,
    deleteMessage,
    clearAllMessages,
    checkUnread,
    resetUnread
  }
})
