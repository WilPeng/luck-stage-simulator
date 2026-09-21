<template>
  <div class="bb-eviction-admin">
    <div class="page-header">
      <h1>淘汰结果</h1>
      <span class="round-tag">第{{ $route.params.round }}周</span>
    </div>

    <div v-if="lastEviction" class="eviction-result-card">
      <div class="result-icon">🚪</div>
      <div class="result-info">
        <div class="result-label">最新淘汰结果</div>
        <div class="result-name">{{ lastEviction.evictedName }}</div>
        <div class="result-votes">{{ lastEviction.voteCount }}{{ lastEviction.otherVotes != null ? '-' + lastEviction.otherVotes : '' }}</div>
      </div>
    </div>

    <div v-if="twistInfo && (twistInfo.isTripleEviction || twistInfo.isKarmicPawnship)" class="twist-info-bar">
      <span v-if="twistInfo.isTripleEviction" class="twist-item triple">🔱 三重献祭：本轮将淘汰得票最高的 2 人</span>
      <span v-if="twistInfo.isKarmicPawnship" class="twist-item karmic">⚖️ 因果报应：被提名但未被淘汰的幸存者将自动成为下轮 HOH</span>
    </div>

    <div class="action-section">
      <h3>操作 - 淘汰夜</h3>
      <div class="action-buttons">
        <template v-if="!night">
          <div class="mode-select">
            <span class="ms-label">宣布句数：</span>
            <label><input type="radio" :value="3" v-model.number="sentenceMode" /> 3 句（直接宣布淘汰者）</label>
            <label><input type="radio" :value="5" v-model.number="sentenceMode" /> 5 句（先宣布安全者，再宣布淘汰者）</label>
          </div>
          <button class="bb-btn bb-btn-danger" @click="startNight" :disabled="(voteData.votes?.length || 0) === 0 || starting">
            🌙 {{ starting ? '处理中...' : '开始淘汰夜（锁票）' }}
          </button>
        </template>
        <template v-else-if="night.phase === 'announce'">
          <button class="bb-btn bb-btn-primary" @click="nextSentence" :disabled="nexting || (night.released || 0) >= (night.segments || []).length">
            📢 下一句（{{ night.released || 0 }}/{{ (night.segments || []).length }}）
          </button>
          <button class="bb-btn bb-btn-primary" @click="confirmNight" :disabled="confirming">
            ✅ {{ confirming ? '处理中...' : '确定（开门）' }}
          </button>
        </template>
        <button v-else class="bb-btn" disabled>🚪 已开门</button>
        <button v-if="night" class="bb-btn" @click="resetNight">清除淘汰夜</button>
      </div>

      <div v-if="night" class="night-preview">
        <div class="night-phase">{{ night.phase === 'announce' ? '📢 淘汰结果宣布' : '🚪 开门结果' }}</div>
        <template v-if="night.phase === 'announce'">
          <div v-for="(s, i) in (night.segments || [])" :key="i" class="night-line"
            :class="{ dim: (night.released || 0) <= i, result: s.type === 'result', evicted: s.type === 'evicted' }">
            {{ s.text }}
          </div>
        </template>
        <template v-else>
          <div v-for="e in night.evicted" :key="e.id" class="night-line door">🚪 {{ e.name }} · {{ night.big }}-{{ night.small }}</div>
        </template>
      </div>
      <div v-if="night && night.phase === 'announce' && nominees.length" class="nominee-preview">
        <div class="np-title">本轮被提名者</div>
        <div class="np-list">
          <span v-for="n in nominees" :key="n.id" class="np-chip">{{ n.name }}</span>
        </div>
      </div>
      <p v-if="!night" class="hint">开始淘汰夜后将锁定投票，并向选手端展示「📢 淘汰结果宣布」框架；再点「确定」显示开门结果。</p>
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

    <div class="history-section">
      <h3>淘汰历史</h3>
      <div class="table-container">
        <table class="bb-table">
          <thead><tr><th>轮次</th><th>被淘汰者</th><th>得票</th><th>时间</th></tr></thead>
          <tbody>
            <tr v-for="e in evictionHistory" :key="e.id">
              <td>{{ formatTime(e.createdAt) }}</td>
              <td class="highlight">{{ e.evictedName }}</td>
              <td>{{ e.voteCount }}{{ e.otherVotes != null ? '-' + e.otherVotes : '' }}</td>
              <td class="time">{{ formatTime(e.updatedAt) }}</td>
            </tr>
            <tr v-if="evictionHistory.length === 0"><td colspan="4" class="empty-cell">暂无淘汰记录</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useBbRefresh } from '../../../composables/useBbRefresh'
