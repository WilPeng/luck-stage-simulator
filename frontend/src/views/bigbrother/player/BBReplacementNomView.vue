<template>
  <div class="bb-replacement-player">
    <div class="page-header">
      <h1>替换提名</h1>
      <span class="round-tag">第{{ roundNum }}周</span>
      <span v-if="isHistory" class="history-tag">历史记录</span>
      <span v-else-if="isFuture" class="future-tag">未开始</span>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <span>加载中...</span>
    </div>

    <template v-else>
      <!-- 否决权信息 -->
      <div v-if="veto" class="info-card veto-card">
        <div class="card-icon">🛡️</div>
        <div class="card-body">
          <div class="card-label">否决权信息</div>
          <div class="card-main">POV 赢家：{{ veto.winnerName }}</div>
          <div v-if="veto.used" class="card-sub">
            已使用 — 拯救: <strong class="saved-name">{{ veto.usedOnPlayerName }}</strong>
          </div>
          <div v-else class="card-sub not-used">否决权未被使用</div>
        </div>
      </div>

      <!-- 当前提名信息 -->
      <div v-if="nomination" class="info-card nomination-card">
        <div class="card-icon">📋</div>
        <div class="card-body">
          <div class="card-label">当前提名</div>
          <div class="nominee-list">
            <div v-for="(name, i) in (nomination.nomineeNames || [])" :key="i" class="nominee-chip"
              :class="{ saved: nomination.replacementNomineeName && veto?.usedOnPlayerName === name }">
              {{ name }}
              <span v-if="nomination.replacementNomineeName && veto?.usedOnPlayerName === name" class="chip-badge saved-badge">已拯救</span>
              <span v-if="isMe(name)" class="chip-badge me-badge">我</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 替换提名结果 -->
      <div v-if="nomination?.replacementNomineeName" class="info-card replacement-result">
        <div class="card-icon">✅</div>
        <div class="card-body">
          <div class="card-label">替换提名已完成</div>
          <div class="card-main replacement-name">{{ nomination.replacementNomineeName }}</div>
          <div class="card-sub">已加入最终提名名单，将进入驱逐投票阶段</div>
        </div>
      </div>

      <!-- HOH 操作区：需要选择替补 -->
      <div v-if="isHoh && needReplacement" class="action-card">
        <div class="action-header">
          <span class="action-icon">👑</span>
          <div>
            <div class="action-title">你是 HOH，否决权已被使用</div>
            <div class="action-desc">请选择一名新的房客替换被拯救的提名者</div>
          </div>
        </div>
        <div v-if="replaceSuccess" class="action-success">
          ✅ 替换提名完成：<strong>{{ nomination?.replacementNomineeName }}</strong>
        </div>
        <div v-else class="action-form">
          <select v-model="replaceId" class="bb-select">
            <option value="">-- 请选择替补人选 --</option>
            <option v-for="h in availablePlayers" :key="h.id" :value="h.id">{{ h.name }}</option>
          </select>
          <button class="bb-btn bb-btn-primary" :disabled="!replaceId || replacing" @click="confirmReplace">
            {{ replacing ? '确认中...' : '确认替换提名' }}
          </button>
        </div>
      </div>

      <!-- 非 HOH 提示 -->
      <div v-else-if="isHoh && veto && !veto.used" class="info-card hint-card">
        <div class="card-icon">💡</div>
        <div class="card-body">
          <div class="card-main">否决权未被使用，无需替换提名</div>
        </div>
      </div>

      <!-- 等待中 -->
      <div v-if="!nomination" class="empty-card">
        <p>暂无替换提名信息</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import { useBbSeasonStore } from '../../../stores/bbSeasonStore'
import {
  bbGetNominationHistory, bbGetCurrentHoh, bbGetCurrentVeto,
  bbGetActiveHouseguests, bbReplaceNomination
} from '../../../services/bbApi'

const route = useRoute()
const authStore = useBbAuthStore()
const seasonStore = useBbSeasonStore()

const roundNum = computed(() => Number(route.params.round) || 1)
const isHistory = computed(() => seasonStore.isStageCompleted(roundNum.value, 'replacement_nom'))
const isFuture = computed(() => seasonStore.getStageStatus(roundNum.value, 'replacement_nom') === 'future')

const loading = ref(true)
const nomination = ref<any>(null)
const veto = ref<any>(null)
const activePlayers = ref<{ id: string; name: string }[]>([])
const replaceId = ref('')
const replacing = ref(false)
const replaceSuccess = ref(false)

const myId = computed(() => authStore.currentUser?.id || '')
const myName = computed(() => authStore.currentUser?.name || '')

const isHoh = computed(() => {
  return nomination.value?.hohId === myId.value
})

const needReplacement = computed(() => {
  if (!nomination.value || !veto.value) return false
  if (veto.value.used && !nomination.value.replacementNomineeId) return true
  return false
})

