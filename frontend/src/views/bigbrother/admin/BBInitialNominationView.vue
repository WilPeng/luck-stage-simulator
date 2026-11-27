<template>
  <div class="bb-nomination-admin">
    <header class="nomination-masthead">
      <div>
        <span class="nomination-round">第 {{ $route.params.round }} 周</span>
        <h1>提名仪式</h1>
      </div>
      <div class="nomination-badges">
        <span>{{ isDirectDemocracy ? '直接民主' : '钥匙仪式' }}</span>
        <span v-if="nomination?.isSecretKeeper || twistInfo?.isSecretKeeper">匿名房主</span>
      </div>
    </header>

    <section v-if="nomination && ceremonyDone" class="nomination-card" aria-label="本轮提名结果">
      <div class="nomination-card-head">
        <h2>本轮提名结果</h2>
        <p class="hoh-info">房主：{{ nomination.hohName }}</p>
      </div>
      <ol class="nominees">
        <li class="nominee-item" v-for="(name, i) in (nomination.nomineeNames || [])" :key="i">
          <BBAvatar :name="name" size="md" />
          <div class="nominee-label">
            <span class="nominee-name">{{ name }}</span>
            <span class="nominee-order">被提名人 {{ i + 1 }}</span>
          </div>
        </li>
      </ol>
    </section>

    <section class="nomination-workflow" aria-label="本轮提名操作">
      <!-- 钥匙仪式 -->
      <KeyCeremony
        v-if="!isDirectDemocracy"
        :keyCeremony="keyCeremony"
        :myId="''"
        :isAdmin="true"
        :eligible="keyEligible"
        :nomineeCount="needThree ? 3 : 2"
        :submitting="submittingKey"
        :drawing="drawingKey"
        :announcing="announcingKey"
        :canStartCeremony="true"
        :starting="startingKey"
        @setup="onKeySetup"
        @start="onKeyStart"
        @draw="onKeyDraw"
        @announce="onKeyAnnounce"
        @speech="onKeySpeech"
      />

      <section v-if="isDirectDemocracy" class="nomination-ballot">
        <header class="nomination-card-head">
          <div>
            <h2>全员投票</h2>
            <p class="nomination-ballot-copy">为每位房客选择投票对象，提交后由系统统计。房主（HOH）的票计两票。</p>
          </div>
          <span v-if="activeList.length" class="nomination-vote-progress" role="status">
            已填写 {{ activeList.filter(h => democracyVotes[h.id]).length }} / {{ activeList.length }} 票
          </span>
        </header>
        <div v-if="activeList.length > 0" class="democracy-vote-section">
          <div class="democracy-grid">
            <div v-for="h in activeList" :key="h.id" class="democracy-row">
              <span class="democracy-voter">{{ h.name }}</span>
              <select v-model="democracyVotes[h.id]" class="bb-select-sm" :aria-label="'为 ' + h.name + ' 选择投票对象'">
                <option value="">选择投票对象</option>
                <option v-for="n in democracyCandidates" :key="n.id" :value="n.id" :disabled="n.id === h.id">{{ n.name }}</option>
              </select>
            </div>
          </div>
          <div class="nomination-ballot-footer">
            <button class="bb-btn bb-btn-primary" @click="submitDemocracyVotes">提交全员投票</button>
          </div>
        </div>
        <div v-else class="empty-hint">暂无活跃房客可供投票</div>
      </section>
    </section>

    <div class="nomination-tools">
      <details v-if="!isDirectDemocracy" class="nomination-disclosure">
        <summary>手动管理提名</summary>
        <div class="action-buttons">
          <button class="bb-btn" @click="showSetModal = true">✏️ 设置提名</button>
          <button v-if="nomination" class="bb-btn bb-btn-danger" @click="undoNomination">↩ 撤销提名</button>
        </div>
      </details>
      <details class="history-section nomination-disclosure">
        <summary>提名历史</summary>
        <div class="table-container">
          <table class="bb-table">
            <thead><tr><th>轮次</th><th>被提名人</th><th>HOH</th></tr></thead>
            <tbody>
              <tr v-for="n in history" :key="n.id">
                <td>{{ getRoundLabel(n.createdAt) }}</td>
                <td>{{ n.nomineeNames?.join(', ') }}</td>
                <td>{{ n.hohName }}</td>
              </tr>
              <tr v-if="history.length === 0"><td colspan="3" class="empty-cell">暂无记录</td></tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>

    <Teleport to="body">
      <div v-if="showSetModal" class="bb-modal-overlay" @click.self="showSetModal = false">
        <div class="bb-modal">
          <div class="bb-modal-header"><h3>设置提名</h3><button class="close-btn" aria-label="关闭设置提名" @click="showSetModal = false">✕</button></div>
          <div class="bb-modal-body">
            <div class="form-group">
              <label for="manual-nominee-1">被提名人 1</label>
              <select id="manual-nominee-1" v-model="nominee1" class="bb-select">
                <option value="" disabled>请选择</option>
                <option v-for="h in listForNominee1" :key="h.id" :value="h.id">{{ h.name }}</option>
              </select>
            </div>
            <div class="form-group">
              <label for="manual-nominee-2">被提名人 2</label>
              <select id="manual-nominee-2" v-model="nominee2" class="bb-select">
                <option value="" disabled>请选择</option>
                <option v-for="h in listForNominee2" :key="h.id" :value="h.id">{{ h.name }}</option>
              </select>
            </div>
            <div v-if="needThree" class="form-group">
              <label for="manual-nominee-3">被提名人 3</label>
              <select id="manual-nominee-3" v-model="nominee3" class="bb-select">
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
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useBbRefresh } from '../../../composables/useBbRefresh'
import { bbGetCurrentNomination, bbSetNomination, bbGetNominationHistory, bbGetActiveHouseguests, bbVoteNominees, bbGetCurrentHoh, bbGetCurrentVeto, bbKeySetup, bbKeyStart, bbKeyDraw, bbKeyAnnounce, bbKeySpeech, bbGetSeasonConfig, bbUndoNomination } from '../../../services/bbApi'
import type { BBNomination, BBRoundConfig } from '../../../types/bigbrother'
import KeyCeremony from '../../../components/bigbrother/KeyCeremony.vue'
import BBAvatar from '../../../components/bigbrother/BBAvatar.vue'

