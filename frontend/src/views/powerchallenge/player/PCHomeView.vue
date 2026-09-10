<template>
  <div class="pc-home">
    <div class="hero">
      <h1>💪 实力大挑战</h1>
      <p class="subtitle">每轮放出（在线人数-1）道题目 · 先答对者占领晋级名额</p>
    </div>

    <div class="panel" v-if="s?.status === 'finished'">
      <div class="panel-title">🏆 赛季冠军</div>
      <div class="champ">{{ s.champion?.playerName }}</div>
      <router-link to="/games/powerchallenge/player/game" class="bb-btn bb-btn-primary main-cta">查看最终排名</router-link>
    </div>

    <div class="panel" v-else-if="s && (s.roundPhase === 'answering' || s.roundPhase === 'countdown')">
      <div class="live-badge">🔴 比赛中</div>
      <div class="info-line">第 {{ s.currentRound }} / {{ s.totalRounds }} 轮 · {{ s.theme }}</div>
      <div class="info-line">本轮放出 {{ s.releasedQuestions?.length || 0 }} 题 · 已占名额 {{ s.claims?.length || 0 }}</div>
      <router-link to="/games/powerchallenge/player/game" class="bb-btn bb-btn-primary main-cta">立即进入比赛 →</router-link>
    </div>

    <div class="panel" v-else>
      <div class="panel-title">第 {{ s?.currentRound || 1 }} / {{ s?.totalRounds || 5 }} 轮 · {{ s?.roundPhase === 'ended' ? '已结束' : '等待开始' }}</div>
      <div class="info-line" v-if="s?.theme">本轮主题：{{ s.theme }}</div>
      <div class="info-line">在场玩家：{{ online.length }} 人</div>
      <router-link to="/games/powerchallenge/player/game" class="bb-btn bb-btn-primary main-cta">进入比赛房间</router-link>
    </div>

    <div class="rank-preview" v-if="s?.ranking?.length">
      <h3>综合排名</h3>
      <div v-for="r in s.ranking.slice(0, 8)" :key="r.playerId" class="rank-row">
        <span class="rk">{{ r.rank }}</span>
        <span class="nm">{{ r.playerName }}</span>
        <span class="pt">{{ r.points }}分</span>
        <span class="st" :class="r.alive ? 'alive' : 'out'">{{ r.alive ? '存活' : '淘汰' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { usePcGameSocket } from '../../../composables/usePcGameSocket'

const { connected, error, state, online, connect, disconnect } = usePcGameSocket()
const s = computed(() => state.value)
const isConnecting = ref(false)

function ensureConnect() {
  if (!connected.value) connect()
}

onMounted(() => {
  connect()
  isConnecting.value = true
  setTimeout(() => { isConnecting.value = false }, 800)
})
onUnmounted(() => disconnect())
</script>

<style scoped>
.pc-home { max-width: 800px; margin: 0 auto; }
.hero { text-align: center; margin: 10px 0 24px; }
.hero h1 { font-size: 30px; color: #e8e8ff; margin: 0 0 6px; }
.subtitle { color: #8a8aa5; font-size: 14px; margin: 0; }
.panel { background: #161638; border: 1px solid #ffffff14; border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 16px; }
.panel-title { color: #bbb; font-size: 14px; margin-bottom: 10px; }
.live-badge { display: inline-block; background: #ff44442a; color: #ff6666; padding: 4px 14px; border-radius: 16px; font-weight: 700; margin-bottom: 8px; }
.champ { font-size: 40px; font-weight: 900; color: #ffc94d; margin: 8px 0; }
.info-line { color: #cfcff0; margin: 4px 0; }
.main-cta { margin-top: 18px; }
.rank-preview { background: #141432; border: 1px solid #ffffff12; border-radius: 14px; padding: 18px; }
.rank-preview h3 { color: #aaa; font-size: 14px; margin: 0 0 12px; }
.rank-row { display: flex; align-items: center; gap: 12px; padding: 8px 4px; border-bottom: 1px solid #ffffff0d; font-size: 14px; }
.rank-row .rk { color: #6666aa; font-weight: 700; width: 24px; }
.rank-row .nm { flex: 1; color: #eee; }
.rank-row .pt { color: #ffc94d; }
.rank-row .st { font-size: 12px; padding: 1px 8px; border-radius: 10px; }
.rank-row .st.alive { background: #00ff8822; color: #00ff88; }
.rank-row .st.out { background: #ff444422; color: #ff6666; }
</style>
