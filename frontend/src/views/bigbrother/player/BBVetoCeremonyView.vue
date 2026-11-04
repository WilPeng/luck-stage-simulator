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

    <!-- POV 发言稿：仪式开始前可提前编辑模拟，仪式开始后仍可继续修改 -->
    <div v-if="veto && isVetoHolder && !isFuture" class="draft-panel">
      <div class="cer-title">🎤 POV 发言稿（可提前编辑，开始后也可修改）</div>
      <div class="draft-field">
        <label>开场发言</label>
        <textarea v-model="draftOpening" class="draft-textarea" rows="2"
          placeholder="现在是POV仪式，我作为否决权获得者，将决定是否使用否决权。"></textarea>
      </div>
      <div class="draft-field">
        <label>使用否决权发言 <span class="draft-hint">可用 {name} 代表被拯救者</span></label>
        <textarea v-model="draftUse" class="draft-textarea" rows="3"
          placeholder="我决定对{name}使用POV。因为我对{name}使用了POV，所以HOH需要选择1名其他房客进行替补。"></textarea>
      </div>
      <div class="draft-field">
        <label>不使用否决权发言</label>
        <textarea v-model="draftSkip" class="draft-textarea" rows="2"
          placeholder="我决定不使用POV"></textarea>
      </div>
      <div class="draft-field">
        <label>结束发言</label>
        <textarea v-model="draftClosing" class="draft-textarea" rows="2"
          placeholder="POV仪式结束。"></textarea>
      </div>
      <div class="draft-actions">
        <button class="bb-btn bb-btn-primary" :disabled="savingDrafts" @click="saveDrafts()">
          {{ savingDrafts ? '保存中…' : '保存发言稿' }}
        </button>
        <span v-if="draftSavedTip" class="draft-saved-tip">已保存</span>
      </div>
    </div>

    <!-- POV 仪式发言区：管理员点击「仪式开始」后，POV 获得者才能开始流程 -->
    <div v-if="veto && isVetoHolder && !isFuture" class="ceremony-panel">
      <div class="cer-title">🎤 POV 仪式发言（客厅）</div>
      <div v-if="!veto.ceremony?.started" class="cer-waiting">
        等待管理员在管理员端点击「仪式开始」…
      </div>
      <template v-else>
        <CeremonyChat room-id="living_room" title="💬 POV 仪式记录（客厅）" empty-text="暂无发言" />
        <div v-if="!veto.ceremony?.openingSpoken" class="cer-actions">
          <button class="bb-btn bb-btn-primary" :disabled="speaking" @click="speak('opening')">发表开场发言</button>
        </div>
        <div v-else-if="veto.status === 'skipped' && !veto.ceremony?.closingSpoken" class="cer-actions">
          <button class="bb-btn bb-btn-primary" :disabled="speaking" @click="speak('closing')">发表结束发言</button>
        </div>
        <div v-else-if="veto.ceremony?.closingSpoken" class="cer-done">POV 仪式已结束</div>
      </template>
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
import { bbGetVetoHistory, bbGetCurrentNomination, bbUseVeto, bbSkipVeto, bbVetoSpeech, bbVetoSaveDrafts } from '../../../services/bbApi'
import type { BBVetoRecord, BBNomination } from '../../../types/bigbrother'
import CeremonyChat from '../../../components/bigbrother/CeremonyChat.vue'

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
  // 管理员点击「仪式开始」后才能操作
  if (!veto.value?.ceremony?.started) return false
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
const speaking = ref(false)
const draftOpening = ref('')
const draftUse = ref('')
const draftSkip = ref('')
const draftClosing = ref('')
const draftsReady = ref(false)
const savingDrafts = ref(false)
const draftSavedTip = ref(false)

function syncDrafts(record: BBVetoRecord | null) {
  if (draftsReady.value) return
  const d: any = record?.ceremony?.drafts
  if (!d) return
  draftOpening.value = d.opening || ''
  draftUse.value = d.use || ''
  draftSkip.value = d.skip || ''
  draftClosing.value = d.closing || ''
  draftsReady.value = true
}