const route = useRoute()
const roundNum = computed(() => Number(route.params.round) || 1)
const roundConfigs = ref<BBRoundConfig[]>([])
const nomination = ref<BBNomination | null>(null)
const keyCeremony = ref<any>(null)
const submittingKey = ref(false)
const drawingKey = ref(false)
const announcingKey = ref(false)
const startingKey = ref(false)
const keyEligible = computed(() => activeList.value.filter(h => h.id !== currentHoh.value?.winnerId))
// 提名仪式是否已结束（HOH 结束发言后才公布被提名者）
const ceremonyDone = computed(() => {
  const kc = keyCeremony.value
  if (!kc) return true
  return !!kc.ended
})

async function onKeySetup(payload: { nominees: string[]; order: string[]; openingText?: string; closingReason?: string }) {
  submittingKey.value = true
  try {
    await bbKeySetup(payload.nominees, payload.order, {
      openingText: payload.openingText,
      closingReason: payload.closingReason
    })
    await fetchData()
  } catch (e: any) { alert(e?.message || '保存失败') } finally { submittingKey.value = false }
}
async function onKeyStart() {
  startingKey.value = true
  try { await bbKeyStart(); await fetchData() } catch (e: any) { alert(e?.message || '开始仪式失败') } finally { startingKey.value = false }
}
async function onKeyDraw() {
  drawingKey.value = true
  try { await bbKeyDraw(); await fetchData() } catch (e: any) { alert(e?.message || '抽钥匙失败') } finally { drawingKey.value = false }
}
async function onKeyAnnounce(text: string) {
  announcingKey.value = true
  try { await bbKeyAnnounce(text); await fetchData() } catch (e: any) { alert(e?.message || '宣布失败') } finally { announcingKey.value = false }
}
async function onKeySpeech(payload: { phase: 'opening' | 'closing'; text?: string; reason?: string; nomineeOrder?: string[] }) {
  try { await bbKeySpeech(payload); await fetchData() } catch (e: any) { alert(e?.message || '发言失败') }
}
const twistInfo = ref<any>(null)
const history = ref<BBNomination[]>([])
const activeList = ref<{ id: string; name: string }[]>([])
const activeMap = ref<Record<string, string>>({})
const currentHoh = ref<any>(null)
const currentVeto = ref<any>(null)
const savedPlayerId = ref('')
const showSetModal = ref(false)
const nominee1 = ref('')
const nominee2 = ref('')
const nominee3 = ref('')
const democracyVotes = ref<Record<string, string>>({})

