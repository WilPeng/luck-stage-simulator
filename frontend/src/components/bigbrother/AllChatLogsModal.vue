<template>
  <Teleport to="body">
    <div v-if="open" class="acl-overlay" @click.self="$emit('close')">
      <div class="acl-panel">
        <div class="acl-header">
          <div>
            <div class="acl-title">📜 全部聊天记录</div>
            <div class="acl-sub">冠军诞生后由管理员公开 · 所有房间、私聊与系统消息</div>
          </div>
          <button class="acl-close" @click="$emit('close')">×</button>
        </div>

        <div class="acl-toolbar">
          <select v-model="roomFilter" class="acl-select">
            <option value="">全部频道</option>
            <option v-for="r in roomOptions" :key="r.value" :value="r.value">{{ r.label }}</option>
          </select>
          <input v-model="keyword" class="acl-search" placeholder="搜索发送者 / 内容…" />
          <span class="acl-count">{{ filtered.length }} / {{ messages.length }} 条</span>
          <button class="acl-btn" :disabled="loading" @click="load">{{ loading ? '加载中…' : '刷新' }}</button>
        </div>

        <div class="acl-list">
          <div v-if="loading && !messages.length" class="acl-empty">加载中…</div>
          <div v-else-if="!filtered.length" class="acl-empty">暂无聊天记录</div>
          <div
            v-for="m in filtered"
            :key="m.id"
            class="acl-msg"
            :class="{ system: m.senderId === 'system', admin: m.senderRole === 'admin' }"
          >
            <div class="acl-meta">
              <span class="acl-room">{{ channelLabel(m) }}</span>
              <BBAvatar :name="m.senderName || '系统'" :avatar="m.senderAvatar" size="sm" />
              <span class="acl-sender" :class="{ admin: m.senderRole === 'admin' }">{{ m.senderName || '系统' }}</span>
              <span class="acl-time">{{ fmtTime(m.createdAt) }}</span>
            </div>
            <div class="acl-content">{{ m.content }}</div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { bbGetAllChatLogs } from '../../services/bbHouseApi'
import BBAvatar from './BBAvatar.vue'

const props = defineProps<{ open: boolean }>()
defineEmits<{ (e: 'close'): void }>()

const messages = ref<any[]>([])
const loading = ref(false)
const roomFilter = ref('')
const keyword = ref('')

const roomOptions = computed(() => {
  const map = new Map<string, string>()
  for (const m of messages.value) {
    if (m.chatType === 'private') {
      map.set('__private__', '私聊')
    } else if (m.roomId) {
      map.set(m.roomId, `${m.roomIcon || '🏠'} ${m.roomName || m.roomId}`)
    } else if (m.chatType === 'public') {
      map.set('__public__', '公共聊天')
    }
  }
  return Array.from(map.entries()).map(([value, label]) => ({ value, label }))
})

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return messages.value.filter(m => {
    if (roomFilter.value === '__private__' && m.chatType !== 'private') return false
    if (roomFilter.value === '__public__' && m.chatType !== 'public') return false
    if (roomFilter.value && roomFilter.value !== '__private__' && roomFilter.value !== '__public__' && m.roomId !== roomFilter.value) return false
    if (!kw) return true
    return String(m.senderName || '').toLowerCase().includes(kw) || String(m.content || '').toLowerCase().includes(kw)
  })
})

function channelLabel(m: any) {
  if (m.senderId === 'system') return '系统'
  if (m.chatType === 'private') return `私聊 → ${m.targetName || ''}`
  if (m.roomId) return `${m.roomIcon || '🏠'} ${m.roomName || m.roomId}`
  return '公共'
}

function fmtTime(t: string) {
  if (!t) return ''
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

async function load() {
  loading.value = true
  try {
    const res = await bbGetAllChatLogs()
    messages.value = res?.messages || []
  } catch {
    messages.value = []
  } finally {
    loading.value = false
  }
}

watch(() => props.open, (v) => {
  if (v) load()
})
</script>

<style scoped>
.acl-overlay {
  position: fixed; inset: 0; z-index: 2000;
  background: rgba(0, 0, 0, 0.72);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.acl-panel {
  width: min(1100px, 96vw);
  height: min(88vh, 900px);
  display: flex; flex-direction: column;
  background: #1b1130;
  border: 1px solid #b39bff55;
  border-radius: 14px;
  box-shadow: 0 24px 80px #000000aa;
  overflow: hidden;
}
.acl-header {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid #ffffff10;
  background: linear-gradient(135deg, #241640, #1b1130);
}
.acl-title { font-size: 18px; font-weight: 700; color: #ece7fb; }
.acl-sub { font-size: 12px; color: #8f83b8; margin-top: 3px; }
.acl-close { background: none; border: none; color: #8f83b8; font-size: 26px; cursor: pointer; line-height: 1; }
.acl-close:hover { color: #ece7fb; }
.acl-toolbar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 10px 16px; border-bottom: 1px solid #ffffff10; background: #160d28;
}
.acl-select, .acl-search {
  background: #120a22; border: 1px solid #b39bff33; border-radius: 8px;
  color: #ece7fb; font-size: 13px; padding: 7px 10px; outline: none;
}
.acl-search { flex: 1; min-width: 180px; }
.acl-select:focus, .acl-search:focus { border-color: #b39bff; }
.acl-count { font-size: 12px; color: #8f83b8; white-space: nowrap; }
.acl-btn {
  padding: 7px 16px; border-radius: 8px; cursor: pointer; font-size: 13px;
  background: #b39bff18; border: 1px solid #b39bff66; color: #b39bff;
}
.acl-btn:hover:not(:disabled) { background: #b39bff28; }
.acl-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.acl-list { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
.acl-empty { text-align: center; color: #6b5f92; font-size: 14px; padding: 40px 0; }
.acl-msg {
  padding: 9px 12px; border-radius: 10px;
  background: #ffffff05; border: 1px solid #ffffff10;
}
.acl-msg.admin { border-color: #e6c98844; background: #e6c98808; }
.acl-msg.system { border-color: #4488ff33; background: #4488ff08; }
.acl-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.acl-room {
  font-size: 11px; color: #c9a6ff; background: #b39bff18;
  border: 1px solid #b39bff33; border-radius: 6px; padding: 1px 8px;
}
.acl-sender { font-size: 13px; font-weight: 600; color: #ece7fb; }
.acl-sender.admin { color: #e6c988; }
.acl-time { font-size: 11px; color: #6b5f92; margin-left: auto; }
.acl-content { margin-top: 5px; font-size: 14px; color: #ddd; line-height: 1.55; word-break: break-word; white-space: pre-wrap; }
</style>
