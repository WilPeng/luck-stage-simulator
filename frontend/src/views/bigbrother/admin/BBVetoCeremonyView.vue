<template>
  <div class="bb-veto-admin">
    <div class="page-header">
      <h1>否决权会议</h1>
      <span class="round-tag">第{{ $route.params.round }}周</span>
    </div>

    <div v-if="twistInfo?.isBoomerangPendant" class="twist-info-bar">
      <span class="twist-item boomerang">🪃 回旋镖护符：使用否决权时将拯救所有被提名者，HOH 需重新提名全部人</span>
    </div>

    <div v-if="veto" class="veto-card">
      <div class="veto-icon">🛡️</div>
      <div class="veto-info">
        <div class="veto-label">否决权持有者</div>
        <div class="veto-winner-row">
          <BBAvatar :name="veto.winnerName" :avatar="vetoWinnerAvatar" size="md" />
          <span class="veto-winner">{{ veto.winnerName }}</span>
        </div>
        <div class="veto-status">
          <template v-if="veto.status === 'pending'">⏳ 待决定</template>
          <template v-else-if="veto.status === 'used'">✅ 已使用</template>
          <template v-else-if="veto.status === 'skipped'">⏭️ 已跳过</template>
          <template v-else>{{ veto.used ? '✅ 已使用' : '⏳ 未使用' }}</template>
        </div>
        <div v-if="veto.status === 'used' && veto.usedOnPlayerName" class="veto-saved">
          拯救: <strong class="highlight">{{ veto.usedOnPlayerName }}</strong>
          <span v-if="twistInfo?.isBoomerangPendant" class="veto-boomerang">（回旋镖护符：全部被提名者已获救）</span>
        </div>
      </div>
    </div>
    <div v-else class="veto-card empty">
      <p>暂无否决权记录</p>
    </div>

    <!-- 当前 HOH 和提名信息 -->
    <div class="status-panel">
      <div class="status-row hoh-row">
        <span class="status-label">👑 当前 HOH</span>
        <span class="status-value" :class="{ 'no-data': !hoh?.winnerName }">
          {{ hoh?.winnerName || '暂无' }}
        </span>
      </div>
      <div class="status-row nom-row">
        <span class="status-label">🎯 被提名人</span>
        <span class="status-value" :class="{ 'no-data': !nomination?.nomineeNames?.length }">
          {{ nomination?.nomineeNames?.join('、') || '暂无' }}
        </span>
      </div>
    </div>

    <!-- 否决权已使用：需替换提名 -->
    <div v-if="veto?.status === 'used' && nomination && nomination.nomineeIds.length < 2" class="replacement-hint">
      <span v-if="twistInfo?.isBoomerangPendant">🪃 回旋镖护符已触发！提名名单已清空，请前往<a href="javascript:void(0)" @click="$router.push('/games/bigbrother/admin/round/' + $route.params.round + '/replacement-nom')" class="link">替换提名</a>重新提名全部人</span>
      <span v-else>⚠️ 否决权已使用，请等待房主选择替补提名</span>
    </div>

    <!-- 否决权已跳过：最终提名已确认 -->
    <div v-if="veto?.status === 'skipped'" class="final-nomination-confirmed">
      <span>✅ 否决权<strong>未被使用</strong>，最终提名名单已确认：<strong class="final-names">{{ finalNomineeNames.join('、') }}</strong>，将进入驱逐投票阶段。</span>
    </div>

    <div class="action-section">
      <h3>操作 - 否决权使用</h3>
      <div class="action-buttons">
        <button class="bb-btn" :disabled="!veto || veto.status !== 'pending'" @click="showUseModal = true">✅ 使用否决权</button>
        <button class="bb-btn" :disabled="!veto || veto.status !== 'pending'" @click="showSkipModal = true">⏭️ 不使用否决权</button>
      </div>
    </div>

    <!-- 不使用否决权确认弹窗 -->
    <Teleport to="body">
      <div v-if="showSkipModal" class="bb-modal-overlay" @click.self="closeSkipModal">
        <div class="bb-modal skip-modal">
          <!-- 第一步：确认弹窗 -->
          <template v-if="!skipConfirmed">
            <div class="bb-modal-header"><h3>确认不使用否决权</h3><button class="close-btn" @click="closeSkipModal">✕</button></div>
            <div class="bb-modal-body">
              <div class="nomination-compare">
                <div class="compare-col">
                  <div class="compare-title">📋 初始提名</div>
                  <div class="compare-names">
                    <span v-for="name in initialNomineeNames" :key="name" class="compare-tag initial">{{ name }}</span>
                    <span v-if="initialNomineeNames.length === 0" class="no-nominees">暂无</span>
                  </div>
                </div>
                <div class="compare-arrow">→</div>
                <div class="compare-col">
                  <div class="compare-title final-title">🎯 最终提名</div>
                  <div class="compare-names">
                    <span v-for="name in finalNomineeNames" :key="name" class="compare-tag final">{{ name }}</span>
                    <span v-if="finalNomineeNames.length === 0" class="no-nominees">暂无</span>
                  </div>
                </div>
              </div>
              <p class="skip-hint">不使用否决权，提名名单将保持不变，进入驱逐投票阶段。</p>
              <div class="form-actions">
                <button class="bb-btn" @click="closeSkipModal">取消</button>
                <button class="bb-btn bb-btn-warning" @click="skipVeto">确认不使用</button>
              </div>
            </div>
          </template>
          <!-- 第二步：结果展示 -->
          <template v-else>
            <div class="bb-modal-header"><h3>✅ 否决权已处理</h3><button class="close-btn" @click="closeSkipModal">✕</button></div>
            <div class="bb-modal-body">
              <div class="skip-result">
                <div class="skip-result-icon">⏭️</div>
                <div class="skip-result-text">否决权<strong>未被使用</strong></div>
                <div class="skip-result-detail">
                  持有者 <strong class="highlight">{{ veto?.winnerName }}</strong> 选择不使用否决权
                </div>
              </div>
              <div class="nomination-compare" style="margin-top: 16px;">
                <div class="compare-col">
                  <div class="compare-title">📋 初始提名</div>
                  <div class="compare-names">
                    <span v-for="name in initialNomineeNames" :key="name" class="compare-tag initial">{{ name }}</span>
                  </div>
                </div>
                <div class="compare-arrow">→</div>
                <div class="compare-col">
                  <div class="compare-title final-title">🎯 最终提名（不变）</div>
                  <div class="compare-names">
                    <span v-for="name in finalNomineeNames" :key="name" class="compare-tag final">{{ name }}</span>
                  </div>
                </div>
              </div>
              <p class="skip-result-hint">最终提名名单已确认，将进入驱逐投票阶段。</p>
              <div class="form-actions">
                <button class="bb-btn bb-btn-primary" @click="closeSkipModal">知道了</button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- 使用否决权弹窗 -->
    <Teleport to="body">
      <div v-if="showUseModal" class="bb-modal-overlay" @click.self="showUseModal = false">
        <div class="bb-modal">
          <div class="bb-modal-header"><h3>使用否决权</h3><button class="close-btn" @click="showUseModal = false">✕</button></div>
          <div class="bb-modal-body">
            <p style="color:#aaa;font-size:14px;margin-bottom:16px;">选择要拯救的被提名人</p>
            <div class="form-group">
              <label>拯救对象</label>
              <select v-model="savePlayerId" class="bb-select">
                <option v-for="n in nomineeOptions" :key="n.id" :value="n.id">{{ n.name }}</option>
              </select>
            </div>
            <div class="form-actions">
              <button class="bb-btn" @click="showUseModal = false">取消</button>
              <button class="bb-btn bb-btn-primary" @click="useVeto">确认拯救</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import BBAvatar from '../../../components/bigbrother/BBAvatar.vue'
