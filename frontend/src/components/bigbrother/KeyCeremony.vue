<template>
  <section class="key-ceremony" aria-label="钥匙仪式">
    <header class="kc-top">
      <h2>{{ isEnded ? '仪式回顾' : isStarted ? '仪式现场' : '提名准备' }}</h2>
      <span class="kc-status" role="status">{{ phaseLabel }}</span>
    </header>

    <ol class="kc-steps" aria-label="仪式流程">
      <li v-for="(step, index) in ceremonySteps" :key="step"
        :class="{ current: index === activeStep, complete: index < activeStep }"
        :aria-current="index === activeStep ? 'step' : undefined">
        {{ step }}
      </li>
    </ol>

    <div v-if="!isStarted && canSetup" class="kc-setup">
      <section class="kc-panel kc-candidates" aria-labelledby="kc-candidates-title">
        <div class="kc-panel-head">
          <h3 id="kc-candidates-title">选择被提名者</h3>
          <span class="kc-count">{{ selectedNominees.length }} / {{ nomineeCount }} 已选</span>
        </div>
        <p v-if="!eligible.length" class="kc-empty">暂无可选房客</p>
        <div v-else class="kc-candidate-grid">
          <button v-for="h in eligible" :key="h.id" type="button" class="kc-candidate"
            :aria-pressed="selectedNominees.includes(h.id)"
            @click="toggleNominee(h.id)">
            <BBAvatar :name="h.name" :avatar="h.avatar" size="sm" />
            <span>{{ h.name }}</span>
            <span class="kc-selection" aria-hidden="true">{{ selectedNominees.includes(h.id) ? '✓' : '+' }}</span>
          </button>
        </div>
      </section>

      <section class="kc-panel kc-safe-order" aria-labelledby="kc-order-title">
        <div class="kc-panel-head">
          <h3 id="kc-order-title">安全顺序</h3>
          <span class="kc-count">{{ safeOrder.length }} 人</span>
        </div>
        <p class="kc-note">房客将按下方顺序被宣布安全。</p>
        <ol class="kc-order">
          <li v-for="(id, i) in safeOrder" :key="id" class="kc-order-row">
            <span class="kc-number">{{ i + 1 }}</span>
            <span class="kc-person">{{ nameOf(id) }}</span>
            <button type="button" class="kc-icon-btn" :aria-label="'上移 ' + nameOf(id)" :disabled="i === 0" @click="moveSafe(i, -1)">↑</button>
            <button type="button" class="kc-icon-btn" :aria-label="'下移 ' + nameOf(id)" :disabled="i === safeOrder.length - 1" @click="moveSafe(i, 1)">↓</button>
          </li>
        </ol>
      </section>
    </div>

    <div v-if="!isStarted && !canSetup" class="kc-wait">
      <p>{{ prepared ? '房主已完成准备，等待管理员开始仪式。' : '等待房主选定提名名单并保存准备。' }}</p>
    </div>

    <div v-if="canSetup || isStarted" class="kc-floor" :class="{ 'kc-floor-live': isStarted }">
      <div class="kc-main">
        <div v-if="canSetup || !isEnded" class="kc-operations" :class="{ 'kc-draft-grid': !isStarted }">
          <details v-if="canSetup" class="kc-panel kc-disclosure"
            :class="{ 'kc-active-panel': isStarted && !keyCeremony.openingSpoken }"
            :open="!isStarted || !keyCeremony.openingSpoken">
            <summary>
              <span>开场发言</span>
              <span v-if="isStarted && keyCeremony.openingSpoken" class="kc-note">已发表</span>
            </summary>
            <div class="kc-panel-body">
              <textarea aria-label="开场发言稿" v-model="openingText" class="kc-input" rows="4"></textarea>
              <div class="kc-form-actions">
                <button type="button" class="kc-button kc-secondary" @click="genOpeningTemplate">生成模板</button>
                <button v-if="isStarted" type="button" class="kc-button"
                  :disabled="!isFirstMoment || keyCeremony.openingSpoken"
                  @click="emitSpeech('opening')">
                  {{ keyCeremony.openingSpoken ? '开场发言已发表' : '发表开场发言' }}
                </button>
              </div>
            </div>
          </details>

          <section v-if="isStarted && (pendingAnnounce || (keyCeremony.openingSpoken && keyCeremony.drawnCount < keyCeremony.order.length))"
            class="kc-panel kc-active-panel kc-live-action" aria-labelledby="kc-action-title">
            <div class="kc-panel-head">
              <h3 id="kc-action-title">{{ pendingAnnounce ? '宣布安全' : '抽取钥匙' }}</h3>
              <span class="kc-count">轮到 {{ actorName }}</span>
            </div>
            <template v-if="pendingAnnounce">
              <template v-if="iAmActor">
                <p class="kc-reveal">钥匙上的名字 <strong>{{ pendingRevealed?.playerName }}</strong></p>
                <div class="kc-announce-form">
                  <input aria-label="宣布安全的发言" v-model="announceText" class="kc-input" @keyup.enter="doAnnounce" />
                  <button type="button" class="kc-button" :disabled="announcing" @click="doAnnounce">{{ announcing ? '发送中…' : '宣布安全' }}</button>
                </div>
              </template>
              <p v-else class="kc-note">等待这把钥匙的结果公布。</p>
            </template>
            <template v-else>
              <button v-if="iAmActor" type="button" class="kc-button" :disabled="drawing" @click="doDraw">
                {{ drawing ? '抽钥匙中…' : '从箱中抽取钥匙' }}
              </button>
              <p v-else class="kc-note">等待当前房客抽取下一把钥匙。</p>
            </template>
          </section>

          <p v-if="isStarted && !pendingAnnounce && !canSetup && !keyCeremony.openingSpoken" class="kc-wait">
            等待房主发表开场发言。
          </p>
          <p v-else-if="isStarted && !canSetup && allKeysDone && !isEnded" class="kc-wait">
            等待房主发表结束发言并公布结果。
          </p>

          <details v-if="canSetup" class="kc-panel kc-disclosure"
            :class="{ 'kc-active-panel': isStarted && allKeysDone && !isEnded }"
            :open="!isStarted || (allKeysDone && !isEnded)">
            <summary>
              <span>结束发言</span>
              <span v-if="isStarted && keyCeremony.closingSpoken" class="kc-note">已发表</span>
            </summary>
            <div class="kc-panel-body">
              <p class="kc-note">按发言顺序排列被提名者，并填写提名原因。</p>
              <ol class="kc-order">
                <li v-for="(n, i) in speechNominees" :key="n.playerId" class="kc-order-row">
                  <span class="kc-number">{{ i + 1 }}</span>
                  <span class="kc-person">{{ n.playerName }}</span>
                  <button type="button" class="kc-icon-btn" :aria-label="'上移 ' + n.playerName" :disabled="i === 0" @click="moveSpeechNominee(i, -1)">↑</button>
                  <button type="button" class="kc-icon-btn" :aria-label="'下移 ' + n.playerName" :disabled="i === speechNominees.length - 1" @click="moveSpeechNominee(i, 1)">↓</button>
                </li>
              </ol>
              <p v-if="!speechNominees.length" class="kc-note">请先选择被提名者。</p>
              <div class="kc-speech-preview">
                <p>我选择提名的房客分别是 <strong>{{ speechNomineeNames }}</strong>，原因是</p>
                <textarea aria-label="提名原因" v-model="closingReason" class="kc-input" rows="3" placeholder="填写提名原因…"></textarea>
                <p>提名仪式到此结束。</p>
              </div>
              <div v-if="isStarted" class="kc-form-actions">
                <button type="button" class="kc-button"
                  :disabled="!allKeysDone || keyCeremony.closingSpoken"
                  @click="emitSpeech('closing')">
                  {{ keyCeremony.closingSpoken ? '结束发言已发表' : '发表结束发言并结束仪式' }}
                </button>
              </div>
            </div>
          </details>
        </div>

        <section v-if="isStarted" class="kc-panel kc-key-progress" aria-labelledby="kc-progress-title">
          <div class="kc-panel-head">
            <h3 id="kc-progress-title">钥匙揭晓</h3>
            <span class="kc-count">已宣布 {{ keyCeremony.announcedCount || 0 }} / {{ keyCeremony.order.length }}</span>
          </div>
          <progress v-if="keyCeremony.order.length" class="kc-progress" aria-label="钥匙揭晓进度"
            :value="keyCeremony.announcedCount || 0" :max="keyCeremony.order.length"></progress>
          <ol class="kc-keys">
            <li v-for="(k, i) in keyCeremony.order" :key="k.playerId" class="kc-key"
              :class="{ safe: i < (keyCeremony.announcedCount || 0), pending: i === (keyCeremony.announcedCount || 0) && i < keyCeremony.drawnCount }">
              <span class="kc-key-index">{{ i + 1 }}</span>
              <template v-if="i < (keyCeremony.announcedCount || 0)">
                <BBAvatar :name="k.playerName" :avatar="avatarOf(k.playerId)" size="sm" />
                <strong>{{ k.playerName }}</strong>
              </template>
              <span v-else-if="i < keyCeremony.drawnCount">待宣布</span>
              <span v-else>未抽取</span>
            </li>
          </ol>
          <p v-if="allKeysDone && !isEnded && (keyCeremony.nominees || []).length" class="kc-reveal">
            被提名者 <strong>{{ keyCeremony.nominees.map(n => n.playerName).join('、') }}</strong>
          </p>
        </section>
      </div>

      <aside v-if="isStarted" class="kc-sidebar" aria-label="人员与宣布记录">
        <section class="kc-panel">
          <div class="kc-panel-head">
            <h3>尚未宣布安全</h3>
            <span class="kc-count">{{ atRisk.length }} 人</span>
          </div>
          <ul class="kc-roster">
            <li v-for="p in atRisk" :key="p.playerId">
              <BBAvatar :name="p.playerName" :avatar="avatarOf(p.playerId)" size="sm" />
              <span>{{ p.playerName }}</span>
            </li>
            <li v-if="!atRisk.length" class="kc-note">无人待确认</li>
          </ul>
        </section>
        <details class="kc-panel kc-disclosure kc-record" :open="!isEnded">
          <summary>宣布记录</summary>
          <div class="kc-panel-body">
            <CeremonyChat room-id="dining_room" title="餐厅" empty-text="暂无宣布" />
          </div>
        </details>
      </aside>
    </div>

    <footer v-if="!isStarted && (canSetup || canStartCeremony)" class="kc-toolbar">
      <p class="kc-note" role="status">
        {{ prepared ? '准备已保存，管理员可以开始仪式。' : '选定名单后，可保存安全顺序和两份发言稿。' }}
      </p>
      <div class="kc-form-actions">
        <button v-if="canSetup" type="button" class="kc-button" :class="{ 'kc-secondary': canStartCeremony && prepared }"
          :disabled="selectedNominees.length !== nomineeCount || submitting" @click="submit">
          {{ submitting ? '保存中…' : prepared ? '保存修改' : '保存提名准备' }}
        </button>
        <button v-if="canStartCeremony" type="button" class="kc-button" :class="{ 'kc-secondary': !prepared }"
          :disabled="!prepared || starting" @click="emit('start')">
          {{ starting ? '开始中…' : '开始仪式' }}
        </button>
      </div>
    </footer>
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
const isEnded = computed(() => isStarted.value && !!props.keyCeremony?.ended)
const ceremonySteps = ['准备', '开场', '钥匙揭晓', '结束发言', '结果']
const activeStep = computed(() => {
  if (!isStarted.value) return 0
  if (isEnded.value) return 4
  if (!props.keyCeremony.openingSpoken) return 1
  return allKeysDone.value ? 3 : 2
})
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
.key-ceremony {
  --kc-surface: #1b1625;
  --kc-raised: #231c30;
  --kc-line: #b39bff29;
  --kc-fg: #f3edf9;
  --kc-muted: #bfb2ce;
  --kc-gold: #f3d49b;
  display: grid;
  gap: 16px;
  min-width: 0;
  padding: clamp(14px, 3vw, 24px);
  border: 1px solid var(--kc-line);
  border-radius: 18px;
  background: var(--kc-surface);
  color: var(--kc-fg);
  container: nomination / inline-size;
}