import { useBbRealtimeStore } from '../../../stores/bbRealtimeStore'
import {
  bbGetVotes, bbGetEvictionHistory, bbGetEvictionNight, bbGetCurrentNomination,
  bbStartEvictionNight, bbConfirmEvictionNight, bbNextEvictionNight, bbResetEvictionNight
} from '../../../services/bbApi'
import type { BBEviction } from '../../../types/bigbrother'

const realtime = useBbRealtimeStore()

const voteData = ref<{ votes: any[]; totalVotes?: number }>({ votes: [], totalVotes: 0 })
const lastEviction = ref<BBEviction | null>(null)
const evictionHistory = ref<BBEviction[]>([])
const twistInfo = ref<any>(null)

const night = ref<any>(null)
const starting = ref(false)
const confirming = ref(false)
const nexting = ref(false)
const sentenceMode = ref<3 | 5>(3)
const nominees = ref<{ id: string; name: string }[]>([])

async function fetchData() {
  try { voteData.value = await bbGetVotes() } catch {}
  try { evictionHistory.value = await bbGetEvictionHistory() } catch {}
  lastEviction.value = evictionHistory.value[0] || null
  try { const r = await bbGetEvictionNight(); night.value = r.night } catch {}
  try {
    const nom: any = await bbGetCurrentNomination()
    nominees.value = (nom?.nomineeIds || []).map((id: string, i: number) => ({ id, name: nom.nomineeNames?.[i] || id }))
  } catch {}
}

async function startNight() {
  if (starting.value) return
  if (!confirm('确定开始淘汰夜？将锁定投票并显示淘汰结果宣布框架。')) return
  starting.value = true
  try {
    night.value = await bbStartEvictionNight(sentenceMode.value)
    await fetchData()
  } catch (e: any) { alert(e?.message || '开始失败') } finally { starting.value = false }
}

async function confirmNight() {
  if (confirming.value) return
  confirming.value = true
  try { night.value = await bbConfirmEvictionNight() } catch (e: any) { alert(e?.message || '确认失败') } finally { confirming.value = false }
}

async function nextSentence() {
  if (nexting.value) return
  nexting.value = true
  try { night.value = await bbNextEvictionNight() } catch (e: any) { alert(e?.message || '揭晓失败') } finally { nexting.value = false }
}

async function resetNight() {
  try { await bbResetEvictionNight(); night.value = null } catch (e: any) { alert(e?.message || '清除失败') }
}

watch(() => realtime.lastEvictionNight, (v) => { night.value = v })

function formatTime(t: string) { return t ? new Date(t).toLocaleString('zh-CN') : '' }

useBbRefresh(fetchData)
onMounted(fetchData)
</script>

