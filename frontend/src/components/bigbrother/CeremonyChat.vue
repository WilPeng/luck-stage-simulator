<template>
  <div class="ceremony-chat">
    <div class="cc-title">{{ title }}</div>
    <div class="cc-body" ref="bodyEl">
      <div v-if="loading" class="cc-loading">加载中…</div>
      <div v-else-if="hasMore" class="cc-loadmore" @click="loadMore">↑ 加载更早的消息</div>
      <div v-for="m in messages" :key="m.id" class="cc-msg"
        :class="{ system: m.senderId === 'system' }">
        <template v-if="m.senderId === 'system'">
          <div class="cc-system">{{ m.content }}</div>
        </template>
        <template v-else>
          <BBAvatar :name="m.senderName" :avatar="m.senderAvatar" size="sm" />
          <div class="cc-bubble-wrap">
            <div class="cc-sender">{{ m.senderName }} <span class="cc-time">{{ fmtTime(m.createdAt) }}</span></div>
            <div class="cc-bubble">{{ m.content }}</div>
          </div>
        </template>
      </div>
      <div v-if="!loading && !messages.length" class="cc-empty">{{ emptyText }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useHouseSocket, type HouseMessage } from '../../composables/useHouseSocket'
import BBAvatar from './BBAvatar.vue'

const props = withDefaults(defineProps<{
  roomId: string
  title?: string
  emptyText?: string
}>(), {
  title: '💬 宣布记录',
  emptyText: '暂无消息'
})

const house = useHouseSocket()
const messages = ref<HouseMessage[]>([])
const hasMore = ref(true)
const loading = ref(false)
const bodyEl = ref<HTMLElement | null>(null)

function fmtTime(t: string) {
  if (!t) return ''
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function scrollToBottom() {
  requestAnimationFrame(() => { if (bodyEl.value) bodyEl.value.scrollTop = bodyEl.value.scrollHeight })
}

house.onHistory.value = (data: any) => {
  if (data.roomId !== props.roomId) return
  messages.value = data.messages || []
  hasMore.value = (data.messages || []).length >= 50
  loading.value = false
  scrollToBottom()
}
house.onNewMessage.value = (data: any) => {
  if (data.roomId !== props.roomId) return
  messages.value = [...messages.value, data.message]
  scrollToBottom()
}
house.onOlderMessages.value = (data: any) => {
  if (data.roomId !== props.roomId) return
  if (data.messages && data.messages.length) {
    messages.value = [...data.messages, ...messages.value]
  }
  if (!data.messages || data.messages.length < 50) hasMore.value = false
  loading.value = false
}

function loadMore() {
  if (loading.value || !messages.value.length) return
  loading.value = true
  house.loadMore(props.roomId, messages.value[0].createdAt)
}
</script>

<style scoped>
.ceremony-chat { background: #0f0f2e; border: 1px solid #ffaa0033; border-radius: 12px; padding: 14px; }
.cc-title { font-size: 14px; font-weight: 700; color: #ffaa00; margin-bottom: 10px; }
.cc-body { display: flex; flex-direction: column; gap: 10px; max-height: 320px; overflow-y: auto; }
.cc-loading, .cc-loadmore { text-align: center; font-size: 12px; color: #00ff88; cursor: pointer; }
.cc-loadmore:hover { text-decoration: underline; }
.cc-empty { text-align: center; color: #666; font-size: 13px; padding: 16px 0; }
.cc-msg { display: flex; gap: 8px; align-items: flex-start; }
.cc-msg.system { justify-content: center; }
.cc-system { font-size: 11px; color: #888; background: #ffffff06; padding: 2px 10px; border-radius: 10px; }
.cc-bubble-wrap { flex: 1; min-width: 0; }
.cc-sender { font-size: 12px; color: #ffaa00; font-weight: 600; margin-bottom: 2px; }
.cc-time { color: #666; font-weight: 400; margin-left: 6px; }
.cc-bubble { font-size: 14px; color: #ddd; background: #ffffff08; border-radius: 8px; padding: 8px 12px; line-height: 1.5; word-break: break-word; }
</style>