import { bbGetCurrentVeto, bbUseVeto, bbSkipVeto, bbGetCurrentNomination, bbGetCurrentHoh, bbGetNominationHistory } from '../../../services/bbApi'
import type { BBVetoRecord, BBNomination, BBHohRecord } from '../../../types/bigbrother'

const veto = ref<BBVetoRecord | null>(null)
const twistInfo = ref<any>(null)
const nomination = ref<BBNomination | null>(null)
const hoh = ref<BBHohRecord | null>(null)
const showUseModal = ref(false)
const showSkipModal = ref(false)
const skipConfirmed = ref(false)
const savePlayerId = ref('')
const initialNomination = ref<BBNomination | null>(null)

const vetoWinnerAvatar = computed(() => {
  return (veto.value as any)?.winnerAvatar || null
})

const nomineeOptions = computed(() => {
  if (!nomination.value) return []
  return nomination.value.nomineeIds.map((id, i) => ({
    id,
    name: nomination.value!.nomineeNames[i] || id
  }))
})

// 初始提名名单（否决权使用前）
const initialNomineeNames = computed(() => {
  return initialNomination.value?.nomineeNames || []
})

// 最终提名名单（当前提名，即否决权决定后的结果）
const finalNomineeNames = computed(() => {
  return nomination.value?.nomineeNames || []
})

