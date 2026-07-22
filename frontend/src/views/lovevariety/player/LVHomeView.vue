<template>
  <div class="lv-home">
    <div class="welcome-section">
      <h1>欢迎来到恋综</h1>
      <p v-if="isWaiting" class="subtitle waiting-subtitle">等待管理员开始游戏...</p>
      <p v-else class="subtitle">第{{ seasonStore.currentRoundNumber }}轮 · {{ seasonStore.stageName }}</p>
    </div>

    <div v-if="isWaiting" class="waiting-banner">
      <div class="waiting-icon">💕</div>
      <div class="waiting-text">游戏尚未开始</div>
      <div class="waiting-hint">请等待管理员点击"开始游戏"</div>
    </div>

    <div v-else>
      <div class="status-section">
        <div class="status-card">
          <LvAvatar :name="authStore.currentUser?.name || '?'" :avatar="authStore.currentUser?.avatar" size="lg" class="card-avatar" />
          <div class="card-info">
            <div class="card-label">当前选手</div>
            <div class="card-value">{{ authStore.currentUser?.name }}</div>
          </div>
          <div class="avatar-actions">
            <button class="lv-btn lv-btn-xs" @click="triggerAvatarUpload">换头像</button>
            <input ref="avatarInputRef" type="file" accept="image/*" class="hidden-input" @change="onAvatarChange" />
          </div>
        </div>
      </div>

      <!-- 当前可操作区域 -->
      <div v-if="isCurrentRound" class="action-section">
        <h2>当前可操作</h2>
        <div class="action-cards">
          <div v-if="isLoveVoteStage" class="action-card highlight" @click="goToVote">
            <span class="action-icon">💌</span>
            <span class="action-title">喜爱值投送</span>
            <span class="action-desc">给其他选手投送喜爱值</span>
          </div>
          <div v-if="isPairingStage" class="action-card" @click="goToResult">
            <span class="action-icon">💑</span>
            <span class="action-title">查看配对结果</span>
            <span class="action-desc">查看本轮配对结果</span>
          </div>
        </div>
      </div>

      <!-- 历史赛程 -->
      <div class="history-section">
        <h2>历史赛程</h2>
        <div v-if="completedStages.length === 0" class="empty-tip">暂无历史记录</div>
        <div v-for="item in completedStages" :key="`${item.round}-${item.stage}`" class="history-item" @click="goToStage(item)">
          <span class="history-icon">{{ getStageIcon(item.stage) }}</span>
          <span class="history-text">第{{ item.round }}轮 · {{ item.stageName }}</span>
          <span class="history-status">已结束</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLvAuthStore } from '../../../stores/lovevarietyAuthStore'
import { useLvSeasonStore } from '../../../stores/lovevarietySeasonStore'
import { LV_STAGE_ORDER, LV_STAGE_NAME, type LVStageType } from '../../../types/lovevariety'
import { lvUploadMyAvatar } from '../../../services/lovevarietyApi'
import LvAvatar from '../../../components/lovevariety/LvAvatar.vue'

const router = useRouter()
const authStore = useLvAuthStore()
const seasonStore = useLvSeasonStore()
const avatarInputRef = ref<HTMLInputElement>()

const isWaiting = computed(() => seasonStore.currentStage === 'waiting')
const isCurrentRound = computed(() => true)

const isLoveVoteStage = computed(() => seasonStore.currentStage === 'love_vote')
const isPairingStage = computed(() => seasonStore.currentStage === 'pairing')

const completedStages = computed(() => {
  const items: { round: number; stage: string; stageName: string; route: string }[] = []
  for (let r = 1; r <= seasonStore.currentRoundNumber; r++) {
    for (const st of LV_STAGE_ORDER) {
      if (seasonStore.isStageCompleted(r, st)) {
        const routeMap: Record<string, string> = {
          love_vote: 'vote',
          pairing: 'result',
          elimination: 'result'
        }
        items.push({
          round: r,
          stage: st,
          stageName: LV_STAGE_NAME[st],
          route: routeMap[st] || 'vote'
        })
      }
    }
  }
  return items
})

