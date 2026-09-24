<template>
  <div class="training-page">
    <div class="page-header">
      <h1>训练中心</h1>
      <p class="subtitle">第{{ currentRound }}公演 · 翻开卡牌提升属性</p>
    </div>

    <!-- 未开放提示 -->
    <div v-if="!isTrainingReleased" class="release-locked-banner">
      <span class="lock-icon">🔒</span>
      <div class="lock-text">
        <div class="lock-title">训练入口尚未开放</div>
        <div class="lock-desc">请等待管理员在并发行动中心开放训练</div>
      </div>
    </div>

    <!-- ===== 属性面板 ===== -->
    <div v-if="attrsLoaded" class="attr-panel">
      <div class="attr-item vocal">
        <span class="attr-icon">🎤</span>
        <div class="attr-body">
          <span class="attr-label">声乐</span>
          <span class="attr-value">{{ attributes.vocal }}</span>
        </div>
        <div class="attr-bar"><div class="attr-fill vocal" :style="{ width: attributes.vocal + '%' }"></div></div>
      </div>
      <div class="attr-item dance">
        <span class="attr-icon">💃</span>
        <div class="attr-body">
          <span class="attr-label">舞蹈</span>
          <span class="attr-value">{{ attributes.dance }}</span>
        </div>
        <div class="attr-bar"><div class="attr-fill dance" :style="{ width: attributes.dance + '%' }"></div></div>
      </div>
      <div class="attr-item charm">
        <span class="attr-icon">✨</span>
        <div class="attr-body">
          <span class="attr-label">魅力</span>
          <span class="attr-value">{{ attributes.charm }}</span>
        </div>
        <div class="attr-bar"><div class="attr-fill charm" :style="{ width: attributes.charm + '%' }"></div></div>
      </div>
      <div class="training-info">
        <span>剩余训练：<strong>{{ remainingDraws }}</strong> 次</span>
        <span>已训练：<strong>{{ trainingCount }}</strong> 次</span>
      </div>
    </div>
    <div v-else class="attr-panel attr-panel-loading">
      <t-loading text="加载属性中..." />
    </div>

    <!-- ===== 训练结束确认 & 公演骰子 ===== -->
    <div class="finish-rating-section">
      <div class="finish-row">
        <div class="finish-info">
          <span class="finish-title">训练结束确认</span>
          <span class="finish-desc">确认后本轮不可再抽卡，并可投掷公演骰子（个人评级，仅受声乐/舞蹈影响）</span>
        </div>
        <t-button v-if="!trainingFinished" theme="primary" :loading="finishing" @click="handleFinishTraining">确定训练结束</t-button>
        <t-tag v-else theme="success" variant="light">已确认训练结束</t-tag>
      </div>

      <div v-if="trainingFinished" class="rating-box" :class="{ rolling, settling }">
        <div class="rating-title">🎯 个人评级掷骰</div>
        <!-- 骰子：滚动 / 落定 / 已投掷 均显示，点数不消失 -->
        <div v-if="rolling || settling || ratingInfo?.rating" class="dice-anim">
          <div class="dice-face" :class="{ settle: !rolling }">{{ diceDisplay }}</div>
          <div class="dice-hint">{{ rolling ? '骰子投掷中…' : (settling ? '点数已定…' : '最终点数') }}</div>
        </div>
        <template v-if="ratingInfo">
          <div v-if="ratingInfo.rating" class="rating-result">
            <span class="rr-badge" :class="'r-' + ratingInfo.rating">{{ ratingInfo.rating }}</span>
            <span>{{ ratingText(ratingInfo.rating) }} · 掷出点数 {{ ratingInfo.roll ?? '—' }}</span>
          </div>
          <template v-else-if="!rolling && !settling">
            <div v-if="!ratingInfo.hasSong" class="rating-warn">你的队伍尚未选择歌曲，无法投掷公演骰子</div>
            <template v-else>
              <div class="rating-info-line">
                歌曲「{{ ratingInfo.song.name }}」 · 难度 {{ ratingInfo.song.difficulty }} 面骰 · 风险值 {{ ratingInfo.song.risk }} · 主属性 {{ attrText(ratingInfo.song.mainAttribute) }}
              </div>
              <div class="face-table">
                <div class="face-row"><span class="fr-name">A 完美</span><span class="fr-range">{{ faceRangeText('a') }}</span></div>
                <div class="face-row"><span class="fr-name">B 正常</span><span class="fr-range">{{ faceRangeText('b') }}</span></div>
                <div class="face-row"><span class="fr-name">C 翻车</span><span class="fr-range">{{ faceRangeText('c') }}</span></div>
                <div class="face-row"><span class="fr-name">D 超级翻车</span><span class="fr-range">{{ faceRangeText('d') }}</span></div>
              </div>
              <t-button theme="primary" size="large" @click="handleRollRating">🎲 点击投掷公演骰子</t-button>
            </template>
          </template>
        </template>
        <div v-else-if="!rolling && !settling" class="rating-loading">加载中...</div>
      </div>
    </div>

    <!-- ===== 有限卡池（带序号，每张仅可被一人抽走） ===== -->
    <div v-if="pool && pool.totalCards > 0" class="cards-section">
      <div class="pool-header">
        <h2 class="section-title">🎴 卡池 <span class="section-sub">共 {{ pool.totalCards }} 张 · 每人可抽 {{ pool.perPersonDrawCount }} 张 · 已抽 {{ myDrawnCount }} 张</span></h2>
        <div class="pool-controls">
          <span class="pool-hint">每次随机展示 {{ poolSample }} 张</span>
          <t-button variant="outline" size="small" :loading="poolLoading" @click="handleRefreshPool">🔄 换一批</t-button>
        </div>
      </div>
      <div class="pool-grid" :class="{ 'grid-settling': settlingSlotIndex !== null }">
        <div
          v-for="c in pagedPoolCards"
          :key="c.index"
          class="pool-slot"
          :class="{
            mine: c.mine,
            taken: c.drawn && !c.mine,
            disabled: isTrainingLocked || c.drawn,
            settling: settlingSlotIndex === c.index,
            revealed: revealedSlotIndex === c.index
          }"
          @click="handlePoolDraw(c)"
        >
          <template v-if="settlingSlotIndex === c.index">
            <div class="slot-settling">
              <t-loading size="small" />
              <span>结算中…</span>
            </div>
          </template>
          <template v-else-if="c.drawn && c.mine && c.card">
            <span class="cf-type">{{ getTypeLabel(c.card.type) }}</span>
            <span class="cf-name">{{ c.card.name }}</span>
            <span class="cf-desc">{{ formatEffect(c.delta || c.card.effect) }}</span>
          </template>
          <template v-else-if="c.drawn">
            <span class="taken-text">已被<br/><strong>{{ c.drawnByName }}</strong><br/>抽走</span>
          </template>
          <template v-else>
            <span class="cb-icon">🎴</span>
            <span class="cb-num">{{ c.index }}</span>
          </template>
        </div>
      </div>
      <div class="pool-pager">
        <t-button v-if="!isTrainingLocked" variant="outline" :loading="poolLoading" @click="handleRefreshPool">
          🔄 换一批（剩余未翻开 {{ pool?.totalFiltered ?? 0 }} 张）
        </t-button>
      </div>
    </div>

    <!-- ===== 尚未生成卡池：需等待管理员生成后才能抽取 ===== -->
    <div v-else class="cards-section">
      <h2 class="section-title">🎴 训练卡池</h2>
      <div class="pool-locked">
        <span class="pl-icon">🔒</span>
        <div class="pl-text">
          <div class="pl-title">卡池尚未生成</div>
          <div class="pl-desc">请等待管理员在本轮「卡池设置」中生成卡池后再抽取</div>
        </div>
      </div>
    </div>

    <!-- ===== 训练记录（表格） ===== -->
    <div v-if="changeLog.length > 0" class="log-section">
      <h2 class="section-title">📋 训练记录</h2>
      <table class="log-table">
        <thead>
          <tr>
            <th class="col-idx">#</th>
            <th class="col-name">卡牌</th>
            <th class="col-desc">描述</th>
            <th class="col-effect">效果</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(log, i) in changeLog" :key="i">
            <td class="col-idx">{{ log.cardIndex != null ? `#${log.cardIndex}` : (i + 1) }}</td>
            <td class="col-name">{{ log.cardName }}</td>
            <td class="col-desc">{{ log.desc || '-' }}</td>
            <td class="col-effect">
              <span v-if="log.vocal" :class="log.vocal > 0 ? 'up' : 'down'">🎤{{ log.vocal > 0 ? '+' : '' }}{{ log.vocal }}</span>
              <span v-if="log.dance" :class="log.dance > 0 ? 'up' : 'down'">💃{{ log.dance > 0 ? '+' : '' }}{{ log.dance }}</span>
              <span v-if="log.charm" :class="log.charm > 0 ? 'up' : 'down'">✨{{ log.charm > 0 ? '+' : '' }}{{ log.charm }}</span>
              <span v-if="!log.vocal && !log.dance && !log.charm" class="no-effect">无属性变化</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/authStore'
