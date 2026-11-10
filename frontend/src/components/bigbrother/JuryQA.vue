<template>
  <div class="jury-chat">
    <div class="jc-head">
      <div>
        <div class="jc-title">🎤 陪审团问答室</div>
        <div class="jc-sub">冠军投票前，陪审团与决赛二人进行问答</div>
      </div>
      <div class="jc-phase-badge" :class="room.phase">{{ room.phaseName || phaseLabel }}</div>
    </div>

    <!-- 管理员控制台 -->
    <div v-if="isAdmin" class="jc-admin">
      <div class="jc-admin-row">
        <span class="jc-admin-label">环节</span>
        <div class="jc-phase-btns">
          <button
            v-for="p in PHASES"
            :key="p.id"
            class="jc-phase-btn"
            :class="{ active: room.phase === p.id }"
            @click="setPhase(p.id)"
          >{{ p.label }}</button>
        </div>
      </div>

      <div v-if="room.phase === 'qa'" class="jc-admin-row order-row">
        <span class="jc-admin-label">提问顺序</span>
        <div class="jc-order-list">
          <div
            v-for="(j, i) in orderDraft"
            :key="j.playerId"
            class="jc-order-item"
            :class="{ turn: room.currentTurn?.playerId === j.playerId }"
          >
            <span class="jc-order-idx">{{ i + 1 }}</span>
            <span class="jc-order-name">{{ j.name }}</span>
            <button class="jc-mini" :disabled="i === 0" @click="moveOrder(i, -1)">↑</button>
            <button class="jc-mini" :disabled="i === orderDraft.length - 1" @click="moveOrder(i, 1)">↓</button>
          </div>
          <span v-if="!orderDraft.length" class="jc-order-empty">暂无陪审团成员</span>
        </div>
        <div class="jc-order-actions">
          <button class="jc-mini save" @click="saveOrder">保存顺序</button>
          <button class="jc-mini" @click="nextTurn">下一位</button>
        </div>
      </div>
      <div v-if="room.phase === 'qa' && room.currentTurn" class="jc-turn-hint">
        当前轮到：<strong>{{ room.currentTurn.name }}</strong> 提问
      </div>
    </div>

    <!-- 消息区 -->
    <div ref="messagesEl" class="jc-messages">
      <div v-if="!room.messages.length" class="jc-empty">
        <span class="jc-empty-icon">💬</span>
        <span>{{ emptyHint }}</span>
      </div>

      <div v-for="m in room.messages" :key="m.id" class="jc-msg-wrap">
        <!-- 管理员消息 -->
        <div v-if="m.senderRole === 'admin'" class="jc-admin-msg">
          <span class="jc-admin-msg-tag">管理员</span>
          <span class="jc-admin-msg-text">{{ m.content }}</span>
        </div>

        <!-- 决赛选手消息 / 回答（右侧） -->
        <div v-else-if="m.senderRole === 'finalist'" class="jc-row right">
          <div class="jc-bubble finalist" :class="{ answer: m.type === 'answer' }">
            <div class="jc-meta">
              <span class="jc-name">{{ m.senderName }}</span>
              <span class="jc-role finalist">{{ m.type === 'answer' ? '回答' : '决赛选手' }}</span>
              <span class="jc-time">{{ fmt(m.createdAt) }}</span>
            </div>
            <!-- 回答引用 -->
            <div v-if="m.type === 'answer' && m.replyToContent" class="jc-quote">
              <div class="jc-quote-head">引用 {{ m.replyToName }}</div>
              <div class="jc-quote-body">{{ m.replyToContent }}</div>
            </div>
            <div class="jc-text">{{ m.content }}</div>
          </div>
          <BBAvatar :name="m.senderName" size="sm" />
        </div>

        <!-- 陪审团提问（左侧） -->
        <div v-else class="jc-row left">
          <BBAvatar :name="m.senderName" size="sm" />
          <div class="jc-bubble jury">
            <div class="jc-meta">
              <span class="jc-name">{{ m.senderName }}</span>
              <span class="jc-role">陪审团</span>
              <span class="jc-time">{{ fmt(m.createdAt) }}</span>
            </div>
            <div class="jc-text">{{ m.content }}</div>
            <div v-if="isFinalist && room.phase === 'qa'" class="jc-answer-row">
              <button class="jc-answer-btn" @click="startReply(m)">回答</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 输入区 -->
    <div class="jc-composer">
      <div v-if="replyTarget" class="jc-reply-preview">
        <div class="jc-reply-head">
          <span>引用 {{ replyTarget.senderName }} 的提问</span>
          <button class="jc-reply-x" @click="replyTarget = null">×</button>
        </div>
        <div class="jc-reply-text">{{ replyTarget.content }}</div>
      </div>
      <div class="jc-input-row">
        <input
          ref="inputEl"
          v-model="draft"
          class="jc-input"
          :placeholder="placeholder"
          :disabled="!canSend"
          @keyup.enter="send"
        />
        <button class="jc-send" :disabled="!canSend || !draft.trim() || sending" @click="send">
          {{ sending ? '发送中…' : sendLabel }}
        </button>
      </div>
      <div v-if="hint" class="jc-hint">{{ hint }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue'
import {
  bbGetJuryQA, bbSendJuryQAMessage, bbAnswerJuryQuestion,
  bbSetJuryQAPhase, bbSetJuryQAOrder, bbNextJuryQATurn
} from '../../services/bbApi'
import { useBbRefresh } from '../../composables/useBbRefresh'
import { useBbAuthStore } from '../../stores/bbAuthStore'
import BBAvatar from './BBAvatar.vue'

type Phase = 'opening' | 'qa' | 'closing'
interface JuryOrderItem { playerId: string; name: string }

const props = defineProps<{ isJury?: boolean; isFinalist?: boolean; isAdmin?: boolean }>()

const PHASES: { id: Phase; label: string }[] = [
  { id: 'opening', label: '① 决赛开场发言' },
  { id: 'qa', label: '② 陪审团轮流提问' },
  { id: 'closing', label: '③ 决赛总结发言' }
]

const authStore = useBbAuthStore()
const myId = computed(() => authStore.currentUser?.id || '')

const room = ref<{
  roundId: string
  phase: Phase
  phaseName: string
  juryOrder: JuryOrderItem[]
  turnIndex: number
  currentTurn: JuryOrderItem | null
  messages: any[]
}>({
  roundId: '',
  phase: 'opening',
  phaseName: '决赛开场发言',
  juryOrder: [],
  turnIndex: 0,
  currentTurn: null,
  messages: []
})

const draft = ref('')
const sending = ref(false)
const replyTarget = ref<any | null>(null)
const messagesEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)

