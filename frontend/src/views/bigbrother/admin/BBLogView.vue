<template>
  <div class="bb-logs">
    <div class="page-header">
      <h1>操作日志</h1>
      <button class="bb-btn" @click="fetchData">刷新</button>
    </div>
    <div class="table-container">
      <table class="bb-table">
        <thead><tr><th>时间</th><th>操作人</th><th>类型</th><th>详情</th></tr></thead>
        <tbody>
          <tr v-for="log in logs" :key="log.id">
            <td class="time">{{ formatTime(log.createdAt) }}</td>
            <td>{{ log.userName }}</td>
            <td><span class="log-type">{{ log.actionType }}</span></td>
            <td class="detail">{{ log.detail }}</td>
          </tr>
          <tr v-if="logs.length === 0"><td colspan="4" class="empty-cell">暂无日志</td></tr>
        </tbody>
      </table>
    </div>
    <div v-if="totalPages > 1" class="pagination">
      <button class="bb-btn bb-btn-xs" :disabled="page <= 1" @click="changePage(page - 1)">上一页</button>
      <span class="page-info">{{ page }} / {{ totalPages }}</span>
      <button class="bb-btn bb-btn-xs" :disabled="page >= totalPages" @click="changePage(page + 1)">下一页</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
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

onMounted(fetchData)
</script>

<style scoped>
.bb-logs { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.bb-btn { background: transparent; border: 1px solid #00ff8844; color: #00ff88; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
.bb-btn:hover { background: #00ff8822; }
.bb-btn-xs { padding: 4px 12px; font-size: 12px; }
.bb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bb-table { width: 100%; border-collapse: collapse; }
.bb-table th, .bb-table td { padding: 10px 16px; text-align: left; border-bottom: 1px solid #00ff8811; font-size: 14px; color: #ccc; }
.bb-table th { color: #888; font-size: 12px; text-transform: uppercase; }
.time { font-size: 12px; color: #666; white-space: nowrap; }
.log-type { background: #00ff8815; color: #00ff88; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.detail { max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty-cell { text-align: center; color: #666; padding: 40px; }
.pagination { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 16px; }
.page-info { font-size: 13px; color: #888; }
</style>
