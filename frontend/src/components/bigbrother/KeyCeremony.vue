<template>
  <section class="key-ceremony" aria-label="钥匙仪式">
    <header class="kc-header">
      <h2>钥匙仪式</h2>
      <span class="kc-status" role="status">{{ phaseLabel }}</span>
    </header>

    <template v-if="!isStarted">
      <template v-if="canSetup">
        <p v-if="prepared" class="kc-saved">准备内容已保存，可以继续修改，仪式由管理员开始。</p>
        <div class="kc-prep-grid">
          <section class="kc-fieldset">
            <h3>1. 选择被提名者</h3>
            <p class="kc-hint">已选 {{ selectedNominees.length }} / {{ nomineeCount }} 人</p>
            <div class="kc-eligible">
              <button v-for="h in eligible" :key="h.id" class="kc-pick"
                :aria-pressed="selectedNominees.includes(h.id)"
                :class="{ chosen: selectedNominees.includes(h.id) }"
                @click="toggleNominee(h.id)">{{ h.name }}</button>
            </div>
          </section>
          <section class="kc-fieldset">
            <h3>2. 排列安全顺序</h3>
            <p class="kc-hint">用上下箭头调整其余房客被宣布安全的顺序。</p>
            <div class="kc-order">
              <div v-for="(id, i) in safeOrder" :key="id" class="kc-order-item">
                <span class="kc-idx">{{ i + 1 }}</span>
                <span class="kc-oname">{{ nameOf(id) }}</span>
                <button class="kc-arrow" :aria-label="'上移 ' + nameOf(id)" :disabled="i === 0" @click="moveSafe(i, -1)">↑</button>
                <button class="kc-arrow" :aria-label="'下移 ' + nameOf(id)" :disabled="i === safeOrder.length - 1" @click="moveSafe(i, 1)">↓</button>
              </div>
            </div>
          </section>
        </div>
      </template>
      <p v-else class="kc-waiting">
        {{ prepared ? '房主已保存提名准备，等待管理员开始仪式。' : '等待房主准备提名仪式。' }}
      </p>
    </template>

    <div v-if="canSetup && !isStarted" class="kc-draft-heading">
      <h3>3. 编辑发言稿</h3>
      <p class="kc-hint">开场与结束发言随提名准备一起保存。</p>
    </div>

    <details v-if="canSetup" class="kc-fieldset kc-draft" :open="!isStarted || !keyCeremony.openingSpoken">
      <summary>开场发言</summary>
      <div class="kc-speech-sub">
        <button class="kc-mini-btn" @click="genOpeningTemplate">生成模板</button>
      </div>
      <textarea aria-label="开场发言稿" v-model="openingText" class="kc-textarea" rows="2"></textarea>
      <button v-if="isStarted" class="kc-btn"
        :disabled="!isFirstMoment || keyCeremony.openingSpoken"
        @click="emitSpeech('opening')">
        {{ keyCeremony.openingSpoken ? '开场发言已发表' : '发表开场发言' }}
      </button>
    </details>

    <template v-if="isStarted">
      <section v-if="!keyCeremony.ended && keyCeremony.openingSpoken && !allKeysDone" class="kc-current">
        <h3>{{ pendingAnnounce ? '宣布本把钥匙' : '抽取下一把钥匙' }}</h3>
        <p class="kc-hint">当前操作人：{{ actorName }}</p>
      </section>
      <div v-if="pendingAnnounce" class="kc-announce">
        <template v-if="iAmActor">
          <div class="kc-revealed">🔑 你抽到的钥匙上写着：<strong>{{ pendingRevealed?.playerName }}</strong></div>
          <div class="kc-announce-form">
            <input aria-label="宣布安全的发言" v-model="announceText" class="kc-input" @keyup.enter="doAnnounce" />
            <button class="kc-btn" :disabled="announcing" @click="doAnnounce">{{ announcing ? '发送中…' : '宣布安全' }}</button>
          </div>
        </template>
        <div v-else class="kc-waiting">等待 {{ actorName }} 宣布…</div>
      </div>

      <!-- 抽钥匙 -->
      <div v-else-if="!keyCeremony.openingSpoken && !canSetup" class="kc-waiting">等待房主发表开场发言。</div>
      <div v-else-if="keyCeremony.openingSpoken && keyCeremony.drawnCount < keyCeremony.order.length" class="kc-draw">
        <button v-if="iAmActor" class="kc-btn kc-btn-draw" :disabled="drawing" @click="doDraw">
          {{ drawing ? '抽钥匙中…' : '🔑 从箱子中抽出一把钥匙' }}
        </button>
        <div v-else class="kc-waiting">等待 {{ actorName }} 抽钥匙…</div>
      </div>

      <div v-else-if="allKeysDone && !canSetup && !keyCeremony.ended" class="kc-waiting">等待房主发表结束发言并公布结果。</div>
    </template>

    <details v-if="canSetup" class="kc-fieldset kc-draft" :open="!isStarted || (allKeysDone && !keyCeremony.ended)">
      <summary>结束发言</summary>
      <p class="kc-hint">可调整提名顺序并填写提名原因。</p>
      <div class="kc-order">
        <div v-for="(n, i) in speechNominees" :key="n.playerId" class="kc-order-item">
          <span class="kc-idx">{{ i + 1 }}</span>
          <span class="kc-oname">{{ n.playerName }}</span>
          <button class="kc-arrow" :aria-label="'上移 ' + n.playerName" :disabled="i === 0" @click="moveSpeechNominee(i, -1)">↑</button>
          <button class="kc-arrow" :aria-label="'下移 ' + n.playerName" :disabled="i === speechNominees.length - 1" @click="moveSpeechNominee(i, 1)">↓</button>
        </div>
        <div v-if="!speechNominees.length" class="kc-risk-empty">请先选择被提名者</div>
      </div>
      <div class="kc-closing-line">
        我选择提名的房客分别是 <strong>{{ speechNomineeNames }}</strong>，原因是
      </div>
      <textarea aria-label="提名原因" v-model="closingReason" class="kc-textarea kc-reason-textarea" rows="4" placeholder="填写提名原因…"></textarea>
      <div class="kc-closing-line">提名仪式到此结束。</div>
      <button v-if="isStarted" class="kc-btn"
        :disabled="!allKeysDone || keyCeremony.closingSpoken"
        @click="emitSpeech('closing')">
        {{ keyCeremony.closingSpoken ? '结束发言已发表' : '发表结束发言并结束仪式' }}
      </button>
    </details>

    <div v-if="canSetup && !isStarted" class="kc-save-panel">
      <button class="kc-submit" :disabled="selectedNominees.length !== nomineeCount || submitting" @click="submit">
        {{ submitting ? '保存中…' : prepared ? '保存修改' : '保存提名准备' }}
      </button>
    </div>
    <div v-if="canStartCeremony && !isStarted" class="kc-start-panel">
      <button class="kc-submit" :disabled="!prepared || starting" @click="emit('start')">
        {{ starting ? '开始中…' : '开始仪式' }}
      </button>
      <p v-if="!prepared" class="kc-hint">保存提名准备后可以开始仪式。</p>
    </div>

    <template v-if="isStarted">
      <section class="kc-progress">
        <div class="kc-progress-head">
          <h3>钥匙进度</h3>
          <span>已宣布 {{ keyCeremony.announcedCount || 0 }} / {{ keyCeremony.order.length }}</span>
        </div>
        <div class="kc-box">
          <div class="box-keys">
            <div v-for="(k, i) in keyCeremony.order" :key="k.playerId" class="kc-key"
              :class="{ drawn: i < keyCeremony.drawnCount, pop: i === keyCeremony.drawnCount - 1 }">
              <template v-if="i < (keyCeremony.announcedCount || 0)">
                <BBAvatar :name="k.playerName" :avatar="avatarOf(k.playerId)" size="sm" />
                <span class="kc-key-name">{{ k.playerName }}</span>
              </template>
              <span v-else-if="i < keyCeremony.drawnCount" class="kc-key-name">🔑</span>
              <span v-else class="kc-key-lock">🔒</span>
            </div>
          </div>
        </div>
        <div class="kc-risk">
          <div class="kc-risk-title">尚未宣布安全 · {{ atRisk.length }} 人</div>
          <div class="kc-risk-list">
            <span v-for="p in atRisk" :key="p.playerId" class="kc-risk-chip">
              <BBAvatar :name="p.playerName" :avatar="avatarOf(p.playerId)" size="sm" />{{ p.playerName }}
            </span>
            <span v-if="!atRisk.length" class="kc-risk-empty">无</span>
          </div>
        </div>
      </section>

      <div v-if="allKeysDone && !keyCeremony.ended && (keyCeremony.nominees || []).length" class="kc-nominees">
        被提名者：<strong>{{ keyCeremony.nominees.map(n => n.playerName).join('、') }}</strong>
      </div>
      <details class="kc-fieldset kc-record" :open="!keyCeremony.ended">
        <summary>宣布记录</summary>
        <CeremonyChat room-id="dining_room" title="餐厅" empty-text="暂无宣布" />
      </details>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import BBAvatar from './BBAvatar.vue'