import { useTrainingCardStore } from '../../stores/trainingCardStore'
import { usePlayerStore } from '../../stores/playerStore'
import { getConcurrentReleaseStatus, getTrainingPool, drawFromPool, getMyRatingInfo, rollPerformanceRating, finishTraining } from '../../services/api'
import { useSfRefresh } from '../../composables/useSfRefresh'
import type { ConcurrentReleaseStatusResponse } from '../../types/season'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'

const route = useRoute()
const authStore = useAuthStore()
const trainingStore = useTrainingCardStore()
const playerStore = usePlayerStore()

const currentRound = computed(() => parseInt(route.params.round as string) || 1)
const currentUser = computed(() => authStore.currentUser)

// 并发阶段释放状态
const releaseStatus = ref<ConcurrentReleaseStatusResponse | null>(null)
const isTrainingReleased = computed(() => !!releaseStatus.value?.trainingReleased)

// 属性值（实时响应）
const attributes = reactive({ vocal: 0, dance: 0, charm: 0 })
const attrsLoaded = ref(false)

// 训练次数
const remainingDraws = ref(0)
const trainingCount = ref(0)

// ===== 训练结束确认 & 公演骰子 =====
const trainingFinished = ref(false)
const finishing = ref(false)
const ratingInfo = ref<any>(null)
const rolling = ref(false)
const settling = ref(false)
const diceDisplay = ref(1)
let diceTimer: number | undefined
function ratingText(r: string): string {
  const m: Record<string, string> = { S: '超级完美', A: '完美', B: '正常', C: '翻车', D: '超级翻车' }
  return m[r] || r
}
function attrText(a?: string): string {
  const m: Record<string, string> = { vocal: '🎤 声乐', dance: '💃 舞蹈', charm: '✨ 魅力' }
  return m[a || 'vocal'] || '—'
}
function faceRangeText(key: 'a' | 'b' | 'c' | 'd'): string {
  const f = ratingInfo.value?.faces?.faces
  if (!f) return '-'
  const total = f.total || 1
  let start = 1
  const mk = (n: number) => {
    if (!n || n <= 0) return '—'
    const s = start
    start += n
    return `${s}${n > 1 ? '-' + (s + n - 1) : ''} 点（${Math.round((n / total) * 100)}%）`
  }
  const map: Record<'a' | 'b' | 'c' | 'd', string> = { a: mk(f.a), b: mk(f.b), c: mk(f.c), d: mk(f.d || 0) }
  return map[key]
}
async function loadRatingInfo() {
  try {
    ratingInfo.value = await getMyRatingInfo()
    trainingFinished.value = !!ratingInfo.value?.finished
    if (ratingInfo.value?.rating && ratingInfo.value?.roll != null) {
      diceDisplay.value = ratingInfo.value.roll
    }
  } catch { /* ignore */ }
}
async function handleFinishTraining() {
  finishing.value = true
  try {
    await finishTraining(`round-${currentRound.value}`, true)
    trainingFinished.value = true
    await loadRatingInfo()
    MessagePlugin.success('已确认训练结束，可投掷公演骰子')
  } catch (e: any) {
    MessagePlugin.error(e?.message || '操作失败')
  } finally {
    finishing.value = false
  }
}
async function handleRollRating() {
  if (rolling.value || settling.value) return
  rolling.value = true
  settling.value = false
  const maxFace = ratingInfo.value?.faces?.difficulty || ratingInfo.value?.song?.difficulty || 6
  diceDisplay.value = 1
  const start = Date.now()
  if (diceTimer) window.clearInterval(diceTimer)
  diceTimer = window.setInterval(() => {
    diceDisplay.value = Math.floor(Math.random() * maxFace) + 1
  }, 70)

  try {
    const res = await rollPerformanceRating(`round-${currentRound.value}`)
    // 至少滚动 1.4s 再定格点数
    const wait = Math.max(0, 1400 - (Date.now() - start))
    if (wait) await new Promise(r => setTimeout(r, wait))
    if (diceTimer) { window.clearInterval(diceTimer); diceTimer = undefined }
    // 先定格最终点数，做一次“落定”动画
    diceDisplay.value = res.roll ?? maxFace
    rolling.value = false
    settling.value = true
    await new Promise(r => setTimeout(r, 650))
    // 再显示评级徽章（带弹出动画）
    settling.value = false
    if (ratingInfo.value) {
      ratingInfo.value.rating = res.rating
      ratingInfo.value.roll = res.roll
    }
    MessagePlugin.success(`掷骰结果：${res.rating}（${res.roll ?? '—'} 点）`)
  } catch (e: any) {
    if (diceTimer) { window.clearInterval(diceTimer); diceTimer = undefined }
    rolling.value = false
    settling.value = false
    MessagePlugin.error(e?.message || '投掷失败')
  }
}

