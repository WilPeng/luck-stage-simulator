<template>
  <div class="bb-nomination-player">
    <div class="page-header">
      <h1>提名</h1>
      <span class="round-tag">第{{ roundNum }}周</span>
      <span v-if="isHistory" class="history-tag">历史记录</span>
      <span v-else-if="isFuture" class="future-tag">未开始</span>
    </div>

    <!-- 直接民主模式：所有玩家参与全员投票 -->
    <div v-if="isCurrentRound && isNominationStage && isDirectDemocracy" class="nomination-action democracy-action">
      <div class="democracy-banner">🗳️ 本周为"直接民主"模式，提名由全员投票决定！请在下方为每位房客选择投票对象（HOH票数双倍）。</div>
      <div v-if="activeList.length > 0" class="democracy-vote-section">
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
        <button class="bb-btn" @click="submitDemocracyVotes" :disabled="submitting" style="margin-top: 12px;">
          {{ submitting ? '提交中...' : '提交我的投票' }}
        </button>
      </div>
      <div v-else class="empty-hint">暂无活跃房客可供投票</div>
    </div>

    <!-- 钥匙仪式：所有选手可见；HOH 可设置（先选被提名者，再排安全顺序） -->
    <KeyCeremony
      v-else-if="isCurrentRound && isNominationStage"
      :keyCeremony="keyCeremony"
      :myId="authStore.currentUser?.id || ''"
      :isHoh="isCurrentHoh"
      :eligible="keyEligible"
      :nomineeCount="nomineeCount"
      :submitting="submittingKey"
      :drawing="drawingKey"
      :announcing="announcingKey"
      @setup="onKeySetup"
      @draw="onKeyDraw"
      @announce="onKeyAnnounce"
      @speech="onKeySpeech"
    />

    <!-- 已有提名结果（钥匙仪式全部揭晓后才显示） -->
    <div v-if="nomination && ceremonyDone" class="nomination-card">
      <div class="hoh-info">HOH: {{ nomination.hohName }}</div>
      <div class="nominees">
        <div v-for="(name, i) in (nomination.nomineeNames || [])" :key="i" class="nominee-item"
          :class="{ warned: isMe(name) }">
          <span class="nominee-icon">📋</span>
          <span class="nominee-name">{{ name }}</span>
          <span v-if="isMe(name)" class="me-badge">我</span>
          <span class="nominee-order">被提名人 {{ i + 1 }}</span>
        </div>
      </div>
      <div v-if="nomination.replacementNomineeName" class="replacement">
        替换提名: <strong>{{ nomination.replacementNomineeName }}</strong>
      </div>
      <div v-if="nomination.vetoUsed" class="veto-note">否决权已被使用</div>
    </div>
    <div v-else class="empty-card">
      <p>本周暂无提名信息</p>
    </div>

    <!-- 提交成功提示 -->
    <div v-if="submitSuccess" class="success-toast">提名已提交！</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import { useBbSeasonStore } from '../../../stores/bbSeasonStore'
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
  return cfg?.twists?.includes('triple_offering') || false
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
const ceremonyDone = computed(() => {
  const kc = keyCeremony.value
  if (!kc) return true
  return !!kc.ended
})
async function onKeySetup(payload: { nominees: string[]; order: string[] }) {
  submittingKey.value = true
  try {
    await bbKeySetup(payload.nominees, payload.order)
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
    if (nom) {
      nomination.value = nom
      keyCeremony.value = nom.keyCeremony || null
    }
  } catch {}
}

// 直接民主投票候选人（所有活跃玩家）
const democracyCandidates = computed(() => activeList.value)

