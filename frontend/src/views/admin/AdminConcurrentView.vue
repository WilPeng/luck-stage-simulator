<template>
  <div class="admin-concurrent">
    <t-card class="concurrent-card" :bordered="false">
      <div class="page-head">
        <div>
          <h1>并发行动控制中心</h1>
          <p>第 {{ roundIndex }} 公演 · 控制各子行动对选手的开放状态</p>
        </div>
        <div class="page-head-actions">
          <t-button variant="outline" :loading="loading" @click="loadData">刷新</t-button>
        </div>
      </div>

      <div class="overview-grid">
        <div class="overview-item">
          <span class="overview-value">{{ status?.summary?.totalTeams ?? 0 }}</span>
          <span class="overview-label">队伍总数</span>
        </div>
        <div class="overview-item">
          <span class="overview-value">{{ status?.summary?.teamCompleted ?? 0 }}</span>
          <span class="overview-label">已组队</span>
        </div>
        <div class="overview-item">
          <span class="overview-value">{{ status?.summary?.songCompleted ?? 0 }}</span>
          <span class="overview-label">已选歌</span>
        </div>
        <div class="overview-item">
          <span class="overview-value">{{ status?.summary?.trainingCompleted ?? 0 }}</span>
          <span class="overview-label">训练完成</span>
        </div>
        <div class="overview-item">
          <span class="overview-value">{{ status?.summary?.rehearsalCompleted ?? 0 }}</span>
          <span class="overview-label">已彩排</span>
        </div>
      </div>

      <div class="global-status">
        <t-tag v-if="allReleased" theme="success" variant="light" size="large">全部行动已开放</t-tag>
        <t-tag v-else theme="default" variant="light" size="large">部分行动尚未开放</t-tag>
      </div>
    </t-card>

    <t-card title="释放开关" :bordered="false" class="concurrent-card">
      <div class="release-grid">
        <div
          v-for="item in releaseItems"
          :key="item.action"
          class="release-card"
          :class="{ released: item.released }"
        >
          <div class="release-header">
            <span class="release-icon">{{ item.icon }}</span>
            <div class="release-info">
              <span class="release-name">{{ item.name }}</span>
              <t-tag :theme="item.released ? 'success' : 'default'" variant="light" size="small">
                {{ item.released ? '已开放' : '未开放' }}
              </t-tag>
            </div>
          </div>

          <div class="release-progress">
            <span class="progress-text">{{ item.progressText }}</span>
          </div>

          <div class="release-desc">
            {{ item.description }}
          </div>

          <div class="release-action">
            <t-button
              :theme="item.released ? 'default' : 'primary'"
              block
              :loading="toggling === item.action"
              @click="toggleRelease(item.action, !item.released)"
            >
              {{ item.released ? '关闭' : '开放' }}
            </t-button>
          </div>
        </div>
      </div>
    </t-card>

    <t-card title="操作入口" :bordered="false" class="concurrent-card">
      <div class="link-grid">
        <router-link
          v-for="link in adminLinks"
          :key="link.path"
          :to="link.path"
          class="link-card"
        >
          <span class="link-icon">{{ link.icon }}</span>
          <span class="link-name">{{ link.name }}</span>
          <span class="link-arrow">→</span>
        </router-link>
      </div>
    </t-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { useAuthStore } from '../../stores/authStore'
import { getConcurrentStatus, setConcurrentRelease } from '../../services/api'
import type { ConcurrentStatusResponse, ConcurrentActionType } from '../../types/season'

const route = useRoute()
const authStore = useAuthStore()

const loading = ref(false)
const toggling = ref<ConcurrentActionType | ''>('')
const status = ref<ConcurrentStatusResponse | null>(null)

const roundIndex = computed(() => {
  const val = route.params.round as string
  const n = parseInt(val, 10)
  return isNaN(n) ? 1 : n
})
const roundId = computed(() => `round-${roundIndex.value}`)
const gamePrefix = computed(() => `/games/${authStore.currentGameId}`)

const allReleased = computed(() => {
  if (!status.value) return false
  return status.value.teamReleased && status.value.songReleased && status.value.trainingReleased && status.value.rehearsalReleased
})

