<template>
  <div class="bb-nomination-admin">
    <div class="page-header">
      <h1>提名管理</h1>
      <span class="round-tag">第{{ $route.params.round }}周</span>
    </div>

    <div v-if="nomination" class="nomination-card">
      <div class="nomination-header">
        <span class="hoh-info">HOH: {{ nomination.hohName }}</span>
        <span v-if="nomination.vetoUsed" class="veto-badge">否决权已使用</span>
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
    </div>

    <div class="action-section">
      <h3>操作</h3>
      <div class="action-buttons">
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
import { bbGetCurrentNomination, bbSetNomination, bbReplaceNomination, bbGetNominationHistory, bbGetActiveHouseguests } from '../../../services/bbApi'
import type { BBNomination } from '../../../types/bigbrother'

const nomination = ref<BBNomination | null>(null)
const history = ref<BBNomination[]>([])
const activeList = ref<{ id: string; name: string }[]>([])
const activeMap = ref<Record<string, string>>({})
const showSetModal = ref(false)
const showReplaceModal = ref(false)
const nominee1 = ref('')
const nominee2 = ref('')
const replaceId = ref('')

// 排除 HOH、已被提名的房客、否决权赢家
const baseAvailable = computed(() => {
  const hohId = nomination.value?.hohId || ''
  const vetoWinnerId = nomination.value?.vetoWinnerId || ''
  const nomineeIdSet = new Set(nomination.value?.nomineeIds || [])
  return activeList.value.filter(h =>
    h.id !== hohId &&
    h.id !== vetoWinnerId &&
    !nomineeIdSet.has(h.id)
  )
})

// 被提名人1的列表：排除被提名人2已选的
const listForNominee1 = computed(() => {
  return baseAvailable.value.filter(h => h.id !== nominee2.value)
})

// 被提名人2的列表：排除被提名人1已选的
const listForNominee2 = computed(() => {
  return baseAvailable.value.filter(h => h.id !== nominee1.value)
})

async function fetchData() {
  try { nomination.value = await bbGetCurrentNomination() } catch {}
  try { history.value = await bbGetNominationHistory() } catch {}
  try {
    const list = await bbGetActiveHouseguests()
    activeList.value = list
    const map: Record<string, string> = {}
    list.forEach(h => { map[h.id] = h.name })
    activeMap.value = map
  } catch {}
}

async function setNomination() {
  if (!nominee1.value || !nominee2.value) { alert('请选择两名被提名人'); return }
  const name1 = activeMap.value[nominee1.value] || ''
  const name2 = activeMap.value[nominee2.value] || ''
  try {
    await bbSetNomination([nominee1.value, nominee2.value], [name1, name2])
    showSetModal.value = false
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
.veto-badge { background: #ffaa0022; color: #ffaa00; padding: 2px 10px; border-radius: 10px; font-size: 12px; }
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
