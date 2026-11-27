<template>
  <div class="bb-nomination-player">
    <header class="nomination-masthead">
      <div>
        <span class="nomination-round">第 {{ roundNum }} 周</span>
        <h1>提名仪式</h1>
      </div>
      <div class="nomination-badges">
        <span v-if="isHistory">历史记录</span>
        <span v-else-if="isFuture">未开始</span>
        <span v-else>{{ isDirectDemocracy ? '直接民主' : '钥匙仪式' }}</span>
      </div>
    </header>

    <!-- 已有提名结果（钥匙仪式全部揭晓后才显示） -->
    <section v-if="nomination && ceremonyDone" class="nomination-card" aria-label="本轮提名结果">
      <div class="nomination-card-head">
        <h2>本轮提名结果</h2>
        <p class="hoh-info">房主：{{ nomination.hohName }}</p>
      </div>
      <ol class="nominees">
        <li v-for="(id, i) in (nomination.nomineeIds || [])" :key="id" class="nominee-item"
          :class="{ warned: id === authStore.currentUser?.id }">
          <BBAvatar :name="nomination.nomineeNames?.[i] || id" :avatar="avatarById(id)" size="md" />
          <div class="nominee-label">
            <span class="nominee-name">{{ nomination.nomineeNames?.[i] }}</span>
            <span class="nominee-order">被提名人 {{ i + 1 }}</span>
          </div>
          <span v-if="id === authStore.currentUser?.id" class="me-badge">我</span>
        </li>
      </ol>
      <div v-if="nomination.replacementNomineeName" class="replacement">
        替换提名：<strong>{{ nomination.replacementNomineeName }}</strong>
      </div>
      <div v-if="nomination.vetoUsed" class="veto-note">否决权已被使用</div>
    </section>

    <!-- 直接民主模式：所有玩家参与全员投票 -->
    <section v-if="isCurrentRound && isNominationStage && isDirectDemocracy" class="nomination-ballot">
      <header class="nomination-card-head">
        <div>
          <h2>全员投票</h2>
          <p class="nomination-ballot-copy">为每位房客选择投票对象。房主（HOH）的票计两票。</p>
        </div>
        <span v-if="activeList.length" class="nomination-vote-progress" role="status">
          已填写 {{ activeList.filter(h => democracyVotes[h.id]).length }} / {{ activeList.length }} 票
        </span>
      </header>
      <div v-if="activeList.length > 0" class="democracy-vote-section">
        <div class="democracy-grid">
          <div v-for="h in activeList" :key="h.id" class="democracy-row">
            <span class="democracy-voter">
              <BBAvatar :name="h.name" :avatar="h.avatar" size="sm" />
              {{ h.name }}
            </span>
            <select v-model="democracyVotes[h.id]" class="bb-select-sm" :aria-label="'为 ' + h.name + ' 选择投票对象'">
              <option value="">选择投票对象</option>
              <option v-for="n in democracyCandidates" :key="n.id" :value="n.id" :disabled="n.id === h.id">{{ n.name }}</option>
            </select>
          </div>
        </div>
        <div class="nomination-ballot-footer">
          <button class="bb-btn" @click="submitDemocracyVotes" :disabled="submitting">
            {{ submitting ? '提交中...' : '提交我的投票' }}
          </button>
        </div>
      </div>
      <div v-else class="empty-hint">暂无活跃房客可供投票</div>
    </section>

    <!-- 钥匙仪式：所有选手可见；HOH 可设置（先选被提名者，再排安全顺序） -->
    <KeyCeremony
      v-else-if="isCurrentRound && isNominationStage"
      :keyCeremony="keyCeremony"
      :myId="authStore.currentUser?.id || ''"
      :isHoh="isCurrentHoh"
      :eligible="keyEligible"
      :avatars="activeList"
      :nomineeCount="nomineeCount"
      :submitting="submittingKey"
      :drawing="drawingKey"
      :announcing="announcingKey"
      @setup="onKeySetup"
      @draw="onKeyDraw"
      @announce="onKeyAnnounce"
      @speech="onKeySpeech"
    />

    <div v-if="!(nomination && ceremonyDone) && !(isCurrentRound && isNominationStage)" class="empty-card">
      <p>{{ isFuture ? '本周提名阶段尚未开始。' : '本周暂无已公布的提名结果。' }}</p>
    </div>

    <!-- 提交成功提示 -->
    <div v-if="submitSuccess" class="success-toast">提名已提交！</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useBbRefresh } from '../../../composables/useBbRefresh'
