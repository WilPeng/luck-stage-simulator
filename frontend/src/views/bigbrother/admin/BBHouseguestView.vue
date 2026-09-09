<template>
  <div class="bb-houseguests">
    <div class="page-header">
      <h1>房客管理</h1>
      <div class="header-actions">
        <button class="bb-btn" @click="exportCsv">📤 导出表格</button>
        <label class="bb-btn upload-btn">📥 导入表格
          <input type="file" accept=".csv,text/csv" hidden @change="onImportFile" />
        </label>
        <button class="bb-btn bb-btn-primary" @click="showCreateModal = true">+ 新建房客</button>
      </div>
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
            <th>头像</th>
            <th>名称</th>
            <th>登录码</th>
            <th>角色</th>
            <th>状态</th>
            <th>Have-Not</th>
            <th>已登录</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="h in list" :key="h.id">
            <td><BBAvatar :name="h.name" :avatar="h.avatar" size="sm" /></td>
            <td class="name-cell">{{ h.name }}</td>
            <td><code class="code-tag">{{ h.loginCode }}</code></td>
            <td>{{ h.role === 'admin' ? '管理员' : '房客' }}</td>
            <td><span class="status-tag" :class="h.status">{{ statusText(h.status) }}</span></td>
            <td>
              <span v-if="h.isHaveNot" class="havenot-tag">🥶 是</span>
              <button v-if="h.role !== 'admin' && h.status === 'active'" class="bb-btn bb-btn-xs" @click="toggleHaveNot(h)">
                {{ h.isHaveNot ? '取消' : '设为贫民' }}
              </button>
            </td>
            <td>{{ h.hasLogin ? '是' : '否' }}</td>
            <td class="actions">
              <button class="bb-btn bb-btn-xs" @click="editHouseguest(h)">编辑</button>
              <button v-if="h.role !== 'admin'" class="bb-btn bb-btn-xs bb-btn-danger" @click="confirmDelete(h)">删除</button>
            </td>
          </tr>
          <tr v-if="list.length === 0"><td colspan="8" class="empty-cell">暂无数据</td></tr>
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
            <div v-if="editingId && formStatus === 'active'" class="form-group">
              <label class="checkbox-row">
                <input type="checkbox" v-model="formIsHaveNot" />
                <span>🥶 Have-Not（可进入贫民屋）</span>
              </label>
            </div>
            <div v-if="editingId" class="form-group">
              <label>头像</label>
              <div class="avatar-edit-section">
                <BBAvatar :name="formName" :avatar="editingAvatar" size="lg" />
                <div class="avatar-buttons">
                  <label class="bb-btn bb-btn-xs upload-label">
                    上传头像
                    <input type="file" accept="image/*" hidden @change="onAdminAvatarFile" />
                  </label>
                  <button v-if="editingAvatar" class="bb-btn bb-btn-xs bb-btn-danger" @click="onAdminDeleteAvatar">删除头像</button>
                </div>
              </div>
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
import { bbGetHouseguests, bbCreateHouseguest, bbUpdateHouseguest, bbDeleteHouseguest, bbUploadHouseguestAvatar, bbDeleteHouseguestAvatar } from '../../../services/bbApi'
import BBAvatar from '../../../components/bigbrother/BBAvatar.vue'
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
const formIsHaveNot = ref(false)
const editingAvatar = ref<string | null>(null)

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
  formIsHaveNot.value = !!h.isHaveNot
  editingAvatar.value = h.avatar
  showCreateModal.value = true
}

async function toggleHaveNot(h: BBHouseguest) {
  try {
    await bbUpdateHouseguest(h.id, { isHaveNot: !h.isHaveNot })
    await fetchData()
  } catch (e: any) { alert(e.message) }
}

async function onAdminAvatarFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !editingId.value) return
  try {
    const result = await bbUploadHouseguestAvatar(editingId.value, file)
    editingAvatar.value = result.avatar
    await fetchData()
  } catch (err: any) { alert(err.message) }
  input.value = ''
}

async function onAdminDeleteAvatar() {
  if (!editingId.value) return
  try {
    await bbDeleteHouseguestAvatar(editingId.value)
    editingAvatar.value = null
    await fetchData()
  } catch (err: any) { alert(err.message) }
}

async function saveHouseguest() {
  try {
    if (editingId.value) {
      const payload: any = { name: formName.value, loginCode: formCode.value, status: formStatus.value }
      if (formStatus.value === 'active') payload.isHaveNot = formIsHaveNot.value
      await bbUpdateHouseguest(editingId.value, payload)
    } else {
      await bbCreateHouseguest({ name: formName.value, loginCode: formCode.value })
    }
    showCreateModal.value = false
    editingId.value = null
    formName.value = ''
    formCode.value = ''
    formIsHaveNot.value = false
    await fetchData()
  } catch (e: any) { alert(e.message) }
}

