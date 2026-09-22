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
        :data="logs"
        :columns="columns"
        row-key="id"
        :bordered="true"
        hover
        stripe
        :loading="loading"
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

      <t-empty v-if="logs.length === 0 && !loading" description="暂无操作日志" />
      <div class="logs-pager">
        <t-pagination
          v-model="pagination.page"
          :total="pagination.total"
          :page-size="pagination.pageSize"
          :page-size-options="[10, 20, 50, 100]"
          show-jumper
          @change="loadLogs"
          @page-size-change="onPageSizeChange"
        />
      </div>
    </t-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { getLogsPaged } from '../../services/api'
import type { OperationLog } from '../../types/log'

const searchKeyword = ref('')
const logs = ref<OperationLog[]>([])
const loading = ref(false)
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const columns = [
  { colKey: 'time', title: '时间', width: '160' },
  { colKey: 'user', title: '操作人', width: '120' },
  { colKey: 'role', title: '角色', width: '100' },
  { colKey: 'action', title: '操作类型', width: '120' },
  { colKey: 'target', title: '操作对象', width: '120' },
  { colKey: 'detail', title: '操作详情' }
]

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
    calculate_performance: '公演结算',
    generate_elimination: '淘汰结果',
    update_stage: '阶段切换'
  }
  return texts[action] || action
}

async function loadLogs() {
  loading.value = true
  try {
    const res = await getLogsPaged({ page: pagination.page, pageSize: pagination.pageSize, keyword: searchKeyword.value || undefined })
    logs.value = res.list
    pagination.total = res.total
  } catch (e: any) {
    MessagePlugin.error(e?.message || '加载日志失败')
  } finally {
    loading.value = false
  }
}

function onSearch() {
  pagination.page = 1
  loadLogs()
}

function onPageSizeChange(size: number) {
  pagination.pageSize = size
  pagination.page = 1
  loadLogs()
}

onMounted(loadLogs)
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

.logs-pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
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
