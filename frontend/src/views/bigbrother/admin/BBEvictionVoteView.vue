<template>
  <div class="bb-eviction-admin">
    <div class="page-header">
      <h1>淘汰投票</h1>
      <span class="round-tag">第{{ $route.params.round }}周</span>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">{{ voteData.total }}</div>
        <div class="stat-label">已投票数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ activeCount }}</div>
        <div class="stat-label">可投票房客</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ voteData.total > 0 && activeCount > 0 ? Math.round(voteData.total / activeCount * 100) : 0 }}%</div>
        <div class="stat-label">投票率</div>
      </div>
    </div>

    <!-- 拉票环节 -->
    <div v-if="nomination" class="campaign-section">
      <div class="campaign-header">
        <h3>📣 拉票环节</h3>
        <span class="campaign-status" :class="campaignData.voteStarted ? 'open' : 'pending'">
          {{ campaignData.voteStarted ? '投票已开始' : '等待开始投票' }}
        </span>
      </div>
      <div class="campaign-grid">
        <div v-for="n in campaignNominees" :key="n.id" class="campaign-card">
          <div class="campaign-name-row">
            <BBAvatar :name="n.name" :avatar="null" size="sm" />
            <span class="campaign-name">{{ n.name }}</span>
            <span v-if="campaignOf(n.id)" class="campaign-submitted-tag">已提交</span>
            <span v-else class="campaign-pending-tag">未提交</span>
          </div>
          <div v-if="campaignOf(n.id)" class="campaign-content">{{ campaignOf(n.id).content }}</div>
          <div v-else class="campaign-empty">尚未提交拉票内容</div>
          <div v-if="campaignOf(n.id)" class="campaign-time">
            提交于 {{ formatTime(campaignOf(n.id).submittedAt) }}
          </div>
        </div>
      </div>
      <div class="campaign-actions">
        <span class="campaign-progress">已提交 {{ submittedCampaignCount }} / {{ campaignNominees.length }}</span>
        <button v-if="!campaignData.voteStarted" class="bb-btn bb-btn-gold" @click="startVoting">
          ▶️ 开始投票
        </button>
        <span v-else class="campaign-open-hint">拉票内容已展示给所有选手，投票已开放</span>
      </div>
    </div>

    <!-- 实时票数汇总 -->
    <div v-if="nomineeOptions.length > 0" class="tally-section">
      <div class="tally-header">
        <h3>📊 实时票数</h3>
        <span class="tally-hint">{{ voteData.total }} 票已投出</span>
      </div>
      <div class="tally-grid">
        <div v-for="n in nomineeTally" :key="n.id" class="tally-card" :class="{ leading: n.isLeading && n.votes > 0 }">
          <div class="tally-rank">{{ n.rank }}</div>
          <div class="tally-avatar">
            <BBAvatar :name="n.name" :avatar="null" size="md" />
          </div>
          <div class="tally-info">
            <div class="tally-name">{{ n.name }}</div>
            <div class="tally-votes-text">{{ n.votes }} 票</div>
          </div>
          <div class="tally-bar-wrap">
            <div class="tally-bar" :style="{ width: n.pct + '%' }"></div>
          </div>
          <div class="tally-count">{{ n.votes }}</div>
        </div>
      </div>
      <div v-if="voteData.votes?.length === 0" class="tally-empty">暂无投票</div>
    </div>

    <!-- 投票管理 -->
    <div v-if="activeHouseguests.length > 0 && nomination" class="vote-manage-section">
      <h3>🗳️ 为房客投票</h3>
      <div v-if="!campaignData.voteStarted" class="vote-locked-hint">
        投票尚未开始，请先在上方点击「开始投票」。开始后被提名人提交的拉票内容会展示给所有选手。
      </div>
      <div class="vote-grid">
        <div v-for="h in activeHouseguests" :key="h.id" class="vote-row"
          :class="{ voted: getVote(h.id), isHoh: h.id === currentHohId, isNominee: isNominee(h.id) }">
          <div class="voter-info">
            <span class="voter-name">{{ h.name }}</span>
            <span v-if="h.id === currentHohId" class="hoh-tag">HOH（仅平票可投）</span>
            <span v-if="isNominee(h.id)" class="nominee-tag">被提名</span>
          </div>
          <div class="voter-vote">
            <span v-if="getVote(h.id)" class="voted-target">→ {{ getVote(h.id) }}</span>
            <span v-else-if="isNominee(h.id)" class="not-voted">被提名（不可投票）</span>
            <span v-else class="not-voted">未投票</span>
          </div>
          <div class="voter-action">
            <select v-model="voteSelections[h.id]" class="bb-select-sm"
              :disabled="isNominee(h.id) || !campaignData.voteStarted"
              @change="castVoteFor(h.id, h.name, voteSelections[h.id])">
              <option value="">{{ isNominee(h.id) ? '被提名者不可投票' : '选择投票对象' }}</option>
              <option v-for="n in nomineeOptions" :key="n.id" :value="n.id"
                :disabled="h.id === n.id">
                {{ n.name }}
              </option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <div v-if="twistInfo?.isTripleEviction" class="twist-action-hint">
      🔱 三重献祭生效中：宣布结果后将淘汰得票最高的 2 名被提名人
    </div>

    <div v-if="voteData.votes?.length > 0" class="votes-section">
      <h3>投票明细</h3>
      <div class="table-container">
        <table class="bb-table">
          <thead><tr><th>投票者</th><th>投票对象</th><th>时间</th></tr></thead>
          <tbody>
            <tr v-for="v in voteData.votes" :key="v.id">
              <td>{{ v.voterName }}</td>
              <td class="highlight">{{ v.targetName }}</td>
              <td class="time">{{ formatTime(v.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useBbRefresh } from '../../../composables/useBbRefresh'
import { bbGetVotes, bbCastVote, bbGetActiveHouseguests, bbGetCurrentNomination, bbGetCurrentHoh, bbGetHouseguestStats, bbGetEvictionCampaign, bbStartEvictionVote } from '../../../services/bbApi'
import BBAvatar from '../../../components/bigbrother/BBAvatar.vue'

const voteData = ref<{ votes: any[]; total: number }>({ votes: [], total: 0 })
const twistInfo = ref<any>(null)
const activeCount = ref(0)
const activeHouseguests = ref<{ id: string; name: string }[]>([])
const nomination = ref<any>(null)
const currentHoh = ref<any>(null)
const voteSelections = ref<Record<string, string>>({})
const campaignData = ref<{ voteStarted: boolean; campaigns: any[] }>({ voteStarted: false, campaigns: [] })

const currentHohId = computed(() => currentHoh.value?.winnerId || '')

const campaignNominees = computed(() => {
  if (!nomination.value) return []
  const ids = [...(nomination.value.nomineeIds || [])]
  const names = [...(nomination.value.nomineeNames || [])]
  if (nomination.value.replacementNomineeId) {
    ids.push(nomination.value.replacementNomineeId)
    names.push(nomination.value.replacementNomineeName || '')
  }
  const seen = new Set<string>()
  return ids
    .map((id: string, i: number) => ({ id, name: names[i] || '' }))
    .filter((n: any) => {
      if (!n.id || seen.has(n.id)) return false
      seen.add(n.id)
      return true
    })
})

function campaignOf(playerId: string) {
  return campaignData.value.campaigns.find((c: any) => c.playerId === playerId) || null
}

const submittedCampaignCount = computed(() => {
  return campaignNominees.value.filter((n: any) => !!campaignOf(n.id)).length
})

const nomineeOptions = computed(() => {
  const ids = nomination.value?.nomineeIds || []
  const names = nomination.value?.nomineeNames || []
  return ids.map((id: string, i: number) => ({ id, name: names[i] || '' }))
})

const nomineeIdSet = computed(() => new Set(nomination.value?.nomineeIds || []))

const nomineeTally = computed(() => {
  const votes = voteData.value.votes || []
  const counts: Record<string, number> = {}
  for (const v of votes) {
    if (!counts[v.targetId]) counts[v.targetId] = 0
    counts[v.targetId]++
  }
  const list = nomineeOptions.value.map((n: any) => ({
    id: n.id,
    name: n.name,
    votes: counts[n.id] || 0,
    pct: 0,
    rank: 0,
    isLeading: false,
  }))
  list.sort((a, b) => b.votes - a.votes)
  const maxVotes = list.length > 0 ? list[0].votes : 0
  for (let i = 0; i < list.length; i++) {
    list[i].rank = i + 1
    list[i].pct = maxVotes > 0 ? Math.round(list[i].votes / maxVotes * 100) : 0
    list[i].isLeading = list[i].votes === maxVotes && maxVotes > 0
  }
  return list
})

function isNominee(hid: string): boolean {
  return nomineeIdSet.value.has(hid)
}

function getVote(voterId: string): string {
  const v = voteData.value.votes?.find((v: any) => v.voterId === voterId)
  return v ? v.targetName : ''
}

async function castVoteFor(voterId: string, voterName: string, targetId: string) {
  if (!targetId) return
  if (!campaignData.value.voteStarted) {
    alert('投票尚未开始，请先点击「开始投票」')
    voteSelections.value[voterId] = ''
    return
  }
  try {
    const target = nomineeOptions.value.find((n: any) => n.id === targetId)
    await bbCastVote(targetId, target?.name || '', voterId, voterName)
    try { voteData.value = await bbGetVotes() } catch {}
    voteSelections.value[voterId] = ''
  } catch (e: any) {
    alert(e?.message || '投票失败')
    voteSelections.value[voterId] = ''
  }
}

async function startVoting() {
  if (campaignData.value.voteStarted) return
  const missing = campaignNominees.value.filter((n: any) => !campaignOf(n.id))
  const msg = missing.length
    ? `还有 ${missing.length} 位被提名人未提交拉票内容（${missing.map((n: any) => n.name).join('、')}），确定现在开始投票吗？`
    : '确定开始投票吗？开始后拉票内容将展示给所有选手，并开放投票。'
  if (!confirm(msg)) return
  try {
    const result = await bbStartEvictionVote()
    campaignData.value = {
      voteStarted: true,
      campaigns: result?.campaigns || campaignData.value.campaigns
    }
    try { nomination.value = await bbGetCurrentNomination() } catch {}
    alert('投票已开始！')
  } catch (e: any) {
    alert(e?.message || '开始投票失败')
  }
}

async function fetchData() {
  try { voteData.value = await bbGetVotes() } catch {}
  try { const stats = await bbGetHouseguestStats(); activeCount.value = stats.active } catch {}
  try { activeHouseguests.value = await bbGetActiveHouseguests() } catch {}
  try { nomination.value = await bbGetCurrentNomination() } catch {}
  try { currentHoh.value = await bbGetCurrentHoh() } catch {}
  try {
    const campaign = await bbGetEvictionCampaign()
    campaignData.value = {
      voteStarted: !!campaign.voteStarted,
      campaigns: campaign.campaigns || []
    }
  } catch {}
  for (const h of activeHouseguests.value) {
    voteSelections.value[h.id] = ''
  }
}

function formatTime(t: string) { return t ? new Date(t).toLocaleString('zh-CN') : '' }

useBbRefresh(fetchData)
onMounted(fetchData)
</script>

<style scoped>
.bb-eviction-admin { max-width: 1000px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #ece7fb; margin: 0; }
.round-tag { background: #b39bff22; color: #b39bff; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #b39bff44; }
.stats-row { display: flex; gap: 16px; margin-bottom: 20px; }
.stat-card { flex: 1; background: #1b1130; border: 1px solid #b39bff22; border-radius: 10px; padding: 16px; text-align: center; }
.stat-value { font-size: 28px; font-weight: 700; color: #fff; }
.stat-label { font-size: 12px; color: #8f83b8; margin-top: 4px; }
.vote-manage-section { background: #1b1130; border: 1px solid #e6c98822; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
.vote-manage-section h3 { margin: 0 0 16px; font-size: 16px; color: #ece7fb; }
.vote-grid { display: flex; flex-direction: column; gap: 8px; }
.vote-row { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #2a1a4a; border-radius: 8px; border: 1px solid #b39bff11; }
.vote-row.voted { border-color: #b39bff44; }
.vote-row.isHoh { border-color: #e6c98844; background: #2e2a0f; }
.vote-row.isNominee { border-color: #ff444466; background: #2a0f0f; }
.voter-info { flex: 1; min-width: 0; }
.voter-name { font-size: 14px; color: #fff; font-weight: 500; }
.hoh-tag { display: inline-block; margin-left: 8px; font-size: 10px; color: #e6c988; background: #e6c98822; padding: 1px 8px; border-radius: 6px; }
.nominee-tag { display: inline-block; margin-left: 8px; font-size: 10px; color: #ff4444; background: #ff444422; padding: 1px 8px; border-radius: 6px; }
.voter-vote { width: 120px; text-align: center; }
.voted-target { color: #b39bff; font-size: 13px; }
.not-voted { color: #6b5f92; font-size: 12px; }
.voter-action { width: 160px; }
.bb-select-sm { width: 100%; padding: 6px 8px; background: #1b1130; border: 1px solid #4a3d6e; border-radius: 6px; color: #fff; font-size: 12px; }
.bb-select-sm:disabled { opacity: 0.4; cursor: not-allowed; background: #1a0f0f; }
.bb-select-sm:focus { border-color: #e6c988; outline: none; }
.bb-select-sm option { background: #1b1130; color: #fff; }
.twist-action-hint { padding: 10px 14px; background: #e74c3c11; border: 1px solid #e74c3c33; border-radius: 8px; font-size: 13px; color: #e74c3c; margin-bottom: 12px; }
.votes-section h3 { font-size: 16px; color: #ece7fb; margin: 0 0 12px; }
.bb-table { width: 100%; border-collapse: collapse; }
.bb-table th, .bb-table td { padding: 10px 16px; text-align: left; border-bottom: 1px solid #b39bff11; font-size: 14px; color: #cfc4ea; }
.bb-table th { color: #8f83b8; font-size: 12px; text-transform: uppercase; }
.highlight { color: #e6c988; font-weight: 500; }
.time { font-size: 12px; color: #6b5f92; }
.tally-section { background: #1b1130; border: 1px solid #e6c98833; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
.tally-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.tally-header h3 { margin: 0; font-size: 16px; color: #ece7fb; }
.tally-hint { font-size: 12px; color: #8f83b8; }
.tally-grid { display: flex; flex-direction: column; gap: 10px; }
.tally-card { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: #2a1a4a; border: 1px solid #ffffff10; border-radius: 8px; transition: all 0.3s ease; }
.tally-card.leading { border-color: #ff444488; background: linear-gradient(90deg, #2a0f0f00, #ff444410); }
.tally-rank { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 12px; font-weight: 700; color: #8f83b8; background: #ffffff08; flex-shrink: 0; }
.tally-card:nth-child(1) .tally-rank { background: #ff444433; color: #ff6b6b; }
.tally-card:nth-child(2) .tally-rank { background: #e6c98833; color: #e6c988; }
.tally-card:nth-child(3) .tally-rank { background: #b39bff33; color: #b39bff; }
.tally-avatar { flex-shrink: 0; }
.tally-info { min-width: 80px; }
.tally-name { font-size: 14px; font-weight: 600; color: #ece7fb; }
.tally-votes-text { font-size: 12px; color: #8f83b8; margin-top: 2px; }
.tally-bar-wrap { flex: 1; height: 6px; background: #ffffff08; border-radius: 3px; overflow: hidden; }
.tally-bar { height: 100%; background: linear-gradient(90deg, #ff4444, #ff6b6b); border-radius: 3px; transition: width 0.5s ease; }
.tally-card.leading .tally-bar { background: linear-gradient(90deg, #ff4444, #ff2222); }
.tally-count { font-size: 20px; font-weight: 700; color: #ff6b6b; min-width: 32px; text-align: right; flex-shrink: 0; }
.tally-card.leading .tally-count { color: #ff4444; text-shadow: 0 0 10px #ff444444; }
.tally-empty { text-align: center; color: #5c5182; font-size: 13px; padding: 16px; }
.campaign-section { background: #1b1130; border: 1px solid #e6c98833; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
.campaign-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.campaign-header h3 { margin: 0; font-size: 16px; color: #ece7fb; }
.campaign-status { font-size: 12px; padding: 2px 10px; border-radius: 10px; border: 1px solid; }
.campaign-status.pending { color: #e6c988; background: #e6c98818; border-color: #e6c98844; }
.campaign-status.open { color: #4ade80; background: #4ade8018; border-color: #4ade8044; }
.campaign-grid { display: flex; flex-direction: column; gap: 10px; }
.campaign-card { background: #2a1a4a; border: 1px solid #ffffff10; border-radius: 8px; padding: 14px 16px; }
.campaign-name-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.campaign-name { font-size: 14px; font-weight: 600; color: #ece7fb; }
.campaign-submitted-tag { font-size: 10px; color: #4ade80; background: #4ade8018; padding: 1px 8px; border-radius: 6px; }
.campaign-pending-tag { font-size: 10px; color: #8f83b8; background: #ffffff08; padding: 1px 8px; border-radius: 6px; }
.campaign-content { font-size: 14px; color: #cfc4ea; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
.campaign-empty { font-size: 13px; color: #6b5f92; }
.campaign-time { margin-top: 8px; font-size: 11px; color: #6b5f92; }
.campaign-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 16px; }
.campaign-progress { font-size: 12px; color: #8f83b8; }
.campaign-open-hint { font-size: 12px; color: #4ade80; }
.vote-locked-hint { padding: 10px 14px; background: #e6c98811; border: 1px solid #e6c98833; border-radius: 8px; font-size: 13px; color: #e6c988; margin-bottom: 12px; }
.bb-btn-gold { border-color: #e6c988; color: #e6c988; }
.bb-btn-gold:hover { background: #e6c98822; }
</style>