const isTrainingLocked = computed(() => remainingDraws.value <= 0 || !isTrainingReleased.value || trainingFinished.value)

// 50 个卡槽
interface CardResult {
  type: string; name: string; desc?: string
  vocal: number; dance: number; charm: number
}
interface CardSlot {
  flipped: boolean
  result: CardResult | null
}
const cardSlots = reactive<CardSlot[]>(
  Array.from({ length: 50 }, () => ({ flipped: false, result: null }))
)

// 变动记录
const changeLog = reactive<{ cardName: string; cardIndex?: number | null; vocal: number; dance: number; charm: number; desc?: string }[]>([])

// ===== 有限卡池 =====
const pool = ref<any>(null)
const poolDrawing = ref(false)
const settlingSlotIndex = ref<number | null>(null)
const revealedSlotIndex = ref<number | null>(null)
function flashReveal(index: number) {
  revealedSlotIndex.value = index
  window.setTimeout(() => { if (revealedSlotIndex.value === index) revealedSlotIndex.value = null }, 700)
}
// 随机抽样模式：每次只加载 10 张，点击哪张抽哪张，「换一批」重新随机
const poolSample = ref(10)
const poolLoading = ref(false)
// 抽样种子：同一 seed 结果稳定（websocket 刷新不乱跳），「换一批」时更换
const poolSeed = ref(Math.floor(Math.random() * 1e9))

const myDrawnCount = computed(() => pool.value?.myDrawnCount || 0)
const pagedPoolCards = computed(() => pool.value?.cards || [])

async function handleRefreshPool() {
  poolSeed.value = Math.floor(Math.random() * 1e9)
  poolLoading.value = true
  try { await loadPool() } finally { poolLoading.value = false }
}

function formatEffect(effect: any): string {
  if (!effect) return '无属性变化'
  const parts: string[] = []
  const n = (v: number) => `${v > 0 ? '+' : ''}${v}`
  if (effect.vocal) parts.push(`🎤${n(effect.vocal)}`)
  if (effect.dance) parts.push(`💃${n(effect.dance)}`)
  if (effect.charm) parts.push(`✨${n(effect.charm)}`)
  if (effect.selfSelect) parts.push(`自选一项${n(effect.selfSelect)}`)
  if (effect.randomOne) parts.push(`随机一项${n(effect.randomOne)}`)
  if (effect.randomTwo) parts.push(`随机两项各${n(effect.randomTwo)}`)
  if (effect.lowest) parts.push(`最低属性${n(effect.lowest)}`)
  if (effect.highest) parts.push(`最高属性${n(effect.highest)}`)
  if (effect.lucky) parts.push(`随机一项${n(effect.lucky)}`)
  if (effect.teamAll) parts.push(`三项各${n(effect.teamAll)}`)
  if (effect.multiply && effect.multiply !== 1) parts.push(`随机一项×${effect.multiply}`)
  if (effect.multiplyAll && effect.multiplyAll !== 1) parts.push(`三项×${effect.multiplyAll}`)
  if (effect.balance) parts.push(`最高↓最低↑各${Math.abs(effect.balance)}`)
  if (effect.roundUp) parts.push(`随机一项向上取整至${effect.roundUp}的倍数`)
  if (effect.roundDown) parts.push(`随机一项向下取整至${effect.roundDown}的倍数`)
  return parts.join(' ') || '无属性变化'
}

// 用卡池数据同步"已训练 / 剩余训练"（以每人可抽张数为准，修复只显示 3 次的问题）
function syncFromPool() {
  if (!pool.value) return
  trainingCount.value = myDrawnCount.value
  remainingDraws.value = Math.max(0, (pool.value.perPersonDrawCount || 0) - myDrawnCount.value)
}

async function loadPool() {
  try {
    const res: any = await getTrainingPool(`round-${currentRound.value}`, {
      sample: poolSample.value,
      seed: poolSeed.value
    })
    pool.value = (res && res.totalCards > 0) ? res : null
    if (pool.value) syncFromPool()
  } catch { pool.value = null }
}