import { useRoute } from 'vue-router'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import { useBbSeasonStore } from '../../../stores/bbSeasonStore'
import { useBbRealtimeStore } from '../../../stores/bbRealtimeStore'
import { bbGetNominationHistory, bbGetActiveHouseguests, bbGetHohHistory, bbGetSeasonConfig, bbVoteNominees, bbGetCurrentNomination, bbKeySetup, bbKeyDraw, bbKeyAnnounce, bbKeySpeech } from '../../../services/bbApi'
import KeyCeremony from '../../../components/bigbrother/KeyCeremony.vue'
import BBAvatar from '../../../components/bigbrother/BBAvatar.vue'
import type { BBRoundConfig } from '../../../types/bigbrother'

const route = useRoute()
const authStore = useBbAuthStore()
const seasonStore = useBbSeasonStore()

const roundNum = computed(() => Number(route.params.round) || 1)
const isCurrentRound = computed(() => roundNum.value === seasonStore.currentRoundNumber)
const isHistory = computed(() => seasonStore.isStageCompleted(roundNum.value, 'nomination'))
const isFuture = computed(() => seasonStore.getStageStatus(roundNum.value, 'nomination') === 'future')

const nomination = ref<any>(null)
const currentHoh = ref<any>(null)
const activeList = ref<{ id: string; name: string; avatar: string | null }[]>([])
const activeMap = ref<Record<string, string>>({})
const submitting = ref(false)
const submitSuccess = ref(false)
const roundConfigs = ref<BBRoundConfig[]>([]) // twist 配置
const democracyVotes = ref<Record<string, string>>({})

const isCurrentHoh = computed(() => {
  return currentHoh.value?.winnerId === authStore.currentUser?.id
})

const isNominationStage = computed(() => seasonStore.currentStage === 'nomination')

// 直接民主：检查当前轮次的 twist 配置
const isDirectDemocracy = computed(() => {
  const cfg = roundConfigs.value.find(c => c.round === roundNum.value)
  return cfg?.twists?.includes('direct_democracy') || false
})

// 三重献祭：检查当前轮次的 twist 配置
const isTripleOffering = computed(() => {
  const cfg = roundConfigs.value.find(c => c.round === roundNum.value)
  return cfg?.twists?.some(id => id === 'triple_offering' || id === 'save_vote' || id === 'tie_recall') || false
})

// BBBB：本轮提名 3 人
const isBbbb = computed(() => {
  const cfg = roundConfigs.value.find(c => c.round === roundNum.value)
  return cfg?.twists?.includes('bbbb') || false
})
const needThree = computed(() => isTripleOffering.value || isBbbb.value)

// 钥匙仪式
const keyCeremony = ref<any>(null)
const submittingKey = ref(false)
const drawingKey = ref(false)
const announcingKey = ref(false)
const nomineeCount = computed(() => needThree.value ? 3 : 2)
const keyEligible = computed(() => activeList.value.filter(h => h.id !== authStore.currentUser?.id))
// 提名仪式是否已结束（HOH 结束发言后才公布被提名者）
const nominationLoaded = ref(false)
const ceremonyDone = computed(() => {
  // 数据未加载完成前，绝不展示被提名者（避免慢网速下剧透）
  if (!nominationLoaded.value) return false
  const kc = keyCeremony.value
  if (!kc) return true // 无钥匙仪式（旧流程）时直接展示
  return !!kc.ended
})
async function onKeySetup(payload: { nominees: string[]; order: string[]; openingText?: string; closingReason?: string }) {
  submittingKey.value = true
  try {
    await bbKeySetup(payload.nominees, payload.order, {
      openingText: payload.openingText,
      closingReason: payload.closingReason
    })
    await refreshNomination()
  } catch (e: any) {
    alert(e?.message || '提交失败')
  } finally {
    submittingKey.value = false
  }
}
async function onKeyDraw() {
  drawingKey.value = true
  try {
    await bbKeyDraw()
    await refreshNomination()
  } catch (e: any) {
    alert(e?.message || '抽钥匙失败')
  } finally {
    drawingKey.value = false
  }
}
async function onKeyAnnounce(text: string) {
  announcingKey.value = true
  try {
    await bbKeyAnnounce(text)
    await refreshNomination()
  } catch (e: any) {
    alert(e?.message || '宣布失败')
  } finally {
    announcingKey.value = false
  }
}
async function onKeySpeech(payload: { phase: 'opening' | 'closing'; text?: string; reason?: string; nomineeOrder?: string[] }) {
  try {
    await bbKeySpeech(payload)
    await refreshNomination()
  } catch (e: any) {
    alert(e?.message || '发言失败')
  }
}
async function refreshNomination() {
  try {
    const nom: any = await bbGetCurrentNomination()
    nomination.value = nom
    keyCeremony.value = nom?.keyCeremony || null
  } catch {}
  // 状态确认完成（含失败也标记，避免一直空白）；仅在成功后才允许展示
  nominationLoaded.value = true
}

