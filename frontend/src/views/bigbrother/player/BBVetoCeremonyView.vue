<template>
  <div class="bb-veto-player">
    <div class="page-header">
      <h1>否决权会议</h1>
      <span class="round-tag">第{{ roundNum }}周</span>
      <span v-if="isHistory" class="history-tag">历史记录</span>
      <span v-else-if="isFuture" class="future-tag">未开始</span>
    </div>

    <!-- 否决权状态卡片 -->
    <div v-if="veto" class="veto-card" :class="{ 'no-winner': !veto.winnerId }">
      <div class="veto-icon">🛡️</div>
      <div class="veto-info">
        <div class="veto-label">否决权持有者</div>
        <div class="veto-winner">{{ veto.winnerName || '暂无' }}</div>
        <div class="veto-status">{{ vetoStatusText }}</div>
        <div v-if="veto.used && veto.usedOnPlayerName" class="veto-saved">
          拯救: <strong class="highlight">{{ veto.usedOnPlayerName }}</strong>
          <span class="veto-removed">已从提名名单中移除</span>
        </div>
      </div>
    </div>
    <div v-else class="veto-card empty">
      <p>暂无否决权记录</p>
    </div>

    <!-- 提名信息 -->
    <div v-if="nomination" class="nomination-panel">
      <div class="nom-title">🎯 当前提名</div>
      <div class="nom-names">
        <span v-for="(name, i) in nomination.nomineeNames" :key="i" class="nom-tag">{{ name }}</span>
        <span v-if="!nomination.nomineeNames?.length" class="nom-empty">暂无提名</span>
      </div>
    </div>

    <!-- 我是否决权持有者：操作区 -->
    <div v-if="isVetoHolder && canOperate" class="action-section">
      <div class="action-header">
        <span class="action-icon">⚡</span>
        <div class="action-header-text">
          <div class="action-title">你是否决权持有者！</div>
          <div class="action-subtitle">你可以选择使用否决权拯救一名被提名者，或跳过不使用</div>
        </div>
      </div>
      <div class="action-buttons">
        <button class="bb-btn bb-btn-use" @click="showUseModal = true">
          ✅ 使用否决权
        </button>
        <button class="bb-btn bb-btn-skip" @click="showSkipModal = true">
          ⏭️ 不使用否决权
        </button>
      </div>
    </div>

    <!-- 操作结果提示 -->
    <div v-if="veto?.status === 'used'" class="result-banner used">
      <span class="result-icon">✅</span>
      <span>否决权已使用，{{ veto.usedOnPlayerName }} 已从提名名单中移除</span>
    </div>
    <div v-if="veto?.status === 'skipped'" class="result-banner skipped">
      <span class="result-icon">⏭️</span>
      <span>否决权未被使用，最终提名名单已确认</span>
    </div>

    <!-- 使用否决权弹窗 -->
    <Teleport to="body">
      <div v-if="showUseModal" class="bb-modal-overlay" @click.self="showUseModal = false">
        <div class="bb-modal">
          <div class="bb-modal-header">
            <h3>使用否决权</h3>
            <button class="close-btn" @click="showUseModal = false">✕</button>
          </div>
          <div class="bb-modal-body">
            <p class="use-hint">选择要拯救的被提名人：</p>
            <div class="nominee-list">
              <label v-for="n in nomineeOptions" :key="n.id" class="nominee-option"
                :class="{ selected: savePlayerId === n.id }">
                <input type="radio" :value="n.id" v-model="savePlayerId" class="nominee-radio" />
                <span class="nominee-name">{{ n.name }}</span>
              </label>
            </div>
            <div v-if="nomineeOptions.length === 0" class="no-nominees">
              暂无被提名者
            </div>
            <div class="form-actions">
              <button class="bb-btn" @click="showUseModal = false">取消</button>
              <button class="bb-btn bb-btn-primary" :disabled="!savePlayerId || using" @click="useVeto">
                {{ using ? '确认中...' : '确认拯救' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 不使用否决权确认弹窗 -->
    <Teleport to="body">
      <div v-if="showSkipModal" class="bb-modal-overlay" @click.self="showSkipModal = false">
        <div class="bb-modal skip-modal">
          <div class="bb-modal-header">
            <h3>确认不使用否决权</h3>
            <button class="close-btn" @click="showSkipModal = false">✕</button>
          </div>
          <div class="bb-modal-body">
            <div class="skip-confirm-text">
              不使用否决权，提名名单将保持不变，进入驱逐投票阶段。
            </div>
            <div class="form-actions">
              <button class="bb-btn" @click="showSkipModal = false">取消</button>
              <button class="bb-btn bb-btn-warning" :disabled="skipping" @click="skipVeto">
                {{ skipping ? '确认中...' : '确认不使用' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import { useBbSeasonStore } from '../../../stores/bbSeasonStore'
import { bbGetVetoHistory, bbGetCurrentNomination, bbUseVeto, bbSkipVeto } from '../../../services/bbApi'
import type { BBVetoRecord, BBNomination } from '../../../types/bigbrother'

const route = useRoute()
const authStore = useBbAuthStore()
const seasonStore = useBbSeasonStore()

const roundNum = computed(() => Number(route.params.round) || 1)
const isHistory = computed(() => seasonStore.isStageCompleted(roundNum.value, 'veto_ceremony'))
const isFuture = computed(() => seasonStore.getStageStatus(roundNum.value, 'veto_ceremony') === 'future')
const veto = ref<BBVetoRecord | null>(null)
const nomination = ref<BBNomination | null>(null)

const myId = computed(() => authStore.currentUser?.id || '')

// 是否为否决权持有者
const isVetoHolder = computed(() => {
  if (!veto.value || !veto.value.winnerId) return false
  return veto.value.winnerId === myId.value
})

// 是否可以操作（pending 状态 + 当前阶段）
const canOperate = computed(() => {
  if (!isVetoHolder.value) return false
  if (veto.value?.status !== 'pending') return false
  if (isFuture.value) return false
  // 当前必须是 veto_ceremony 阶段
  return seasonStore.currentStage === 'veto_ceremony'
})

const vetoStatusText = computed(() => {
  if (!veto.value) return ''
  if (veto.value.status === 'pending') return '⏳ 待决定'
  if (veto.value.status === 'used') return '✅ 已使用'
  if (veto.value.status === 'skipped') return '⏭️ 已跳过'
  return veto.value.used ? '✅ 已使用' : '⏳ 未使用'
})

const nomineeOptions = computed(() => {
  if (!nomination.value) return []
  return nomination.value.nomineeIds.map((id, i) => ({
    id,
    name: nomination.value!.nomineeNames[i] || id
  }))
})

// ===== 操作 =====
const showUseModal = ref(false)
const showSkipModal = ref(false)
const savePlayerId = ref('')
const using = ref(false)
const skipping = ref(false)

async function useVeto() {
  if (!savePlayerId.value || using.value) return
  using.value = true
  try {
    const p = nomineeOptions.value.find(n => n.id === savePlayerId.value)
    await bbUseVeto(savePlayerId.value, p?.name || '')
    showUseModal.value = false
    savePlayerId.value = ''
    await fetchData()
  } catch (e: any) {
    alert(e?.message || '操作失败')
  } finally {
    using.value = false
  }
}

async function skipVeto() {
  if (skipping.value) return
  skipping.value = true
  try {
    await bbSkipVeto()
    showSkipModal.value = false
    await fetchData()
  } catch (e: any) {
    alert(e?.message || '操作失败')
  } finally {
    skipping.value = false
  }
}

async function fetchData() {
  try {
    const history = await bbGetVetoHistory()
    const roundKey = `round-${roundNum.value}`
    veto.value = history.find(h => h.roundId === roundKey) || null
  } catch {}
  try {
    nomination.value = await bbGetCurrentNomination()
  } catch {}
}

onMounted(async () => {
  await fetchData()

  // 轮询更新（等待其他操作者操作）
  let pollTimer: ReturnType<typeof setInterval> | null = null
  if (!isFuture.value) {
    pollTimer = setInterval(async () => {
      await fetchData()
    }, 3000)
  }

  onUnmounted(() => {
    if (pollTimer) clearInterval(pollTimer)
  })
})
</script>

<style scoped>
.bb-veto-player { max-width: 600px; margin: 0 auto; padding: 16px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #00ff8844; }
.history-tag { background: #88888822; color: #aaa; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #88888844; }
.future-tag { background: #44444422; color: #666; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #44444444; }

.veto-card {
  background: linear-gradient(135deg, #0f0f2e, #1a1a3e);
  border: 1px solid #ffaa00; border-radius: 12px;
  padding: 24px; display: flex; align-items: center; gap: 20px;
  margin-bottom: 16px;
}
.veto-card.no-winner { border-color: #444; }
.veto-card.empty { border-color: #333; }
.veto-card.empty p { text-align: center; color: #666; width: 100%; margin: 0; }
.veto-icon { font-size: 48px; }
.veto-label { font-size: 12px; color: #888; text-transform: uppercase; }
.veto-winner { font-size: 20px; font-weight: 700; color: #ffaa00; }
.veto-status { font-size: 13px; color: #aaa; margin-top: 4px; }
.veto-saved { margin-top: 8px; font-size: 14px; color: #aaa; }
.highlight { color: #00ff88; font-weight: 600; }
.veto-removed { display: block; font-size: 12px; color: #00ff88; margin-top: 4px; }

/* 提名信息 */
.nomination-panel {
  background: #0f0f2e; border: 1px solid #ff444433; border-radius: 10px;
  padding: 16px 20px; margin-bottom: 16px;
}
.nom-title { font-size: 14px; font-weight: 600; color: #e0e0e0; margin-bottom: 10px; }
.nom-names { display: flex; flex-wrap: wrap; gap: 8px; }
.nom-tag {
  padding: 6px 14px; border-radius: 8px; font-size: 14px; font-weight: 600;
  background: #ff444415; color: #ff4444; border: 1px solid #ff444433;
}
.nom-empty { font-size: 13px; color: #555; }

/* 操作区 */
.action-section {
  background: linear-gradient(135deg, #1a1a0f, #1a1a2e);
  border: 1px solid #ffaa0044; border-radius: 12px;
  padding: 20px; margin-bottom: 16px;
}
.action-header {
  display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px;
}
.action-icon { font-size: 24px; }
.action-header-text { flex: 1; }
.action-title { font-size: 15px; font-weight: 600; color: #e0e0e0; }
.action-subtitle { font-size: 12px; color: #888; margin-top: 4px; }
.action-buttons { display: flex; gap: 12px; }

/* 结果提示 */
.result-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 18px; border-radius: 10px;
  font-size: 14px; margin-bottom: 16px;
}
.result-banner.used { background: #00ff8810; border: 1px solid #00ff8844; color: #00ff88; }
.result-banner.skipped { background: #ffaa0010; border: 1px solid #ffaa0044; color: #ffaa00; }
.result-icon { font-size: 18px; }

/* 按钮 */
.bb-btn {
  background: transparent; border: 1px solid #00ff8844; color: #00ff88;
  padding: 10px 24px; border-radius: 6px; cursor: pointer; font-size: 14px;
  transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px;
}
.bb-btn:hover:not(:disabled) { background: #00ff8822; }
.bb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bb-btn-primary { background: #00ff8822; border-color: #00ff88; }
.bb-btn-use { border-color: #00ff8844; color: #00ff88; }
.bb-btn-use:hover { background: #00ff8822; }
.bb-btn-skip { border-color: #ffaa0044; color: #ffaa00; }
.bb-btn-skip:hover { background: #ffaa0015; }
.bb-btn-warning { border-color: #ffaa0044; color: #ffaa00; }
.bb-btn-warning:hover { background: #ffaa0015; }

/* 弹窗 */
.bb-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.bb-modal { background: #1a1a3e; border: 1px solid #00ff8844; border-radius: 12px; width: 400px; max-width: 90vw; }
.skip-modal { width: 440px; }
.bb-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #00ff8822; }
.bb-modal-header h3 { margin: 0; color: #00ff88; font-size: 16px; }
.close-btn { background: none; border: none; color: #888; cursor: pointer; font-size: 18px; }
.bb-modal-body { padding: 20px; }
.use-hint { color: #aaa; font-size: 14px; margin-bottom: 16px; }
.skip-confirm-text { font-size: 14px; color: #ffaa00; padding: 12px; background: #ffaa0008; border: 1px solid #ffaa0022; border-radius: 6px; }
.form-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; }

/* 被提名者选择 */
.nominee-list { display: flex; flex-direction: column; gap: 8px; }
.nominee-option {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; border: 1px solid #ffffff10; border-radius: 8px;
  cursor: pointer; transition: all 0.2s;
}
.nominee-option:hover { background: #ffffff08; border-color: #00ff8833; }
.nominee-option.selected { background: #00ff8815; border-color: #00ff88; }
.nominee-radio { accent-color: #00ff88; }
.nominee-name { font-size: 14px; color: #e0e0e0; font-weight: 500; }
.no-nominees { text-align: center; color: #666; font-size: 13px; padding: 16px; }
</style>