// 重建「训练记录」表格（管理端撤销/补抽后实时同步，含卡牌序号）
async function loadRecordLog() {
  const uid = currentUser.value?.id
  if (!uid) return
  try {
    await trainingStore.fetchRecords({ userId: uid, round: currentRound.value })
    const roundRecords = trainingStore.records || []
    if (trainingStore.cards.length === 0) {
      await trainingStore.fetchCards().catch(() => {})
    }
    const items = roundRecords.map((r: any) => {
      const card = trainingStore.cards.find(c => c.id === r.cardId)
      return {
        cardName: r.cardName,
        cardIndex: r.cardIndex ?? null,
        desc: card?.description || '',
        vocal: r.effect?.vocal || 0,
        dance: r.effect?.dance || 0,
        charm: r.effect?.charm || 0
      }
    })
    changeLog.splice(0, changeLog.length, ...items)
    if (!pool.value) {
      trainingCount.value = roundRecords.length
      remainingDraws.value = Math.max(0, (trainingStore.config?.drawsPerPlayer || 3) - roundRecords.length)
    }
  } catch { /* ignore */ }
}

useSfRefresh(async () => {
  await loadPool()
  await loadRecordLog()
  await loadRecordLog()
  const uid = currentUser.value?.id
  if (uid) {
    const userData = await playerStore.fetchUserById(uid).catch(() => null)
    if (userData?.attributes) {
      attributes.vocal = userData.attributes.vocal
      attributes.dance = userData.attributes.dance
      attributes.charm = userData.attributes.charm
      attrsLoaded.value = true
    }
  }
}, '/training')

async function handlePoolDraw(c: any) {
  if (!pool.value || c.drawn || isTrainingLocked.value || !currentUser.value) return
  if (poolDrawing.value) return
  poolDrawing.value = true
  settlingSlotIndex.value = c.index
  const startedAt = Date.now()
  try {
    const res: any = await drawFromPool({ roundId: `round-${currentRound.value}`, slotIndex: c.index, playerId: currentUser.value.id })
    if (res?.attributesAfter) {
      attributes.vocal = res.attributesAfter.vocal ?? attributes.vocal
      attributes.dance = res.attributesAfter.dance ?? attributes.dance
      attributes.charm = res.attributesAfter.charm ?? attributes.charm
    }
    const delta = res?.attrDelta || {}
    changeLog.unshift({ cardName: res?.card?.name || '', cardIndex: res?.cardIndex ?? null, vocal: delta.vocal || 0, dance: delta.dance || 0, charm: delta.charm || 0, desc: formatEffect(res?.card?.effect) })
    trainingCount.value += 1
    if (typeof res?.remainingDraws === 'number') remainingDraws.value = res.remainingDraws
    // 先刷新卡池（此时仍保持 loading，揭示动画在结算完成后播放）
    await loadPool()
    if (res?.isSelfSelect) {
      // 自选卡：结算未完成（需选择属性），保持 loading 直到选择完成
      showSelectDialogForPool(res.card?.effect?.selfSelect || 5, res.card?.name || '', res.recordId, () => {
        settlingSlotIndex.value = null
        flashReveal(c.index)
      })
    } else {
      // 保证 loading 至少可见 1.1s，制造"结算中"过程感，再揭示结果
      const elapsed = Date.now() - startedAt
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 1100 - elapsed)))
      settlingSlotIndex.value = null
      flashReveal(c.index)
    }
  } catch (e: any) {
    settlingSlotIndex.value = null
    MessagePlugin.error(e.message || '抽卡失败')
  } finally {
    poolDrawing.value = false
  }
}

function showSelectDialogForPool(val: number, cardName: string, recordId?: string, onSettled?: () => void) {
  const attrs = [
    { key: 'vocal', label: '🎤 声乐', current: attributes.vocal },
    { key: 'dance', label: '💃 舞蹈', current: attributes.dance },
    { key: 'charm', label: '✨ 魅力', current: attributes.charm }
  ]
  const dialog = DialogPlugin({
    header: `「${cardName}」— 选择属性`,
    body: () => h('div', { class: 'select-dialog' }, [
      h('p', { class: 'select-hint' }, `请选择要${val > 0 ? '增加' : '减少'} ${Math.abs(val)} 点的属性：`),
      h('div', { class: 'select-options' }, attrs.map(a =>
        h('button', {
          class: 'select-option',
          onClick: async () => {
            if (recordId) {
              try {
                const { applySelfSelect } = await import('../../services/api')
                const r = await applySelfSelect(recordId, a.key)
                attributes.vocal = r.attributes?.vocal ?? attributes.vocal
                attributes.dance = r.attributes?.dance ?? attributes.dance
                attributes.charm = r.attributes?.charm ?? attributes.charm
              } catch { const k = a.key as 'vocal' | 'dance' | 'charm'; attributes[k] = Math.max(0, attributes[k] + val) }
            } else {
              const k = a.key as 'vocal' | 'dance' | 'charm'; attributes[k] = Math.max(0, attributes[k] + val)
            }
            dialog.hide()
            await loadPool()
            onSettled?.()
          }
        }, `${a.label}  →  ${a.current} ${val > 0 ? '+' : ''}${val}`)
      ))
    ]),
    footer: false, closeBtn: false, width: '360px'
  })
}

// 自选属性缓存（正在等待选择的卡槽索引）
const pendingSelectIdx = ref<number | null>(null)
const pendingSelectValue = ref(0)