function confirmDelete(h: BBHouseguest) {
  if (!confirm(`确定删除房客 ${h.name} 吗？`)) return
  bbDeleteHouseguest(h.id).then(fetchData).catch((e: any) => alert(e.message))
}

// ===== 导出全部房客为表格(CSV，Excel 可打开) =====
async function fetchAllHouseguests(): Promise<BBHouseguest[]> {
  const all: BBHouseguest[] = []
  let pageNum = 1
  for (;;) {
    const r = await bbGetHouseguests({ page: pageNum, pageSize: 100 })
    all.push(...r.list)
    if (pageNum >= r.totalPages) break
    pageNum++
  }
  return all
}

function statusLabel(s: string): string {
  const map: Record<string, string> = { active: '活跃', evicted: '已淘汰', jury: '陪审团' }
  return map[s] || s
}

async function exportCsv() {
  try {
    const rows = await fetchAllHouseguests()
    const header = ['名称', '登录码', '角色', '状态', '已登录']
    const lines = rows.map(h => [
      h.name,
      h.loginCode,
      h.role === 'admin' ? '管理员' : '房客',
      statusLabel(h.status),
      h.hasLogin ? '是' : '否'
    ])
    const csv = [header, ...lines].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `BigBrother房客_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  } catch (e: any) {
    alert(e.message || '导出失败')
  }
}

// ===== 导入表格：CSV 列名 名称/姓名 + 登录码（可带 状态/角色）=====
const importBusy = ref(false)
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQuote = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuote) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++ } else inQuote = false
      } else cur += ch
    } else if (ch === '"') {
      inQuote = true
    } else if (ch === ',') {
      row.push(cur); cur = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cur); cur = ''
      if (row.some(c => c.trim() !== '')) rows.push(row)
      row = []
    } else {
      cur += ch
    }
  }
  row.push(cur)
  if (row.some(c => c.trim() !== '')) rows.push(row)
  return rows
}

async function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (importBusy.value) return
  importBusy.value = true
  try {
    const text = await file.text()
    const rows = parseCsv(text)
    if (rows.length === 0) { alert('文件为空或格式错误'); return }
    // 找表头/列位置
    let nameIdx = 0, codeIdx = 1, statusIdx = -1, roleIdx = -1
    const first = rows[0].map(c => c.trim().toLowerCase())
    if (first.some(c => c.includes('名'))) {
      nameIdx = first.findIndex(c => c.includes('名')) >= 0 ? first.findIndex(c => c.includes('名')) : 0
      codeIdx = first.findIndex(c => c.includes('登录')) >= 0 ? first.findIndex(c => c.includes('登录')) : first.findIndex(c => c.includes('码'))
      statusIdx = first.findIndex(c => c.includes('状态'))
      roleIdx = first.findIndex(c => c.includes('角色'))
      rows.shift()
    }
    const existing = await fetchAllHouseguests()
    const existingCodes = new Set(existing.map(h => h.loginCode))
    let ok = 0, skip = 0, fail = 0
    const messages: string[] = []
    for (const r of rows) {
      const name = (r[nameIdx] || '').trim()
      const code = (r[codeIdx] || '').trim()
      if (!name) { skip++; continue }
      if (!code) { fail++; messages.push(`「${name}」缺少登录码`); continue }
      if (existingCodes.has(code)) { skip++; messages.push(`登录码 ${code} 已存在，跳过 ${name}`); continue }
      try {
        await bbCreateHouseguest({ name, loginCode: code })
        existingCodes.add(code)
        ok++
      } catch (err: any) {
        fail++
        messages.push(`${name}: ${err.message || '创建失败'}`)
      }
    }
    await fetchData()
    alert(`导入完成：成功 ${ok} 条，跳过 ${skip} 条，失败 ${fail} 条${messages.length ? '\n' + messages.slice(0, 8).join('\n') : ''}`)
  } catch (err: any) {
    alert('导入失败：' + (err.message || err))
  } finally {
    importBusy.value = false
    input.value = ''
  }
}

onMounted(fetchData)
</script>

<style scoped>
.bb-houseguests { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; gap: 12px; flex-wrap: wrap; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.header-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.upload-btn { position: relative; display: inline-flex; align-items: center; cursor: pointer; }
.upload-btn input[type="file"] { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
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
.havenot-tag { padding: 2px 10px; border-radius: 10px; font-size: 12px; background: #66aaff22; color: #66aaff; margin-right: 6px; }
.checkbox-row { display: flex; align-items: center; gap: 8px; color: #ccc; cursor: pointer; }
.checkbox-row input { width: 16px; height: 16px; accent-color: #00ff88; }
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
.avatar-edit-section { display: flex; align-items: center; gap: 16px; }
.avatar-buttons { display: flex; flex-direction: column; gap: 6px; }
.upload-label { position: relative; display: inline-block; text-align: center; }
.upload-label input[type="file"] { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.form-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; }
</style>