<style scoped>
.bb-eviction-admin { max-width: 1000px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #00ff8844; }
.eviction-result-card { background: linear-gradient(135deg, #2e0f0f, #3e1a1a); border: 1px solid #ff4444; border-radius: 12px; padding: 24px; display: flex; align-items: center; gap: 20px; margin-bottom: 20px; }
.result-icon { font-size: 48px; }
.result-label { font-size: 12px; color: #888; text-transform: uppercase; }
.result-name { font-size: 22px; font-weight: 700; color: #ff4444; }
.result-votes { font-size: 14px; color: #aaa; margin-top: 4px; }
.twist-info-bar { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 14px 18px; margin-bottom: 20px; display: flex; flex-direction: column; gap: 6px; }
.twist-item { font-size: 13px; color: #aaa; }
.twist-item.triple { color: #e74c3c; }
.twist-item.karmic { color: #00ff88; }
.twist-action-hint { padding: 10px 14px; background: #e74c3c11; border: 1px solid #e74c3c33; border-radius: 8px; font-size: 13px; color: #e74c3c; margin-bottom: 12px; }
.action-section { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
.action-section h3 { margin: 0 0 12px; font-size: 16px; color: #e0e0e0; }
.action-buttons { display: flex; gap: 12px; }
.bb-btn { background: transparent; border: 1px solid #00ff8844; color: #00ff88; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
.bb-btn:hover { background: #00ff8822; }
.bb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bb-btn-danger { border-color: #ff4444; color: #ff4444; }
.bb-btn-danger:hover { background: #ff444422; }
.votes-section h3, .history-section h3 { font-size: 16px; color: #e0e0e0; margin: 0 0 12px; }
.votes-section { margin-bottom: 20px; }
.bb-table { width: 100%; border-collapse: collapse; }
.bb-table th, .bb-table td { padding: 10px 16px; text-align: left; border-bottom: 1px solid #00ff8811; font-size: 14px; color: #ccc; }
.bb-table th { color: #888; font-size: 12px; text-transform: uppercase; }
.highlight { color: #ffaa00; font-weight: 500; }
.time { font-size: 12px; color: #666; }
.empty-cell { text-align: center; color: #666; padding: 32px; }
.announce-segments { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.seg { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: #ffffff06; border: 1px solid #ffffff10; border-radius: 8px; opacity: 0.5; }
.seg.shown { opacity: 1; border-color: #00ff8866; background: #00ff8810; }
.seg-no { width: 22px; height: 22px; border-radius: 50%; background: #1c1c46; color: #aaa; font-size: 12px; display: flex; align-items: center; justify-content: center; }
.seg.shown .seg-no { background: #00ff88; color: #003018; }
.seg-text { color: #e0e0e0; font-size: 15px; }
.announce-form { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.announce-form label { color: #888; font-size: 13px; }
.bb-select { padding: 8px 12px; background: #0a0a1a; border: 1px solid #00ff8833; border-radius: 6px; color: #e0e0e0; font-size: 13px; }
.hint { color: #666; font-size: 12px; margin-top: 8px; }
.night-preview { margin-top: 16px; background: #0a0a1a; border: 1px solid #ffaa0044; border-radius: 10px; padding: 18px; text-align: center; }
.night-phase { color: #ffaa00; font-size: 13px; margin-bottom: 12px; }
.night-line { font-size: 20px; font-weight: 700; color: #e0e0e0; padding: 4px 0; }
.night-line.evicted { color: #ff4444; }
.night-line.result { color: #ff4444; }
.night-line.dim { opacity: 0.2; }
.mode-select { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; width: 100%; margin-bottom: 10px; font-size: 13px; color: #aaa; }
.mode-select .ms-label { color: #888; }
.mode-select label { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }
.night-line.door { color: #ffaa00; }
.nominee-preview { margin-top: 14px; background: #0a0a1a; border: 1px solid #ffaa0033; border-radius: 10px; padding: 14px; }
.np-title { font-size: 13px; color: #ffaa00; margin-bottom: 10px; }
.np-list { display: flex; flex-wrap: wrap; gap: 8px; }
.np-chip { background: #ffaa0015; border: 1px solid #ffaa0033; border-radius: 6px; padding: 6px 14px; font-size: 14px; color: #ffaa00; }
</style>
