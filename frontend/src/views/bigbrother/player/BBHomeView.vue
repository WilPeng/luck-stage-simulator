<template>
  <div class="bb-home">
    <div class="welcome-section">
      <h1>欢迎回来，{{ authStore.currentUser?.name }}</h1>
      <p class="subtitle">当前第 {{ seasonStore.currentRoundNumber }} 周 · {{ seasonStore.stageName }}</p>
    </div>

    <div v-if="currentHoh" class="hoh-banner" :class="{ 'is-me': isMe(currentHoh.winnerName) }">
      <span class="hoh-crown">👑</span>
      <span class="hoh-text">
        <strong>{{ currentHoh.winnerName }}</strong> 是本周的 HOH<span v-if="isMe(currentHoh.winnerName)">（就是你！）</span>
      </span>
    </div>

    <div class="status-cards">
      <div class="status-card">
        <div class="card-icon">📅</div>
        <div class="card-info">
          <div class="card-label">当前轮次</div>
          <div class="card-value">{{ seasonStore.currentRoundNumber }} / {{ seasonStore.totalRounds }}</div>
        </div>
      </div>
      <div class="status-card">
        <div class="card-icon">🎯</div>
        <div class="card-info">
          <div class="card-label">当前阶段</div>
          <div class="card-value stage">{{ seasonStore.stageName }}</div>
        </div>
      </div>
      <div class="status-card">
        <div class="card-icon">👤</div>
        <div class="card-info">
          <div class="card-label">我的角色</div>
          <div class="card-value">{{ authStore.currentUser?.role === 'admin' ? '管理员' : '房客' }}</div>
        </div>
      </div>
    </div>

    <!-- 当前阶段可操作 -->
    <div class="action-section">
      <h2>当前可操作</h2>
      <div class="action-grid">
        <div v-for="action in currentActions" :key="action.path"
          class="action-card" @click="goTo(action.path)">
          <span class="action-icon">{{ action.icon }}</span>
          <span class="action-title">{{ action.title }}</span>
          <span class="action-desc">{{ action.desc }}</span>
        </div>
        <div v-if="currentActions.length === 0" class="no-action">
          当前阶段暂无可用操作
        </div>
      </div>
    </div>

    <!-- 历史赛程导航 -->
    <div class="history-section">
      <h2>历史赛程</h2>
      <div class="round-list">
        <div v-for="r in historyRounds" :key="r.round" class="round-card">
          <div class="round-header">第 {{ r.round }} 周</div>
          <div class="stage-links">
            <div v-for="stage in r.stages" :key="stage.key"
              class="stage-link" :class="stage.class" @click="goTo(stage.path)">
              <span class="stage-icon">{{ stage.icon }}</span>
              <span class="stage-name">{{ stage.label }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import { useBbSeasonStore } from '../../../stores/bbSeasonStore'
import { bbGetCurrentHoh } from '../../../services/bbApi'

const router = useRouter()
const authStore = useBbAuthStore()
const seasonStore = useBbSeasonStore()

const currentHoh = ref<any>(null)

function isMe(name: string): boolean {
  return name === authStore.currentUser?.name
}

const currentActions = computed(() => {
  const stage = seasonStore.currentStage
  const round = seasonStore.currentRoundNumber
  const actions: Record<string, { icon: string; title: string; desc: string; path: string }> = {
    hoh_competition: { icon: '👑', title: 'HOH 竞争', desc: '参与 HOH 竞争，争夺一家之主', path: `/games/bigbrother/player/round/${round}/hoh` },
    nomination: { icon: '📋', title: '查看提名', desc: '查看本周被提名人', path: `/games/bigbrother/player/round/${round}/nomination` },
    veto_competition: { icon: '🛡️', title: '否决权竞争', desc: '参与否决权竞争', path: `/games/bigbrother/player/round/${round}/veto` },
    veto_ceremony: { icon: '⚖️', title: '否决权会议', desc: '查看否决权使用情况', path: `/games/bigbrother/player/round/${round}/veto` },
    eviction_vote: { icon: '🗳️', title: '淘汰投票', desc: '参与本周淘汰投票', path: `/games/bigbrother/player/round/${round}/eviction` },
    eviction: { icon: '🚪', title: '淘汰结果', desc: '查看本周淘汰结果', path: `/games/bigbrother/player/round/${round}/eviction` },
  }
  return actions[stage] ? [actions[stage]] : []
})

const stageInfo: Record<string, { icon: string; label: string; path: string }> = {
  hoh_competition: { icon: '👑', label: 'HOH', path: 'hoh' },
  nomination: { icon: '📋', label: '提名', path: 'nomination' },
  veto_competition: { icon: '🛡️', label: '否决权', path: 'veto' },
  veto_ceremony: { icon: '⚖️', label: '否决权', path: 'veto' },
  replacement_nom: { icon: '🔄', label: '替换提名', path: 'nomination' },
  eviction_vote: { icon: '🗳️', label: '淘汰', path: 'eviction' },
  eviction: { icon: '🚪', label: '结果', path: 'eviction' },
}

const historyRounds = computed(() => {
  const rounds: { round: number; stages: { key: string; icon: string; label: string; path: string; class: string }[] }[] = []
  for (let r = 1; r <= seasonStore.currentRoundNumber; r++) {
    const stages: any[] = []
    const allStages = ['hoh_competition', 'nomination', 'veto_competition', 'veto_ceremony', 'replacement_nom', 'eviction_vote', 'eviction']
    for (const s of allStages) {
      const status = seasonStore.getStageStatus(r, s as any)
      if (status === 'future') continue
      const info = stageInfo[s]
      if (!info) continue
      // 替换提名共享提名页面，只在已完成时显示
      if (s === 'replacement_nom' && status !== 'completed') continue
      stages.push({
        key: s,
        icon: info.icon,
        label: info.label,
        path: `/games/bigbrother/player/round/${r}/${info.path}`,
        class: status === 'current' ? 'current' : 'completed'
      })
    }
    rounds.push({ round: r, stages })
  }
  return rounds.reverse() // 最新轮次在上
})

function goTo(path: string) {
  router.push(path)
}

onMounted(async () => {
  await seasonStore.fetchProgress()
  try { currentHoh.value = await bbGetCurrentHoh() } catch {}
})
</script>

<style scoped>
.bb-home { max-width: 1000px; margin: 0 auto; }
.welcome-section { margin-bottom: 24px; }
.welcome-section h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0 0 8px; }
.subtitle { font-size: 14px; color: #888; margin: 0; }

.hoh-banner {
  display: flex; align-items: center; gap: 12px;
  background: linear-gradient(135deg, #0f0f2e, #1a1a3e);
  border: 1px solid #ffaa00; border-radius: 12px;
  padding: 16px 20px; margin-bottom: 20px;
  animation: slideIn 0.3s ease;
}
.hoh-banner.is-me {
  border-color: #00ff88;
  background: linear-gradient(135deg, #0a1a0a, #0f2e1a);
}
@keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
.hoh-crown { font-size: 28px; }
.hoh-text { font-size: 15px; color: #ffaa00; }
.hoh-banner.is-me .hoh-text { color: #00ff88; }
.hoh-text strong { font-weight: 700; }

.status-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
.status-card { background: linear-gradient(135deg, #0f0f2e, #1a1a3e); border: 1px solid #00ff8822; border-radius: 12px; padding: 20px; display: flex; align-items: center; gap: 16px; }
.card-icon { font-size: 28px; }
.card-label { font-size: 12px; color: #888; }
.card-value { font-size: 18px; font-weight: 700; color: #fff; }
.card-value.stage { color: #00ff88; font-size: 14px; }
.action-section h2 { font-size: 18px; font-weight: 600; color: #e0e0e0; margin: 0 0 12px; }
.action-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.action-card { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 20px; cursor: pointer; transition: all 0.3s; }
.action-card:hover { border-color: #00ff88; transform: translateY(-2px); background: #1a1a3e; }
.action-icon { display: block; font-size: 32px; margin-bottom: 8px; }
.action-title { display: block; font-size: 16px; font-weight: 600; color: #e0e0e0; margin-bottom: 4px; }
.action-desc { font-size: 13px; color: #888; }
.no-action { grid-column: 1 / -1; text-align: center; color: #666; padding: 40px; }

.history-section { margin-top: 32px; }
.history-section h2 { font-size: 18px; font-weight: 600; color: #e0e0e0; margin: 0 0 16px; }
.round-list { display: flex; flex-direction: column; gap: 16px; }
.round-card { background: #0f0f2e; border: 1px solid #444; border-radius: 12px; padding: 16px; }
.round-header { font-size: 14px; font-weight: 600; color: #888; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }
.stage-links { display: flex; gap: 8px; flex-wrap: wrap; }
.stage-link { display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 13px; cursor: pointer; transition: all 0.2s; }
.stage-link.completed { background: #00ff8808; border: 1px solid #00ff8822; color: #aaa; }
.stage-link.completed:hover { border-color: #00ff88; color: #00ff88; }
.stage-link.current { background: #ffaa0015; border: 1px solid #ffaa00; color: #ffaa00; }
.stage-link.current:hover { background: #ffaa0022; }
.stage-icon { font-size: 16px; }
.stage-name { font-weight: 500; }
</style>