// 翻牌
async function handleFlip(idx: number) {
  if (isTrainingLocked.value || cardSlots[idx].flipped) return
  if (!currentUser.value) return

  try {
    cardSlots[idx].flipped = true
    const res = await trainingStore.doDraw(currentUser.value.id, currentRound.value)
    const record = res.record
    const eff = record.effect

    // 解析效果值——后端优先返回 attrDelta（已解析具体值），
    // 也可能返回原始定义（randomOne/lowest/highest）
    const attrDelta = (eff as any).attrDelta
    let rv = attrDelta?.vocal || eff.vocal || 0
    let rd = attrDelta?.dance || eff.dance || 0
    let rc = attrDelta?.charm || eff.charm || 0
    if (!rv && !rd && !rc) {
      // 原始定义 → 前端现场解析
      const cur = { vocal: attributes.vocal, dance: attributes.dance, charm: attributes.charm }
      if (eff.randomOne) {
        const pick = (['vocal', 'dance', 'charm'] as const)[Math.floor(Math.random() * 3)]
        if (pick === 'vocal') rv = eff.randomOne; else if (pick === 'dance') rd = eff.randomOne; else rc = eff.randomOne
      }
      if (eff.randomTwo) {
        const shuffled = (['vocal', 'dance', 'charm'] as const).sort(() => Math.random() - 0.5).slice(0, 2)
        for (const a of shuffled) { if (a === 'vocal') rv += eff.randomTwo; else if (a === 'dance') rd += eff.randomTwo; else rc += eff.randomTwo }
      }
      if (eff.highest) {
        const max = Math.max(cur.vocal, cur.dance, cur.charm)
        if (cur.vocal === max) rv += eff.highest; if (cur.dance === max) rd += eff.highest; if (cur.charm === max) rc += eff.highest
      }
      if (eff.lowest) {
        const min = Math.min(cur.vocal, cur.dance, cur.charm)
        if (cur.vocal === min) rv += eff.lowest; if (cur.dance === min) rd += eff.lowest; if (cur.charm === min) rc += eff.lowest
      }
      if (eff.multiply && (eff as any).multiply > 0) {
        const factor = (eff as any).multiply - 1
        const pick = (['vocal', 'dance', 'charm'] as const)[Math.floor(Math.random() * 3)]
        const delta = Math.round(cur[pick] * factor)
        if (pick === 'vocal') rv += delta; else if (pick === 'dance') rd += delta; else rc += delta
      }
      if (eff.multiplyAll && (eff as any).multiplyAll > 0) {
        const factor = (eff as any).multiplyAll - 1
        rv += Math.round(cur.vocal * factor)
        rd += Math.round(cur.dance * factor)
        rc += Math.round(cur.charm * factor)
      }
    }

    // 统一取 cardType，兼容后端可能用 type 字段
    const cardType = (record as any).cardType || (record as any).type || ''
    // 生成描述文本（record 无 description 字段时，从效果值拼接）
    const descText = buildEffectDesc(rv, rd, rc)

    // 自选卡 → 弹出对话框（通过 cardType 或 effect 中的 selfSelect 判断）
    if (cardType === 'self_select' || eff.selfSelect) {
      const val = eff.selfSelect || 5
      pendingSelectIdx.value = idx
      pendingSelectValue.value = val
      cardSlots[idx].result = {
        type: cardType, name: record.cardName,
        desc: `请选择一项属性${val > 0 ? '+' : ''}${val}`, vocal: 0, dance: 0, charm: 0
      }
      showSelectDialog(idx, val, record.cardName, record.id)
      return
    }

    applyCardResult(idx, record.cardName, cardType, rv, rd, rc, descText)
  } catch (e: any) {
    cardSlots[idx].flipped = false
    MessagePlugin.error(e.message || '训练失败')
  }
}

// 应用卡牌效果
function applyCardResult(idx: number, name: string, type: string, v: number, d: number, c: number, desc?: string) {
  cardSlots[idx].result = {
    type, name, desc,
    vocal: v, dance: d, charm: c
  }
  attributes.vocal = Math.max(0, attributes.vocal + v)
  attributes.dance = Math.max(0, attributes.dance + d)
  attributes.charm = Math.max(0, attributes.charm + c)
  changeLog.unshift({ cardName: name, vocal: v, dance: d, charm: c, desc })
  remainingDraws.value = Math.max(0, remainingDraws.value - 1)
  trainingCount.value += 1

  // 自选卡：同步更新 mock 存储中最后一条记录的 effect 为实际选择
  if (type === 'self_select') {
    try {
      const all = JSON.parse(localStorage.getItem('luck_sim_training_records') || '[]')
      const last = all[all.length - 1]
      if (last) {
        last.effect = { vocal: v, dance: d, charm: c }
        localStorage.setItem('luck_sim_training_records', JSON.stringify(all))
      }
    } catch { /* ignore */ }
  }
}

// 显示自选属性对话框
function showSelectDialog(idx: number, val: number, cardName: string, recordId?: string) {
  const attrs = [
    { key: 'vocal', label: '🎤 声乐', current: attributes.vocal },
    { key: 'dance', label: '💃 舞蹈', current: attributes.dance },
    { key: 'charm', label: '✨ 魅力', current: attributes.charm }
  ]

  const dialog = DialogPlugin({
    header: `「${cardName}」— 选择属性`,
    body: ({}) => h('div', { class: 'select-dialog' }, [
      h('p', { class: 'select-hint' }, `请选择要${val > 0 ? '增加' : '减少'} ${Math.abs(val)} 点的属性：`),
      h('div', { class: 'select-options' }, attrs.map(a =>
        h('button', {
          class: 'select-option',
          onClick: async () => {
            // 调用后端 API 持久化选择
            if (recordId) {
              try {
                const { applySelfSelect } = await import('../../services/api')
                const res = await applySelfSelect(recordId, a.key)
                // 用后端返回的结果更新本地属性
                attributes.vocal = res.attributes?.vocal ?? Math.max(0, attributes.vocal + (a.key === 'vocal' ? val : 0))
                attributes.dance = res.attributes?.dance ?? Math.max(0, attributes.dance + (a.key === 'dance' ? val : 0))
                attributes.charm = res.attributes?.charm ?? Math.max(0, attributes.charm + (a.key === 'charm' ? val : 0))
              } catch (e: any) {
                console.warn('[训练] 自选属性同步失败，仅本地更新:', e.message)
                // 降级：本地更新
                const attrKey = a.key as 'vocal' | 'dance' | 'charm'
                attributes[attrKey] = Math.max(0, attributes[attrKey] + val)
              }
            } else {
              // 无 recordId（Mock 模式），直接本地更新
              const attrKey = a.key as 'vocal' | 'dance' | 'charm'
              attributes[attrKey] = Math.max(0, attributes[attrKey] + val)
            }

            const ov = a.key === 'vocal' ? val : 0
            const od = a.key === 'dance' ? val : 0
            const oc = a.key === 'charm' ? val : 0
            applyCardResult(idx, cardName, 'self_select', ov, od, oc, `自选：${a.label} ${val > 0 ? '+' : ''}${val}`)
            dialog.hide()
          }
        }, `${a.label}  →  ${a.current} ${val > 0 ? '+' : ''}${val}`)
      ))
    ]),
    footer: false,
    closeBtn: false,
    width: '360px',
  })
}

