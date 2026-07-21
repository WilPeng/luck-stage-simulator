<template>
  <div class="training-page">
    <div class="page-header">
      <h1>训练中心</h1>
      <p class="subtitle">第{{ currentRound }}公演 · 翻开卡牌提升属性</p>
    </div>

    <!-- ===== 属性面板 ===== -->
    <div class="attr-panel">
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

    <!-- ===== 卡牌网格 ===== -->
    <div class="cards-section">
      <h2 class="section-title">🎴 训练卡牌 <span class="section-sub">点击翻开一张</span></h2>
      <div class="cards-grid">
        <div
          v-for="(card, idx) in cardSlots"
          :key="idx"
          class="card-slot"
          :class="{
            'flipped': card.flipped,
            'disabled': isTrainingLocked || card.flipped
          }"
          @click="handleFlip(idx)"
        >
          <div class="card-inner">
            <!-- 卡背 -->
            <div class="card-back">
              <span class="cb-icon">🎴</span>
              <span class="cb-num">{{ idx + 1 }}</span>
            </div>
            <!-- 卡面（翻开后显示效果） -->
            <div v-if="card.flipped && card.result" class="card-front" :class="card.result.type">
              <span class="cf-type">{{ getTypeLabel(card.result.type) }}</span>
              <span class="cf-name">{{ card.result.name }}</span>
              <span v-if="card.result.desc" class="cf-desc">{{ card.result.desc }}</span>
              <div class="cf-effects">
                <span v-if="card.result.vocal" class="cf-effect" :class="card.result.vocal > 0 ? 'up' : 'down'">
                  🎤{{ card.result.vocal > 0 ? '+' : '' }}{{ card.result.vocal }}
                </span>
                <span v-if="card.result.dance" class="cf-effect" :class="card.result.dance > 0 ? 'up' : 'down'">
                  💃{{ card.result.dance > 0 ? '+' : '' }}{{ card.result.dance }}
                </span>
                <span v-if="card.result.charm" class="cf-effect" :class="card.result.charm > 0 ? 'up' : 'down'">
                  ✨{{ card.result.charm > 0 ? '+' : '' }}{{ card.result.charm }}
                </span>
              </div>
            </div>
          </div>
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
            <td class="col-idx">{{ i + 1 }}</td>
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
import { computed, h, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/authStore'
import { useTrainingCardStore } from '../../stores/trainingCardStore'
import { usePlayerStore } from '../../stores/playerStore'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'

const route = useRoute()
const authStore = useAuthStore()
const trainingStore = useTrainingCardStore()
const playerStore = usePlayerStore()

const currentRound = computed(() => parseInt(route.params.round as string) || 1)
const currentUser = computed(() => authStore.currentUser)

// 属性值（实时响应）
const attributes = reactive({ vocal: 50, dance: 50, charm: 50 })

// 训练次数
const remainingDraws = ref(0)
const trainingCount = ref(0)
const isTrainingLocked = computed(() => remainingDraws.value <= 0)

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
const changeLog = reactive<{ cardName: string; vocal: number; dance: number; charm: number; desc?: string }[]>([])

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

    // 2. 加载训练配置
    await trainingStore.fetchConfig()
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
        desc: card?.description || '',
        vocal: r.effect.vocal || 0,
        dance: r.effect.dance || 0,
        charm: r.effect.charm || 0
      })
    }
  } catch (e) {
    console.warn('[Training] 加载失败:', e)
  }
})
</script>

<style lang="scss" scoped>
.training-page {
  max-width: 1000px;
  margin: 0 auto;
  padding: 0 4px;
color: var(--text-primary);
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
</style>