const orderDraft = ref<JuryOrderItem[]>([])
const orderDirty = ref(false)

const phaseLabel = computed(() => PHASES.find(p => p.id === room.value.phase)?.label || '')

const isMyTurn = computed(() => {
  if (!props.isJury) return false
  const cur = room.value.currentTurn
  return !!cur && cur.playerId === myId.value
})

const canSend = computed(() => {
  if (props.isAdmin) return true
  if (room.value.phase === 'opening' || room.value.phase === 'closing') {
    return !!props.isFinalist
  }
  // qa
  if (props.isFinalist) return true
  if (props.isJury) return isMyTurn.value
  return false
})

const sendLabel = computed(() => {
  if (replyTarget.value) return '回答'
  if (props.isJury) return '提问'
  return '发送'
})

const placeholder = computed(() => {
  if (props.isAdmin) return '以管理员身份发言（可选）…'
  if (room.value.phase === 'opening' || room.value.phase === 'closing') {
    return props.isFinalist ? '输入你的发言…' : '本环节仅决赛二人发言'
  }
  if (props.isFinalist) {
    return replyTarget.value ? '输入你的回答…' : '主动发言，或点击某条提问旁的「回答」…'
  }
  if (props.isJury) {
    return isMyTurn.value ? '轮到你提问…' : '等待轮到你提问'
  }
  return '只有决赛二人和陪审团可以发言'
})

const hint = computed(() => {
  if (props.isAdmin) return ''
  if (room.value.phase === 'opening') return '第一阶段：两名 F2 分别发言，陪审团暂不能发言'
  if (room.value.phase === 'closing') return '第三阶段：两名 F2 分别总结发言，陪审团暂不能发言'
  if (props.isJury && !isMyTurn.value) {
    return room.value.currentTurn ? `当前轮到 ${room.value.currentTurn.name} 提问` : '等待陪审团提问'
  }
  return ''
})

