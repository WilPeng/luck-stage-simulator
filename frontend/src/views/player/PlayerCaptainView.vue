<template>
  <div class="player-captain">
    <StageStatusView :round="currentRound" stage="captain_vote">
      <template #current>
        <div class="voting-section">
          <div class="voting-info">
            <div class="info-icon">🗳️</div>
            <div class="info-content">
              <h3>投票选出队长</h3>
              <p>每位选手只能投两票，选择后点击确认投票</p>
            </div>
          </div>

          <div class="selected-count">
            已选择 <strong>{{ selectedIds.length }}</strong> / 2 票
          </div>

          <div class="candidates-grid">
            <div
              v-for="candidate in candidates"
              :key="candidate.id"
              class="candidate-card"
              :class="{ selected: selectedIds.includes(candidate.id), disabled: hasVoted }"
              @click="toggleCandidate(candidate.id)"
            >
              <div class="candidate-avatar">
                <img v-if="candidate.avatar" :src="getAvatarUrl(candidate.avatar)" :alt="candidate.name" />
                <div v-else class="avatar-placeholder">{{ candidate.name.charAt(0) }}</div>
              </div>
              <div class="candidate-info">
                <div class="candidate-name">{{ candidate.name }}</div>

              </div>
              <div v-if="selectedIds.includes(candidate.id)" class="selected-badge">✓</div>
            </div>
          </div>

          <div v-if="hasVoted" class="voted-notice">
            <span class="voted-icon">✅</span>
            <span>你已投票，等待管理员公布结果</span>
          </div>

          <div v-else class="voting-actions">
            <button
              class="vote-button"
              :disabled="selectedIds.length === 0"
              :loading="submitting"
              @click="submitVote"
            >
              确认投票 ({{ selectedIds.length }})
            </button>
          </div>
        </div>
      </template>

      <template #completed>
        <div class="result-section">
          <div class="result-header">
            <div class="result-icon">👑</div>
            <h2>投票结果</h2>
          </div>

          <div class="results-list">
            <div v-for="item in voteResults" :key="item.playerId" class="result-item" :class="{ winner: item.rank === 1 }">
              <span class="result-rank">{{ item.rank }}</span>
              <span class="result-name">{{ item.playerName }}</span>
              <div class="result-bar">
                <div class="result-bar-fill" :style="{ width: barWidth(item) + '%' }"></div>
              </div>
              <span class="result-votes">{{ item.voteCount }} 票</span>
            </div>
          </div>

          <div v-if="voteResults.length === 0" class="no-result">
            <p>暂无投票数据</p>
          </div>
        </div>
      </template>
    </StageStatusView>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { useSeasonStore } from '../../stores/seasonStore'
import { usePlayerStore } from '../../stores/playerStore'
import { submitCaptainVote, getMyVote, getCaptainResults, getAvatarUrl } from '../../services/api'
import StageStatusView from '../../components/StageStatusView.vue'

const route = useRoute()
const seasonStore = useSeasonStore()
const playerStore = usePlayerStore()

const currentRound = computed(() => parseInt(route.params.round as string) || 1)
const selectedIds = ref<string[]>([])
const hasVoted = ref(false)
const submitting = ref(false)
const voteResults = ref<{ playerId: string; playerName: string; voteCount: number; rank: number }[]>([])

const candidates = computed(() => {
  return playerStore.users
    .filter(user => user.role !== 'admin' && user.status !== 'eliminated')
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-CN'))
})

const maxVotes = computed(() => {
  const max = voteResults.value[0]?.voteCount || 0
  return max || 1
})

function barWidth(item: { voteCount: number }): number {
  return (item.voteCount / maxVotes.value) * 100
}

function toggleCandidate(userId: string) {
  if (hasVoted.value || submitting.value) return
  const idx = selectedIds.value.indexOf(userId)
  if (idx >= 0) {
    selectedIds.value.splice(idx, 1)
  } else if (selectedIds.value.length < 2) {
    selectedIds.value.push(userId)
  } else {
    MessagePlugin.warning('最多只能投给 2 位选手')
  }
}

async function submitVote() {
  if (selectedIds.value.length === 0 || hasVoted.value) return
  submitting.value = true
  try {
    const roundId = `round-${currentRound.value}`
    await submitCaptainVote(roundId, selectedIds.value)
    hasVoted.value = true
    MessagePlugin.success('投票成功！')
  } catch (e: any) {
    MessagePlugin.error(e.message || '投票失败')
  } finally {
    submitting.value = false
  }
}

async function loadMyVote() {
  const roundId = `round-${currentRound.value}`
  try {
    const data = await getMyVote(roundId)
    hasVoted.value = data.hasVoted
    selectedIds.value = data.votedFor || []
  } catch (e) {
    hasVoted.value = false
  }
}

async function loadResults() {
  const roundId = `round-${currentRound.value}`
  try {
    voteResults.value = await getCaptainResults(roundId)
  } catch (e) {
    voteResults.value = []
  }
}

