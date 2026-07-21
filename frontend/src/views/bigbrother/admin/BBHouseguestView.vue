<template>
  <div class="bb-houseguests">
    <div class="page-header">
      <h1>房客管理</h1>
      <button class="bb-btn" @click="showCreateModal = true">+ 新建房客</button>
    </div>

    <div class="toolbar">
      <input v-model="searchKeyword" class="bb-input" placeholder="搜索房客名称/登录码..." @input="onSearch" />
      <select v-model="statusFilter" class="bb-select" @change="fetchData">
        <option value="">全部状态</option>
        <option value="active">活跃</option>
        <option value="evicted">已淘汰</option>
        <option value="jury">陪审团</option>
      </select>
    </div>

    <div class="table-container">
      <table class="bb-table">
        <thead>
          <tr>
            <th>名称</th>
            <th>登录码</th>
            <th>角色</th>
            <th>状态</th>
            <th>已登录</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="h in list" :key="h.id">
            <td class="name-cell">{{ h.name }}</td>
            <td><code class="code-tag">{{ h.loginCode }}</code></td>
            <td>{{ h.role === 'admin' ? '管理员' : '房客' }}</td>
            <td><span class="status-tag" :class="h.status">{{ statusText(h.status) }}</span></td>
            <td>{{ h.hasLogin ? '是' : '否' }}</td>
            <td class="actions">
              <button class="bb-btn bb-btn-xs" @click="editHouseguest(h)">编辑</button>
              <button v-if="h.role !== 'admin'" class="bb-btn bb-btn-xs bb-btn-danger" @click="confirmDelete(h)">删除</button>
            </td>
          </tr>
          <tr v-if="list.length === 0"><td colspan="6" class="empty-cell">暂无数据</td></tr>
        </tbody>
      </table>
    </div>

    <div v-if="totalPages > 1" class="pagination">
      <button class="bb-btn bb-btn-xs" :disabled="page <= 1" @click="changePage(page - 1)">上一页</button>
      <span class="page-info">{{ page }} / {{ totalPages }}</span>
      <button class="bb-btn bb-btn-xs" :disabled="page >= totalPages" @click="changePage(page + 1)">下一页</button>
    </div>

    <!-- 新建弹窗 -->
    <Teleport to="body">
      <div v-if="showCreateModal" class="bb-modal-overlay" @click.self="showCreateModal = false">
        <div class="bb-modal">
          <div class="bb-modal-header">
            <h3>{{ editingId ? '编辑房客' : '新建房客' }}</h3>
            <button class="close-btn" @click="showCreateModal = false">✕</button>
          </div>
          <div class="bb-modal-body">
            <div class="form-group">
              <label>名称</label>
              <input v-model="formName" class="bb-input" placeholder="房客名称" />
            </div>
            <div class="form-group">
              <label>登录码</label>
              <input v-model="formCode" class="bb-input" placeholder="登录码" />
            </div>
            <div v-if="editingId" class="form-group">
              <label>状态</label>
              <select v-model="formStatus" class="bb-select">
                <option value="active">活跃</option>
                <option value="evicted">已淘汰</option>
                <option value="jury">陪审团</option>
              </select>
            </div>
            <div class="form-actions">
              <button class="bb-btn" @click="showCreateModal = false">取消</button>
              <button class="bb-btn bb-btn-primary" @click="saveHouseguest">{{ editingId ? '保存' : '创建' }}</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { bbGetHouseguests, bbCreateHouseguest, bbUpdateHouseguest, bbDeleteHouseguest } from '../../../services/bbApi'
import type { BBHouseguest } from '../../../types/bigbrother'

const list = ref<BBHouseguest[]>([])
const page = ref(1)
const totalPages = ref(1)
const searchKeyword = ref('')
const statusFilter = ref('')
const showCreateModal = ref(false)
const editingId = ref<string | null>(null)
const formName = ref('')
const formCode = ref('')
const formStatus = ref('active')

