<template>
  <div class="lv-votes">
    <div class="page-header">
      <h1>喜爱值投送详情</h1>
      <span class="round-tag">第{{ $route.params.round }}轮</span>
    </div>

    <div v-if="loading" class="loading">加载中...</div>

    <div v-else>
      <!-- 收获汇总 -->
      <div class="summary-section">
        <h3>收获喜爱值汇总</h3>
        <div class="summary-grid">
          <div v-for="item in receivedSummary" :key="item.playerId" class="summary-card"
            :class="{ single: item.isSingle }">
            <LvAvatar :name="item.playerName" :avatar="getPlayerAvatar(item.playerId)" size="md" class="summary-avatar" />
            <div class="player-name">{{ item.playerName }}</div>
            <div class="total-value">{{ item.total }}</div>
            <div class="total-label">收获喜爱值</div>
            <div v-if="item.isSingle" class="single-badge">❤️ 单身汉</div>
          </div>
        </div>
      </div>

      <!-- 代投区域 -->
      <div v-if="isVoteStage && unsubmittedPlayers.length > 0" class="admin-proxy-section">
        <h3>代投送（未完成投送的选手）</h3>
        <div class="proxy-header-actions">
          <button class="lv-btn lv-btn-sm lv-btn-primary" @click="autoSubmitAllUnsubmitted" :disabled="proxyMultiLoading">
            {{ proxyMultiLoading ? '代投中...' : '🎲 一键代投所有人' }}
          </button>
          <button class="lv-btn lv-btn-sm" @click="autoSubmitSelected" :disabled="proxyMultiLoading || proxySelectedIds.size === 0">
            {{ proxyMultiLoading ? '代投中...' : '🎲 一键代投选中' }}
          </button>
        </div>
        <div class="unsubmitted-list">
          <div v-for="p in unsubmittedPlayers" :key="p.id" class="unsubmitted-item">
            <label class="proxy-checkbox">
              <input type="checkbox" :checked="proxySelectedIds.has(p.id)" @change="toggleProxySelect(p.id)" />
            </label>
            <LvAvatar :name="p.name" :avatar="getPlayerAvatar(p.id)" size="sm" />
            <span class="player-name">{{ p.name }}</span>
            <span class="status-badge status-unsubmitted">未投送</span>
            <button class="lv-btn lv-btn-sm" @click="openProxyDialog(p)">手动代投</button>
            <button class="lv-btn lv-btn-sm lv-btn-primary" @click="autoSubmitSingle(p)" :disabled="proxyMultiLoading">
              🎲 一键代投
            </button>
          </div>
        </div>
        <div v-if="proxyMultiMsg" class="budget-msg" :class="{ error: proxyMultiMsgError }">{{ proxyMultiMsg }}</div>
      </div>

      <!-- 预算控制面板 -->
      <div v-if="isVoteStage" class="budget-control-section">
        <h3>预算控制面板</h3>
        <div class="budget-control-header">
          <span class="budget-range-info">预算范围：100-160</span>
          <div class="budget-actions">
            <button class="lv-btn lv-btn-sm" @click="randomAllBudgets" :disabled="budgetLoading">
              🎲 一键随机所有人
            </button>
            <button class="lv-btn lv-btn-sm" @click="randomSelectedBudgets" :disabled="budgetLoading || selectedPlayers.size === 0">
              🎲 随机选中
            </button>
            <button class="lv-btn lv-btn-sm" @click="setSelectedBudgets" :disabled="budgetLoading || selectedPlayers.size === 0 || !bulkSetValue">
              设置选中为 <input v-model.number="bulkSetValue" type="number" class="bulk-input" min="1" placeholder="值" @click.stop />
            </button>
          </div>
        </div>
        <div class="budget-players">
          <div v-for="p in allActivePlayers" :key="p.id" class="budget-player-row" :class="{ submitted: submittedVoterIds.has(p.id) }">
            <label class="budget-checkbox">
              <input type="checkbox" :checked="selectedPlayers.has(p.id)" @change="toggleSelect(p.id)" />
            </label>
            <LvAvatar :name="p.name" :avatar="getPlayerAvatar(p.id)" size="sm" />
            <span class="player-name">{{ p.name }}</span>
            <span v-if="submittedVoterIds.has(p.id)" class="status-badge status-submitted">已投送</span>
            <div class="budget-edit">
              <input v-model.number="editingBudget[p.id]" type="number" class="budget-input" min="1"
                @change="onBudgetChange(p.id)" />
              <button class="lv-btn lv-btn-xs" @click="onBudgetChange(p.id)" :disabled="budgetLoading">设置</button>
            </div>
          </div>
        </div>
        <div v-if="budgetMsg" class="budget-msg" :class="{ error: budgetMsgError }">{{ budgetMsg }}</div>
      </div>

      <!-- 投送明细 -->
      <div class="detail-section">
        <h3>投送明细</h3>
        <div v-if="groupedVotes.length === 0" class="empty-cell">暂无投送记录</div>
        <div v-else class="grouped-list">
          <div v-for="group in groupedVotes" :key="group.voterId" class="vote-group-card"
            :class="{ 'is-self': group.voterId === 'self' }">
            <div class="group-header">
              <div class="group-voter">
                <LvAvatar :name="group.voterName" :avatar="getPlayerAvatar(group.voterId)" size="sm" />
                <span class="voter-name">{{ group.voterName }}</span>
                <span class="status-badge status-submitted">已投送</span>
              </div>
              <div class="group-info">
                <span class="group-total">总额：<strong>{{ group.total }}</strong></span>
                <button class="lv-btn lv-btn-xs lv-btn-danger" @click="confirmRevoke(group)">撤回</button>
              </div>
            </div>
            <div class="group-body">
              <div v-for="item in group.items" :key="item.targetId" class="vote-detail-row">
                <div class="vote-target">
                  <LvAvatar :name="item.targetName" :avatar="getPlayerAvatar(item.targetId)" size="sm" />
                  <span>{{ item.targetName }}</span>
                </div>
                <span class="value-badge">{{ item.value }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 代投弹窗 -->
    <div v-if="showProxyDialog" class="modal-overlay" @click.self="closeProxyDialog">
      <div class="modal-content">
        <div class="modal-header">
          <h3>代投送 - {{ proxyPlayer?.name }}</h3>
          <button class="close-btn" @click="closeProxyDialog">&times;</button>
        </div>
        <div class="modal-body">
          <div class="total-banner">
            <div class="total-label">投送总额</div>
            <div class="total-value">{{ proxyBudget }}</div>
            <div class="total-hint">
              系统分配预算
              <span class="budget-actions">
                <button class="lv-btn lv-btn-xs" @click="rerollBudget" :disabled="proxySubmitting">重新随机</button>
                <button class="lv-btn lv-btn-xs" @click="showCustomBudget = !showCustomBudget">
                  {{ showCustomBudget ? '取消' : '手动指定' }}
                </button>
              </span>
            </div>
            <div class="auto-distribute-row">
              <button class="lv-btn lv-btn-xs lv-btn-primary" @click="randomDistribute" :disabled="proxySubmitting">
                🎲 一键随机分配
              </button>
            </div>
            <div v-if="showCustomBudget" class="custom-budget-row">
              <input v-model.number="customBudgetValue" type="number" class="budget-input" min="1" placeholder="输入预算值" />
              <button class="lv-btn lv-btn-xs" @click="applyCustomBudget" :disabled="!customBudgetValue || customBudgetValue < 1">确定</button>
            </div>
          </div>

          <div class="remaining-info" :class="{ error: proxyRemaining < 0 || !proxyAllDifferent }">
            <span>剩余可分配: {{ proxyRemaining }}</span>
            <span v-if="!proxyAllDifferent" class="error-text">每个选手的喜爱值必须不同！</span>
            <span v-else-if="proxyRemaining === 0" class="ok-text">✅ 分配完成</span>
          </div>

          <div class="players-list">
            <div v-for="p in proxyTargets" :key="p.id" class="player-row">
              <div class="player-name-row">
                <LvAvatar :name="p.name" :avatar="getPlayerAvatar(p.id)" size="sm" />
                <span class="player-name">{{ p.name }}</span>
              </div>
              <input v-model.number="proxyValues[p.id]" type="number" class="vote-input"
                min="1" :max="proxyBudget" placeholder="0"
                @input="onProxyValueChange" />
            </div>
          </div>

          <div v-if="proxyError" class="error-toast">{{ proxyError }}</div>
          <div v-if="proxySuccess" class="success-toast">{{ proxySuccess }}</div>
        </div>
        <div class="modal-footer">
          <button class="lv-btn" @click="closeProxyDialog" :disabled="proxySubmitting">取消</button>
          <button class="lv-btn lv-btn-primary" @click="submitProxyVotes"
            :disabled="!proxyCanSubmit || proxySubmitting">
            {{ proxySubmitting ? '提交中...' : '确认代投' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 撤回确认弹窗 -->
    <div v-if="showRevokeConfirm" class="modal-overlay" @click.self="showRevokeConfirm = false">
      <div class="modal-content modal-sm">
        <div class="modal-header">
          <h3>确认撤回</h3>
          <button class="close-btn" @click="showRevokeConfirm = false">&times;</button>
        </div>
        <div class="modal-body">
          <p class="revoke-text">确定要撤回 <strong>{{ revokeTarget?.voterName }}</strong> 的投送吗？</p>
          <p class="revoke-hint">撤回后该选手将变为"未投送"状态，可以重新投送。</p>
          <div v-if="revokeError" class="error-toast">{{ revokeError }}</div>
        </div>
        <div class="modal-footer">
          <button class="lv-btn" @click="showRevokeConfirm = false" :disabled="revoking">取消</button>
          <button class="lv-btn lv-btn-danger" @click="doRevoke" :disabled="revoking">
            {{ revoking ? '撤回中...' : '确认撤回' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useLvSeasonStore } from '../../../stores/lovevarietySeasonStore'
import {
  lvGetRoundVotes, lvGetRoundPairing, lvGetActivePlayers,
  lvAdminSubmitVotes, lvAdminSetBudget,
  lvAdminBatchSetBudget, lvAdminRevokeVotes,
  lvAdminAutoSubmit
} from '../../../services/lovevarietyApi'
import type { LVLoveVote } from '../../../types/lovevariety'
import LvAvatar from '../../../components/lovevariety/LvAvatar.vue'

const route = useRoute()
const seasonStore = useLvSeasonStore()
const votes = ref<LVLoveVote[]>([])
const pairing = ref<any>(null)
const loading = ref(true)
const playerMap = ref<Record<string, string>>({})
const allActivePlayers = ref<{ id: string; name: string; voteBudget: number }[]>([])

const roundId = computed(() => `round-${route.params.round}`)
const isVoteStage = computed(() => seasonStore.currentStage === 'love_vote')

// 已投送的选手ID集合
const submittedVoterIds = computed(() => new Set(votes.value.map(v => v.voterId)))

// 未投送选手列表
const unsubmittedPlayers = computed(() => {
  return allActivePlayers.value.filter(p => !submittedVoterIds.value.has(p.id))
})

const receivedSummary = computed(() => {
  const map: Record<string, { playerName: string; total: number }> = {}
  for (const v of votes.value) {
    if (!map[v.targetId]) map[v.targetId] = { playerName: v.targetName, total: 0 }
    map[v.targetId].total += v.value
  }
  const list = Object.entries(map).map(([playerId, data]) => ({
    playerId,
    playerName: data.playerName,
    total: data.total,
    isSingle: pairing.value?.singlePlayerId === playerId
  }))
  list.sort((a, b) => a.total - b.total)
  return list
})

// 按投票人分组的投送明细
const groupedVotes = computed(() => {
  const map: Record<string, { voterId: string; voterName: string; items: LVLoveVote[]; total: number }> = {}
  for (const v of votes.value) {
    if (!map[v.voterId]) map[v.voterId] = { voterId: v.voterId, voterName: v.voterName, items: [], total: 0 }
    map[v.voterId].items.push(v)
    map[v.voterId].total += v.value
  }
  return Object.values(map)
})

function getPlayerAvatar(playerId: string): string | null {
  return playerMap.value[playerId] || null
}

// ===== 预算控制面板 =====
const budgetLoading = ref(false)
const budgetMsg = ref('')
const budgetMsgError = ref(false)
const editingBudget = ref<Record<string, number>>({})
const selectedPlayers = ref<Set<string>>(new Set())
const bulkSetValue = ref(0)

function toggleSelect(id: string) {
  const s = new Set(selectedPlayers.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedPlayers.value = s
}

async function randomAllBudgets() {
  budgetLoading.value = true
  budgetMsg.value = ''
  try {
    const ids = allActivePlayers.value.map(p => p.id)
    const results = await lvAdminBatchSetBudget(ids)
    results.forEach(r => {
      const found = allActivePlayers.value.find(p => p.id === r.playerId)
      if (found) found.voteBudget = r.voteBudget
      editingBudget.value[r.playerId] = r.voteBudget
    })
    budgetMsg.value = `✅ 已为 ${results.length} 位选手随机分配预算`
    budgetMsgError.value = false
  } catch (e: any) {
    budgetMsg.value = e.message || '随机失败'
    budgetMsgError.value = true
  } finally {
    budgetLoading.value = false
  }
}

async function randomSelectedBudgets() {
  if (selectedPlayers.value.size === 0) return
  budgetLoading.value = true
  budgetMsg.value = ''
  try {
    const ids = Array.from(selectedPlayers.value)
    const results = await lvAdminBatchSetBudget(ids)
    results.forEach(r => {
      const found = allActivePlayers.value.find(p => p.id === r.playerId)
      if (found) found.voteBudget = r.voteBudget
      editingBudget.value[r.playerId] = r.voteBudget
    })
    selectedPlayers.value = new Set()
    budgetMsg.value = `✅ 已为 ${results.length} 位选手随机分配预算`
    budgetMsgError.value = false
  } catch (e: any) {
    budgetMsg.value = e.message || '随机失败'
    budgetMsgError.value = true
  } finally {
    budgetLoading.value = false
  }
}

async function setSelectedBudgets() {
  if (selectedPlayers.value.size === 0 || !bulkSetValue.value || bulkSetValue.value < 1) return
  budgetLoading.value = true
  budgetMsg.value = ''
  try {
    const ids = Array.from(selectedPlayers.value)
    const val = Math.floor(bulkSetValue.value)
    const results = await lvAdminBatchSetBudget(ids, val)
    results.forEach(r => {
      const found = allActivePlayers.value.find(p => p.id === r.playerId)
      if (found) found.voteBudget = r.voteBudget
      editingBudget.value[r.playerId] = r.voteBudget
    })
    selectedPlayers.value = new Set()
    budgetMsg.value = `✅ 已为 ${results.length} 位选手设置预算为 ${val}`
    budgetMsgError.value = false
  } catch (e: any) {
    budgetMsg.value = e.message || '设置失败'
    budgetMsgError.value = true
  } finally {
    budgetLoading.value = false
  }
}

async function onBudgetChange(playerId: string) {
  const val = editingBudget.value[playerId]
  if (val === undefined || val < 1) return
  budgetLoading.value = true
  budgetMsg.value = ''
  try {
    const result = await lvAdminSetBudget(playerId, Math.floor(val))
    const found = allActivePlayers.value.find(p => p.id === playerId)
    if (found) found.voteBudget = result.voteBudget
    editingBudget.value[playerId] = result.voteBudget
    budgetMsg.value = `✅ 已设置 ${result.playerName} 的预算为 ${result.voteBudget}`
    budgetMsgError.value = false
  } catch (e: any) {
    budgetMsg.value = e.message || '设置失败'
    budgetMsgError.value = true
  } finally {
    budgetLoading.value = false
  }
}

// ===== 撤回 =====
const showRevokeConfirm = ref(false)
const revokeTarget = ref<{ voterId: string; voterName: string } | null>(null)
const revoking = ref(false)
const revokeError = ref('')

function confirmRevoke(group: { voterId: string; voterName: string }) {
  revokeTarget.value = { voterId: group.voterId, voterName: group.voterName }
  revokeError.value = ''
  showRevokeConfirm.value = true
}

async function doRevoke() {
  if (!revokeTarget.value) return
  revoking.value = true
  revokeError.value = ''
  try {
    await lvAdminRevokeVotes(roundId.value, revokeTarget.value.voterId)
    showRevokeConfirm.value = false
    revokeTarget.value = null
    // 刷新数据
    votes.value = await lvGetRoundVotes(roundId.value)
  } catch (e: any) {
    revokeError.value = e.message || '撤回失败'
  } finally {
    revoking.value = false
  }
}

// ===== 代投弹窗 =====
const showProxyDialog = ref(false)
const proxyPlayer = ref<{ id: string; name: string } | null>(null)
const proxyBudget = ref(0)
const proxyTargets = ref<{ id: string; name: string }[]>([])
const proxyValues = ref<Record<string, number>>({})
const proxySubmitting = ref(false)
const proxyError = ref('')
const proxySuccess = ref('')
const showCustomBudget = ref(false)
const customBudgetValue = ref(0)

// ===== 一键代投多人 =====
const proxySelectedIds = ref<Set<string>>(new Set())
const proxyMultiLoading = ref(false)
const proxyMultiMsg = ref('')
const proxyMultiMsgError = ref(false)

function toggleProxySelect(id: string) {
  const s = new Set(proxySelectedIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  proxySelectedIds.value = s
}

/** 随机分配预算给所有目标（互不相同的整数，总和 = proxyBudget） */
function randomDistribute() {
  const targets = proxyTargets.value
  if (targets.length === 0) return
  const budget = proxyBudget.value

  // 每人至少 1
  const n = targets.length
  if (budget < n) {
    proxyError.value = '预算不足以分配给所有目标'
    return
  }

  // 算法：随机分配互不相同的值
  let remaining = budget - n // 每人先分1
  const values = new Array(n).fill(1)

  // 随机生成 n 个互不相同的增量
  const maxExtra = Math.min(remaining, 100)
  const pool = []
  for (let i = 0; i <= maxExtra; i++) pool.push(i)

  // 打乱后取 n 个
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const incs = pool.slice(0, n)
  const incSum = incs.reduce((a, b) => a + b, 0)

  if (incSum > 0) {
    let adjRemaining = remaining
    for (let i = 0; i < n; i++) {
      const inc = Math.round(incs[i] / incSum * remaining)
      values[i] += inc
      adjRemaining -= inc
    }
    // 处理余数
    let idx = 0
    while (adjRemaining > 0 && idx < n * 5) {
      values[idx % n]++
      adjRemaining--
      idx++
    }
  } else {
    const base = Math.floor(remaining / n)
    for (let i = 0; i < n; i++) values[i] += base
    let rest = remaining - base * n
    for (let i = 0; i < rest; i++) values[i]++
  }

  // 确保互不相同
  const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].v <= sorted[i - 1].v) {
      sorted[i].v = sorted[i - 1].v + 1
    }
  }
  // 如果总和变了，从最大开始减
  const newSum = sorted.reduce((a, b) => a + b.v, 0)
  let diff = newSum - budget
  for (let i = sorted.length - 1; i >= 0 && diff > 0; i--) {
    const adjust = Math.min(diff, sorted[i].v - 1)
    sorted[i].v -= adjust
    diff -= adjust
  }
  sorted.forEach(s => { values[s.i] = s.v })

  // 填充到 proxyValues
  targets.forEach((t, i) => {
    proxyValues.value[t.id] = Math.max(1, Math.round(values[i]))
  })
  proxyError.value = ''
}

/** 一键代投单个选手（直接随机分配并提交） */
async function autoSubmitSingle(player: { id: string; name: string }) {
  proxyMultiLoading.value = true
  proxyMultiMsg.value = ''
  proxyMultiMsgError.value = false
  try {
    const result = await lvAdminAutoSubmit(roundId.value, player.id)
    proxyMultiMsg.value = `✅ 已一键代 ${result.voterName} 完成投送！`
    votes.value = await lvGetRoundVotes(roundId.value)
    // 从选中中移除
    const s = new Set(proxySelectedIds.value)
    s.delete(player.id)
    proxySelectedIds.value = s
  } catch (e: any) {
    proxyMultiMsg.value = `❌ ${player.name} 代投失败: ${e.message || '未知错误'}`
    proxyMultiMsgError.value = true
  } finally {
    proxyMultiLoading.value = false
  }
}

/** 一键代投所有未投送选手 */
async function autoSubmitAllUnsubmitted() {
  proxyMultiLoading.value = true
  proxyMultiMsg.value = ''
  proxyMultiMsgError.value = false
  const players = [...unsubmittedPlayers.value]
  let success = 0
  let fail = 0
  const errors: string[] = []
  for (const p of players) {
    try {
      await lvAdminAutoSubmit(roundId.value, p.id)
      success++
    } catch (e: any) {
      fail++
      errors.push(`${p.name}: ${e.message || '未知错误'}`)
    }
  }
  votes.value = await lvGetRoundVotes(roundId.value)
  proxySelectedIds.value = new Set()
  if (fail === 0) {
    proxyMultiMsg.value = `✅ 已一键代投全部 ${success} 位选手！`
    proxyMultiMsgError.value = false
  } else {
    proxyMultiMsg.value = `✅ 成功 ${success} 位，❌ 失败 ${fail} 位：${errors.join('；')}`
    proxyMultiMsgError.value = true
  }
  proxyMultiLoading.value = false
}

/** 一键代投选中的选手 */
async function autoSubmitSelected() {
  if (proxySelectedIds.value.size === 0) return
  proxyMultiLoading.value = true
  proxyMultiMsg.value = ''
  proxyMultiMsgError.value = false
  const ids = Array.from(proxySelectedIds.value)
  const players = ids.map(id => unsubmittedPlayers.value.find(p => p.id === id)).filter(Boolean) as { id: string; name: string }[]
  let success = 0
  let fail = 0
  const errors: string[] = []
  for (const p of players) {
    try {
      await lvAdminAutoSubmit(roundId.value, p.id)
      success++
    } catch (e: any) {
      fail++
      errors.push(`${p.name}: ${e.message || '未知错误'}`)
    }
  }
  votes.value = await lvGetRoundVotes(roundId.value)
  proxySelectedIds.value = new Set()
  if (fail === 0) {
    proxyMultiMsg.value = `✅ 已一键代投 ${success} 位选手！`
    proxyMultiMsgError.value = false
  } else {
    proxyMultiMsg.value = `✅ 成功 ${success} 位，❌ 失败 ${fail} 位：${errors.join('；')}`
    proxyMultiMsgError.value = true
  }
  proxyMultiLoading.value = false
}

const proxyTotalUsed = computed(() => {
  return Object.values(proxyValues.value).reduce((sum, v) => sum + (v || 0), 0)
})

const proxyRemaining = computed(() => proxyBudget.value - proxyTotalUsed.value)

const proxyAllDifferent = computed(() => {
  const values = Object.values(proxyValues.value).filter(v => v > 0)
  const unique = new Set(values)
  return unique.size === values.length
})

const proxyCanSubmit = computed(() => {
  return proxyRemaining.value === 0 && proxyAllDifferent.value && Object.keys(proxyValues.value).length > 0
})

function onProxyValueChange() {
  proxyError.value = ''
}

function openProxyDialog(player: { id: string; name: string; voteBudget: number }) {
  proxyPlayer.value = player
  proxyBudget.value = player.voteBudget
  proxyError.value = ''
  proxySuccess.value = ''
  proxySubmitting.value = false
  showCustomBudget.value = false
  customBudgetValue.value = 0

  proxyTargets.value = allActivePlayers.value.filter(p => p.id !== player.id)
  proxyValues.value = {}
  proxyTargets.value.forEach(p => { proxyValues.value[p.id] = 0 })

  showProxyDialog.value = true
}

async function rerollBudget() {
  if (!proxyPlayer.value) return
  proxyError.value = ''
  try {
    const result = await lvAdminSetBudget(proxyPlayer.value.id)
    proxyBudget.value = result.voteBudget
    const found = allActivePlayers.value.find(p => p.id === proxyPlayer.value!.id)
    if (found) found.voteBudget = result.voteBudget
    editingBudget.value[proxyPlayer.value.id] = result.voteBudget
  } catch (e: any) {
    proxyError.value = e.message || '重新随机失败'
  }
}

async function applyCustomBudget() {
  if (!proxyPlayer.value || !customBudgetValue.value || customBudgetValue.value < 1) return
  proxyError.value = ''
  try {
    const val = Math.floor(customBudgetValue.value)
    const result = await lvAdminSetBudget(proxyPlayer.value.id, val)
    proxyBudget.value = result.voteBudget
    const found = allActivePlayers.value.find(p => p.id === proxyPlayer.value!.id)
    if (found) found.voteBudget = result.voteBudget
    editingBudget.value[proxyPlayer.value.id] = result.voteBudget
    showCustomBudget.value = false
    customBudgetValue.value = 0
  } catch (e: any) {
    proxyError.value = e.message || '设置预算失败'
  }
}

function closeProxyDialog() {
  showProxyDialog.value = false
  showCustomBudget.value = false
  proxyPlayer.value = null
}

async function submitProxyVotes() {
  if (!proxyCanSubmit.value || !proxyPlayer.value) return
  proxySubmitting.value = true
  proxyError.value = ''
  proxySuccess.value = ''

  try {
    const votesData = Object.entries(proxyValues.value)
      .filter(([_, v]) => v > 0)
      .map(([targetId, value]) => {
        const player = proxyTargets.value.find(p => p.id === targetId)
        return { targetId, targetName: player?.name || '', value }
      })

    const result = await lvAdminSubmitVotes(roundId.value, proxyPlayer.value.id, votesData, proxyBudget.value)
    proxySuccess.value = `✅ 已成功代 ${result.voterName} 完成投送！`
    votes.value = await lvGetRoundVotes(roundId.value)
    setTimeout(() => {
      closeProxyDialog()
    }, 1500)
  } catch (e: any) {
    proxyError.value = e.message || '代投失败'
  } finally {
    proxySubmitting.value = false
  }
}

onMounted(async () => {
  try {
    votes.value = await lvGetRoundVotes(roundId.value)
    pairing.value = await lvGetRoundPairing(roundId.value)
    const players = await lvGetActivePlayers()
    allActivePlayers.value = players.map(p => ({ id: p.id, name: p.name, voteBudget: (p as any).voteBudget ?? 0 }))
    players.forEach(p => { playerMap.value[p.id] = p.avatar || '' })
    // 初始化编辑预算映射
    allActivePlayers.value.forEach(p => { editingBudget.value[p.id] = p.voteBudget })
  } catch {}
  loading.value = false
})
</script>

<style scoped>
.lv-votes { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag {
  background: #ff69b422; color: #ff69b4; padding: 2px 12px;
  border-radius: 10px; font-size: 12px; border: 1px solid #ff69b444;
}
.loading { text-align: center; color: #888; padding: 40px; font-size: 16px; }
.summary-section { margin-bottom: 24px; }
.summary-section h3 { font-size: 16px; color: #e0e0e0; margin: 0 0 12px; }
.summary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
.summary-card {
  background: #1a0f2e; border: 1px solid #ff69b422; border-radius: 10px;
  padding: 16px; text-align: center; position: relative;
}
.summary-card.single { border-color: #ff69b4; background: #ff69b408; }
.summary-avatar { margin: 0 auto 8px; }
.summary-card .player-name { font-size: 14px; font-weight: 600; color: #e0e0e0; margin-bottom: 8px; }
.summary-card .total-value { font-size: 28px; font-weight: 700; color: #ff69b4; }
.summary-card .total-label { font-size: 11px; color: #888; margin-top: 4px; }
.summary-card .single-badge { font-size: 12px; color: #ff69b4; margin-top: 6px; }

/* 代投区域 */
.admin-proxy-section { margin-bottom: 24px; }
.admin-proxy-section h3 { font-size: 16px; color: #e0e0e0; margin: 0 0 12px; }
.proxy-header-actions { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.unsubmitted-list { display: flex; flex-wrap: wrap; gap: 8px; }
.unsubmitted-item {
  display: flex; align-items: center; gap: 8px;
  background: #1a0f2e; border: 1px solid #ffa50033; border-radius: 8px;
  padding: 8px 12px;
}
.unsubmitted-item .player-name { font-size: 14px; color: #e0e0e0; font-weight: 500; }
.proxy-checkbox { display: flex; align-items: center; }
.proxy-checkbox input { accent-color: #ff69b4; width: 16px; height: 16px; cursor: pointer; }

/* 预算控制面板 */
.budget-control-section { margin-bottom: 24px; }
.budget-control-section h3 { font-size: 16px; color: #e0e0e0; margin: 0 0 12px; }
.budget-control-header {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  margin-bottom: 12px; padding: 10px 14px;
  background: #1a0f2e; border: 1px solid #ff69b422; border-radius: 8px;
}
.budget-range-info { font-size: 12px; color: #aaa; }
.budget-actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.bulk-input {
  width: 60px; background: #120824; border: 1px solid #ff69b422; color: #e0e0e0;
  padding: 2px 6px; border-radius: 4px; font-size: 13px; text-align: center; outline: none;
}
.bulk-input:focus { border-color: #ff69b4; }
.budget-players { display: flex; flex-direction: column; gap: 4px; }
.budget-player-row {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; background: #1a0f2e; border: 1px solid #ff69b411; border-radius: 6px;
}
.budget-player-row.submitted { opacity: 0.6; }
.budget-player-row .player-name { flex: 1; font-size: 14px; color: #e0e0e0; }
.budget-checkbox { display: flex; align-items: center; }
.budget-checkbox input { accent-color: #ff69b4; width: 16px; height: 16px; cursor: pointer; }
.budget-edit { display: flex; gap: 4px; align-items: center; }
.budget-edit .budget-input {
  width: 70px; background: #120824; border: 1px solid #ff69b422; color: #e0e0e0;
  padding: 4px 8px; border-radius: 4px; font-size: 14px; text-align: center; outline: none;
}
.budget-edit .budget-input:focus { border-color: #ff69b4; }
.budget-msg { margin-top: 8px; font-size: 13px; text-align: center; color: #00ff88; }
.budget-msg.error { color: #ff4444; }

/* 投送明细分组展示 */
.detail-section h3 { font-size: 16px; color: #e0e0e0; margin: 0 0 12px; }
.grouped-list { display: flex; flex-direction: column; gap: 12px; }
.vote-group-card {
  background: #1a0f2e; border: 1px solid #ff69b422; border-radius: 10px; overflow: hidden;
}
.vote-group-card.is-self { border-color: #ff69b4; }
.group-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; background: #ff69b408; border-bottom: 1px solid #ff69b422;
}
.group-voter { display: flex; align-items: center; gap: 8px; }
.voter-name { font-size: 14px; font-weight: 600; color: #e0e0e0; }
.group-info { display: flex; align-items: center; gap: 12px; }
.group-total { font-size: 13px; color: #aaa; }
.group-total strong { color: #ff69b4; font-size: 15px; }
.group-body { padding: 4px 0; }
.vote-detail-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 14px; border-bottom: 1px solid #ff69b408;
}
.vote-detail-row:last-child { border-bottom: none; }
.vote-target { display: flex; align-items: center; gap: 8px; font-size: 14px; color: #ccc; }

/* 状态标签 */
.status-badge { font-size: 11px; padding: 2px 8px; border-radius: 6px; }
.status-unsubmitted { color: #ffa500; background: #ffa50015; }
.status-submitted { color: #00ff88; background: #00ff8815; }

.lv-btn {
  background: transparent; border: 1px solid #ff69b444; color: #ff69b4;
  padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; transition: all 0.2s;
}
.lv-btn:hover { background: #ff69b422; }
.lv-btn-sm { padding: 4px 10px; font-size: 12px; }
.lv-btn-xs { padding: 2px 8px; font-size: 11px; }
.lv-btn-primary { background: #ff69b422; border-color: #ff69b4; }
.lv-btn-danger { border-color: #ff444488; color: #ff4444; }
.lv-btn-danger:hover { background: #ff444422; }
.lv-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* 空状态 */
.empty-cell { text-align: center; color: #666; padding: 32px; font-size: 14px; }

/* 弹窗 */
.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.modal-content {
  background: #1a0f2e; border: 1px solid #ff69b444; border-radius: 12px;
  width: 90%; max-width: 500px; max-height: 90vh; overflow-y: auto;
}
.modal-content.modal-sm { max-width: 400px; }
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px; border-bottom: 1px solid #ff69b422;
}
.modal-header h3 { margin: 0; font-size: 16px; color: #e0e0e0; }
.close-btn { background: none; border: none; color: #888; font-size: 24px; cursor: pointer; }
.close-btn:hover { color: #fff; }
.modal-body { padding: 20px; }
.modal-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 20px; border-top: 1px solid #ff69b422;
}

/* 撤回确认 */
.revoke-text { font-size: 15px; color: #e0e0e0; text-align: center; }
.revoke-hint { font-size: 12px; color: #888; text-align: center; margin-top: 8px; }

/* 弹窗内的投送表单 */
.total-banner {
  background: linear-gradient(135deg, #ff69b422, #ff149322);
  border: 1px solid #ff69b4; border-radius: 10px; padding: 16px;
  text-align: center; margin-bottom: 16px;
}
.total-banner .total-label { font-size: 12px; color: #aaa; }
.total-banner .total-value { font-size: 32px; font-weight: 700; color: #ff69b4; margin: 4px 0; }
.total-banner .total-hint { font-size: 11px; color: #888; margin-bottom: 6px; }
.total-banner .budget-actions { display: inline-flex; gap: 4px; margin-left: 8px; }
.total-banner .custom-budget-row { display: flex; gap: 6px; justify-content: center; margin-top: 8px; }
.total-banner .budget-input { width: 100px; background: #1a0f2e; border: 1px solid #ff69b422; color: #e0e0e0; padding: 4px 8px; border-radius: 4px; font-size: 14px; text-align: center; outline: none; }
.total-banner .budget-input:focus { border-color: #ff69b4; }
.total-banner .auto-distribute-row { margin-top: 8px; }
.remaining-info { text-align: center; font-size: 14px; color: #888; margin-bottom: 14px; }
.remaining-info.error { color: #ff4444; }
.remaining-info .error-text { display: block; font-size: 12px; color: #ff4444; margin-top: 4px; }
.remaining-info .ok-text { display: block; font-size: 12px; color: #00ff88; margin-top: 4px; }
.players-list { margin-bottom: 16px; }
.player-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-bottom: 1px solid #ff69b411;
}
.player-name-row { display: flex; align-items: center; gap: 8px; }
.player-name { font-size: 14px; font-weight: 500; color: #e0e0e0; }
.vote-input {
  width: 80px; background: #1a0f2e; border: 1px solid #ff69b422; color: #e0e0e0;
  padding: 6px 10px; border-radius: 6px; font-size: 16px; text-align: center; outline: none;
}
.vote-input:focus { border-color: #ff69b4; }
.value-badge { background: #ff69b415; color: #ff69b4; padding: 2px 10px; border-radius: 10px; font-size: 13px; font-weight: 600; }
.error-toast { text-align: center; color: #ff4444; margin-top: 8px; font-size: 13px; }
.success-toast { text-align: center; color: #00ff88; margin-top: 8px; font-size: 13px; }
</style>