// 提名仪式逐句环节：只增量更新仪式状态，不整页重载
const realtime = useBbRealtimeStore()
watch(() => realtime.lastKeyCeremony, (payload) => {
  if (!payload) return
  if (payload.roundId && payload.roundId !== `round-${roundNum.value}`) return
  if (payload.keyCeremony) keyCeremony.value = payload.keyCeremony
  if (Array.isArray(payload.nomineeIds)) {
    nomination.value = {
      ...(nomination.value || {}),
      nomineeIds: payload.nomineeIds,
      nomineeNames: payload.nomineeNames || []
    }
  }
})

// 直接民主投票候选人（所有活跃玩家）
const democracyCandidates = computed(() => activeList.value)

function isMe(name: string): boolean {
  return name === authStore.currentUser?.name
}

function avatarById(id: string): string | null {
  const h = activeList.value.find(x => x.id === id)
  return h?.avatar || null
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
  submitting.value = true
  try {
    const result = await bbVoteNominees(votes)
    submitSuccess.value = true
    setTimeout(() => submitSuccess.value = false, 2000)
    try {
      const history = await bbGetNominationHistory()
      const roundKey = `round-${roundNum.value}`
      nomination.value = history.find(h => h.roundId === roundKey) || null
    } catch {}
  } catch (e: any) {
    alert(e.message || '投票失败')
  } finally {
    submitting.value = false
  }
}

async function loadData() {
  const roundKey = `round-${roundNum.value}`
  try {
    const hohHistory = await bbGetHohHistory()
    currentHoh.value = hohHistory.find(h => h.roundId === roundKey) || null
  } catch {}
  try {
    const config = await bbGetSeasonConfig()
    roundConfigs.value = config.roundConfigs || []
  } catch {}
  if (isCurrentRound.value) {
    try {
      const list = await bbGetActiveHouseguests()
      activeList.value = list
      const map: Record<string, string> = {}
      list.forEach(h => { map[h.id] = h.name; democracyVotes.value[h.id] ??= '' })
      activeMap.value = map
    } catch {}
    await refreshNomination()
  } else {
    try {
      const history = await bbGetNominationHistory()
      nomination.value = history.find(h => h.roundId === roundKey) || null
      keyCeremony.value = nomination.value?.keyCeremony || null
    } catch {}
  }
}

useBbRefresh(loadData,
  '/hoh', '/nomination/set', '/nomination/undo', '/nomination/replace', '/nomination/vote-nominees',
  '/nomination/bbbb-winner', '/veto/use', '/round-twist', '/houseguests',
  '/season/set', '/season/next', '/season/reset', '/season/config', '/season/twists'
)
onMounted(loadData)
</script>

<style scoped>
.bb-nomination-player { max-width: 1000px; margin: 0 auto; }


.bb-btn { width: 100%; padding: 12px; background: linear-gradient(135deg, #e6c988, #ff8800); border: none; border-radius: 8px; color: #000; font-size: 16px; font-weight: 600; cursor: pointer; }
.bb-btn:disabled { opacity: 0.5; cursor: not-allowed; }


.success-toast { position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); background: #b39bff; color: #000; padding: 12px 24px; border-radius: 8px; font-weight: 600; }

/* 直接民主样式 */
.bb-select-sm { padding: 6px 10px; background: #1b1130; border: 1px solid #4a3d6e; border-radius: 6px; color: #fff; font-size: 12px; width: 180px; }
.bb-select-sm:focus { border-color: #3498db; outline: none; }
.bb-select-sm option { background: #1b1130; color: #fff; }
</style>
