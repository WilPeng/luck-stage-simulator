<template>
  <div class="bb-logs wb-page">
    <header class="page-header wb-header">
      <div class="wb-heading">
        <h1>操作日志</h1>
      </div>
      <div class="wb-page-tools">
        <button class="bb-btn" @click="fetchData">刷新</button>
      </div>
    </header>
    <div class="wb-data-board">
      <ul v-if="logs.length" class="audit-log-list" aria-label="操作记录">
        <li v-for="log in logs" :key="log.id" class="audit-log-entry">
          <div class="audit-log-meta">
            <span class="log-type">{{ log.actionType }}</span>
            <span class="audit-log-user">{{ log.userName }}</span>
            <time v-if="log.createdAt" :datetime="log.createdAt">{{ formatTime(log.createdAt) }}</time>
          </div>
          <p class="audit-log-detail">{{ log.detail }}</p>
        </li>
      </ul>
      <p v-else class="empty-state">暂无日志</p>
      <nav v-if="totalPages > 1" class="pagination" aria-label="操作日志分页">
        <button class="bb-btn bb-btn-xs" :disabled="page <= 1" @click="changePage(page - 1)">上一页</button>
        <span class="page-info" aria-live="polite">{{ page }} / {{ totalPages }}</span>
        <button class="bb-btn bb-btn-xs" :disabled="page >= totalPages" @click="changePage(page + 1)">下一页</button>
      </nav>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useBbRefresh } from '../../../composables/useBbRefresh'
import { bbGetLogs } from '../../../services/bbApi'

const logs = ref<any[]>([])
const page = ref(1)
const totalPages = ref(1)

async function fetchData() {
  try {
    const result = await bbGetLogs({ page: page.value, pageSize: 30 })
    logs.value = result.list || []
    totalPages.value = Math.ceil((result.total || 0) / 30)
  } catch {}
}

function changePage(p: number) { page.value = p; fetchData() }
function formatTime(t: string) { return t ? new Date(t).toLocaleString('zh-CN') : '' }

useBbRefresh(fetchData,
  '/auth', '/season', '/house/admin/door', '/house/admin/evict-backyard', '/houseguests', '/round-twist', '/nomination/bbbb-winner'
)
onMounted(fetchData)
</script>

<style scoped>
.bb-logs { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #ece7fb; margin: 0; }
.bb-btn { background: transparent; border: 1px solid #b39bff44; color: #b39bff; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
.bb-btn:hover { background: #b39bff22; }
.bb-btn-xs { padding: 4px 12px; font-size: 12px; }
.bb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.audit-log-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.audit-log-entry { display: grid; align-items: start; gap: 6px 14px; padding: 10px 12px; border-radius: 8px; background: var(--wb-inset); }
.audit-log-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; font-size: 13px; }
.audit-log-meta time { color: var(--wb-label); font-variant-numeric: tabular-nums; }
.audit-log-user { color: #f2e9fa; font-weight: 600; }
.log-type { background: #b39bff15; color: #b39bff; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.audit-log-detail { margin: 0; color: var(--wb-label); font-size: 14px; white-space: pre-wrap; overflow-wrap: anywhere; }
.empty-state { text-align: center; color: var(--wb-label); padding: 32px 15px; }
.pagination { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 16px; }
.page-info { font-size: 13px; color: #8f83b8; }
@container workspace (min-width: 680px) {
  .audit-log-entry { grid-template-columns: minmax(185px, 1fr) minmax(0, 2.2fr); }
}
</style>