function getStageIcon(stage: string): string {
  const map: Record<string, string> = {
    love_vote: '💌',
    pairing: '💑',
    elimination: '🚪'
  }
  return map[stage] || '📋'
}

function goToVote() {
  router.push(`/games/lovevariety/player/round/${seasonStore.currentRoundNumber}/vote`)
}

function goToResult() {
  router.push(`/games/lovevariety/player/round/${seasonStore.currentRoundNumber}/result`)
}

function goToStage(item: any) {
  router.push(`/games/lovevariety/player/round/${item.round}/${item.route}`)
}

function triggerAvatarUpload() {
  avatarInputRef.value?.click()
}

async function onAvatarChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const result = await lvUploadMyAvatar(file)
    if (authStore.currentUser) {
      authStore.currentUser.avatar = result.avatar
    }
  } catch (err: any) {
    alert(err.message)
  }
  input.value = ''
}

onMounted(async () => {
  await seasonStore.fetchProgress()
  await seasonStore.fetchMenu()
})
</script>

<style scoped>
.lv-home { max-width: 800px; margin: 0 auto; }
.welcome-section { text-align: center; margin-bottom: 24px; }
.welcome-section h1 { font-size: 28px; font-weight: 700; color: #e0e0e0; margin: 0; }
.welcome-section .subtitle { color: #ff69b4; font-size: 16px; margin: 8px 0 0; }
.welcome-section .waiting-subtitle { color: #ffaa00; font-size: 16px; margin: 8px 0 0; }
.waiting-banner {
  text-align: center; padding: 60px 20px;
  background: linear-gradient(135deg, #1a0f2e, #2d1b4e);
  border: 1px dashed #ff69b444; border-radius: 16px; margin-bottom: 24px;
}
.waiting-icon { font-size: 48px; margin-bottom: 16px; }
.waiting-text { font-size: 20px; font-weight: 600; color: #ff69b4; margin-bottom: 8px; }
.waiting-hint { font-size: 14px; color: #888; }
.status-section { margin-bottom: 24px; }
.status-card {
  background: linear-gradient(135deg, #1a0f2e, #2d1b4e);
  border: 1px solid #ff69b422; border-radius: 12px;
  padding: 16px 20px; display: flex; align-items: center; gap: 12px;
}
.card-avatar { border: 2px solid #ff69b444; }
.card-label { font-size: 12px; color: #888; }
.card-value { font-size: 18px; font-weight: 600; color: #ff69b4; }
.avatar-actions { margin-left: auto; }
.lv-btn {
  background: transparent; border: 1px solid #ff69b444; color: #ff69b4;
  padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; transition: all 0.2s;
}
.lv-btn:hover { background: #ff69b422; }
.lv-btn-xs { padding: 4px 12px; font-size: 12px; }
.hidden-input { display: none; }
.action-section { margin-bottom: 24px; }
.action-section h2 { font-size: 18px; font-weight: 600; color: #e0e0e0; margin: 0 0 12px; }
.action-cards { display: flex; gap: 12px; flex-wrap: wrap; }
.action-card {
  background: #1a0f2e; border: 1px solid #ff69b422; border-radius: 10px;
  padding: 20px; cursor: pointer; transition: all 0.3s; flex: 1; min-width: 200px;
}
.action-card:hover { border-color: #ff69b4; transform: translateY(-2px); background: #2d1b4e; }
.action-card.highlight { border-color: #ff69b4; background: #ff69b408; }
.action-icon { display: block; font-size: 28px; margin-bottom: 8px; }
.action-title { display: block; font-size: 16px; font-weight: 600; color: #e0e0e0; margin-bottom: 4px; }
.action-desc { font-size: 12px; color: #888; }
.history-section h2 { font-size: 18px; font-weight: 600; color: #e0e0e0; margin: 0 0 12px; }
.history-item {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px; background: #1a0f2e; border: 1px solid #ff69b411;
  border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s;
}
.history-item:hover { border-color: #ff69b422; background: #2d1b4e; }
.history-icon { font-size: 18px; }
.history-text { flex: 1; font-size: 14px; color: #ccc; }
.history-status { font-size: 12px; color: #888; }
.empty-tip { text-align: center; color: #666; padding: 20px; }
</style>