function isMe(name: string): boolean {
  return name === authStore.currentUser?.name
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

onMounted(async () => {
  try {
    const hohHistory = await bbGetHohHistory()
    const roundKey = `round-${roundNum.value}`
    currentHoh.value = hohHistory.find(h => h.roundId === roundKey) || null
  } catch {}
  try {
    const config = await bbGetSeasonConfig()
    roundConfigs.value = config.roundConfigs || []
  } catch {}
  try {
    const history = await bbGetNominationHistory()
    const roundKey = `round-${roundNum.value}`
    nomination.value = history.find(h => h.roundId === roundKey || h.roundId === `round-${roundNum.value}`) || null
  } catch {}
  if (isCurrentRound.value) {
    try {
      const list = await bbGetActiveHouseguests()
      activeList.value = list
      const map: Record<string, string> = {}
      list.forEach(h => { map[h.id] = h.name; democracyVotes.value[h.id] = '' })
      activeMap.value = map
    } catch {}
    await refreshNomination()
  }
})
</script>

<style scoped>
.bb-nomination-player { max-width: 600px; margin: 0 auto; padding: 16px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #00ff8844; }
.history-tag { background: #88888822; color: #aaa; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #88888844; }
.future-tag { background: #44444422; color: #666; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #44444444; }

.hoh-banner { background: linear-gradient(135deg, #ffaa0022, #ff880022); border: 1px solid #ffaa00; border-radius: 8px; padding: 12px; text-align: center; font-size: 15px; color: #ffaa00; margin-bottom: 20px; }

.nomination-form { background: linear-gradient(135deg, #0f0f2e, #1a1a3e); border: 1px solid #444; border-radius: 12px; padding: 20px; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 14px; color: #aaa; margin-bottom: 6px; }
.bb-select { width: 100%; padding: 10px; background: #1a1a3e; border: 1px solid #444; border-radius: 8px; color: #fff; font-size: 14px; }
.bb-select:focus { border-color: #ffaa00; outline: none; }
.bb-select option { background: #1a1a3e; color: #fff; }
.bb-btn { width: 100%; padding: 12px; background: linear-gradient(135deg, #ffaa00, #ff8800); border: none; border-radius: 8px; color: #000; font-size: 16px; font-weight: 600; cursor: pointer; }
.bb-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.nomination-card { background: linear-gradient(135deg, #0f0f2e, #1a1a3e); border: 1px solid #ffaa00; border-radius: 12px; padding: 24px; margin-top: 20px; }
.hoh-info { font-size: 14px; color: #aaa; margin-bottom: 16px; }
.nominees { display: flex; gap: 16px; }
.nominee-item { flex: 1; background: #ffaa0008; border: 1px solid #ffaa0022; border-radius: 8px; padding: 16px; text-align: center; position: relative; }
.nominee-item.warned { border-color: #ff4444; background: #ff444408; }
.nominee-icon { display: block; font-size: 24px; margin-bottom: 8px; }
.nominee-name { display: block; font-size: 18px; font-weight: 600; color: #fff; }
.me-badge { position: absolute; top: 8px; right: 8px; background: #ff4444; color: #fff; padding: 1px 8px; border-radius: 8px; font-size: 10px; }
.nominee-order { display: block; font-size: 12px; color: #888; margin-top: 4px; }
.replacement { margin-top: 16px; padding: 12px; background: #ffaa0008; border-radius: 8px; font-size: 14px; color: #ffaa00; }
.veto-note { margin-top: 12px; color: #00ff88; font-size: 13px; }
.empty-card { background: #0f0f2e; border: 1px solid #444; border-radius: 12px; padding: 40px; text-align: center; margin-top: 20px; }
.empty-card p { color: #666; }

.success-toast { position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); background: #00ff88; color: #000; padding: 12px 24px; border-radius: 8px; font-weight: 600; }

/* 直接民主样式 */
.democracy-action { margin-bottom: 20px; }
.democracy-banner { background: linear-gradient(135deg, #3498db22, #2980b922); border: 1px solid #3498db; border-radius: 8px; padding: 12px; text-align: center; font-size: 14px; color: #3498db; margin-bottom: 16px; line-height: 1.6; }
.democracy-vote-section { background: linear-gradient(135deg, #0f0f2e, #1a1a3e); border: 1px solid #3498db44; border-radius: 12px; padding: 20px; }
.democracy-grid { display: flex; flex-direction: column; gap: 8px; }
.democracy-row { display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: #1a1a3e; border-radius: 6px; }
.democracy-voter { flex: 1; font-size: 14px; color: #ccc; }
.bb-select-sm { padding: 6px 10px; background: #0f0f2e; border: 1px solid #444; border-radius: 6px; color: #fff; font-size: 12px; width: 180px; }
.bb-select-sm:focus { border-color: #3498db; outline: none; }
.bb-select-sm option { background: #0f0f2e; color: #fff; }
.empty-hint { text-align: center; color: #666; font-size: 14px; padding: 20px; }
.key-ceremony-panel, .key-setup-panel { background: #0f0f2e; border: 1px solid #ffaa0044; border-radius: 10px; padding: 14px; margin-bottom: 16px; }
.kc-title { font-size: 14px; color: #ffaa00; margin-bottom: 10px; }
.kc-keys { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.kc-key { padding: 8px 14px; border-radius: 8px; background: #ffffff08; border: 1px solid #ffffff18; color: #666; font-size: 13px; }
.kc-key.drawn { background: #00ff8822; border-color: #00ff88; color: #00ff88; font-weight: 600; }
.kc-nominees { font-size: 14px; color: #ff6666; }
.kc-eligible { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.kc-pick { padding: 8px 14px; border: 1px solid #ffffff22; background: #ffffff08; color: #ccc; border-radius: 8px; cursor: pointer; font-size: 13px; }
.kc-pick.chosen { background: #ffaa0022; border-color: #ffaa00; color: #ffaa00; }
.kc-order-line { font-size: 13px; color: #8a8aa5; margin-bottom: 12px; }
</style>
