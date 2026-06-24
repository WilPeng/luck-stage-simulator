<template>
  <div class="admin-players">
    <!-- 头部搜索区 -->
    <div class="header-section">
      <div class="header-title">
        <h1>玩家管理</h1>
        <span class="total-count">共 {{ playerStore.total }} 人</span>
      </div>
      
      <div class="search-bar">
        <t-input
          v-model="searchKeyword"
          placeholder="搜索选手姓名/登录码"
          clearable
          @enter="handleSearch"
        >
          <template #suffix>
            <t-button size="small" theme="primary" @click="handleSearch">搜索</t-button>
          </template>
        </t-input>
      </div>
      
      <div class="filter-row">
        <t-select
          v-model="filterRole"
          placeholder="身份"
          clearable
          @change="handleFilterChange"
          class="filter-item"
        >
          <t-option value="captain" label="队长" />
          <t-option value="player" label="队员" />
        </t-select>
        <t-select
          v-model="filterStatus"
          placeholder="状态"
          clearable
          @change="handleFilterChange"
          class="filter-item"
        >
          <t-option value="active" label="安全" />
          <t-option value="danger" label="危险" />
          <t-option value="eliminated" label="已淘汰" />
        </t-select>
        <t-button theme="primary" @click="openEditDialog()" class="add-btn">
          <template #icon><AddIcon /></template>
          新增
        </t-button>
      </div>
    </div>

    <!-- 移动端卡片列表 -->
    <div class="player-list">
      <div 
        v-for="player in playerStore.users" 
        :key="player.id" 
        class="player-card"
        @click="handleView(player)"
      >
        <div class="card-header">
          <div class="player-avatar">
            <img v-if="player.avatar" :src="getAvatarUrl(player.avatar)" class="avatar-img" :alt="player.name" />
            <span v-else>{{ getAvatar(player.name) }}</span>
          </div>
          <div class="player-info">
            <div class="player-name">{{ player.name }}</div>
            <div class="player-meta">
              <t-tag theme="primary" variant="outline" size="small">{{ player.loginCode }}</t-tag>
              <t-tag :theme="getRoleTheme(player.role)" variant="light" size="small">
                {{ getRoleText(player.role) }}
              </t-tag>
            </div>
          </div>
          <t-tag :theme="getStatusTheme(player.status)" variant="light" size="small" class="status-tag">
            {{ getStatusText(player.status) }}
          </t-tag>
        </div>
        
        <div class="card-body">
          <div class="attr-row">
            <div class="attr-item">
              <span class="attr-label">Vocal</span>
              <span class="attr-value vocal">{{ player.attributes?.vocal || 0 }}</span>
            </div>
            <div class="attr-item">
              <span class="attr-label">Dance</span>
              <span class="attr-value dance">{{ player.attributes?.dance || 0 }}</span>
            </div>
            <div class="attr-item">
              <span class="attr-label">Charm</span>
              <span class="attr-value charm">{{ player.attributes?.charm || 0 }}</span>
            </div>
          </div>
          
          <div class="card-footer">
            <span class="team-info">{{ getTeamName(player.teamId) || '未组队' }}</span>
            <span class="login-status" :class="{ logged: player.hasLogin }">
              {{ player.hasLogin ? '已登录' : '未登录' }}
            </span>
          </div>
        </div>
        
        <div class="card-actions" @click.stop>
          <t-button theme="primary" variant="text" size="small" @click="openEditDialog(player)">
            编辑
          </t-button>
          <t-popconfirm content="确认删除?" @confirm="handleDelete(player)">
            <t-button theme="danger" variant="text" size="small" :disabled="player.role === 'admin'">
              删除
            </t-button>
          </t-popconfirm>
        </div>
      </div>
      
      <!-- 空状态 -->
      <div v-if="!playerStore.loading && playerStore.users.length === 0" class="empty-state">
        <span class="empty-icon">📭</span>
        <span class="empty-text">暂无选手数据</span>
      </div>
      
      <!-- 加载状态 -->
      <div v-if="playerStore.loading" class="loading-state">
        <t-loading text="加载中..." />
      </div>
    </div>

    <!-- 分页 -->
    <div class="pagination-section" v-if="playerStore.total > 0">
      <t-pagination
        v-model="currentPage"
        :total="playerStore.total"
        :page-size="playerStore.pageSize"
        :page-size-options="[10, 20, 50]"
        show-page-size
        @change="onPageChange"
        @page-size-change="onPageSizeChange"
      />
    </div>

    <!-- 查看详情弹窗 -->
    <t-dialog
      v-model:visible="showDetail"
      header="选手详情"
      width="90%"
      :close-on-overlay-click="true"
      :destroy-on-close="true"
    >
      <div class="detail-content" v-if="selectedPlayer">
        <div class="detail-header">
          <div class="detail-avatar">
            <img v-if="selectedPlayer.avatar" :src="getAvatarUrl(selectedPlayer.avatar)" class="avatar-img" :alt="selectedPlayer.name" />
            <span v-else>{{ getAvatar(selectedPlayer.name) }}</span>
          </div>
          <div class="detail-name">{{ selectedPlayer.name }}</div>
          <t-tag :theme="getStatusTheme(selectedPlayer.status)" variant="light">
            {{ getStatusText(selectedPlayer.status) }}
          </t-tag>
        </div>
        
        <div class="detail-section">
          <div class="detail-item">
            <span class="detail-label">登录码</span>
            <span class="detail-value">{{ selectedPlayer.loginCode }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">身份</span>
            <span class="detail-value">{{ getRoleText(selectedPlayer.role) }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">队伍</span>
            <span class="detail-value">{{ getTeamName(selectedPlayer.teamId) || '未组队' }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">训练次数</span>
            <span class="detail-value">{{ selectedPlayer.trainingCount || 0 }} 次</span>
          </div>
        </div>
        
        <div class="attr-section">
          <div class="attr-title">属性值</div>
          <div class="attr-bars">
            <div class="attr-bar-item">
              <span class="attr-name">Vocal</span>
              <div class="attr-bar">
                <div class="attr-bar-fill vocal" :style="{ width: (selectedPlayer.attributes?.vocal || 0) + '%' }"></div>
              </div>
              <span class="attr-num">{{ selectedPlayer.attributes?.vocal || 0 }}</span>
            </div>
            <div class="attr-bar-item">
              <span class="attr-name">Dance</span>
              <div class="attr-bar">
                <div class="attr-bar-fill dance" :style="{ width: (selectedPlayer.attributes?.dance || 0) + '%' }"></div>
              </div>
              <span class="attr-num">{{ selectedPlayer.attributes?.dance || 0 }}</span>
            </div>
            <div class="attr-bar-item">
              <span class="attr-name">Charm</span>
              <div class="attr-bar">
                <div class="attr-bar-fill charm" :style="{ width: (selectedPlayer.attributes?.charm || 0) + '%' }"></div>
              </div>
              <span class="attr-num">{{ selectedPlayer.attributes?.charm || 0 }}</span>
            </div>
          </div>
        </div>
      </div>
    </t-dialog>

    <!-- 新增/编辑选手弹窗 -->
    <t-dialog
      v-model:visible="showEditDialog"
      :header="isEditMode ? '编辑选手' : '新增选手'"
      width="90%"
      :close-on-overlay-click="true"
      :destroy-on-close="true"
      @confirm="handleSave"
    >
      <t-form ref="formRef" :data="editFormData" :rules="formRules" label-align="top">
        <div class="edit-avatar-section">
          <div class="edit-avatar-preview" @click="triggerEditFileInput">
            <img v-if="editAvatarUrl" :src="editAvatarUrl" class="avatar-img" alt="头像" />
            <div v-else class="avatar-placeholder">
              <span class="avatar-emoji">{{ getAvatar(editFormData.name) }}</span>
            </div>
            <div class="avatar-overlay">
              <span class="overlay-icon">📷</span>
              <span class="overlay-text">点击更换</span>
            </div>
          </div>
          <div class="edit-avatar-actions">
            <t-button size="small" theme="primary" variant="outline" @click="triggerEditFileInput">上传头像</t-button>
            <t-button v-if="editFormData.avatar" size="small" theme="danger" variant="outline" @click="handleDeleteEditAvatar">删除</t-button>
          </div>
          <input
            ref="editFileInput"
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/bmp"
            style="display: none"
            @change="handleEditFileChange"
          />
          <p class="avatar-hint">支持 JPG/PNG/GIF/WebP，最大 5MB</p>
        </div>
        <t-form-item label="姓名" name="name">
          <t-input v-model="editFormData.name" placeholder="请输入选手姓名" />
        </t-form-item>
        <t-form-item label="登录码" name="loginCode">
          <t-input v-model="editFormData.loginCode" placeholder="请输入登录码" />
        </t-form-item>
        <t-row :gutter="16">
          <t-col :span="6">
            <t-form-item label="身份" name="role">
              <t-select v-model="editFormData.role" placeholder="选择">
                <t-option value="player" label="队员" />
                <t-option value="captain" label="队长" />
              </t-select>
            </t-form-item>
          </t-col>
          <t-col :span="6">
            <t-form-item label="状态" name="status">
              <t-select v-model="editFormData.status" placeholder="选择">
                <t-option value="active" label="安全" />
                <t-option value="danger" label="危险" />
                <t-option value="eliminated" label="淘汰" />
              </t-select>
            </t-form-item>
          </t-col>
        </t-row>
        <t-form-item label="队伍">
          <t-select v-model="editFormData.teamId" placeholder="选择队伍(可选)" clearable>
            <t-option v-for="team in teamStore.teams" :key="team.id" :value="team.id" :label="team.name" />
          </t-select>
        </t-form-item>
        
        <div class="attr-input-section">
          <div class="attr-input-title">属性设置</div>
          <div class="attr-inputs">
            <div class="attr-input-item">
              <label>Vocal</label>
              <t-input-number v-model="editFormData.attributes.vocal" :min="0" :max="999" :step="1" style="width: 120px" />
            </div>
            <div class="attr-input-item">
              <label>Dance</label>
              <t-input-number v-model="editFormData.attributes.dance" :min="0" :max="999" :step="1" style="width: 120px" />
            </div>
            <div class="attr-input-item">
              <label>Charm</label>
              <t-input-number v-model="editFormData.attributes.charm" :min="0" :max="999" :step="1" style="width: 120px" />
            </div>
          </div>
        </div>
      </t-form>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { usePlayerStore } from '../../stores/playerStore'
import { useTeamStore } from '../../stores/teamStore'
import { getAvatarUrl, uploadAvatar, deleteAvatar } from '../../services/api'
import type { User } from '../../types/user'
import type { FormRule } from 'tdesign-vue-next'
import { AddIcon } from 'tdesign-icons-vue-next'

const playerStore = usePlayerStore()
const teamStore = useTeamStore()

const searchKeyword = ref('')
const filterRole = ref('')
const filterStatus = ref('')
const showDetail = ref(false)
const showEditDialog = ref(false)
const isEditMode = ref(false)
const selectedPlayer = ref<User | null>(null)
const currentPage = ref(1)

const editFormData = reactive({
  id: '',
  name: '',
  loginCode: '',
  role: 'player' as 'player' | 'captain',
  status: 'active' as 'active' | 'danger' | 'eliminated',
  teamId: null as string | null,
  avatar: null as string | null,
  attributes: {
    vocal: 30,
    dance: 30,
    charm: 30
  }
})

const editFileInput = ref<HTMLInputElement | null>(null)
const editAvatarUrl = computed(() => getAvatarUrl(editFormData.avatar))

const formRules: Record<string, FormRule[]> = {
  name: [{ required: true, message: '姓名不能为空', type: 'error' }],
  loginCode: [{ required: true, message: '登录码不能为空', type: 'error' }]
}

function getAvatar(name?: string): string {
  const icons = ['🌟', '🎤', '💃', '✨', '🎵', '🎭', '🎨', '🎪']
  if (!name) return '🎤'
  return icons[name.charCodeAt(0) % icons.length]
}

function getRoleText(role?: string): string {
  const texts: Record<string, string> = { captain: '队长', player: '队员', admin: '管理员' }
  return texts[role || ''] || '未知'
}

function getRoleTheme(role?: string): 'primary' | 'warning' | 'danger' | 'default' {
  const themes: Record<string, 'primary' | 'warning' | 'danger' | 'default'> = {
    captain: 'warning', player: 'primary', admin: 'danger'
  }
  return themes[role || ''] || 'primary'
}

function getStatusText(status?: string): string {
  const texts: Record<string, string> = { active: '安全', danger: '危险', eliminated: '已淘汰' }
  return texts[status || ''] || '未知'
}

function getStatusTheme(status?: string): 'success' | 'warning' | 'danger' | 'default' {
  const themes: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
    active: 'success', danger: 'warning', eliminated: 'danger'
  }
  return themes[status || ''] || 'default'
}

function getTeamName(teamId?: string): string {
  if (!teamId) return ''
  const team = teamStore.getTeamById(teamId)
  return team?.name || ''
}

async function loadData() {
  await playerStore.fetchUsersWithPagination({
    keyword: searchKeyword.value || undefined,
    role: filterRole.value || undefined,
    status: filterStatus.value || undefined
  })
}

async function handleSearch() {
  currentPage.value = 1
  playerStore.setPage(1)
  await loadData()
}

async function handleFilterChange() {
  currentPage.value = 1
  playerStore.setPage(1)
  await loadData()
}

async function onPageChange(pageInfo: { current: number }) {
  currentPage.value = pageInfo.current
  playerStore.setPage(pageInfo.current)
  await loadData()
}

async function onPageSizeChange(pageSize: number) {
  playerStore.setPageSize(pageSize)
  await loadData()
}

function handleView(player: User) {
  selectedPlayer.value = player
  showDetail.value = true
}

function openEditDialog(player?: User) {
  if (player) {
    isEditMode.value = true
    editFormData.id = player.id
    editFormData.name = player.name
    editFormData.loginCode = player.loginCode
    editFormData.role = player.role as 'player' | 'captain'
    editFormData.status = player.status as 'active' | 'danger' | 'eliminated'
    editFormData.teamId = player.teamId || null
    editFormData.avatar = player.avatar || null
    editFormData.attributes = {
      vocal: player.attributes?.vocal || 30,
      dance: player.attributes?.dance || 30,
      charm: player.attributes?.charm || 30
    }
  } else {
    isEditMode.value = false
    editFormData.id = ''
    editFormData.name = ''
    editFormData.loginCode = ''
    editFormData.role = 'player'
    editFormData.status = 'active'
    editFormData.teamId = null
    editFormData.avatar = null
    editFormData.attributes = { vocal: 30, dance: 30, charm: 30 }
  }
  showEditDialog.value = true
}

function triggerEditFileInput() {
  editFileInput.value?.click()
}

async function handleEditFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  // 验证文件类型
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp']
  if (!validTypes.includes(file.type.toLowerCase())) {
    MessagePlugin.error('只支持 JPG/PNG/GIF/WebP/BMP 格式')
    target.value = ''
    return
  }

  // 验证文件大小 (5MB)
  if (file.size > 5 * 1024 * 1024) {
    MessagePlugin.error('文件大小不能超过 5MB')
    target.value = ''
    return
  }

  try {
    if (isEditMode.value && editFormData.id) {
      const result = await uploadAvatar(editFormData.id, file)
      editFormData.avatar = result.avatar
      MessagePlugin.success('头像上传成功')
    } else {
      // 新建模式下先预览，保存后再上传
      const reader = new FileReader()
      reader.onload = (ev) => {
        editFormData.avatar = ev.target?.result as string
      }
      reader.readAsDataURL(file)
      // 暂存文件，保存后上传
      ;(editFormData as any)._pendingAvatarFile = file
    }
  } catch (err: any) {
    MessagePlugin.error(err.message || '头像上传失败')
  }
  target.value = ''
}

async function handleDeleteEditAvatar() {
  try {
    if (isEditMode.value && editFormData.id) {
      await deleteAvatar(editFormData.id)
    }
    editFormData.avatar = null
    MessagePlugin.success('头像已删除')
  } catch (err: any) {
    MessagePlugin.error(err.message || '删除头像失败')
  }
}

async function handleSave() {
  try {
    const data: Record<string, any> = {
      name: editFormData.name,
      loginCode: editFormData.loginCode,
      role: editFormData.role,
      status: editFormData.status,
      teamId: editFormData.teamId || undefined,
      attributes: editFormData.attributes
    }

    if (isEditMode.value) {
      await playerStore.updateUser({ id: editFormData.id, ...data })
      MessagePlugin.success('选手信息已更新')
    } else {
      const result = await playerStore.createUser(data as any)
      // 新建模式下，如果有暂存的头像文件，上传它
      const pendingFile = (editFormData as any)._pendingAvatarFile as File | undefined
      if (pendingFile && result?.id) {
        try {
          await uploadAvatar(result.id, pendingFile)
        } catch (avatarErr) {
          MessagePlugin.warning('选手已创建，但头像上传失败')
        }
      }
      MessagePlugin.success('选手创建成功')
    }
    showEditDialog.value = false
    await loadData()
  } catch (e: any) {
    MessagePlugin.error(e.message || '操作失败')
  }
}

async function handleDelete(player: User) {
  try {
    await playerStore.deleteUser(player.id)
    MessagePlugin.success(`${player.name} 已删除`)
    await loadData()
  } catch (e: any) {
    MessagePlugin.error(e.message || '删除失败')
  }
}

onMounted(async () => {
  await teamStore.fetchTeams()
  await loadData()
})
</script>

<style lang="scss" scoped>
.admin-players {
  background: #f5f7fa;
  padding: 12px;
  min-height: 100%;
  padding-bottom: env(safe-area-inset-bottom, 20px);
}

.header-section {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.header-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  
  h1 {
    font-size: 20px;
    font-weight: 700;
    margin: 0;
    color: #000;
  }
  
  .total-count {
    font-size: 14px;
    color: rgba(0, 0, 0, 0.5);
  }
}

.search-bar {
  margin-bottom: 12px;
}

.filter-row {
  display: flex;
  gap: 8px;
  align-items: center;
  
  .filter-item {
    flex: 1;
    min-width: 0;
  }
  
  .add-btn {
    flex-shrink: 0;
  }
}

.player-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.player-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  
  &:active {
    transform: scale(0.98);
  }
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.player-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
  overflow: hidden;

  .avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.player-info {
  flex: 1;
  min-width: 0;
}

.player-name {
  font-size: 16px;
  font-weight: 600;
  color: #000;
  margin-bottom: 4px;
}

.player-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.status-tag {
  flex-shrink: 0;
}

.card-body {
  border-top: 1px solid #f0f0f0;
  padding-top: 12px;
}

.attr-row {
  display: flex;
  justify-content: space-around;
  margin-bottom: 12px;
}

.attr-item {
  text-align: center;
  
  .attr-label {
    display: block;
    font-size: 12px;
    color: rgba(0, 0, 0, 0.5);
    margin-bottom: 4px;
  }
  
  .attr-value {
    font-size: 18px;
    font-weight: 600;
    
    &.vocal { color: #e34d59; }
    &.dance { color: #00a870; }
    &.charm { color: #ed7b2f; }
  }
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  
  .team-info {
    color: rgba(0, 0, 0, 0.6);
  }
  
  .login-status {
    color: rgba(0, 0, 0, 0.4);
    
    &.logged {
      color: #00a870;
    }
  }
}

.card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
}

.empty-state, .loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
  
  .empty-icon {
    font-size: 48px;
    margin-bottom: 12px;
  }
  
  .empty-text {
    font-size: 14px;
    color: rgba(0, 0, 0, 0.4);
  }
}

.pagination-section {
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  margin-top: 12px;
  
  :deep(.t-pagination) {
    justify-content: center;
  }
}

// 详情弹窗样式
.detail-content {
  padding: 0 4px;
}

.detail-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
  border-bottom: 1px solid #f0f0f0;
  
  .detail-avatar {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
    margin-bottom: 12px;
    overflow: hidden;

    .avatar-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }
  
  .detail-name {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 8px;
  }
}

.detail-section {
  padding: 16px 0;
  border-bottom: 1px solid #f0f0f0;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  
  .detail-label {
    color: rgba(0, 0, 0, 0.5);
    font-size: 14px;
  }
  
  .detail-value {
    font-size: 14px;
    color: #000;
  }
}

.attr-section {
  padding: 16px 0;
  
  .attr-title {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 16px;
  }
}

.attr-bars {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.attr-bar-item {
  display: flex;
  align-items: center;
  gap: 12px;
  
  .attr-name {
    width: 50px;
    font-size: 13px;
    color: rgba(0, 0, 0, 0.6);
  }
  
  .attr-bar {
    flex: 1;
    height: 8px;
    background: #f0f0f0;
    border-radius: 4px;
    overflow: hidden;
    
    .attr-bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s;
      
      &.vocal { background: linear-gradient(90deg, #e34d59, #f78ba7); }
      &.dance { background: linear-gradient(90deg, #00a870, #8fd4a0); }
      &.charm { background: linear-gradient(90deg, #ed7b2f, #ffcbae); }
    }
  }
  
  .attr-num {
    width: 30px;
    text-align: right;
    font-size: 13px;
    font-weight: 600;
  }
}

// 编辑表单属性输入
.attr-input-section {
  margin-top: 16px;
  
  .attr-input-title {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 12px;
  }
  
  .attr-inputs {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  
  .attr-input-item {
    label {
      display: block;
      font-size: 13px;
      color: rgba(0, 0, 0, 0.6);
      margin-bottom: 8px;
    }
    
    .attr-input-value {
      display: block;
      text-align: center;
      font-size: 16px;
      font-weight: 600;
      margin-top: 4px;
    }
  }
}

.edit-avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 20px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 12px;
}

.edit-avatar-preview {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  overflow: hidden;
  cursor: pointer;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;

  .avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;

    .avatar-emoji {
      font-size: 36px;
    }
  }

  .avatar-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s;

    .overlay-icon {
      font-size: 24px;
      margin-bottom: 4px;
    }

    .overlay-text {
      font-size: 12px;
      color: #fff;
    }
  }

  &:hover .avatar-overlay {
    opacity: 1;
  }
}

.edit-avatar-actions {
  display: flex;
  gap: 8px;
}

.avatar-hint {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.4);
  margin-top: 8px;
}

// 桌面端适配
@media (min-width: 768px) {
  .admin-players {
    padding: 24px;
  }
  
  .header-section {
    padding: 20px 24px;
  }
  
  .player-list {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }
}

@media (min-width: 1024px) {
  .player-list {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