.kc-top, .kc-panel-head, .kc-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
}
.kc-top h2 { margin: 0; font-size: clamp(21px, 3.3vw, 28px); }
.kc-panel h3 { margin: 0; font-size: 16px; }
.kc-note, .kc-count { color: var(--kc-muted); font-size: 13px; line-height: 1.5; }
.kc-count { font-variant-numeric: tabular-nums; }
.kc-status {
  display: inline-flex;
  align-items: center;
  padding: 4px 11px;
  border-radius: 99px;
  background: #f3d49b14;
  color: var(--kc-gold);
  font-size: 13px;
  font-weight: 650;
}

.kc-steps {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.kc-steps li {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 9px 5px;
  border-top: 2px solid var(--kc-line);
  color: var(--kc-muted);
  font-size: 12px;
}
.kc-steps li.current { border-color: var(--kc-gold); color: var(--kc-gold); font-weight: 700; }
.kc-steps li.complete { border-color: #8bbba580; color: #abd8c3; }

.kc-setup, .kc-floor, .kc-main, .kc-operations, .kc-sidebar {
  display: grid;
  gap: 12px;
  min-width: 0;
  align-content: start;
}
.kc-panel {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--kc-line);
  border-radius: 12px;
  background: var(--kc-raised);
}
.kc-panel-head { margin-bottom: 12px; }
.kc-panel-head + .kc-note { margin: -4px 0 10px; }

.kc-candidate-grid, .kc-keys {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 130px), 1fr));
  gap: 8px;
}
.kc-candidate, .kc-key {
  min-width: 0;
  min-height: 46px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px;
  text-align: start;
  color: inherit;
  border: 1px solid var(--kc-line);
  border-radius: 8px;
  background: #15111f;
  overflow-wrap: anywhere;
}
.kc-candidate { font: inherit; font-size: 14px; cursor: pointer; }
.kc-candidate:hover { border-color: var(--kc-gold); }
.kc-candidate[aria-pressed="true"] { background: #f3d49b19; border-color: var(--kc-gold); color: var(--kc-gold); }
.kc-selection { margin-inline-start: auto; color: var(--kc-gold); font-weight: 700; }
.kc-order, .kc-roster, .kc-keys { list-style: none; margin: 0; padding: 0; }
.kc-order { display: grid; gap: 5px; }
.kc-safe-order .kc-order { max-height: 300px; overflow-y: auto; }
.kc-order-row {
  display: grid;
  grid-template-columns: auto minmax(0,1fr) auto auto;
  align-items: center;
  gap: 6px;
  min-height: 42px;
  padding: 3px;
  border-bottom: 1px solid var(--kc-line);
}
.kc-number, .kc-key-index { min-width: 24px; color: var(--kc-muted); font-size: 12px; text-align: center; }
.kc-person { min-width: 0; font-size: 14px; overflow-wrap: anywhere; }
.kc-icon-btn {
  width: 36px;
  height: 36px;
  border: 1px solid var(--kc-line);
  border-radius: 7px;
  background: #15111f;
  color: var(--kc-fg);
  cursor: pointer;
}

.kc-disclosure { padding: 0; }
.kc-disclosure summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 13px 14px;
  cursor: pointer;
  font-weight: 650;
  list-style: none;
}
.kc-disclosure summary::-webkit-details-marker { display: none; }
.kc-disclosure summary::after { content: '⌄'; color: var(--kc-muted); margin-inline-start: auto; }
.kc-disclosure[open] summary::after { content: '⌃'; }
.kc-panel-body { display: grid; gap: 10px; padding: 0 14px 14px; }
.kc-form-actions, .kc-announce-form { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.kc-input {
  width: 100%;
  min-width: 0;
  min-height: 42px;
  padding: 9px 11px;
  border: 1px solid var(--kc-line);
  border-radius: 8px;
  background: #130f1c;
  color: var(--kc-fg);
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
}
textarea.kc-input { resize: vertical; }
.kc-announce-form .kc-input { flex: 1 1 180px; }
.kc-speech-preview { display: grid; gap: 6px; color: var(--kc-muted); font-size: 14px; line-height: 1.5; }
.kc-speech-preview strong { color: var(--kc-fg); }

.kc-button {
  min-height: 42px;
  padding: 8px 14px;
  border: 1px solid var(--kc-gold);
  border-radius: 8px;
  background: var(--kc-gold);
  color: #261b16;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
.kc-button.kc-secondary { background: transparent; color: var(--kc-gold); border-color: var(--kc-line); }
.kc-button:not(:disabled):hover, .kc-icon-btn:not(:disabled):hover { filter: brightness(1.12); }
.kc-button:disabled, .kc-icon-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.kc-toolbar { padding: 12px 0 0; border-top: 1px solid var(--kc-line); }
.kc-active-panel { border-color: #f3d49b88; }
.kc-live-action { background: linear-gradient(135deg, #342a2b, var(--kc-raised) 85%); }
.kc-wait, .kc-empty { padding: 14px; background: #b39bff0d; border-radius: 8px; color: var(--kc-muted); line-height: 1.5; }
.kc-reveal { padding: 8px 0; color: var(--kc-gold); overflow-wrap: anywhere; }
.kc-progress { width: 100%; height: 6px; display: block; margin-bottom: 12px; accent-color: var(--kc-gold); }
.kc-key { color: var(--kc-muted); font-size: 13px; }
.kc-key.safe { background: #65b99a13; border-color: #65b99a66; color: #b5e5cf; }
.kc-key.pending { border-color: #f3d49b88; color: var(--kc-gold); }
.kc-roster { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 100px), 1fr)); gap: 7px; }
.kc-roster li { display: flex; align-items: center; gap: 6px; color: var(--kc-muted); font-size: 13px; overflow-wrap: anywhere; }
.kc-record :deep(.ceremony-chat) { padding: 0; border: 0; background: transparent; }
.kc-record :deep(.cc-title) { color: var(--kc-muted); font-size: 12px; font-weight: 500; }

@container nomination (min-width: 680px) {
  .kc-setup, .kc-floor-live { grid-template-columns: minmax(0, 1.85fr) minmax(210px, 1fr); align-items: start; }
  .kc-draft-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
}
@container nomination (max-width: 390px) {
  .kc-candidate-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .kc-toolbar > .kc-form-actions { width: 100%; }
  .kc-toolbar .kc-button { flex: 1 1 auto; }
}
</style>