const emptyHint = computed(() => {
  if (room.value.phase === 'opening') return '等待决赛二人开场发言'
  if (room.value.phase === 'closing') return '等待决赛二人总结发言'
  return '暂无消息，陪审团可以按顺序开始提问'
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
    const res: any = await bbGetJuryQA()
    room.value = {
      roundId: res?.roundId || '',
      phase: res?.phase || 'opening',
      phaseName: res?.phaseName || '',
      juryOrder: res?.juryOrder || [],
      turnIndex: res?.turnIndex || 0,
      currentTurn: res?.currentTurn || null,
      messages: res?.messages || []
    }
    if (!orderDirty.value) orderDraft.value = [...(res?.juryOrder || [])]
  } catch {
    room.value.messages = []
  }
  await scrollToBottom()
}

function startReply(m: any) {
  if (!props.isFinalist || room.value.phase !== 'qa') return
  replyTarget.value = m
  nextTick(() => inputEl.value?.focus())
}

async function send() {
  const text = draft.value.trim()
  if (!text || sending.value || !canSend.value) return
  sending.value = true
  try {
    if (replyTarget.value && props.isFinalist) {
      await bbAnswerJuryQuestion(replyTarget.value.id, text)
      replyTarget.value = null
    } else {
      await bbSendJuryQAMessage(text)
    }
    draft.value = ''
    await load()
  } catch (e: any) {
    alert(e?.message || '发送失败')
  } finally {
    sending.value = false
  }
}

async function setPhase(phase: Phase) {
  try {
    await bbSetJuryQAPhase(phase)
    replyTarget.value = null
    orderDirty.value = false
    await load()
  } catch (e: any) {
    alert(e?.message || '切换环节失败')
  }
}

function moveOrder(idx: number, dir: number) {
  const j = idx + dir
  if (j < 0 || j >= orderDraft.value.length) return
  const arr = [...orderDraft.value]
  const tmp = arr[idx]
  arr[idx] = arr[j]
  arr[j] = tmp
  orderDraft.value = arr
  orderDirty.value = true
}

async function saveOrder() {
  try {
    await bbSetJuryQAOrder(orderDraft.value.map(j => j.playerId))
    orderDirty.value = false
    await load()
  } catch (e: any) {
    alert(e?.message || '保存顺序失败')
  }
}

