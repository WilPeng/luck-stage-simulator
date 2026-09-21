<template>
  <div class="key-ceremony">
    <!-- 设置阶段：先选被提名者，再安排安全顺序 -->
    <template v-if="!keyCeremony">
      <div v-if="canSetup" class="kc-setup">
        <div class="kc-title">🔑 提名仪式 · 准备</div>
        <div class="kc-step">① 选择 {{ nomineeCount }} 名被提名者（点击选择）</div>
        <div class="kc-eligible">
          <button v-for="h in eligible" :key="h.id" class="kc-pick"
            :class="{ chosen: selectedNominees.includes(h.id) }"
            @click="toggleNominee(h.id)">{{ h.name }}</button>
        </div>
        <div class="kc-step">② 拖动/调整其余选手的揭晓顺序（即安全顺序）</div>
        <div class="kc-order">
          <div v-for="(id, i) in safeOrder" :key="id" class="kc-order-item">
            <span class="kc-idx">{{ i + 1 }}</span>
            <span class="kc-oname">{{ nameOf(id) }}</span>
            <button class="kc-arrow" :disabled="i === 0" @click="moveSafe(i, -1)">↑</button>
            <button class="kc-arrow" :disabled="i === safeOrder.length - 1" @click="moveSafe(i, 1)">↓</button>
          </div>
        </div>
        <button class="kc-submit" :disabled="selectedNominees.length !== nomineeCount || submitting" @click="submit">
          {{ submitting ? '提交中…' : '开始提名仪式' }}
        </button>
      </div>
      <div v-else class="kc-waiting">等待 HOH 开始提名仪式…</div>
    </template>

    <!-- 仪式阶段 -->
    <template v-else>
      <div class="kc-title">🔑 提名仪式 · 钥匙揭晓</div>

      <div class="kc-box">
        <div class="box-icon">📦</div>
        <div class="box-keys">
          <div v-for="(k, i) in keyCeremony.order" :key="k.playerId" class="kc-key"
            :class="{ drawn: i < keyCeremony.drawnCount, pop: i === keyCeremony.drawnCount - 1 }">
            <span v-if="i < (keyCeremony.announcedCount || 0)" class="kc-key-name">{{ k.playerName }}</span>
            <span v-else-if="i < keyCeremony.drawnCount" class="kc-key-name">🔑</span>
            <span v-else class="kc-key-lock">🔒</span>
          </div>
        </div>
      </div>

      <div class="kc-turn">
        {{ pendingAnnounce ? '等待宣布' : '当前抽钥匙' }}：<strong>{{ actorName }}</strong>
        （已抽 {{ keyCeremony.drawnCount }}/{{ keyCeremony.order.length }}）
      </div>

      <!-- 暂时危险名单 -->
      <div class="kc-risk">
        <div class="kc-risk-title">⚠️ 暂时危险（未被抽出钥匙，共 {{ atRisk.length }} 人）</div>
        <div class="kc-risk-list">
          <span v-for="p in atRisk" :key="p.playerId" class="kc-risk-chip">{{ p.playerName }}</span>
          <span v-if="!atRisk.length" class="kc-risk-empty">无</span>
        </div>
      </div>

      <!-- 待宣布：由抽出该钥匙的人宣布 -->
      <div v-if="pendingAnnounce" class="kc-announce">
        <template v-if="iAmActor">
          <div class="kc-revealed">🔑 你抽到的钥匙上写着：<strong>{{ pendingRevealed?.playerName }}</strong></div>
          <div class="kc-announce-form">
            <input v-model="announceText" class="kc-input" @keyup.enter="doAnnounce" />
            <button class="kc-btn" :disabled="announcing" @click="doAnnounce">{{ announcing ? '发送中…' : '宣布安全' }}</button>
          </div>
        </template>
        <div v-else class="kc-waiting">等待 {{ actorName }} 宣布…</div>
      </div>

      <!-- 抽钥匙 -->
      <div v-else-if="keyCeremony.drawnCount < keyCeremony.order.length" class="kc-draw">
        <button v-if="iAmActor" class="kc-btn kc-btn-draw" :disabled="drawing" @click="doDraw">
          {{ drawing ? '抽钥匙中…' : '🔑 从箱子中抽出一把钥匙' }}
        </button>
        <div v-else class="kc-waiting">等待 {{ actorName }} 抽钥匙…</div>
      </div>

      <div v-else class="kc-done">🔑 所有钥匙已抽完</div>

      <!-- 类聊天框：宣布记录 -->
      <div class="kc-chat">
        <div class="kc-chat-title">💬 宣布记录</div>
        <div class="kc-chat-body">
          <div v-for="(m, i) in keyCeremony.messages" :key="i" class="kc-msg">
            <BBAvatar :name="m.playerName" size="sm" />
            <div class="kc-msg-body">
              <div class="kc-sender">{{ m.playerName }}</div>
              <div class="kc-bubble">{{ m.text }}</div>
            </div>
          </div>
          <div v-if="!keyCeremony.messages?.length" class="kc-empty">暂无宣布</div>
        </div>
      </div>

      <div v-if="(keyCeremony.announcedCount || 0) >= keyCeremony.order.length" class="kc-nominees">
        🎯 被提名者：<strong>{{ (keyCeremony.nominees || []).map(n => n.playerName).join('、') }}</strong>
      </div>
    </template>

    <!-- 发言稿：始终展示给 HOH/管理员，按状态禁用发送按钮 -->
    <div v-if="canSetup" class="kc-speech-panel">
      <div class="kc-speech-title">🎤 发言稿（浏览器本地保存）</div>

      <div class="kc-speech-sub">开场发言
        <button class="kc-mini-btn" @click="genOpeningTemplate">生成模板</button>
      </div>
      <textarea v-model="openingText" class="kc-textarea" rows="2"></textarea>
      <button v-if="keyCeremony" class="kc-btn"
        :disabled="!isFirstMoment || keyCeremony.openingSpoken"
        @click="emitSpeech('opening')">
        {{ keyCeremony.openingSpoken ? '开场发言已发表' : '发表开场发言' }}
      </button>

      <div class="kc-speech-sub">结束发言（仅可修改提名顺序与原因）</div>
      <div class="kc-order">
        <div v-for="(n, i) in speechNominees" :key="n.playerId" class="kc-order-item">
          <span class="kc-idx">{{ i + 1 }}</span>
          <span class="kc-oname">{{ n.playerName }}</span>
          <button class="kc-arrow" :disabled="i === 0" @click="moveSpeechNominee(i, -1)">↑</button>
          <button class="kc-arrow" :disabled="i === speechNominees.length - 1" @click="moveSpeechNominee(i, 1)">↓</button>
        </div>
        <div v-if="!speechNominees.length" class="kc-risk-empty">请先选择被提名者</div>
      </div>
      <div class="kc-closing-line">
        我选择提名的房客分别是 <strong>{{ speechNomineeNames }}</strong>，原因是
      </div>
      <textarea v-model="closingReason" class="kc-textarea kc-reason-textarea" rows="4" placeholder="填写提名原因…"></textarea>
      <div class="kc-closing-line">提名仪式到此结束。</div>
      <button v-if="keyCeremony" class="kc-btn"
        :disabled="!allKeysDone || keyCeremony.closingSpoken"
        @click="emitSpeech('closing')">
        {{ keyCeremony.closingSpoken ? '结束发言已发表' : '发表结束发言并结束仪式' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import BBAvatar from './BBAvatar.vue'

const props = defineProps<{
  keyCeremony: any | null
  myId: string
  isAdmin?: boolean
  isHoh?: boolean
  eligible: { id: string; name: string }[]
  nomineeCount: number
  submitting?: boolean
  drawing?: boolean
  announcing?: boolean
}>()

const emit = defineEmits<{
  (e: 'setup', payload: { nominees: string[]; order: string[] }): void
  (e: 'draw'): void
  (e: 'announce', text: string): void
  (e: 'speech', payload: { phase: 'opening' | 'closing'; text?: string; reason?: string; nomineeOrder?: string[] }): void
}>()

const selectedNominees = ref<string[]>([])
const safeOrder = ref<string[]>([])
const announceText = ref('')
const nomineeOrderList = ref<any[]>([])

// 发言稿：浏览器本地保存（开场发言 + 提名原因）
const LS_OPEN = 'bb_nom_draft_opening'
const LS_REASON = 'bb_nom_draft_reason'
const openingText = ref(localStorage.getItem(LS_OPEN) || '')
const closingReason = ref(localStorage.getItem(LS_REASON) || '')
const lastAutoOpening = ref('')
watch(openingText, v => { try { localStorage.setItem(LS_OPEN, v) } catch {} })
watch(closingReason, v => { try { localStorage.setItem(LS_REASON, v) } catch {} })

const canSetup = computed(() => props.isAdmin || props.isHoh)
const nameOf = (id: string) => props.eligible.find(h => h.id === id)?.name || id

function initOrder() {
  const ids = props.eligible.map(h => h.id)
  safeOrder.value = ids.filter(id => !selectedNominees.value.includes(id))
}

function toggleNominee(id: string) {
  const i = selectedNominees.value.indexOf(id)
  if (i >= 0) {
    selectedNominees.value.splice(i, 1)
    if (!safeOrder.value.includes(id)) safeOrder.value.push(id)
  } else {
    if (selectedNominees.value.length >= props.nomineeCount) return
    selectedNominees.value.push(id)
    safeOrder.value = safeOrder.value.filter(x => x !== id)
  }
}
function moveSafe(index: number, dir: -1 | 1) {
  const t = index + dir
  if (t < 0 || t >= safeOrder.value.length) return
  const arr = [...safeOrder.value]
  ;[arr[index], arr[t]] = [arr[t], arr[index]]
  safeOrder.value = arr
}
function submit() {
  if (selectedNominees.value.length !== props.nomineeCount) return
  emit('setup', { nominees: [...selectedNominees.value], order: [...safeOrder.value] })
}

// ===== 仪式阶段 =====
// 当前操作者：待宣布时 = 抽出该钥匙的人（第一位是 HOH，之后是上一位安全选手）；
// 待抽钥匙时 = 下一位抽钥匙者（上一位安全选手）
const actorId = computed(() => {
  const kc = props.keyCeremony
  if (!kc) return null
  if ((kc.announcedCount || 0) < (kc.drawnCount || 0)) {
    const idx = kc.announcedCount || 0 // 待宣布的钥匙序号（0 起）
    return idx === 0 ? kc.hohId : kc.order[idx - 1]?.playerId
  }
  return (kc.drawnCount || 0) === 0 ? kc.hohId : kc.order[kc.drawnCount - 1]?.playerId
})
const actorName = computed(() => {
  const kc = props.keyCeremony
  if (!kc) return ''
  if ((kc.announcedCount || 0) < (kc.drawnCount || 0)) {
    const idx = kc.announcedCount || 0
    return idx === 0 ? kc.hohName : (kc.order[idx - 1]?.playerName || '')
  }
  return (kc.drawnCount || 0) === 0 ? kc.hohName : (kc.order[kc.drawnCount - 1]?.playerName || '')
})
const pendingAnnounce = computed(() => !!props.keyCeremony && (props.keyCeremony.announcedCount || 0) < (props.keyCeremony.drawnCount || 0))
const pendingRevealed = computed(() => props.keyCeremony ? props.keyCeremony.order[props.keyCeremony.announcedCount] : null)
const iAmActor = computed(() => !!props.isAdmin || props.myId === actorId.value)

// 暂时危险：尚未被宣布安全的所有选手（含最终被提名者，不区分显示）
const announcedSafeIds = computed(() => {
  const kc = props.keyCeremony
  if (!kc) return new Set<string>()
  return new Set((kc.order || []).slice(0, kc.announcedCount || 0).map((k: any) => k.playerId))
})
const atRisk = computed<any[]>(() => {
  const kc = props.keyCeremony
  if (!kc) return []
  const list = (kc.eligible && kc.eligible.length) ? kc.eligible : [...(kc.order || []), ...(kc.nominees || [])]
  return list.filter((p: any) => !announcedSafeIds.value.has(p.playerId))
})

watch(pendingRevealed, (r) => {
  if (r) announceText.value = `${r.playerName}, you're safe.`
}, { immediate: true })

function doDraw() { if (!props.drawing) emit('draw') }
function doAnnounce() {
  if (props.announcing) return
  emit('announce', announceText.value || (pendingRevealed.value ? `${pendingRevealed.value.playerName}, you're safe.` : ''))
}

// 发言模板
const allKeysDone = computed(() => !!props.keyCeremony && (props.keyCeremony.announcedCount || 0) >= (props.keyCeremony.order || []).length)
const isFirstMoment = computed(() => !!props.keyCeremony && (props.keyCeremony.drawnCount || 0) === 0 && (props.keyCeremony.announcedCount || 0) === 0)

watch(() => props.keyCeremony, (kc) => {
  if (!kc) return
  if (!nomineeOrderList.value.length) nomineeOrderList.value = [...(kc.nominees || [])]
  if (!openingText.value) {
    const n = (kc.nominees || []).length
    const text = `现在是提名仪式。作为房主，我有权利提名${n}位房客候选淘汰。我将从箱子中逐个抽出钥匙，最后没有获得钥匙的房客将成为本轮的淘汰候选。`
    openingText.value = text
    lastAutoOpening.value = text
  }
}, { immediate: true })

// 发言稿中的被提名者：仪式阶段用已确定的提名名单，准备阶段用当前所选
const speechNominees = computed<any[]>(() => {
  if (props.keyCeremony) return nomineeOrderList.value
  return selectedNominees.value.map(id => ({ playerId: id, playerName: nameOf(id) }))
})
const speechNomineeNames = computed(() => speechNominees.value.map(n => n.playerName).join('、') || '……')
function moveSpeechNominee(index: number, dir: -1 | 1) {
  const t = index + dir
  if (t < 0 || t >= speechNominees.value.length) return
  if (props.keyCeremony) {
    const a = [...nomineeOrderList.value]
    ;[a[index], a[t]] = [a[t], a[index]]
    nomineeOrderList.value = a
  } else {
    const a = [...selectedNominees.value]
    ;[a[index], a[t]] = [a[t], a[index]]
    selectedNominees.value = a
  }
}
function genOpeningTemplate() {
  const n = speechNominees.value.length || props.nomineeCount
  const text = `现在是提名仪式。作为房主，我有权利提名${n}位房客候选淘汰。我将从箱子中逐个抽出钥匙，最后没有获得钥匙的房客将成为本轮的淘汰候选。`
  openingText.value = text
  lastAutoOpening.value = text
}
// 被提名者数量变化时，若开场发言仍是自动模板则同步更新
watch(() => speechNominees.value.length, () => {
  if (!openingText.value || openingText.value === lastAutoOpening.value) genOpeningTemplate()
})
function emitSpeech(phase: 'opening' | 'closing') {
  if (phase === 'opening') {
    emit('speech', { phase, text: openingText.value })
  } else {
    const names = speechNominees.value.map(n => n.playerName).join('、')
    const text = `我选择提名的房客分别是${names}，原因是${closingReason.value || '……'}。提名仪式到此结束。`
    emit('speech', {
      phase,
      text,
      reason: closingReason.value,
      nomineeOrder: speechNominees.value.map(n => n.playerId)
    })
  }
}

watch(() => props.eligible, () => { if (!props.keyCeremony) initOrder() }, { immediate: true })
onMounted(() => {
  if (!props.keyCeremony) initOrder()
  if (!openingText.value) genOpeningTemplate()
})
</script>

<style scoped>
.key-ceremony { background: #0f0f2e; border: 1px solid #ffaa0044; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
.kc-title { font-size: 15px; font-weight: 700; color: #ffaa00; margin-bottom: 12px; }
.kc-step { font-size: 13px; color: #8a8aa5; margin: 10px 0 8px; }
.kc-eligible { display: flex; flex-wrap: wrap; gap: 8px; }
.kc-pick { padding: 8px 14px; border: 1px solid #ffffff22; background: #ffffff08; color: #ccc; border-radius: 8px; cursor: pointer; font-size: 13px; }
.kc-pick.chosen { background: #ff444422; border-color: #ff4444; color: #ff6b6b; }
.kc-order { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.kc-order-item { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #ffffff06; border-radius: 8px; }
.kc-idx { width: 20px; height: 20px; border-radius: 50%; background: #ffaa0022; color: #ffaa00; font-size: 11px; display: flex; align-items: center; justify-content: center; }
.kc-oname { flex: 1; font-size: 13px; color: #e0e0e0; }
.kc-arrow { width: 24px; height: 24px; border: 1px solid #ffffff22; background: #ffffff08; color: #ccc; border-radius: 4px; cursor: pointer; }
.kc-arrow:disabled { opacity: 0.3; cursor: not-allowed; }
.kc-submit { width: 100%; padding: 12px; border: 1px solid #ffaa00; background: #ffaa0022; color: #ffaa00; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; }
.kc-submit:disabled { opacity: 0.4; cursor: not-allowed; }
.kc-waiting { text-align: center; color: #8a8aa5; font-size: 14px; padding: 20px 0; }
.kc-box { display: flex; align-items: center; gap: 16px; margin-bottom: 14px; }
.box-icon { font-size: 44px; }
.box-keys { display: flex; flex-wrap: wrap; gap: 8px; }
.kc-key { min-width: 64px; padding: 8px 12px; border-radius: 8px; background: #ffffff08; border: 1px solid #ffffff18; color: #666; font-size: 13px; text-align: center; }
.kc-key.drawn { background: #ffaa0018; border-color: #ffaa00; color: #ffaa00; font-weight: 600; }
.kc-key.pop { animation: keyPop 0.6s ease; }
@keyframes keyPop { 0% { transform: scale(0.3) rotate(-20deg); opacity: 0; } 60% { transform: scale(1.15) rotate(6deg); } 100% { transform: scale(1) rotate(0); opacity: 1; } }
.kc-turn { font-size: 14px; color: #ccc; margin-bottom: 12px; }
.kc-turn strong { color: #00ff88; }
.kc-risk { background: #ff444410; border: 1px solid #ff444433; border-radius: 10px; padding: 10px 12px; margin-bottom: 14px; }
.kc-risk-title { font-size: 13px; color: #ff6b6b; margin-bottom: 8px; }
.kc-risk-list { display: flex; flex-wrap: wrap; gap: 6px; }
.kc-risk-chip { padding: 4px 12px; border-radius: 8px; background: #ff444422; border: 1px solid #ff444455; color: #ff8a8a; font-size: 13px; }
.kc-risk-empty { color: #666; font-size: 13px; }
.kc-announce { background: #ffaa0012; border: 1px solid #ffaa0044; border-radius: 10px; padding: 12px; margin-bottom: 14px; }
.kc-revealed { font-size: 15px; color: #e0e0e0; margin-bottom: 10px; }
.kc-revealed strong { color: #ffaa00; }
.kc-announce-form { display: flex; gap: 8px; }
.kc-input { flex: 1; padding: 10px 14px; background: #0a0a1a; border: 1px solid #ffaa0044; border-radius: 8px; color: #e0e0e0; font-size: 14px; outline: none; }
.kc-btn { padding: 10px 20px; border: 1px solid #ffaa00; background: #ffaa0022; color: #ffaa00; border-radius: 8px; cursor: pointer; font-size: 14px; }
.kc-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.kc-btn-draw { width: 100%; font-size: 16px; padding: 14px; }
.kc-draw { margin-bottom: 14px; }
.kc-done { text-align: center; color: #00ff88; font-size: 14px; margin-bottom: 14px; }
.kc-chat { border-top: 1px solid #ffffff12; padding-top: 12px; }
.kc-chat-title { font-size: 13px; color: #8a8aa5; margin-bottom: 8px; }
.kc-chat-body { display: flex; flex-direction: column; gap: 8px; max-height: 240px; overflow-y: auto; }
.kc-msg { display: flex; gap: 8px; align-items: flex-start; }
.kc-msg-body { flex: 1; min-width: 0; }
.kc-sender { font-size: 12px; color: #00ff88; font-weight: 600; margin-bottom: 3px; }
.kc-bubble { display: inline-block; max-width: 92%; background: #16163a; border: 1px solid #ffffff12; border-radius: 4px 12px 12px 12px; padding: 8px 12px; font-size: 14px; color: #e6e6f5; line-height: 1.5; word-break: break-word; }
.kc-empty { color: #666; font-size: 13px; text-align: center; padding: 12px; }
.kc-nominees { margin-top: 12px; text-align: center; font-size: 15px; color: #ff6666; }
.kc-speech { background: #4488ff10; border: 1px solid #4488ff33; border-radius: 10px; padding: 12px; margin-bottom: 14px; }
.kc-speech-title { font-size: 13px; color: #7fb0ff; margin-bottom: 8px; }
.kc-textarea { width: 100%; padding: 10px 12px; background: #0a0a1a; border: 1px solid #4488ff44; border-radius: 8px; color: #e0e0e0; font-size: 14px; outline: none; resize: vertical; box-sizing: border-box; margin-bottom: 8px; font-family: inherit; }
.kc-speech-preview { margin: 8px 0; padding: 8px 12px; background: #ffffff06; border-radius: 8px; color: #aaa; font-size: 13px; line-height: 1.5; }
.kc-speech-panel { background: #4488ff10; border: 1px solid #4488ff33; border-radius: 10px; padding: 12px; margin-top: 14px; }
.kc-speech-sub { font-size: 13px; color: #7fb0ff; margin: 10px 0 6px; }
.kc-mini-btn { margin-left: 8px; padding: 2px 10px; border: 1px solid #4488ff66; background: #4488ff22; color: #7fb0ff; border-radius: 6px; cursor: pointer; font-size: 12px; }
.kc-mini-btn:hover { background: #4488ff33; }
.kc-closing-line { font-size: 14px; color: #e0e0e0; line-height: 2; margin: 8px 0; }
.kc-closing-line strong { color: #ff6666; }
.kc-inline-input { padding: 6px 10px; background: #0a0a1a; border: 1px solid #4488ff44; border-radius: 6px; color: #e0e0e0; font-size: 14px; outline: none; min-width: 220px; }
.kc-reason-textarea { min-height: 96px; font-size: 15px; line-height: 1.6; }
</style>
