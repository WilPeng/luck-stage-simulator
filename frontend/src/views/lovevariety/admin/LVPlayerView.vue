<template>
  <div class="lv-players">
    <div class="page-header">
      <h1>选手管理</h1>
      <button class="lv-btn" @click="showCreateModal = true">+ 新建选手</button>
    </div>

    <div class="toolbar">
      <input v-model="searchKeyword" class="lv-input" placeholder="搜索选手名称/登录码..." @input="onSearch" />
      <select v-model="statusFilter" class="lv-select" @change="fetchData">
        <option value="">全部状态</option>
        <option value="active">活跃</option>
        <option value="eliminated">已淘汰</option>
      </select>
    </div>

    <div class="table-container">
      <table class="lv-table">
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
          <tr v-for="p in list" :key="p.id">
            <td class="name-cell">{{ p.name }}</td>
            <td><code class="code-tag">{{ p.loginCode }}</code></td>
            <td>{{ p.role === 'admin' ? '管理员' : '选手' }}</td>
            <td><span class="status-tag" :class="p.status">{{ statusText(p.status) }}</span></td>
            <td>{{ p.hasLogin ? '是' : '否' }}</td>
            <td class="actions">
              <button class="lv-btn lv-btn-xs" @click="editPlayer(p)">编辑</button>
              <button v-if="p.role !== 'admin'" class="lv-btn lv-btn-xs lv-btn-danger" @click="confirmDelete(p)">删除</button>
            </td>
          </tr>
          <tr v-if="list.length === 0"><td colspan="6" class="empty-cell">暂无数据</td></tr>
        </tbody>
      </table>
    </div>

    <div v-if="totalPages > 1" class="pagination">
      <button class="lv-btn lv-btn-xs" :disabled="page <= 1" @click="changePage(page - 1)">上一页</button>
      <span class="page-info">{{ page }} / {{ totalPages }}</span>
      <button class="lv-btn lv-btn-xs" :disabled="page >= totalPages" @click="changePage(page + 1)">下一页</button>
    </div>

    <!-- 新建/编辑弹窗 -->
    <Teleport to="body">
      <div v-if="showCreateModal" class="lv-modal-overlay" @click.self="showCreateModal = false">
        <div class="lv-modal">
          <div class="lv-modal-header">
            <h3>{{ editingId ? '编辑选手' : '新建选手' }}</h3>
            <button class="close-btn" @click="showCreateModal = false">✕</button>
          </div>
          <div class="lv-modal-body">
            <div class="form-group">
              <label>名称</label>
              <input v-model="formName" class="lv-input" placeholder="选手名称" />
            </div>
            <div class="form-group">
              <label>登录码</label>
              <input v-model="formCode" class="lv-input" placeholder="登录码" />
            </div>
            <div v-if="editingId" class="form-group">
              <label>状态</label>
              <select v-model="formStatus" class="lv-select">
                <option value="active">活跃</option>
                <option value="eliminated">已淘汰</option>
              </select>
            </div>
            <div class="form-actions">
              <button class="lv-btn" @click="showCreateModal = false">取消</button>
              <button class="lv-btn lv-btn-primary" @click="savePlayer">{{ editingId ? '保存' : '创建' }}</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { lvGetPlayers, lvCreatePlayer, lvUpdatePlayer, lvDeletePlayer } from '../../../services/lovevarietyApi'
import type { LVPlayer } from '../../../types/lovevariety'

const list = ref<LVPlayer[]>([])
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
    const result = await lvGetPlayers({
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
  const map: Record<string, string> = { active: '活跃', eliminated: '已淘汰' }
  return map[status] || status
}

function editPlayer(p: LVPlayer) {
  editingId.value = p.id
  formName.value = p.name
  formCode.value = p.loginCode
  formStatus.value = p.status
  showCreateModal.value = true
}

async function savePlayer() {
  try {
    if (editingId.value) {
      await lvUpdatePlayer(editingId.value, { name: formName.value, status: formStatus.value })
    } else {
      await lvCreatePlayer({ name: formName.value, loginCode: formCode.value })
    }
    showCreateModal.value = false
    editingId.value = null
    formName.value = ''
    formCode.value = ''
    await fetchData()
  } catch (e: any) { alert(e.message) }
}

function confirmDelete(p: LVPlayer) {
  if (!confirm(`确定删除选手 ${p.name} 吗？`)) return
  lvDeletePlayer(p.id).then(fetchData).catch((e: any) => alert(e.message))
}

onMounted(fetchData)
</script>

<style scoped>
.lv-players { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.lv-btn {
  background: transparent; border: 1px solid #ff69b444; color: #ff69b4;
  padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s;
}
.lv-btn:hover { background: #ff69b422; }
.lv-btn-primary { background: #ff69b422; border-color: #ff69b4; }
.lv-btn-danger { border-color: #ff4444; color: #ff4444; }
.lv-btn-xs { padding: 4px 12px; font-size: 12px; }
.lv-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; }
.lv-input {
  background: #1a0f2e; border: 1px solid #ff69b422; color: #e0e0e0;
  padding: 8px 12px; border-radius: 6px; font-size: 14px; flex: 1; outline: none;
}
.lv-input:focus { border-color: #ff69b4; }
.lv-select {
  background: #1a0f2e; border: 1px solid #ff69b422; color: #e0e0e0;
  padding: 8px 12px; border-radius: 6px; font-size: 14px; outline: none; cursor: pointer;
}
.table-container { overflow-x: auto; }
.lv-table { width: 100%; border-collapse: collapse; }
.lv-table th, .lv-table td {
  padding: 12px 16px; text-align: left; border-bottom: 1px solid #ff69b411;
  font-size: 14px; color: #ccc;
}
.lv-table th { color: #888; font-weight: 500; font-size: 12px; text-transform: uppercase; }
.lv-table tr:hover td { background: #ff69b405; }
.name-cell { color: #e0e0e0; font-weight: 500; }
.code-tag { background: #ff69b415; color: #ff69b4; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.status-tag { padding: 2px 10px; border-radius: 10px; font-size: 12px; }
.status-tag.active { background: #00ff8822; color: #00ff88; }
.status-tag.eliminated { background: #ff444422; color: #ff4444; }
.actions { display: flex; gap: 6px; }
.empty-cell { text-align: center; color: #666; padding: 40px; }
.pagination { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 16px; }
.page-info { font-size: 13px; color: #888; }
.lv-modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.lv-modal {
  background: #2d1b4e; border: 1px solid #ff69b444;
  border-radius: 12px; width: 400px; max-width: 90vw;
}
.lv-modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px; border-bottom: 1px solid #ff69b422;
}
.lv-modal-header h3 { margin: 0; color: #ff69b4; font-size: 16px; }
.close-btn { background: none; border: none; color: #888; cursor: pointer; font-size: 18px; }
.lv-modal-body { padding: 20px; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 13px; color: #aaa; margin-bottom: 6px; }
.form-group .lv-input, .form-group .lv-select { width: 100%; }
.form-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; }
</style>