// 从效果值生成描述文本
function buildEffectDesc(v: number, d: number, c: number): string {
  const parts: string[] = []
  if (v) parts.push(`🎤${v > 0 ? '+' : ''}${v}`)
  if (d) parts.push(`💃${d > 0 ? '+' : ''}${d}`)
  if (c) parts.push(`✨${c > 0 ? '+' : ''}${c}`)
  return parts.join(' ') || '无效果'
}

// 类型显示
function getTypeLabel(type: string): string {
  const m: Record<string, string> = { vocal: '声乐', dance: '舞蹈', charm: '魅力', mixed: '综合', event: '事件' }
  return m[type] || type
}

async function loadReleaseStatus() {
  try {
    releaseStatus.value = await getConcurrentReleaseStatus(`round-${currentRound.value}`)
  } catch (e) {
    releaseStatus.value = null
  }
}

onMounted(async () => {
  if (!currentUser.value) return
  try {
    const uid = currentUser.value.id

    // 1. 从后端加载用户最新属性
    const userData = await playerStore.fetchUserById(uid)
    if (userData?.attributes) {
      attributes.vocal = userData.attributes.vocal
      attributes.dance = userData.attributes.dance
      attributes.charm = userData.attributes.charm
    }

    // 2. 加载训练配置与释放状态
    await Promise.all([trainingStore.fetchConfig(), loadReleaseStatus()])
    const config = trainingStore.config
    remainingDraws.value = config?.drawsPerPlayer || 3

    // 3. 加载本轮训练记录
    await trainingStore.fetchRecords({ userId: uid, round: currentRound.value })
    const roundRecords = trainingStore.records
    console.log('[训练] 本轮记录数:', roundRecords.length)
    trainingCount.value = roundRecords.length
    remainingDraws.value = Math.max(0, (config?.drawsPerPlayer || 3) - roundRecords.length)

    // 4. 回填变动记录（含描述）
    if (trainingStore.cards.length === 0) {
      await trainingStore.fetchCards()
    }
    for (const r of roundRecords) {
      const card = trainingStore.cards.find(c => c.id === r.cardId)
      changeLog.push({
        cardName: r.cardName,
        cardIndex: (r as any).cardIndex ?? null,
        desc: card?.description || '',
        vocal: r.effect.vocal || 0,
        dance: r.effect.dance || 0,
        charm: r.effect.charm || 0
      })
    }

    // 5. 加载有限卡池（若管理员已配置）
    await loadPool()
    // 5.1 加载训练结束状态与公演骰子信息
    await loadRatingInfo()

    // 全部关键数据就绪后再展示属性面板（避免先显示占位数值）
    attrsLoaded.value = true

    // 6. 启动释放状态轮询
    startReleasePolling()
  } catch (e) {
    console.warn('[Training] 加载失败:', e)
    attrsLoaded.value = true
  }
})

let releaseTimer: number | undefined

onBeforeUnmount(() => {
  if (releaseTimer) window.clearInterval(releaseTimer)
  if (diceTimer) window.clearInterval(diceTimer)
})

// 轮询释放状态：管理员开放后选手端自动解锁
async function startReleasePolling() {
  releaseTimer = window.setInterval(() => { if (!document.hidden) loadReleaseStatus() }, 8000)
}
</script>

<style lang="scss" scoped>
.training-page {
  max-width: 1000px;
  margin: 0 auto;
  padding: 0 4px;
color: var(--text-primary);
}

