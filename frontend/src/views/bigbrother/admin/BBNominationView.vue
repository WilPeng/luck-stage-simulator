<template>
  <div class="bb-nomination-admin">
    <div class="page-header">
      <h1>提名管理</h1>
      <span class="round-tag">第{{ $route.params.round }}周</span>
    </div>

    <div v-if="nomination" class="nomination-card">
      <div class="nomination-header">
        <span class="hoh-info">HOH: {{ nomination.hohName }}</span>
        <div class="header-badges">
          <span v-if="nomination.isSecretKeeper" class="twist-badge secret">🎭 匿名房主</span>
          <span v-if="nomination.isDirectDemocracy" class="twist-badge democracy">🗳️ 直接民主</span>
          <span v-if="isTripleOffering" class="twist-badge triple">🔱 三重献祭</span>
          <span v-if="nomination.vetoUsed" class="veto-badge">否决权已使用</span>
        </div>
      </div>
      <div class="nominees">
        <div class="nominee-item" v-for="(name, i) in (nomination.nomineeNames || [])" :key="i">
          <span class="nominee-icon">📋</span>
          <span class="nominee-name">{{ name }}</span>
          <span class="nominee-order">被提名人 {{ i + 1 }}</span>
        </div>
      </div>
      <div v-if="nomination.replacementNomineeName" class="replacement">
        <span>替换提名: </span>
        <strong class="highlight">{{ nomination.replacementNomineeName }}</strong>
      </div>
    </div>
    <div v-else class="nomination-card empty">
      <p>暂无提名记录</p>
      <div v-if="twistInfo" class="twist-info-bar">
        <span v-if="twistInfo.isDirectDemocracy" class="twist-info-item">🗳️ 本轮为"直接民主"模式，提名由全员投票决定</span>
        <span v-if="twistInfo.isTripleOffering" class="twist-info-item">🔱 本轮为"三重献祭"模式，允许提名3人</span>
        <span v-if="twistInfo.isSecretKeeper" class="twist-info-item">🎭 本轮为"匿名房主"模式</span>
      </div>
    </div>

    <div class="action-section">
      <h3>操作</h3>
      <template v-if="isDirectDemocracy">
        <div class="twist-action-hint">
          🗳️ 当前为"直接民主"模式，提名由全员投票决定。请在下方为每位房客选择投票对象，系统自动统计票数（HOH票数双倍）。
        </div>
        <div v-if="activeList.length > 0" class="democracy-vote-section">
          <h4>全员投票（直接民主）</h4>
          <div class="democracy-grid">
            <div v-for="h in activeList" :key="h.id" class="democracy-row">
              <span class="democracy-voter">
                <BBAvatar :name="h.name" :avatar="h.avatar" size="sm" />
                {{ h.name }}
              </span>
              <select v-model="democracyVotes[h.id]" class="bb-select-sm">
                <option value="">选择投票对象</option>
                <option v-for="n in democracyCandidates" :key="n.id" :value="n.id" :disabled="n.id === h.id">{{ n.name }}</option>
              </select>
            </div>
          </div>
          <button class="bb-btn bb-btn-primary" @click="submitDemocracyVotes" style="margin-top: 12px;">提交全员投票</button>
        </div>
        <div v-else class="empty-hint">暂无活跃房客可供投票</div>
      </template>
      <div v-else class="action-buttons">
        <button class="bb-btn" @click="showSetModal = true">✏️ 设置提名</button>
        <button class="bb-btn" @click="showReplaceModal = true" :disabled="!nomination">🔄 替换提名</button>
      </div>
    </div>

    <div class="history-section">
      <h3>提名历史</h3>
      <div class="table-container">
        <table class="bb-table">
          <thead><tr><th>轮次</th><th>被提名人</th><th>HOH</th><th>替换提名</th></tr></thead>
          <tbody>
            <tr v-for="n in history" :key="n.id">
              <td>{{ getRoundLabel(n.createdAt) }}</td>
              <td>{{ n.nomineeNames?.join(', ') }}</td>
              <td>{{ n.hohName }}</td>
              <td>{{ n.replacementNomineeName || '-' }}</td>
            </tr>
            <tr v-if="history.length === 0"><td colspan="4" class="empty-cell">暂无记录</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showSetModal" class="bb-modal-overlay" @click.self="showSetModal = false">
        <div class="bb-modal">
          <div class="bb-modal-header"><h3>设置提名</h3><button class="close-btn" @click="showSetModal = false">✕</button></div>
          <div class="bb-modal-body">
            <div class="form-group">
              <label>被提名人 1</label>
              <select v-model="nominee1" class="bb-select">
                <option value="" disabled>请选择</option>
                <option v-for="h in listForNominee1" :key="h.id" :value="h.id">{{ h.name }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>被提名人 2</label>
              <select v-model="nominee2" class="bb-select">
                <option value="" disabled>请选择</option>
                <option v-for="h in listForNominee2" :key="h.id" :value="h.id">{{ h.name }}</option>
              </select>
            </div>
            <div v-if="isTripleOffering" class="form-group">
              <label>被提名人 3（三重献祭）</label>
              <select v-model="nominee3" class="bb-select">
                <option value="" disabled>请选择</option>
                <option v-for="h in listForNominee3" :key="h.id" :value="h.id">{{ h.name }}</option>
              </select>
            </div>
            <div class="form-actions">
              <button class="bb-btn" @click="showSetModal = false">取消</button>
              <button class="bb-btn bb-btn-primary" @click="setNomination">确认提名</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="showReplaceModal" class="bb-modal-overlay" @click.self="showReplaceModal = false">
        <div class="bb-modal">
          <div class="bb-modal-header"><h3>替换提名</h3><button class="close-btn" @click="showReplaceModal = false">✕</button></div>
          <div class="bb-modal-body">
            <div class="form-group">
              <label>替换人选</label>
              <select v-model="replaceId" class="bb-select">
                <option value="" disabled>请选择</option>
                <option v-for="h in baseAvailable" :key="h.id" :value="h.id">{{ h.name }}</option>
              </select>
            </div>
            <div class="form-actions">
              <button class="bb-btn" @click="showReplaceModal = false">取消</button>
              <button class="bb-btn bb-btn-primary" @click="replaceNomination">确认替换</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { bbGetCurrentNomination, bbSetNomination, bbReplaceNomination, bbGetNominationHistory, bbGetActiveHouseguests, bbVoteNominees, bbGetCurrentVeto } from '../../../services/bbApi'
import BBAvatar from '../../../components/bigbrother/BBAvatar.vue'
import type { BBNomination } from '../../../types/bigbrother'

const nomination = ref<BBNomination | null>(null)
const twistInfo = ref<any>(null)
const history = ref<BBNomination[]>([])
const activeList = ref<{ id: string; name: string; avatar: string | null }[]>([])
const activeMap = ref<Record<string, string>>({})
const showSetModal = ref(false)
const showReplaceModal = ref(false)
const nominee1 = ref('')
const nominee2 = ref('')
const nominee3 = ref('')
const replaceId = ref('')
const democracyVotes = ref<Record<string, string>>({})
const savedPlayerId = ref('') // 被 POV 拯救的选手 ID

// 排除 HOH、已被提名的房客、否决权赢家、被 POV 拯救的选手
const baseAvailable = computed(() => {
  const hohId = nomination.value?.hohId || ''
  const vetoWinnerId = nomination.value?.vetoWinnerId || ''
  const nomineeIdSet = new Set(nomination.value?.nomineeIds || [])
  const excludeSet = new Set([hohId, vetoWinnerId, savedPlayerId.value])
  return activeList.value.filter(h =>
    !excludeSet.has(h.id) &&
    !nomineeIdSet.has(h.id)
  )
})

const listForNominee1 = computed(() => {
  return baseAvailable.value.filter(h => h.id !== nominee2.value && h.id !== nominee3.value)
})

const listForNominee2 = computed(() => {
  return baseAvailable.value.filter(h => h.id !== nominee1.value && h.id !== nominee3.value)
})

const listForNominee3 = computed(() => {
  return baseAvailable.value.filter(h => h.id !== nominee1.value && h.id !== nominee2.value)
})

// 直接民主：投票候选人（所有活跃玩家）
const democracyCandidates = computed(() => activeList.value)

// 直接民主：同时检查 nomination 和 twistInfo，确保无提名记录时也能正确识别
const isDirectDemocracy = computed(() =>
  (nomination.value as any)?.isDirectDemocracy || twistInfo.value?.isDirectDemocracy
)

// 三重献祭：同时检查 nomination 和 twistInfo，确保无提名记录时也能正确识别
const isTripleOffering = computed(() =>
  (nomination.value as any)?.isTripleOffering || twistInfo.value?.isTripleOffering
)

async function fetchData() {
  try {
    const data = await bbGetCurrentNomination()
    nomination.value = data as any
    twistInfo.value = (data as any)?.twists || null
  } catch {}
  try {
    const vetoData = await bbGetCurrentVeto()
    savedPlayerId.value = vetoData?.usedOnPlayerId || ''
  } catch {}
  try { history.value = await bbGetNominationHistory() } catch {}
  try {
    const list = await bbGetActiveHouseguests()
    activeList.value = list
    const map: Record<string, string> = {}
    list.forEach(h => { map[h.id] = h.name; democracyVotes.value[h.id] = '' })
    activeMap.value = map
  } catch {}
}

async function setNomination() {
  const isTriple = isTripleOffering.value
  const ids = [nominee1.value, nominee2.value]
  if (isTriple && nominee3.value) ids.push(nominee3.value)
  const names = ids.map(id => activeMap.value[id] || '')
  if (ids.some(id => !id)) {
    alert(isTriple ? '请选择三名被提名人' : '请选择两名被提名人')
    return
  }
  try {
    await bbSetNomination(ids, names)
    showSetModal.value = false
    nominee1.value = ''; nominee2.value = ''; nominee3.value = ''
    await fetchData()
  } catch (e: any) { alert(e.message) }
}

async function submitDemocracyVotes() {
  const votes = Object.entries(democracyVotes.value)
    .filter(([, targetId]) => targetId)
    .map(([voterId, targetId]) => ({
      voterId,
      voterName: activeMap.value[voterId] || '',
      targetId,
      targetName: activeMap.value[targetId] || ''
    }))
  if (votes.length === 0) { alert('请至少为一位房客投票'); return }
  try {
    const result = await bbVoteNominees(votes)
    alert(`直接民主投票完成！提名结果：${result.data.nominees.map((n: any) => n.name).join('、')}`)
    await fetchData()
  } catch (e: any) { alert(e.message) }
}

async function replaceNomination() {
  if (!replaceId.value) return
  const pName = activeMap.value[replaceId.value] || ''
  try {
    await bbReplaceNomination(replaceId.value, pName)
    showReplaceModal.value = false
    await fetchData()
  } catch (e: any) { alert(e.message) }
}

function getRoundLabel(t: string) { return t ? new Date(t).toLocaleDateString('zh-CN') : '?' }

onMounted(fetchData)
</script>

<style scoped>
.bb-nomination-admin { max-width: 1000px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #00ff8844; }
.nomination-card { background: linear-gradient(135deg, #0f0f2e, #1a1a3e); border: 1px solid #00ff88; border-radius: 12px; padding: 24px; margin-bottom: 20px; }
.nomination-card.empty { border-color: #444; }
.nomination-card.empty p { text-align: center; color: #666; }
.nomination-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.hoh-info { color: #aaa; font-size: 14px; }
.header-badges { display: flex; gap: 6px; flex-wrap: wrap; }
.twist-badge { padding: 2px 8px; border-radius: 8px; font-size: 11px; }
.twist-badge.secret { background: #9b59b622; color: #9b59b6; border: 1px solid #9b59b644; }
.twist-badge.democracy { background: #3498db22; color: #3498db; border: 1px solid #3498db44; }
.twist-badge.triple { background: #e74c3c22; color: #e74c3c; border: 1px solid #e74c3c44; }
.veto-badge { background: #ffaa0022; color: #ffaa00; padding: 2px 10px; border-radius: 10px; font-size: 12px; }
.twist-info-bar { margin-top: 12px; padding: 10px; background: #1a1a3e; border-radius: 8px; display: flex; flex-direction: column; gap: 4px; }
.twist-info-item { font-size: 13px; color: #aaa; }
.democracy-vote-section { margin-top: 12px; }
.democracy-vote-section h4 { font-size: 14px; color: #3498db; margin: 0 0 12px; }
.democracy-grid { display: flex; flex-direction: column; gap: 8px; }
.democracy-row { display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: #1a1a3e; border-radius: 6px; }
.democracy-voter { flex: 1; font-size: 14px; color: #ccc; }
.bb-select-sm { padding: 6px 10px; background: #0f0f2e; border: 1px solid #444; border-radius: 6px; color: #fff; font-size: 12px; width: 180px; }
.bb-select-sm:focus { border-color: #3498db; outline: none; }
.bb-select-sm option { background: #0f0f2e; color: #fff; }
.twist-action-hint { padding: 12px; background: #3498db11; border: 1px solid #3498db33; border-radius: 8px; font-size: 13px; color: #3498db; margin-bottom: 12px; }
.empty-hint { text-align: center; color: #666; font-size: 14px; padding: 20px; }
.nominees { display: flex; gap: 16px; }
.nominee-item { flex: 1; background: #00ff8808; border: 1px solid #00ff8822; border-radius: 8px; padding: 16px; text-align: center; }
.nominee-icon { display: block; font-size: 24px; margin-bottom: 8px; }
.nominee-name { display: block; font-size: 18px; font-weight: 600; color: #fff; margin-bottom: 4px; }
.nominee-order { font-size: 12px; color: #888; }
.replacement { margin-top: 16px; padding: 12px; background: #ffaa0008; border-radius: 8px; font-size: 14px; color: #aaa; }
.highlight { color: #ffaa00; }
.action-section { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
.action-section h3 { margin: 0 0 12px; font-size: 16px; color: #e0e0e0; }
.action-buttons { display: flex; gap: 12px; }
.bb-btn { background: transparent; border: 1px solid #00ff8844; color: #00ff88; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
.bb-btn:hover { background: #00ff8822; }
.bb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bb-btn-primary { background: #00ff8822; border-color: #00ff88; }
.history-section h3 { font-size: 16px; color: #e0e0e0; margin: 0 0 12px; }
.bb-table { width: 100%; border-collapse: collapse; }
.bb-table th, .bb-table td { padding: 10px 16px; text-align: left; border-bottom: 1px solid #00ff8811; font-size: 14px; color: #ccc; }
.bb-table th { color: #888; font-size: 12px; text-transform: uppercase; }
.empty-cell { text-align: center; color: #666; padding: 32px; }
.bb-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.bb-modal { background: #1a1a3e; border: 1px solid #00ff8844; border-radius: 12px; width: 400px; max-width: 90vw; }
.bb-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #00ff8822; }
.bb-modal-header h3 { margin: 0; color: #00ff88; font-size: 16px; }
.close-btn { background: none; border: none; color: #888; cursor: pointer; font-size: 18px; }
.bb-modal-body { padding: 20px; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 13px; color: #aaa; margin-bottom: 6px; }
.bb-select { background: #0f0f2e; border: 1px solid #00ff8822; color: #e0e0e0; padding: 8px 12px; border-radius: 6px; font-size: 14px; outline: none; cursor: pointer; width: 100%; }
.form-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; }
</style>