async function fetchData() {
  try {
    const result = await bbGetCurrentVeto()
    veto.value = result as any
    twistInfo.value = (result as any)?.twists || null
  } catch {}
  try { nomination.value = await bbGetCurrentNomination() } catch {}
  try { hoh.value = await bbGetCurrentHoh() } catch {}
  // 获取提名历史，取最近的一条作为初始提名
  try {
    const history = await bbGetNominationHistory()
    if (history && history.length > 0) {
      initialNomination.value = history[0]
    }
  } catch {}
}

async function useVeto() {
  if (!savePlayerId.value) { alert('请选择要拯救的对象'); return }
  const p = nomineeOptions.value.find(n => n.id === savePlayerId.value)
  try {
    await bbUseVeto(savePlayerId.value, p?.name || '')
    showUseModal.value = false
    await fetchData()
  } catch (e: any) { alert(e.message) }
}

async function skipVeto() {
  try {
    await bbSkipVeto()
    skipConfirmed.value = true
    await fetchData()
  } catch (e: any) { alert(e.message) }
}

// 关闭 skip 弹窗时重置状态
function closeSkipModal() {
  showSkipModal.value = false
  skipConfirmed.value = false
}

onMounted(fetchData)
</script>

<style scoped>
.bb-veto-admin { max-width: 1000px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #00ff8844; }
.veto-card { background: linear-gradient(135deg, #0f0f2e, #1a1a3e); border: 1px solid #ffaa00; border-radius: 12px; padding: 24px; display: flex; align-items: center; gap: 20px; margin-bottom: 20px; }
.veto-card.empty { border-color: #444; }
.veto-card.empty p { text-align: center; color: #666; width: 100%; }
.veto-icon { font-size: 48px; }
.veto-label { font-size: 12px; color: #888; text-transform: uppercase; }
.veto-winner-row { display: flex; align-items: center; gap: 12px; margin-top: 4px; }
.veto-winner { font-size: 20px; font-weight: 700; color: #ffaa00; }
.veto-status { font-size: 13px; color: #aaa; margin-top: 4px; }
.veto-saved { margin-top: 8px; font-size: 14px; color: #aaa; }
.highlight { color: #00ff88; }
.veto-boomerang { display: block; font-size: 12px; color: #00ff88; margin-top: 4px; font-weight: 600; }
.twist-info-bar { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 14px 18px; margin-bottom: 20px; display: flex; flex-direction: column; gap: 6px; }
.twist-item { font-size: 13px; color: #aaa; }
.twist-item.boomerang { color: #00ff88; }
.replacement-hint { background: #ffaa0022; border: 1px solid #ffaa00; border-radius: 10px; padding: 12px 16px; font-size: 14px; color: #ffaa00; margin-bottom: 20px; }
.replacement-hint .link { color: #ffaa00; text-decoration: underline; }
.final-nomination-confirmed { background: #00ff8810; border: 1px solid #00ff8844; border-radius: 10px; padding: 12px 16px; font-size: 14px; color: #00ff88; margin-bottom: 20px; }
.final-nomination-confirmed strong { color: #00ff88; }
.final-names { font-size: 15px; }
.status-panel { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 16px 20px; margin-bottom: 20px; display: flex; flex-direction: column; gap: 12px; }
.status-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; }
.status-row + .status-row { border-top: 1px solid #00ff8811; }
.status-label { font-size: 13px; color: #888; min-width: 120px; }
.status-value { font-size: 14px; font-weight: 600; color: #e0e0e0; }
.status-value.no-data { color: #555; font-weight: 400; }
.hoh-row .status-value { color: #4488ff; }
.nom-row .status-value { color: #ff4444; }
.replacement-hint .link { color: #ffaa00; text-decoration: underline; }
.action-section { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
.action-section h3 { margin: 0 0 12px; font-size: 16px; color: #e0e0e0; }
.action-buttons { display: flex; gap: 12px; flex-wrap: wrap; }
.bb-btn { background: transparent; border: 1px solid #00ff8844; color: #00ff88; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
.bb-btn:hover { background: #00ff8822; }
.bb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bb-btn-primary { background: #00ff8822; border-color: #00ff88; }
.bb-btn-warning { border-color: #ffaa0044; color: #ffaa00; }
.bb-btn-warning:hover { background: #ffaa0015; }
.bb-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.bb-modal { background: #1a1a3e; border: 1px solid #00ff8844; border-radius: 12px; width: 400px; max-width: 90vw; }
.skip-modal { width: 520px; }
.bb-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #00ff8822; }
.bb-modal-header h3 { margin: 0; color: #00ff88; font-size: 16px; }
.close-btn { background: none; border: none; color: #888; cursor: pointer; font-size: 18px; }
.bb-modal-body { padding: 20px; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 13px; color: #aaa; margin-bottom: 6px; }
.bb-select { background: #0f0f2e; border: 1px solid #00ff8822; color: #e0e0e0; padding: 8px 12px; border-radius: 6px; font-size: 14px; outline: none; cursor: pointer; width: 100%; }
.form-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; }

/* 提名对比面板 */
.nomination-compare { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 16px; }
.compare-col { flex: 1; }
.compare-title { font-size: 13px; font-weight: 600; color: #aaa; margin-bottom: 10px; }
.compare-title.final-title { color: #ff4444; }
.compare-names { display: flex; flex-direction: column; gap: 6px; }
.compare-tag {
  display: inline-block; padding: 6px 12px; border-radius: 6px; font-size: 14px; font-weight: 600;
}
.compare-tag.initial {
  background: #4488ff10; color: #4488ff; border: 1px solid #4488ff33;
}
.compare-tag.final {
  background: #ff444410; color: #ff4444; border: 1px solid #ff444433;
}
.no-nominees { font-size: 13px; color: #555; font-style: italic; }
.compare-arrow {
  display: flex; align-items: center; padding-top: 28px;
  font-size: 20px; color: #888; font-weight: 700;
}
.skip-hint { font-size: 13px; color: #ffaa00; margin: 0; padding: 12px; background: #ffaa0008; border: 1px solid #ffaa0022; border-radius: 6px; }

/* 不使用否决权结果展示 */
.skip-result { text-align: center; padding: 12px 0; }
.skip-result-icon { font-size: 40px; margin-bottom: 12px; }
.skip-result-text { font-size: 16px; color: #e0e0e0; margin-bottom: 8px; }
.skip-result-text strong { color: #ffaa00; }
.skip-result-detail { font-size: 13px; color: #888; }
.skip-result-detail .highlight { color: #ffaa00; }
.skip-result-hint { font-size: 13px; color: #00ff88; margin: 16px 0 0; padding: 12px; background: #00ff8808; border: 1px solid #00ff8822; border-radius: 6px; }
</style>