import CeremonyChat from './CeremonyChat.vue'

const props = defineProps<{
  keyCeremony: any | null
  myId: string
  isAdmin?: boolean
  isHoh?: boolean
  eligible: { id: string; name: string; avatar?: string | null }[]
  avatars?: { id: string; name: string; avatar?: string | null }[]
  nomineeCount: number
  submitting?: boolean
  drawing?: boolean
  announcing?: boolean
  canStartCeremony?: boolean
  starting?: boolean
}>()

const emit = defineEmits<{
  (e: 'setup', payload: { nominees: string[]; order: string[]; openingText?: string; closingReason?: string }): void
  (e: 'start'): void
  (e: 'draw'): void
  (e: 'announce', text: string): void
  (e: 'speech', payload: { phase: 'opening' | 'closing'; text?: string; reason?: string; nomineeOrder?: string[] }): void
}>()

const selectedNominees = ref<string[]>([])
const safeOrder = ref<string[]>([])
const announceText = ref('')
const nomineeOrderList = ref<any[]>([])

// 头像查询（优先用全量列表，含自己；回退 eligible）
function avatarOf(id?: string | null): string | null {
  if (!id) return null
  const found = (props.avatars || []).find(e => e.id === id) || props.eligible.find(e => e.id === id)
  return (found as any)?.avatar || null
}