.release-locked-banner {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; margin-bottom: 20px;
  background: rgba(255, 215, 0, 0.08);
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 12px;
  .lock-icon { font-size: 24px; }
  .lock-text { flex: 1; }
  .lock-title { font-size: 14px; font-weight: 600; color: #ffd700; }
  .lock-desc { font-size: 12px; color: var(--text-tertiary); }
}

.page-header {
  position: relative;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
  &::after {
    content: '';
    position: absolute;
    bottom: -1px; left: 0;
    width: 80px; height: 2px;
    background: linear-gradient(90deg, #ffd700, #ff6b6b, #a29bfe);
    border-radius: 2px;
  }
  h1 { font-size: 26px; font-weight: 800; margin: 0 0 6px 0; letter-spacing: 1px; }
  .subtitle { color: var(--text-tertiary); margin: 0; font-size: 14px; }
}

// ===== 属性面板 =====
.attr-panel {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
  margin-bottom: 24px;

  @media (max-width: 600px) { grid-template-columns: 1fr; }
}

.attr-panel-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
}

.attr-item {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px;
  position: relative;

  .attr-icon { font-size: 24px; }
  .attr-body {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 6px 0 8px;
  }
  .attr-label { font-size: 13px; color: var(--text-tertiary); }
  .attr-value { font-size: 22px; font-weight: 800; }

  .attr-bar {
    height: 4px;
    background: var(--hover-bg);
    border-radius: 4px;
    overflow: hidden;
  }
  .attr-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.5s ease;
  }
  &.vocal .attr-fill { background: linear-gradient(90deg, #3498db, #2980b9); }
  &.vocal .attr-value { color: #3498db; }
  &.dance .attr-fill { background: linear-gradient(90deg, #e67e22, #d35400); }
  &.dance .attr-value { color: #e67e22; }
  &.charm .attr-fill { background: linear-gradient(90deg, #9b59b6, #8e44ad); }
  &.charm .attr-value { color: #9b59b6; }
}

.training-info {
  grid-column: 1 / -1;
  display: flex;
  gap: 24px;
  justify-content: center;
  padding: 10px;
  background: var(--hover-bg);
  border-radius: 10px;
  font-size: 14px;
  color: var(--text-tertiary);
  strong { color: #ffd700; }
}

// ===== 区块标题 =====
.section-title {
  font-size: 17px;
  font-weight: 700;
  margin: 0 0 14px 0;
  display: flex;
  align-items: center;
  gap: 8px;
  .section-sub { font-size: 13px; font-weight: 400; color: var(--text-muted); }
}

// ===== 卡牌网格 =====
.cards-section { margin-bottom: 28px; }

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 8px;

  @media (min-width: 700px) {
    grid-template-columns: repeat(10, 1fr);
  }
}

.card-slot {
  aspect-ratio: 3/4;
  perspective: 600px;
  cursor: pointer;
  &.disabled { pointer-events: none; }

  .card-inner {
    position: relative;
    width: 100%; height: 100%;
    transition: transform 0.5s ease;
    transform-style: preserve-3d;
  }

  &.flipped .card-inner { transform: rotateY(180deg); }

  .card-back, .card-front {
    position: absolute;
    inset: 0;
    backface-visibility: hidden;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4px;
    font-size: 11px;
    text-align: center;
  }

  .card-back {
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: var(--text-primary);
    .cb-icon { font-size: 22px; }
    .cb-num { font-size: 10px; opacity: 0.5; margin-top: 2px; }
  }

  .card-front {
    transform: rotateY(180deg);
    gap: 2px;
    padding: 6px 4px;

    &.vocal { background: linear-gradient(135deg, #3498db, #2980b9); }
    &.dance { background: linear-gradient(135deg, #e67e22, #d35400); }
    &.charm { background: linear-gradient(135deg, #9b59b6, #8e44ad); }
    &.mixed { background: linear-gradient(135deg, #1abc9c, #16a085); }
    &.event { background: linear-gradient(135deg, #e74c3c, #c0392b); }
    &.self_select { background: linear-gradient(135deg, #f39c12, #e67e22); }

    .cf-type { font-size: 9px; opacity: 0.7; }
    .cf-name { font-size: 10px; font-weight: 700; line-height: 1.2; }
    .cf-desc { font-size: 9px; opacity: 0.8; line-height: 1.2; text-align: center; }

    .cf-effects { display: flex; gap: 2px; flex-wrap: wrap; justify-content: center; }
    .cf-effect {
      font-size: 10px; padding: 1px 4px; border-radius: 3px;
      &.up { background: var(--hover-bg); }
      &.down { background: rgba(0,0,0,0.2); }
    }
  }
}

// ===== 训练记录表格 =====
.log-section { margin-bottom: 28px; width: 100%; max-width: 700px; }

.log-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  thead th {
    text-align: left;
    padding: 10px 12px;
    color: var(--text-muted);
    font-weight: 500;
    font-size: 12px;
    border-bottom: 1px solid var(--border-color);
  }

  tbody tr {
    transition: background 0.2s;
    &:hover { background: var(--hover-bg); }
    border-bottom: 1px solid var(--border-color);
  }

  td {
    padding: 10px 12px;
    vertical-align: middle;
  }

  .col-idx { width: 40px; color: var(--text-muted); }
  .col-name { width: 100px; font-weight: 600; color: var(--text-secondary); }
  .col-desc { color: var(--text-tertiary); font-size: 12px; }
  .col-effect {
    width: 140px;
    text-align: right;
    white-space: nowrap;
    span { margin-left: 6px; }
    .up { color: #2ecc71; }
    .down { color: #e74c3c; }
    .no-effect { color: var(--text-muted); font-size: 12px; }
  }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}

// ===== 自选属性对话框 =====
:deep(.select-dialog) {
  text-align: center;
  .select-hint {
    color: var(--text-secondary);
    font-size: 14px;
    margin: 0 0 16px;
  }
  .select-options {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .select-option {
    padding: 12px 20px;
    border: 1px solid rgba(255,215,0,0.3);
    border-radius: 10px;
    background: linear-gradient(135deg, rgba(255,215,0,0.1), rgba(255,107,107,0.05));
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    &:hover {
      background: linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,107,107,0.1));
      border-color: rgba(255,215,0,0.5);
      transform: translateY(-1px);
    }
  }
}

.pool-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }.pool-controls { display: flex; align-items: center; gap: 10px; }
.pool-hint { font-size: 12px; color: var(--text-tertiary); }
.pool-pager { display: flex; justify-content: center; margin-top: 14px; }
.pool-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 10px; }
.pool-grid.grid-settling .pool-slot:not(.settling) { opacity: .45; filter: grayscale(0.4); pointer-events: none; }
.pool-slot { aspect-ratio: 3/4; border-radius: 10px; border: 1px solid var(--border-color, #333); background: rgba(255,255,255,0.03); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; cursor: pointer; text-align: center; padding: 6px; transition: all .15s; position: relative; }
.pool-slot.settling { border-color: #00d6a4; box-shadow: 0 0 14px rgba(0,214,164,0.5); pointer-events: none; z-index: 2; }
.pool-slot .slot-settling { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; border-radius: 10px; background: rgba(0,0,0,0.5); color: #00d6a4; font-size: 12px; font-weight: 600; animation: slotPulse 1s ease-in-out infinite; z-index: 3; }
@keyframes slotPulse { 0%,100% { opacity: .85; } 50% { opacity: 1; } }
.pool-slot.revealed { animation: cardReveal .6s cubic-bezier(0.2, 1.2, 0.4, 1); }
@keyframes cardReveal {
  0% { transform: rotateY(90deg) scale(0.85); opacity: 0; }
  55% { transform: rotateY(-12deg) scale(1.06); opacity: 1; }
  100% { transform: rotateY(0) scale(1); opacity: 1; }
}
.pool-slot:hover:not(.disabled) { border-color: #00d6a4; transform: translateY(-2px); }
.pool-slot.disabled { cursor: not-allowed; opacity: .85; }
.pool-slot.mine { border-color: #00d6a4; background: rgba(0,214,164,0.12); cursor: default; }
.pool-slot.taken { background: rgba(255,255,255,0.02); opacity: .5; cursor: not-allowed; }
.pool-slot .cb-icon { font-size: 26px; }
.pool-slot .cb-num { font-size: 12px; opacity: .6; }
.pool-slot .cf-type { font-size: 10px; padding: 1px 6px; border-radius: 6px; background: rgba(0,214,164,0.2); }
.pool-slot .cf-name { font-size: 12px; font-weight: 600; word-break: break-all; }
.pool-slot .cf-desc { font-size: 10px; opacity: .75; word-break: break-all; }
.pool-slot .taken-text { font-size: 12px; opacity: .7; line-height: 1.4; }

.finish-rating-section { margin: 16px 0 24px; padding: 14px 16px; border: 1px solid var(--border-color); border-radius: 12px; background: var(--card-bg); }
.finish-rating-section .finish-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.finish-rating-section .finish-info { display: flex; flex-direction: column; gap: 2px; }
.finish-rating-section .finish-title { font-size: 14px; font-weight: 700; }
.finish-rating-section .finish-desc { font-size: 12px; color: var(--text-tertiary); }
.finish-rating-section .rating-box { margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--border-color); display: flex; flex-direction: column; align-items: center; gap: 10px; }
.finish-rating-section .rating-title { font-size: 15px; font-weight: 700; }
.finish-rating-section .rating-loading,
.finish-rating-section .rating-warn { font-size: 13px; color: var(--text-tertiary); }
.finish-rating-section .rating-result { display: flex; align-items: center; gap: 10px; font-size: 15px; }
.finish-rating-section .rr-badge { font-size: 24px; font-weight: 800; color: #0052d9; }
.finish-rating-section .rating-info-line { font-size: 13px; color: var(--text-secondary); text-align: center; }
.finish-rating-section .face-table { width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: 4px; }
.finish-rating-section .face-row { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 8px; background: var(--hover-bg); border-radius: 6px; }
.finish-rating-section .face-row .fr-name { font-weight: 600; }
.finish-rating-section .face-row .fr-range { color: var(--text-secondary); }

.finish-rating-section .rating-box.rolling { animation: diceShake 0.4s infinite; }
.finish-rating-section .rating-box.rolling .rating-title { animation: glowPulse 0.9s infinite; }
.finish-rating-section .rr-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 46px; height: 46px; border-radius: 12px;
  font-size: 26px; font-weight: 900; color: #fff;
  background: linear-gradient(135deg, #0052d9, #6a5acd);
  box-shadow: 0 4px 14px rgba(0, 82, 217, 0.4);
  animation: badgePop 0.6s cubic-bezier(0.2, 1.4, 0.4, 1);
}
.finish-rating-section .rr-badge.r-S { background: linear-gradient(135deg, #f39c12, #e74c3c); }
.finish-rating-section .rr-badge.r-A { background: linear-gradient(135deg, #2ba471, #4ecdc4); }
.finish-rating-section .rr-badge.r-B { background: linear-gradient(135deg, #0052d9, #4a90e2); }
.finish-rating-section .rr-badge.r-C { background: linear-gradient(135deg, #8a8f99, #b0b4bc); }
.finish-rating-section .rr-badge.r-D { background: linear-gradient(135deg, #e74c3c, #c0392b); }
@keyframes diceShake { 0%, 100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
@keyframes glowPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
@keyframes badgePop {
  0% { transform: scale(0.3) rotate(-20deg); opacity: 0; }
  60% { transform: scale(1.15) rotate(6deg); opacity: 1; }
  100% { transform: scale(1) rotate(0); }
}

.finish-rating-section .dice-anim { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 6px 0; }
.finish-rating-section .dice-face {
  width: 92px; height: 92px; border-radius: 18px;
  display: flex; align-items: center; justify-content: center;
  font-size: 46px; font-weight: 900; color: #fff;
  background: linear-gradient(135deg, #0052d9, #6a5acd);
  box-shadow: 0 8px 24px rgba(0, 82, 217, 0.45);
  animation: diceRoll 0.28s linear infinite;
}
.finish-rating-section .dice-face.settle {
  animation: diceLand 0.6s cubic-bezier(0.2, 1.5, 0.4, 1);
  background: linear-gradient(135deg, #f39c12, #e74c3c);
  box-shadow: 0 0 26px rgba(243, 156, 18, 0.6);
}
.finish-rating-section .dice-hint { font-size: 12px; color: var(--text-tertiary); }
@keyframes diceRoll {
  0% { transform: rotate(0) scale(1); }
  25% { transform: rotate(-12deg) scale(1.05); }
  50% { transform: rotate(10deg) scale(0.98); }
  75% { transform: rotate(-6deg) scale(1.04); }
  100% { transform: rotate(0) scale(1); }
}
@keyframes diceLand {
  0% { transform: scale(1.4) rotate(20deg); opacity: 0.6; }
  60% { transform: scale(0.92) rotate(-4deg); opacity: 1; }
  100% { transform: scale(1) rotate(0); }
}

.pool-locked { display: flex; align-items: center; gap: 12px; padding: 20px; border: 1px dashed var(--border-color); border-radius: 12px; background: var(--hover-bg); }
.pool-locked .pl-icon { font-size: 28px; }
.pool-locked .pl-title { font-size: 14px; font-weight: 700; }
.pool-locked .pl-desc { font-size: 12px; color: var(--text-tertiary); }
</style>