onMounted(async () => {
  await playerStore.fetchUsers({ pageSize: 1000 })
  await loadMyVote()
  await loadResults()
})
</script>

<style scoped lang="scss">
.player-captain {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  color: var(--text-primary);
}

.voting-section {
  .voting-info {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 12px;
    color: white;
    margin-bottom: 16px;

    .info-icon { font-size: 48px; }
    .info-content {
      h3 { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
      p { font-size: 14px; opacity: 0.9; }
    }
  }

  .selected-count {
    text-align: center;
    font-size: 14px;
    color: var(--text-secondary);
    margin-bottom: 16px;
    strong { color: #667eea; font-size: 18px; }
  }

  .candidates-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .candidate-card {
    position: relative;
    padding: 20px;
    background: var(--hover-bg);
    border: 2px solid var(--border-color);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.3s;

    &:hover:not(.disabled) {
      transform: translateY(-4px);
      box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
    }

    &.selected { border-color: #667eea; background: linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%); }
    &.disabled { opacity: 0.6; cursor: default; }

    .candidate-avatar {
      width: 80px; height: 80px; margin: 0 auto 12px;
      border-radius: 50%; overflow: hidden;
      img { width: 100%; height: 100%; object-fit: cover; }
      .avatar-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; font-size: 32px; font-weight: 700; }
    }

    .candidate-info { text-align: center;
      .candidate-name { font-size: 16px; font-weight: 600; margin-bottom: 8px; color: var(--text-primary); }
      .candidate-stats { display: flex; justify-content: center; gap: 8px; font-size: 12px; color: var(--text-tertiary);
        .stat { padding: 2px 8px; background: var(--hover-bg); border-radius: 4px; }
      }
    }

    .selected-badge { position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: #667eea; color: white; border-radius: 50%; font-size: 14px; font-weight: 700; }
  }

  .voted-notice { text-align: center; padding: 16px; background: rgba(0, 82, 217, 0.15); border-radius: 12px; font-size: 16px; color: #64b5f6; display: flex; align-items: center; justify-content: center; gap: 8px;
    .voted-icon { font-size: 24px; }
  }

  .voting-actions { text-align: center;
    .vote-button { padding: 12px 48px; font-size: 16px; font-weight: 600; color: white; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; border-radius: 24px; cursor: pointer; transition: all 0.3s;
      &:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 16px rgba(102, 126, 234, 0.3); }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
  }
}

.result-section {
  .result-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px;
    .result-icon { font-size: 48px; }
    h2 { font-size: 24px; font-weight: 700; color: var(--text-primary); }
  }

  .results-list { display: flex; flex-direction: column; gap: 12px; }

  .result-item { display: flex; align-items: center; gap: 12px; padding: 16px; background: var(--hover-bg); border-radius: 12px;
    &.winner { background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%); }
    .result-rank { font-size: 20px; font-weight: 700; color: var(--text-tertiary); width: 32px; text-align: center; }
    .result-name { font-size: 14px; font-weight: 500; min-width: 100px; }
    .result-bar { flex: 1; height: 12px; background: var(--hover-bg); border-radius: 6px; overflow: hidden;
      .result-bar-fill { height: 100%; background: linear-gradient(90deg, #667eea, #764ba2); border-radius: 6px; transition: width 0.5s; }
    }
    .result-votes { font-size: 14px; font-weight: 600; color: #667eea; min-width: 60px; text-align: right; }
  }

  .no-result { text-align: center; padding: 48px; color: var(--text-tertiary); }
}

// ===== 移动端适配 =====
@media (max-width: 768px) {
  .player-captain {
    padding: 16px;
  }

  .voting-section {
    .voting-info {
      padding: 14px;
      gap: 12px;

      .info-icon { font-size: 36px; }
      .info-content {
        h3 { font-size: 17px; }
        p { font-size: 13px; }
      }
    }

    .candidates-grid {
      gap: 12px;
    }

    .candidate-card {
      padding: 14px;

      .candidate-avatar {
        width: 64px; height: 64px;
        .avatar-placeholder { font-size: 26px; }
      }

      .candidate-info {
        .candidate-name { font-size: 14px; }
        .candidate-stats { gap: 6px; font-size: 11px; }
      }

      .selected-badge { width: 24px; height: 24px; font-size: 12px; }
    }

    .vote-button {
      padding: 12px 36px;
      font-size: 15px;
    }
  }

  .result-section {
    .result-header {
      gap: 12px;
      .result-icon { font-size: 36px; }
      h2 { font-size: 20px; }
    }

    .result-item {
      padding: 12px;
      gap: 8px;

      .result-rank { font-size: 16px; width: 24px; }
      .result-name { font-size: 13px; min-width: auto; flex-shrink: 1; }
      .result-bar { min-width: 40px; }
      .result-votes { font-size: 12px; min-width: auto; white-space: nowrap; }
    }
  }
}
</style>