// 排除 HOH（本人不可提名自己）、POV 赢家、被 POV 拯救者
const baseAvailable = computed(() => {
  const hohId = nomination.value?.hohId || currentHoh.value?.winnerId || ''
  const vetoWinnerId = currentVeto.value?.winnerId || ''
  const excludeSet = new Set<string>()
  if (hohId) excludeSet.add(hohId)
  if (vetoWinnerId) excludeSet.add(vetoWinnerId)
  if (savedPlayerId.value) excludeSet.add(savedPlayerId.value)
  return activeList.value.filter(h => !excludeSet.has(h.id))
})

const listForNominee1 = computed(() => baseAvailable.value.filter(h => h.id !== nominee2.value && h.id !== nominee3.value))
const listForNominee2 = computed(() => baseAvailable.value.filter(h => h.id !== nominee1.value && h.id !== nominee3.value))
const listForNominee3 = computed(() => baseAvailable.value.filter(h => h.id !== nominee1.value && h.id !== nominee2.value))

const democracyCandidates = computed(() => activeList.value)

// 本轮 twist（优先用赛季配置，无需提名记录即可识别）
const roundTwists = computed<string[]>(() => roundConfigs.value.find(c => c.round === roundNum.value)?.twists || [])
const hasTwist = (key: string, fallback: any) => roundConfigs.value.length ? roundTwists.value.includes(key) : !!fallback

// 直接民主
const isDirectDemocracy = computed(() =>
  hasTwist('direct_democracy', (nomination.value as any)?.isDirectDemocracy || twistInfo.value?.isDirectDemocracy)
)

// 三重献祭
const isTripleOffering = computed(() =>
  hasTwist('tie_recall', false) || hasTwist('save_vote', false) || hasTwist('triple_offering', (nomination.value as any)?.isTripleOffering || twistInfo.value?.isTripleOffering)
)

// BBBB：本轮提名 3 人
const isBbbb = computed(() =>
  hasTwist('bbbb', (nomination.value as any)?.isBbbb || twistInfo.value?.isBbbb)
)
const needThree = computed(() => isTripleOffering.value || isBbbb.value)

async function undoNomination() {
  if (!confirm('确定撤销本周提名吗？\n将删除本周提名与否决权记录，并回到提名阶段。')) return
  try { await bbUndoNomination(); await fetchData() } catch (e: any) { alert(e?.message || '撤销失败') }
}