const availablePlayers = computed(() => {
  const hohId = nomination.value?.hohId || ''
  const savedId = veto.value?.usedOnPlayerId || ''
  const nomineeIds = new Set(nomination.value?.nomineeIds || [])
  const excludeIds = new Set([hohId, savedId])
  return activePlayers.value.filter(p =>
    !excludeIds.has(p.id) && !nomineeIds.has(p.id)
  )
})

function isMe(name: string): boolean { return name === myName.value }

async function confirmReplace() {
  if (!replaceId.value || replacing.value) return
  replacing.value = true
  try {
    const playerName = activePlayers.value.find(p => p.id === replaceId.value)?.name || ''
    await bbReplaceNomination(replaceId.value, playerName)
    replaceSuccess.value = true
    // 刷新数据
    const history = await bbGetNominationHistory()
    const roundKey = `round-${roundNum.value}`
    nomination.value = history.find((h: any) => h.roundId === roundKey) || null
  } catch (e: any) {
    alert(e.message || '替换提名失败')
  } finally {
    replacing.value = false
  }
}

onMounted(async () => {
  try {
    const roundKey = `round-${roundNum.value}`
    const [history, hohData, vetoData] = await Promise.all([
      bbGetNominationHistory().catch(() => []),
      bbGetCurrentHoh().catch(() => null),
      bbGetCurrentVeto().catch(() => null)
    ])
    nomination.value = history.find((h: any) => h.roundId === roundKey) || null
    veto.value = vetoData
    // 如果 nomination 里没有 hohId，从 hohData 补充
    if (nomination.value && !nomination.value.hohId && hohData) {
      nomination.value.hohId = hohData.winnerId
      nomination.value.hohName = hohData.winnerName
    }
    // 加载活跃房客列表（HOH 操作需要）
    if (nomination.value?.hohId === myId.value) {
      try {
        const list = await bbGetActiveHouseguests()
        activePlayers.value = list.map((h: any) => ({ id: h.id, name: h.name }))
      } catch {}
    }
  } catch {} finally {
    loading.value = false
  }
})
</script>

<style scoped>
.bb-replacement-player { max-width: 600px; margin: 0 auto; padding: 16px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #00ff8844; }
.history-tag { background: #88888822; color: #aaa; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #88888844; }
.future-tag { background: #44444422; color: #666; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #44444444; }

.loading-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 20px; color: #888; font-size: 14px; }
.loading-spinner { width: 32px; height: 32px; border: 3px solid #00ff8822; border-top-color: #00ff88; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.info-card { display: flex; align-items: flex-start; gap: 16px; background: linear-gradient(135deg, #0f0f2e, #1a1a3e); border: 1px solid #00ff8833; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
.veto-card { border-color: #ffaa0044; }
.replacement-result { border-color: #00ff8844; background: linear-gradient(135deg, #0a1a0a, #0f2e1a); }
.hint-card { border-color: #444; opacity: 0.7; }
.card-icon { font-size: 32px; flex-shrink: 0; }
.card-body { flex: 1; min-width: 0; }
.card-label { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
.card-main { font-size: 18px; font-weight: 700; color: #e0e0e0; margin-bottom: 4px; }
.card-sub { font-size: 13px; color: #aaa; }
.saved-name { color: #00ff88; }
.not-used { color: #666; }
.replacement-name { color: #00ff88; }

.nominee-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.nominee-chip { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; background: #ff444410; border: 1px solid #ff444433; border-radius: 8px; font-size: 15px; font-weight: 600; color: #ff4444; }
.nominee-chip.saved { border-color: #00ff8844; background: #00ff8810; color: #00ff88; }
.chip-badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; }
.saved-badge { background: #00ff8822; color: #00ff88; border: 1px solid #00ff8833; }
.me-badge { background: #ff444422; color: #ff4444; border: 1px solid #ff444433; }

.action-card { background: linear-gradient(135deg, #1a1a0a, #2e2a0f); border: 1px solid #ffaa0066; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
.action-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.action-icon { font-size: 32px; }
.action-title { font-size: 16px; font-weight: 700; color: #ffaa00; }
.action-desc { font-size: 13px; color: #aaa; margin-top: 2px; }
.action-success { padding: 12px; background: #00ff8815; border: 1px solid #00ff8833; border-radius: 8px; color: #00ff88; font-size: 14px; text-align: center; }
.action-form { display: flex; flex-direction: column; gap: 12px; }
.bb-select { background: #0f0f2e; border: 1px solid #00ff8822; color: #e0e0e0; padding: 10px 14px; border-radius: 8px; font-size: 14px; outline: none; cursor: pointer; width: 100%; box-sizing: border-box; }
.bb-select:focus { border-color: #00ff88; }
.bb-btn { background: transparent; border: 1px solid #00ff8844; color: #00ff88; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
.bb-btn:hover { background: #00ff8822; }
.bb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bb-btn-primary { background: #00ff8822; border-color: #00ff88; }

.empty-card { background: #0f0f2e; border: 1px solid #444; border-radius: 12px; padding: 40px; text-align: center; }
.empty-card p { color: #666; }
</style>