// 发言稿：浏览器本地保存（开场发言 + 提名原因）
const LS_OPEN = 'bb_nom_draft_opening'
const LS_REASON = 'bb_nom_draft_reason'
const openingText = ref(localStorage.getItem(LS_OPEN) || '')
const closingReason = ref(localStorage.getItem(LS_REASON) || '')
const lastAutoOpening = ref('')
watch(openingText, v => { try { localStorage.setItem(LS_OPEN, v) } catch {} })
watch(closingReason, v => { try { localStorage.setItem(LS_REASON, v) } catch {} })

const canSetup = computed(() => props.isAdmin || props.isHoh)
// 兼容旧数据：没有 started 字段的仪式视为已开始
const isStarted = computed(() => !!props.keyCeremony && props.keyCeremony.started !== false)
const prepared = computed(() => !!props.keyCeremony && props.keyCeremony.started === false)
const nameOf = (id: string) => props.eligible.find(h => h.id === id)?.name || id

function initOrder() {
  const ids = props.eligible.map(h => h.id)
  safeOrder.value = ids.filter(id => !selectedNominees.value.includes(id))
}

let initializedPrepId = ''
function initFromPrepared() {
  const kc = props.keyCeremony
  if (!kc || kc.started !== false) return false
  if (initializedPrepId === kc.id) return true
  initializedPrepId = kc.id || 'prepared'
  selectedNominees.value = (kc.nominees || []).map((n: any) => n.playerId)
  safeOrder.value = (kc.order || []).map((o: any) => o.playerId)
  if (kc.openingText) openingText.value = kc.openingText
  if (kc.closingReason) closingReason.value = kc.closingReason
  return true
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
  emit('setup', {
    nominees: [...selectedNominees.value],
    order: [...safeOrder.value],
    openingText: openingText.value,
    closingReason: closingReason.value
  })
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
const phaseLabel = computed(() => {
  if (!isStarted.value) return prepared.value ? '等待开始' : '准备提名'
  if (props.keyCeremony.ended) return '仪式已结束'
  if (!props.keyCeremony.openingSpoken) return '开场发言'
  if (pendingAnnounce.value) return '宣布安全'
  if (allKeysDone.value) return '结束发言'
  return '抽取钥匙'
})
const isFirstMoment = computed(() => !!props.keyCeremony && (props.keyCeremony.drawnCount || 0) === 0 && (props.keyCeremony.announcedCount || 0) === 0)

watch(() => props.keyCeremony, (kc) => {
  if (!kc) return
  if (kc.started === false) initFromPrepared()
  if (kc.started !== false && !nomineeOrderList.value.length) nomineeOrderList.value = [...(kc.nominees || [])]
  if (kc.openingText && !openingText.value) openingText.value = kc.openingText
  if (kc.closingReason && !closingReason.value) closingReason.value = kc.closingReason
  if (!openingText.value) {
    const n = (kc.nominees || []).length
    const text = `现在是提名仪式。作为房主，我有权利提名${n}位房客候选淘汰。我将从箱子中逐个抽出钥匙，最后没有获得钥匙的房客将成为本轮的淘汰候选。`
    openingText.value = text
    lastAutoOpening.value = text
  }
}, { immediate: true })

// 发言稿中的被提名者：仪式阶段用已确定的提名名单，准备阶段用当前所选
const speechNominees = computed<any[]>(() => {
  if (isStarted.value) return nomineeOrderList.value
  return selectedNominees.value.map(id => ({ playerId: id, playerName: nameOf(id) }))
})
const speechNomineeNames = computed(() => speechNominees.value.map(n => n.playerName).join('、') || '……')
function moveSpeechNominee(index: number, dir: -1 | 1) {
  const t = index + dir
  if (t < 0 || t >= speechNominees.value.length) return
  if (isStarted.value) {
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
  if (props.keyCeremony?.started === false) initFromPrepared()
  else if (!props.keyCeremony) initOrder()
  if (!openingText.value) genOpeningTemplate()
})
</script>

<style scoped>
.key-ceremony { background: #1b1130; border: 1px solid #e6c98844; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
.kc-eligible { display: flex; flex-wrap: wrap; gap: 8px; }
.kc-pick { padding: 8px 14px; border: 1px solid #ffffff22; background: #ffffff08; color: #cfc4ea; border-radius: 8px; cursor: pointer; font-size: 13px; }
.kc-pick.chosen { background: #ff444422; border-color: #ff4444; color: #ff6b6b; }
.kc-order { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.kc-order-item { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #ffffff06; border-radius: 8px; }
.kc-idx { width: 20px; height: 20px; border-radius: 50%; background: #e6c98822; color: #e6c988; font-size: 11px; display: flex; align-items: center; justify-content: center; }
.kc-oname { flex: 1; font-size: 13px; color: #ece7fb; }
.kc-arrow { width: 24px; height: 24px; border: 1px solid #ffffff22; background: #ffffff08; color: #cfc4ea; border-radius: 4px; cursor: pointer; }
.kc-arrow:disabled { opacity: 0.3; cursor: not-allowed; }
.kc-submit { width: 100%; padding: 12px; border: 1px solid #e6c988; background: #e6c98822; color: #e6c988; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; }
.kc-submit:disabled { opacity: 0.4; cursor: not-allowed; }
.kc-saved { margin-bottom: 10px; padding: 8px 12px; border: 1px solid #44cc8844; background: #44cc8812; color: #6ee7a8; border-radius: 8px; font-size: 13px; }
.kc-start-panel { margin-top: 14px; padding-top: 14px; border-top: 1px solid #ffffff12; }
.kc-waiting { text-align: center; color: #b3a6d6; font-size: 14px; padding: 20px 0; }
.kc-box { display: flex; align-items: center; gap: 16px; margin-bottom: 14px; }
.box-keys { display: flex; flex-wrap: wrap; gap: 8px; }
.kc-key { min-width: 64px; padding: 8px 12px; border-radius: 8px; background: #ffffff08; border: 1px solid #ffffff18; color: #6b5f92; font-size: 13px; text-align: center; display: inline-flex; flex-direction: column; align-items: center; gap: 4px; }
.kc-key.drawn { background: #e6c98818; border-color: #e6c988; color: #e6c988; font-weight: 600; }
.kc-key.pop { animation: keyPop 0.6s ease; }
@keyframes keyPop { 0% { transform: scale(0.3) rotate(-20deg); opacity: 0; } 60% { transform: scale(1.15) rotate(6deg); } 100% { transform: scale(1) rotate(0); opacity: 1; } }
.kc-risk { background: #ff444410; border: 1px solid #ff444433; border-radius: 10px; padding: 10px 12px; margin-bottom: 14px; }
.kc-risk-title { font-size: 13px; color: #ff6b6b; margin-bottom: 8px; }
.kc-risk-list { display: flex; flex-wrap: wrap; gap: 6px; }
.kc-risk-chip { padding: 4px 12px; border-radius: 8px; background: #ff444422; border: 1px solid #ff444455; color: #ff8a8a; font-size: 13px; display: inline-flex; align-items: center; gap: 6px; }
.kc-risk-empty { color: #6b5f92; font-size: 13px; }
.kc-announce { background: #e6c98812; border: 1px solid #e6c98844; border-radius: 10px; padding: 12px; margin-bottom: 14px; }
.kc-revealed { font-size: 15px; color: #ece7fb; margin-bottom: 10px; }
.kc-revealed strong { color: #e6c988; }
.kc-announce-form { display: flex; gap: 8px; }
.kc-input { flex: 1; padding: 10px 14px; background: #120a22; border: 1px solid #e6c98844; border-radius: 8px; color: #ece7fb; font-size: 14px; outline: none; }
.kc-btn { padding: 10px 20px; border: 1px solid #e6c988; background: #e6c98822; color: #e6c988; border-radius: 8px; cursor: pointer; font-size: 14px; }
.kc-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.kc-btn-draw { width: 100%; font-size: 16px; padding: 14px; }
.kc-draw { margin-bottom: 14px; }
.kc-nominees { margin-top: 12px; text-align: center; font-size: 15px; color: #ff6666; }
.kc-textarea { width: 100%; padding: 10px 12px; background: #120a22; border: 1px solid #4488ff44; border-radius: 8px; color: #ece7fb; font-size: 14px; outline: none; resize: vertical; box-sizing: border-box; margin-bottom: 8px; font-family: inherit; }
.kc-speech-sub { font-size: 13px; color: #7fb0ff; margin: 10px 0 6px; }
.kc-mini-btn { margin-left: 8px; padding: 2px 10px; border: 1px solid #4488ff66; background: #4488ff22; color: #7fb0ff; border-radius: 6px; cursor: pointer; font-size: 12px; }
.kc-mini-btn:hover { background: #4488ff33; }
.kc-closing-line { font-size: 14px; color: #ece7fb; line-height: 2; margin: 8px 0; }
.kc-closing-line strong { color: #ff6666; }
.kc-reason-textarea { min-height: 96px; font-size: 15px; line-height: 1.6; }

.key-ceremony { display: grid; gap: 12px; padding: clamp(14px, 2.5vw, 24px); margin: 0; }
.kc-header, .kc-progress-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.kc-header h2, .key-ceremony h3 { margin: 0; color: #f3e8ff; font-size: 17px; }
.kc-status { color: #f1d69a; background: #e6c98818; border: 1px solid #e6c98835; border-radius: 999px; padding: 4px 10px; font-size: 13px; }
.kc-prep-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 255px), 1fr)); gap: 12px; align-items: start; }
.kc-fieldset, .kc-progress { min-width: 0; padding: 14px; background: #231835; border: 1px solid #b39bff2c; border-radius: 10px; }
.kc-hint, .kc-progress-head span { color: #c3b4dd; font-size: 13px; line-height: 1.5; }
.kc-hint { margin: 5px 0 10px; }
.kc-saved, .kc-order, .kc-box, .kc-risk, .kc-announce, .kc-draw, .kc-nominees { margin: 0; }
.kc-draft summary, .kc-record summary { cursor: pointer; color: #e6d8fa; font-weight: 650; }
.kc-draft[open] summary, .kc-record[open] summary { margin-bottom: 10px; }
.kc-start-panel { margin: 0; }
.kc-waiting { padding: 12px; border-radius: 8px; background: #b39bff0d; text-align: start; }
.kc-pick, .kc-arrow { min-height: 36px; }
.kc-arrow { flex: 0 0 36px; }
.kc-idx { flex-shrink: 0; }
.kc-oname, .kc-key-name { min-width: 0; overflow-wrap: anywhere; }
.kc-progress { display: grid; gap: 12px; }
.kc-key { max-width: 100%; }
.kc-current { padding: 12px 14px; border-inline-start: 3px solid #e6c988; background: #e6c9880c; border-radius: 8px; }
.kc-current .kc-hint { margin-bottom: 0; }
.kc-input { min-width: 0; }
.kc-announce-form { flex-wrap: wrap; }
.kc-announce-form .kc-input { flex-basis: 190px; }
.kc-draft .kc-mini-btn { margin: 0; }
.kc-draft .kc-btn, .kc-announce .kc-btn { min-height: 40px; }
.kc-nominees { padding: 10px; color: #f2b7bf; text-align: start; }
@media (prefers-reduced-motion: reduce) {
  .kc-key.pop { animation: none; }
}
</style>