async function fetchData() {
  try {
    const data = await bbGetCurrentNomination()
    nomination.value = data as any
    keyCeremony.value = (data as any)?.keyCeremony || null
    twistInfo.value = (data as any)?.twists || null
  } catch {}
  try {
    const hoh = await bbGetCurrentHoh()
    currentHoh.value = hoh as any
  } catch {}
  try {
    const veto = await bbGetCurrentVeto()
    currentVeto.value = veto as any
    savedPlayerId.value = (veto as any)?.usedOnPlayerId || ''
  } catch {}
  try { history.value = await bbGetNominationHistory() } catch {}
  try {
    const config = await bbGetSeasonConfig()
    roundConfigs.value = config.roundConfigs || []
    const tw = roundConfigs.value.find(c => c.round === roundNum.value)?.twists || []
    twistInfo.value = {
      isDirectDemocracy: tw.includes('direct_democracy'),
      isTripleOffering: tw.includes('triple_offering') || tw.includes('save_vote') || tw.includes('tie_recall'),
      isBbbb: tw.includes('bbbb'),
      isSecretKeeper: tw.includes('secret_keeper')
    }
  } catch {}
  try {
    const list = await bbGetActiveHouseguests()
    activeList.value = list
    const map: Record<string, string> = {}
    list.forEach(h => { map[h.id] = h.name; democracyVotes.value[h.id] = '' })
    activeMap.value = map
  } catch {}
}

async function setNomination() {
  const isTriple = needThree.value
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
      voterId, voterName: activeMap.value[voterId] || '',
      targetId, targetName: activeMap.value[targetId] || ''
    }))
  if (votes.length === 0) { alert('请至少为一位房客投票'); return }
  try {
    const result = await bbVoteNominees(votes)
    alert(`直接民主投票完成！提名结果：${result.data.nominees.map((n: any) => n.name).join('、')}`)
    await fetchData()
  } catch (e: any) { alert(e.message) }
}

function getRoundLabel(t: string) { return t ? new Date(t).toLocaleDateString('zh-CN') : '?' }

useBbRefresh(fetchData,
  '/nomination', '/hoh', '/veto', '/houseguests', '/round-twist', '/season/set', '/season/next', '/season/reset', '/season/config', '/season/twists'
)
onMounted(fetchData)
</script>

<style scoped>
.bb-nomination-admin { max-width: 1000px; margin: 0 auto; }
.nomination-card.empty p { text-align: center; color: #6b5f92; }
.bb-select-sm { padding: 6px 10px; background: #1b1130; border: 1px solid #4a3d6e; border-radius: 6px; color: #fff; font-size: 12px; width: 180px; }
.bb-select-sm:focus { border-color: #3498db; outline: none; }
.bb-select-sm option { background: #1b1130; color: #fff; }
.action-buttons { display: flex; gap: 12px; }
.bb-btn { background: transparent; border: 1px solid #b39bff44; color: #b39bff; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
.bb-btn:hover { background: #b39bff22; }
.bb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bb-btn-primary { background: #b39bff22; border-color: #b39bff; }
.bb-btn-danger { border-color: #ff444466; color: #ff4444; }
.bb-btn-danger:hover { background: #ff444422; }
.bb-table { width: 100%; border-collapse: collapse; }
.bb-table th, .bb-table td { padding: 10px 16px; text-align: left; border-bottom: 1px solid #b39bff11; font-size: 14px; color: #cfc4ea; }
.bb-table th { color: #8f83b8; font-size: 12px; text-transform: uppercase; }
.empty-cell { text-align: center; color: #6b5f92; padding: 32px; }
.bb-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.bb-modal { background: #2a1a4a; border: 1px solid #b39bff44; border-radius: 12px; width: 400px; max-width: 90vw; }
.bb-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #b39bff22; }
.bb-modal-header h3 { margin: 0; color: #b39bff; font-size: 16px; }
.close-btn { background: none; border: none; color: #8f83b8; cursor: pointer; font-size: 18px; }
.bb-modal-body { padding: 20px; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 13px; color: #a99bd0; margin-bottom: 6px; }
.bb-select { background: #1b1130; border: 1px solid #b39bff22; color: #ece7fb; padding: 8px 12px; border-radius: 6px; font-size: 14px; outline: none; cursor: pointer; width: 100%; }
.form-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; }
</style>