async function saveDrafts(showTip = true): Promise<boolean> {
  if (savingDrafts.value) return false
  savingDrafts.value = true
  try {
    await bbVetoSaveDrafts({
      opening: draftOpening.value,
      use: draftUse.value,
      skip: draftSkip.value,
      closing: draftClosing.value
    })
    draftsReady.value = true
    if (showTip) {
      draftSavedTip.value = true
      setTimeout(() => { draftSavedTip.value = false }, 2000)
    }
    return true
  } catch (e: any) {
    if (showTip) alert(e?.message || '保存发言稿失败')
    return false
  } finally {
    savingDrafts.value = false
  }
}

async function speak(phase: 'opening' | 'closing') {
  if (speaking.value) return
  speaking.value = true
  try {
    const text = phase === 'opening' ? draftOpening.value : draftClosing.value
    await bbVetoSpeech(phase, text)
    await fetchData()
  } catch (e: any) {
    alert(e?.message || '发言失败')
  } finally {
    speaking.value = false
  }
}

async function useVeto() {
  if (!savePlayerId.value || using.value) return
  using.value = true
  try {
    if (!(await saveDrafts(false))) return
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
    if (!(await saveDrafts(false))) return
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
    syncDrafts(veto.value)
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
.page-header h1 { font-size: 24px; font-weight: 600; color: #ece7fb; margin: 0; }
.round-tag { background: #b39bff22; color: #b39bff; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #b39bff44; }
.history-tag { background: #88888822; color: #a99bd0; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #88888844; }
.future-tag { background: #44444422; color: #6b5f92; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #44444444; }

.veto-card {
  background: linear-gradient(135deg, #1b1130, #2a1a4a);
  border: 1px solid #e6c988; border-radius: 12px;
  padding: 24px; display: flex; align-items: center; gap: 20px;
  margin-bottom: 16px;
}
.veto-card.no-winner { border-color: #4a3d6e; }
.veto-card.empty { border-color: #3a2f5c; }
.veto-card.empty p { text-align: center; color: #6b5f92; width: 100%; margin: 0; }
.veto-icon { font-size: 48px; }
.veto-label { font-size: 12px; color: #8f83b8; text-transform: uppercase; }
.veto-winner { font-size: 20px; font-weight: 700; color: #e6c988; }
.veto-status { font-size: 13px; color: #a99bd0; margin-top: 4px; }
.veto-saved { margin-top: 8px; font-size: 14px; color: #a99bd0; }
.highlight { color: #b39bff; font-weight: 600; }
.veto-removed { display: block; font-size: 12px; color: #b39bff; margin-top: 4px; }

/* 提名信息 */
.nomination-panel {
  background: #1b1130; border: 1px solid #ff444433; border-radius: 10px;
  padding: 16px 20px; margin-bottom: 16px;
}
.nom-title { font-size: 14px; font-weight: 600; color: #ece7fb; margin-bottom: 10px; }
.nom-names { display: flex; flex-wrap: wrap; gap: 8px; }
.nom-tag {
  padding: 6px 14px; border-radius: 8px; font-size: 14px; font-weight: 600;
  background: #ff444415; color: #ff4444; border: 1px solid #ff444433;
}
.nom-empty { font-size: 13px; color: #5c5182; }

/* 操作区 */
.action-section {
  background: linear-gradient(135deg, #1a1a0f, #221540);
  border: 1px solid #e6c98844; border-radius: 12px;
  padding: 20px; margin-bottom: 16px;
}
.action-header {
  display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px;
}
.action-icon { font-size: 24px; }
.action-header-text { flex: 1; }
.action-title { font-size: 15px; font-weight: 600; color: #ece7fb; }
.action-subtitle { font-size: 12px; color: #8f83b8; margin-top: 4px; }
.action-buttons { display: flex; gap: 12px; }

/* 结果提示 */
.result-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 18px; border-radius: 10px;
  font-size: 14px; margin-bottom: 16px;
}
.result-banner.used { background: #b39bff10; border: 1px solid #b39bff44; color: #b39bff; }
.result-banner.skipped { background: #e6c98810; border: 1px solid #e6c98844; color: #e6c988; }
.result-icon { font-size: 18px; }

/* 按钮 */
.bb-btn {
  background: transparent; border: 1px solid #b39bff44; color: #b39bff;
  padding: 10px 24px; border-radius: 6px; cursor: pointer; font-size: 14px;
  transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px;
}
.bb-btn:hover:not(:disabled) { background: #b39bff22; }
.bb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bb-btn-primary { background: #b39bff22; border-color: #b39bff; }
.bb-btn-use { border-color: #b39bff44; color: #b39bff; }
.bb-btn-use:hover { background: #b39bff22; }
.bb-btn-skip { border-color: #e6c98844; color: #e6c988; }
.bb-btn-skip:hover { background: #e6c98815; }
.bb-btn-warning { border-color: #e6c98844; color: #e6c988; }
.bb-btn-warning:hover { background: #e6c98815; }

/* 弹窗 */
.bb-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.bb-modal { background: #2a1a4a; border: 1px solid #b39bff44; border-radius: 12px; width: 400px; max-width: 90vw; }
.skip-modal { width: 440px; max-width: 92vw; }
.bb-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #b39bff22; }
.bb-modal-header h3 { margin: 0; color: #b39bff; font-size: 16px; }
.close-btn { background: none; border: none; color: #8f83b8; cursor: pointer; font-size: 18px; }
.bb-modal-body { padding: 20px; }
.use-hint { color: #a99bd0; font-size: 14px; margin-bottom: 16px; }
.skip-confirm-text { font-size: 14px; color: #e6c988; padding: 12px; background: #e6c98808; border: 1px solid #e6c98822; border-radius: 6px; }
.form-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; }

/* 被提名者选择 */
.nominee-list { display: flex; flex-direction: column; gap: 8px; }
.nominee-option {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; border: 1px solid #ffffff10; border-radius: 8px;
  cursor: pointer; transition: all 0.2s;
}
.nominee-option:hover { background: #ffffff08; border-color: #b39bff33; }
.nominee-option.selected { background: #b39bff15; border-color: #b39bff; }
.nominee-radio { accent-color: #b39bff; }
.nominee-name { font-size: 14px; color: #ece7fb; font-weight: 500; }
.no-nominees { text-align: center; color: #6b5f92; font-size: 13px; padding: 16px; }
.draft-panel { background: #1b1130; border: 1px solid #4488ff44; border-radius: 12px; padding: 18px; margin-bottom: 16px; }
.draft-field { margin-bottom: 12px; }
.draft-field label { display: block; font-size: 13px; color: #7fb0ff; margin-bottom: 6px; }
.draft-hint { color: #8f83b8; font-size: 12px; margin-left: 6px; }
.draft-textarea { width: 100%; box-sizing: border-box; padding: 10px 12px; background: #0a0a24; border: 1px solid #4488ff44; border-radius: 8px; color: #ece7fb; font-size: 14px; line-height: 1.5; outline: none; resize: vertical; font-family: inherit; }
.draft-actions { display: flex; align-items: center; gap: 12px; }
.draft-saved-tip { color: #6ee7a8; font-size: 13px; }
.ceremony-panel { background: #1b1130; border: 1px solid #e6c98844; border-radius: 12px; padding: 18px; margin-bottom: 16px; }
.cer-title { font-size: 15px; font-weight: 700; color: #e6c988; margin-bottom: 10px; }
.cer-msgs { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.cer-msg { background: #211640; border-radius: 8px; padding: 8px 12px; font-size: 14px; color: #ddd; border-left: 3px solid #e6c98866; }
.cer-sender { color: #e6c988; font-weight: 600; margin-right: 6px; }
.cer-empty { color: #6b5f92; font-size: 13px; }
.cer-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.cer-actions .bb-input { flex: 1; min-width: 180px; background: #0a0a24; border: 1px solid #e6c98844; color: #ece7fb; padding: 8px 12px; border-radius: 6px; outline: none; }
.cer-done { color: #b39bff; font-size: 13px; }
.cer-waiting { color: #b3a6d6; font-size: 14px; padding: 8px 0; }
</style>
