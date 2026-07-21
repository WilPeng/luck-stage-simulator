<template>
  <div class="admin-logs">
    <t-card class="logs-header-card" :bordered="false">
      <t-row :gutter="16" align="center">
        <t-col :xs="24" :md="12">
          <div class="header-left">
            <h1>操作日志</h1>
            <p class="subtitle">查看所有操作记录</p>
          </div>
        </t-col>
        <t-col :xs="24" :md="12">
          <div class="header-right">
            <t-input
              v-model="searchKeyword"
              placeholder="搜索日志..."
              clearable
              @change="onSearch"
            >
              <span class="prefix-icon">🔍</span>
            </t-input>
          </div>
        </t-col>
      </t-row>
    </t-card>

    <t-card :bordered="false">
      <t-table
        :data="filteredLogs"
        :columns="columns"
        row-key="id"
        :bordered="true"
        hover
        stripe
        :pagination="{ defaultPageSize: 10 }"
        @page-change="onPageChange"
      >
        <template #time="{ row }">
          <span class="log-time">{{ row.createdAt }}</span>
        </template>
        <template #user="{ row }">
          <span class="log-user">{{ row.userName }}</span>
        </template>
        <template #role="{ row }">
          <t-tag :theme="getRoleTheme(row.role)" variant="light" size="small">
            {{ getRoleText(row.role) }}
          </t-tag>
        </template>
        <template #action="{ row }">
          <t-tag variant="outline" size="small">
            {{ getActionText(row.actionType) }}
          </t-tag>
        </template>
        <template #target="{ row }">
          <span class="log-target">{{ row.targetType || '-' }}</span>
        </template>
        <template #detail="{ row }">
          <span class="log-detail">{{ row.detail }}</span>
        </template>
      </t-table>

      <t-empty v-if="filteredLogs.length === 0" description="暂无操作日志" />
    </t-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useLogStore } from '../../stores/logStore'

const logStore = useLogStore()

const searchKeyword = ref('')

const columns = [
  { colKey: 'time', title: '时间', width: '160' },
  { colKey: 'user', title: '操作人', width: '120' },
  { colKey: 'role', title: '角色', width: '100' },
  { colKey: 'action', title: '操作类型', width: '120' },
  { colKey: 'target', title: '操作对象', width: '120' },
  { colKey: 'detail', title: '操作详情' }
]

const filteredLogs = computed(() => {
  if (!searchKeyword.value) return logStore.logs
  return logStore.logs.filter(log =>
    log.userName.includes(searchKeyword.value) ||
    log.detail.includes(searchKeyword.value) ||
    log.actionType.includes(searchKeyword.value)
  )
})

function getRoleText(role: string): string {
  const texts: Record<string, string> = {
    admin: '管理员',
    captain: '队长',
    player: '队员'
  }
  return texts[role] || role
}

function getRoleTheme(role: string): 'primary' | 'warning' | 'success' | 'default' | 'danger' {
  const themes: Record<string, 'primary' | 'warning' | 'success' | 'default' | 'danger'> = {
    admin: 'danger',
    captain: 'warning',
    player: 'primary'
  }
  return themes[role] || 'default'
}

function getActionText(action: string): string {
  const texts: Record<string, string> = {
    login: '登录',
    logout: '退出',
    initial_luck: '初始命运',
    apply_team: '申请入队',
    invite_player: '邀请队员',
    accept_invite: '接受邀请',
    reject_invite: '拒绝邀请',
    lock_team: '锁定队伍',
    select_song: '选择歌曲',
    draw_card: '训练翻牌',
    start_rehearsal: '开启彩排',
    calculate_performance: '公演结算',
    generate_elimination: '淘汰结果',
    update_stage: '阶段切换'
  }
  return texts[action] || action
}

function onSearch() {
}

function onPageChange(_pageInfo: { current: number; pageSize: number }) {
}

onMounted(async () => {
  await logStore.fetchLogs()
})
</script>

<style lang="scss" scoped>
.admin-logs {
  background: var(--bg-primary);
  padding: 24px;
  min-height: 100%;
}

.logs-header-card {
  margin-bottom: 24px;

  :deep(.t-card__body) {
    padding: 20px 24px;
  }
}

.header-left {
  h1 {
    font-size: 24px;
    font-weight: 700;
    margin: 0 0 8px 0;
    color: var(--text-primary);
  }

  .subtitle {
    color: var(--text-secondary);
    margin: 0;
    font-size: 14px;
  }
}

.header-right {
  display: flex;
  justify-content: flex-end;
}

.log-time {
  color: var(--text-secondary);
  font-size: 13px;
}

.log-user {
  font-weight: 600;
  color: var(--text-primary);
}

.log-target {
  color: var(--text-secondary);
}

.log-detail {
  color: var(--text-primary);
}

@media (max-width: 768px) {
  .admin-logs {
    padding: 16px;
  }

  .header-right {
    justify-content: flex-start;
    margin-top: 16px;
  }
}
</style>