async function fetchData() {
  try {
    const result = await bbGetHouseguests({
      keyword: searchKeyword.value,
      status: statusFilter.value || undefined,
      page: page.value,
      pageSize: 20
    })
    list.value = result.list
    totalPages.value = result.totalPages
  } catch {}
}

function onSearch() { page.value = 1; fetchData() }
function changePage(p: number) { page.value = p; fetchData() }

function statusText(status: string): string {
  const map: Record<string, string> = { active: '活跃', evicted: '已淘汰', jury: '陪审团' }
  return map[status] || status
}

function editHouseguest(h: BBHouseguest) {
  editingId.value = h.id
  formName.value = h.name
  formCode.value = h.loginCode
  formStatus.value = h.status
  showCreateModal.value = true
}

async function saveHouseguest() {
  try {
    if (editingId.value) {
      await bbUpdateHouseguest(editingId.value, { name: formName.value, loginCode: formCode.value, status: formStatus.value })
    } else {
      await bbCreateHouseguest({ name: formName.value, loginCode: formCode.value })
    }
    showCreateModal.value = false
    editingId.value = null
    formName.value = ''
    formCode.value = ''
    await fetchData()
  } catch (e: any) { alert(e.message) }
}

function confirmDelete(h: BBHouseguest) {
  if (!confirm(`确定删除房客 ${h.name} 吗？`)) return
  bbDeleteHouseguest(h.id).then(fetchData).catch((e: any) => alert(e.message))
}

onMounted(fetchData)
</script>

<style scoped>
.bb-houseguests { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.bb-btn {
  background: transparent; border: 1px solid #00ff8844; color: #00ff88;
  padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s;
}
.bb-btn:hover { background: #00ff8822; }
.bb-btn-primary { background: #00ff8822; border-color: #00ff88; }
.bb-btn-danger { border-color: #ff4444; color: #ff4444; }
.bb-btn-xs { padding: 4px 12px; font-size: 12px; }
.bb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; }
.bb-input {
  background: #0f0f2e; border: 1px solid #00ff8822; color: #e0e0e0;
  padding: 8px 12px; border-radius: 6px; font-size: 14px; flex: 1; outline: none;
}
.bb-input:focus { border-color: #00ff88; }
.bb-select {
  background: #0f0f2e; border: 1px solid #00ff8822; color: #e0e0e0;
  padding: 8px 12px; border-radius: 6px; font-size: 14px; outline: none; cursor: pointer;
}
.table-container { overflow-x: auto; }
.bb-table { width: 100%; border-collapse: collapse; }
.bb-table th, .bb-table td {
  padding: 12px 16px; text-align: left; border-bottom: 1px solid #00ff8811;
  font-size: 14px; color: #ccc;
}
.bb-table th { color: #888; font-weight: 500; font-size: 12px; text-transform: uppercase; }
.bb-table tr:hover td { background: #00ff8805; }
.name-cell { color: #e0e0e0; font-weight: 500; }
.code-tag { background: #00ff8815; color: #00ff88; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.status-tag { padding: 2px 10px; border-radius: 10px; font-size: 12px; }
.status-tag.active { background: #00ff8822; color: #00ff88; }
.status-tag.evicted { background: #ff444422; color: #ff4444; }
.status-tag.jury { background: #ffaa0022; color: #ffaa00; }
.actions { display: flex; gap: 6px; }
.empty-cell { text-align: center; color: #666; padding: 40px; }
.pagination { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 16px; }
.page-info { font-size: 13px; color: #888; }
.bb-modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.bb-modal {
  background: #1a1a3e; border: 1px solid #00ff8844;
  border-radius: 12px; width: 400px; max-width: 90vw;
}
.bb-modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px; border-bottom: 1px solid #00ff8822;
}
.bb-modal-header h3 { margin: 0; color: #00ff88; font-size: 16px; }
.close-btn { background: none; border: none; color: #888; cursor: pointer; font-size: 18px; }
.bb-modal-body { padding: 20px; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 13px; color: #aaa; margin-bottom: 6px; }
.form-group .bb-input, .form-group .bb-select { width: 100%; }
.form-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; }
</style>