async function nextTurn() {
  try {
    await bbNextJuryQATurn()
    await load()
  } catch (e: any) {
    alert(e?.message || '轮转失败')
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
  min-height: 360px;
}
.jc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid #ffffff10;
  background: linear-gradient(135deg, #241640, #1b1130);
}
.jc-title { font-size: 16px; font-weight: 700; color: #aa44ff; }
.jc-sub { font-size: 12px; color: #b3a6d6; margin-top: 2px; }
.jc-phase-badge {
  font-size: 12px; padding: 4px 12px; border-radius: 10px;
  background: #aa44ff18; border: 1px solid #aa44ff44; color: #c9a6ff; white-space: nowrap;
}
.jc-phase-badge.opening { background: #4488ff18; border-color: #4488ff55; color: #7fb0ff; }
.jc-phase-badge.qa { background: #aa44ff18; border-color: #aa44ff55; color: #c9a6ff; }
.jc-phase-badge.closing { background: #e6c98818; border-color: #e6c98855; color: #e6c988; }

/* 管理员控制台 */
.jc-admin {
  padding: 12px 16px;
  border-bottom: 1px solid #ffffff10;
  background: #160d28;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.jc-admin-row { display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap; }
.jc-admin-label { font-size: 12px; color: #8f83b8; min-width: 56px; padding-top: 4px; }
.jc-phase-btns { display: flex; gap: 6px; flex-wrap: wrap; }
.jc-phase-btn {
  padding: 4px 12px; border-radius: 8px; cursor: pointer; font-size: 12px;
  background: #2a1a4a; border: 1px solid #4a3d6e; color: #cfc4ea;
}
.jc-phase-btn.active { border-color: #aa44ff; color: #c9a6ff; background: #aa44ff22; }
.jc-order-list { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 200px; }
.jc-order-item {
  display: flex; align-items: center; gap: 8px; font-size: 12px; color: #cfc4ea;
  padding: 3px 8px; border-radius: 6px; background: #ffffff06;
}
.jc-order-item.turn { background: #aa44ff22; color: #e3d1ff; }
.jc-order-idx { width: 16px; color: #8f83b8; }
.jc-order-name { flex: 1; }
.jc-order-empty { font-size: 12px; color: #6b5f92; }
.jc-order-actions { display: flex; gap: 6px; }
.jc-mini {
  background: #2a1a4a; border: 1px solid #4a3d6e; color: #cfc4ea;
  border-radius: 4px; cursor: pointer; padding: 2px 8px; font-size: 11px;
}
.jc-mini:disabled { opacity: 0.3; cursor: not-allowed; }
.jc-mini.save { border-color: #aa44ff88; color: #c9a6ff; }
.jc-turn-hint { font-size: 12px; color: #c9a6ff; }
.jc-turn-hint strong { color: #fff; }

/* 消息区 */
.jc-messages {
  flex: 1;
  max-height: 420px;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.jc-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; color: #6b5f92; font-size: 13px; padding: 48px 0;
}
.jc-empty-icon { font-size: 28px; }
.jc-msg-wrap { display: flex; flex-direction: column; }
.jc-row { display: flex; align-items: flex-end; gap: 8px; }
.jc-row.left { justify-content: flex-start; }
.jc-row.right { justify-content: flex-end; }
.jc-bubble {
  max-width: 78%;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid #ffffff14;
  background: #2a1a4a;
}
.jc-bubble.jury { border-bottom-left-radius: 4px; border-color: #aa44ff33; }
.jc-bubble.finalist { border-bottom-right-radius: 4px; background: #b39bff18; border-color: #b39bff44; }
.jc-meta { display: flex; align-items: center; gap: 6px; font-size: 11px; margin-bottom: 4px; }
.jc-name { color: #ece7fb; font-weight: 600; }
.jc-role { color: #aa44ff; background: #aa44ff18; border-radius: 6px; padding: 0 6px; }
.jc-role.finalist { color: #b39bff; background: #b39bff18; }
.jc-time { color: #6b5f92; margin-left: auto; }
.jc-text { font-size: 14px; line-height: 1.55; color: #f0ebff; white-space: pre-wrap; word-break: break-word; }
.jc-quote {
  margin-bottom: 8px; padding: 8px 10px; border-radius: 8px;
  background: #120a22; border-left: 3px solid #b39bff; 
}
.jc-quote-head { font-size: 11px; color: #b39bff; margin-bottom: 2px; }
.jc-quote-body { font-size: 12px; color: #a99bd0; white-space: pre-wrap; word-break: break-word; }
.jc-answer-row { display: flex; justify-content: flex-end; margin-top: 8px; }
.jc-answer-btn {
  padding: 3px 12px; border-radius: 6px; cursor: pointer; font-size: 11px;
  background: #b39bff18; border: 1px solid #b39bff66; color: #b39bff;
}
.jc-answer-btn:hover { background: #b39bff33; }

.jc-admin-msg {
  align-self: center; max-width: 80%; text-align: center;
  font-size: 12px; color: #8f83b8; background: #ffffff08;
  border: 1px dashed #ffffff22; border-radius: 10px; padding: 6px 12px;
}
.jc-admin-msg-tag { color: #e6c988; font-weight: 600; margin-right: 6px; }

/* 输入区 */
.jc-composer { border-top: 1px solid #ffffff10; padding: 12px 14px; background: #160d28; }
.jc-reply-preview {
  margin-bottom: 8px; padding: 8px 10px; border-radius: 8px;
  background: #120a22; border: 1px solid #b39bff33;
}
.jc-reply-head { display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: #b39bff; }
.jc-reply-x { background: none; border: none; color: #8f83b8; cursor: pointer; font-size: 14px; }
.jc-reply-text { font-size: 12px; color: #a99bd0; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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
.jc-hint { font-size: 11px; color: #8f83b8; margin-top: 8px; }
</style>
