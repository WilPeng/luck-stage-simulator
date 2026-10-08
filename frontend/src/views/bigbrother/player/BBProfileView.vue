<template>
  <div class="bb-profile">
    <div class="page-header">
      <h1>我的资料</h1>
    </div>

    <div class="profile-card">
      <label class="profile-avatar-wrap" title="点击更换头像">
        <BBAvatar :name="user?.name || '?'" :avatar="user?.avatar" size="lg" />
        <div class="avatar-overlay">📷</div>
        <input type="file" accept="image/*" hidden @change="onAvatarFile" />
      </label>
      <div class="profile-info">
        <div class="profile-name">{{ user?.name }}</div>
        <div class="profile-code">账号: {{ user?.username }}</div>
        <div class="profile-status">
          <span class="status-tag" :class="user?.status">{{ statusText }}</span>
        </div>
        <div class="avatar-actions">
          <button class="bb-btn-xs" @click="triggerUpload">更换头像</button>
          <button v-if="user?.avatar" class="bb-btn-xs bb-btn-danger-xs" @click="handleDeleteAvatar">删除头像</button>
        </div>
      </div>
    </div>

    <div class="info-section">
      <h3>基本信息</h3>
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">角色</span>
          <span class="info-value">{{ user?.role === 'admin' ? '管理员' : '房客' }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">状态</span>
          <span class="info-value">{{ statusText }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">账号</span>
          <span class="info-value"><code>{{ user?.username }}</code></span>
        </div>
      </div>
    </div>

    <div class="info-section password-section">
      <h3>账号安全</h3>
      <div class="pwd-form">
        <div class="pwd-row">
          <label>账号</label>
          <input class="bb-input" :value="user?.username" disabled />
        </div>
        <div class="pwd-row">
          <label>原密码</label>
          <input v-model="oldPwd" type="password" class="bb-input" placeholder="请输入原密码" autocomplete="current-password" />
        </div>
        <div class="pwd-row">
          <label>新密码</label>
          <input v-model="newPwd" type="password" class="bb-input" placeholder="至少 4 位" autocomplete="new-password" />
        </div>
        <div class="pwd-row">
          <label>确认新密码</label>
          <input v-model="newPwd2" type="password" class="bb-input" placeholder="再次输入新密码" autocomplete="new-password" />
        </div>
        <button class="bb-btn-xs" :disabled="pwdSaving" @click="changePwd">{{ pwdSaving ? '提交中...' : '修改密码' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import { bbUploadMyAvatar, bbDeleteMyAvatar, bbChangePassword } from '../../../services/bbApi'
import BBAvatar from '../../../components/bigbrother/BBAvatar.vue'

const authStore = useBbAuthStore()
const user = computed(() => authStore.currentUser)
const fileInput = ref<HTMLInputElement | null>(null)

const oldPwd = ref('')
const newPwd = ref('')
const newPwd2 = ref('')
const pwdSaving = ref(false)

const statusText = computed(() => {
  const map: Record<string, string> = { active: '活跃', evicted: '已淘汰', jury: '陪审团', f2: '决赛二人' }
  return map[user.value?.status || ''] || user.value?.status || ''
})

async function changePwd() {
  if (!oldPwd.value || !newPwd.value) { alert('请填写原密码与新密码'); return }
  if (newPwd.value.length < 4) { alert('新密码至少 4 位'); return }
  if (newPwd.value !== newPwd2.value) { alert('两次输入的新密码不一致'); return }
  pwdSaving.value = true
  try {
    await bbChangePassword(oldPwd.value, newPwd.value)
    alert('密码修改成功')
    oldPwd.value = ''
    newPwd.value = ''
    newPwd2.value = ''
  } catch (err: any) {
    alert(err.message || '修改失败')
  } finally {
    pwdSaving.value = false
  }
}

function triggerUpload() {
  const el = document.querySelector('.profile-avatar-wrap input[type="file"]') as HTMLInputElement
  if (el) el.click()
}

async function onAvatarFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const result = await bbUploadMyAvatar(file, user.value?.id)
    if (user.value) {
      authStore.currentUser = { ...user.value, avatar: result.avatar }
    }
  } catch (err: any) { alert(err.message) }
  input.value = ''
}

async function handleDeleteAvatar() {
  if (!confirm('确定删除头像吗？')) return
  try {
    await bbDeleteMyAvatar(user.value?.id)
    if (user.value) {
      authStore.currentUser = { ...user.value, avatar: null }
    }
  } catch (err: any) { alert(err.message) }
}
</script>

<style scoped>
.bb-profile { max-width: 600px; margin: 0 auto; }
.page-header { margin-bottom: 24px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.profile-card { background: linear-gradient(135deg, #0f0f2e, #1a1a3e); border: 1px solid #00ff8822; border-radius: 12px; padding: 24px; display: flex; align-items: center; gap: 20px; margin-bottom: 20px; }
.profile-avatar-wrap { position: relative; cursor: pointer; flex-shrink: 0; }
.avatar-overlay { position: absolute; inset: 0; border-radius: 50%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; font-size: 20px; opacity: 0; transition: opacity 0.2s; }
.profile-avatar-wrap:hover .avatar-overlay { opacity: 1; }
.profile-name { font-size: 20px; font-weight: 600; color: #fff; }
.profile-code { font-size: 13px; color: #888; margin-top: 4px; }
.profile-status { margin-top: 8px; }
.avatar-actions { margin-top: 8px; display: flex; gap: 8px; }
.bb-btn-xs { background: transparent; border: 1px solid #00ff8844; color: #00ff88; padding: 4px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; transition: all 0.2s; }
.bb-btn-xs:hover { background: #00ff8822; }
.bb-btn-danger-xs { border-color: #ff4444; color: #ff4444; }
.bb-btn-danger-xs:hover { background: #ff444422; }
.status-tag { padding: 2px 10px; border-radius: 10px; font-size: 12px; }
.status-tag.active { background: #00ff8822; color: #00ff88; }
.status-tag.evicted { background: #ff444422; color: #ff4444; }
.status-tag.jury { background: #ffaa0022; color: #ffaa00; }
.status-tag.f2 { background: #a855f722; color: #c084fc; }
.info-section { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 20px; }
.info-section h3 { margin: 0 0 16px; font-size: 16px; color: #e0e0e0; }
.info-grid { display: flex; flex-direction: column; gap: 12px; }
.info-item { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #00ff8811; }
.info-item:last-child { border-bottom: none; }
.info-label { font-size: 14px; color: #888; }
.info-value { font-size: 14px; color: #e0e0e0; font-weight: 500; }
.info-value code { background: #00ff8815; color: #00ff88; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.password-section { margin-top: 20px; }
.pwd-form { display: flex; flex-direction: column; gap: 12px; }
.pwd-row { display: flex; flex-direction: column; gap: 6px; }
.pwd-row label { font-size: 13px; color: #888; }
.bb-input { background: #0a0a24; border: 1px solid #00ff8833; color: #e0e0e0; padding: 8px 12px; border-radius: 6px; font-size: 14px; outline: none; }
.bb-input:disabled { opacity: 0.6; }
.bb-input:focus { border-color: #00ff88; }
.pwd-form .bb-btn-xs { align-self: flex-start; }
</style>