const releaseItems = computed(() => {
  const s = status.value
  if (!s) return []
  const summary = s.summary
  return [
    {
      action: 'team' as ConcurrentActionType,
      icon: '👥',
      name: '组队',
      released: s.teamReleased,
      progressText: `${summary.teamCompleted} / ${summary.totalTeams} 队伍`,
      description: '开放后选手可申请入队、队长可同意申请'
    },
    {
      action: 'song' as ConcurrentActionType,
      icon: '🎵',
      name: '选歌',
      released: s.songReleased,
      progressText: `${summary.songCompleted} / ${summary.totalTeams} 队伍`,
      description: '开放后队长可从歌曲池抢选歌曲'
    },
    {
      action: 'training' as ConcurrentActionType,
      icon: '💪',
      name: '训练',
      released: s.trainingReleased,
      progressText: `${summary.trainingCompleted} / ${summary.totalPlayers} 选手`,
      description: '开放后选手可进行训练抽卡'
    },
    {
      action: 'rehearsal' as ConcurrentActionType,
      icon: '🎭',
      name: '彩排',
      released: s.rehearsalReleased,
      progressText: `${summary.rehearsalCompleted} / ${summary.totalTeams} 队伍`,
      description: '开放后队长可触发本队彩排'
    }
  ]
})

const adminLinks = computed(() => [
  { path: `${gamePrefix.value}/admin/round/${roundIndex.value}/teaming`, icon: '👥', name: '组队管理' },
  { path: `${gamePrefix.value}/admin/round/${roundIndex.value}/song_select`, icon: '🎵', name: '选歌管理' },
  { path: `${gamePrefix.value}/admin/round/${roundIndex.value}/training`, icon: '💪', name: '训练管理' }
])

async function loadData() {
  loading.value = true
  try {
    status.value = await getConcurrentStatus(roundId.value)
  } catch (e: any) {
    MessagePlugin.error(e.message || '加载并发状态失败')
  } finally {
    loading.value = false
  }
}

async function toggleRelease(action: ConcurrentActionType, released: boolean) {
  toggling.value = action
  try {
    status.value = await setConcurrentRelease(roundId.value, action, released)
    MessagePlugin.success(`${released ? '已开放' : '已关闭'} ${actionName(action)}`)
  } catch (e: any) {
    MessagePlugin.error(e.message || '设置失败')
  } finally {
    toggling.value = ''
  }
}

function actionName(action: ConcurrentActionType): string {
  const map: Record<ConcurrentActionType, string> = {
    team: '组队',
    song: '选歌',
    training: '训练',
    rehearsal: '彩排'
  }
  return map[action]
}

onMounted(loadData)
</script>

<style lang="scss" scoped>
.admin-concurrent {
  min-height: 100%;
  padding: 12px;
  background: var(--bg-primary);
}

.concurrent-card {
  margin-bottom: 12px;
  border-radius: 8px;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  h1 {
    margin: 0 0 4px;
    color: var(--text-primary);
    font-size: 22px;
    line-height: 1.25;
  }

  p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.6;
  }
}

.page-head-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  margin-top: 16px;
}

.overview-item {
  min-width: 0;
  padding: 12px;
  border-radius: 8px;
  background: var(--bg-primary);
  text-align: center;
}

.overview-value {
  display: block;
  color: #0052d9;
  font-size: 18px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.overview-label {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}

.global-status {
  margin-top: 16px;
  text-align: center;
}

.release-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.release-card {
  padding: 16px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
  gap: 12px;

  &.released {
    border-color: #2ba471;
    background: rgba(43, 164, 113, 0.04);
  }
}

.release-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.release-icon {
  font-size: 28px;
}

.release-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.release-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.release-progress {
  font-size: 13px;
  color: var(--text-secondary);
}

.release-desc {
  flex: 1;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.release-action {
  margin-top: auto;
}

.link-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.link-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
  border-radius: 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  text-decoration: none;
  transition: all 0.2s;

  &:hover {
    border-color: #0052d9;
  }
}

.link-icon {
  font-size: 20px;
}

.link-name {
  flex: 1;
  font-size: 14px;
  color: var(--text-primary);
}

.link-arrow {
  color: var(--text-tertiary);
}
</style>
