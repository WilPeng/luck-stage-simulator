<template>
  <div class="player-profile">
    <!-- 个人信息头部 -->
    <div class="profile-header">
      <h1>{{ currentUser?.name }}</h1>
    </div>

    <!-- 头像区域 -->
    <div class="avatar-section">
      <div class="avatar-container" @click="triggerFileInput">
        <img v-if="avatarUrl" :src="avatarUrl" class="avatar-img" alt="头像" />
        <div v-else class="avatar-placeholder">
          <span class="avatar-emoji">{{ avatarEmoji }}</span>
        </div>
        <div class="avatar-overlay">
          <span class="overlay-icon">📷</span>
          <span class="overlay-text">点击更换</span>
        </div>
      </div>
      <div class="avatar-actions">
        <button class="upload-btn" @click="triggerFileInput">上传头像</button>
        <button v-if="currentUser?.avatar" class="delete-btn" @click="handleDeleteAvatar">删除头像</button>
      </div>
      <input
        ref="fileInput"
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/bmp"
        style="display: none"
        @change="handleFileChange"
      />
      <p class="avatar-hint">支持 JPG/PNG/GIF/WebP，最大 5MB</p>
    </div>

    <p class="subtitle">查看和管理你的舞台属性</p>

    <!-- 三个属性卡片 -->
    <div class="main-attributes">
      <div class="attr-card vocal-card">
        <span class="card-icon">🎤</span>
        <div class="card-info">
          <span class="attr-label">Vocal</span>
          <span class="attr-value">{{ currentUser?.attributes.vocal }}</span>
        </div>
        <div class="attr-bar-track">
          <div class="attr-bar vocal" :style="{ width: `${currentUser?.attributes.vocal}%` }"></div>
        </div>
        <span class="attr-description">声乐能力</span>
      </div>

      <div class="attr-card dance-card">
        <span class="card-icon">💃</span>
        <div class="card-info">
          <span class="attr-label">Dance</span>
          <span class="attr-value">{{ currentUser?.attributes.dance }}</span>
        </div>
        <div class="attr-bar-track">
          <div class="attr-bar dance" :style="{ width: `${currentUser?.attributes.dance}%` }"></div>
        </div>
        <span class="attr-description">舞蹈能力</span>
      </div>

      <div class="attr-card charm-card">
        <span class="card-icon">✨</span>
        <div class="card-info">
          <span class="attr-label">Charm</span>
          <span class="attr-value">{{ currentUser?.attributes.charm }}</span>
        </div>
        <div class="attr-bar-track">
          <div class="attr-bar charm" :style="{ width: `${currentUser?.attributes.charm}%` }"></div>
        </div>
        <span class="attr-description">舞台魅力</span>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-summary">
      <div class="summary-card">
        <span class="summary-icon">📊</span>
        <div class="summary-info">
          <span class="summary-label">属性总和</span>
          <span class="summary-value">{{ totalAttributes }}</span>
        </div>
      </div>

      <div class="summary-card">
        <span class="summary-icon">🏆</span>
        <div class="summary-info">
          <span class="summary-label">最高属性</span>
          <span class="summary-value">{{ highestAttr }}</span>
        </div>
      </div>

      <div class="summary-card">
        <span class="summary-icon">📉</span>
        <div class="summary-info">
          <span class="summary-label">最低属性</span>
          <span class="summary-value">{{ lowestAttr }}</span>
        </div>
      </div>

      <div class="summary-card">
        <span class="summary-icon">📈</span>
        <div class="summary-info">
          <span class="summary-label">平均属性</span>
          <span class="summary-value">{{ averageAttr }}</span>
        </div>
      </div>
    </div>

    <!-- 属性变化记录 -->
    <div class="card history-section">
      <div class="section-header">
        <span class="header-icon">📜</span>
        <h2 class="section-title">属性变化记录</h2>
      </div>

      <div class="history-list" v-if="trainingRecords.length > 0">
        <div v-for="record in trainingRecords" :key="record.id" class="history-item">
          <div class="history-header">
            <span class="record-card-name">{{ record.cardName }}</span>
            <span class="record-time">{{ record.createdAt }}</span>
          </div>
          <div class="effect-list">
            <span
              v-if="record.effect.vocal"
              class="effect-tag"
              :class="record.effect.vocal > 0 ? 'positive' : 'negative'"
            >
              Vocal {{ record.effect.vocal > 0 ? '+' : '' }}{{ record.effect.vocal }}
            </span>
            <span
              v-if="record.effect.dance"
              class="effect-tag"
              :class="record.effect.dance > 0 ? 'positive' : 'negative'"
            >
              Dance {{ record.effect.dance > 0 ? '+' : '' }}{{ record.effect.dance }}
            </span>
            <span
              v-if="record.effect.charm"
              class="effect-tag"
              :class="record.effect.charm > 0 ? 'positive' : 'negative'"
            >
              Charm {{ record.effect.charm > 0 ? '+' : '' }}{{ record.effect.charm }}
            </span>
          </div>
        </div>
      </div>

      <div class="empty-state" v-else>
        <p>暂无属性变化记录</p>
        <router-link :to="`/games/${authStore.currentGameId}/player/training`" class="go-train-btn">去训练</router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useAuthStore } from '../../stores/authStore'
import { useTrainingCardStore } from '../../stores/trainingCardStore'
import { uploadMyAvatar, deleteMyAvatar, getAvatarUrl } from '../../services/api'

const authStore = useAuthStore()
const trainingCardStore = useTrainingCardStore()

const currentUser = computed(() => authStore.currentUser)
const trainingRecords = computed(() => trainingCardStore.records)
const fileInput = ref<HTMLInputElement | null>(null)

const avatarUrl = computed(() => {
  return getAvatarUrl(currentUser.value?.avatar)
})

const avatarEmoji = computed(() => {
  const icons = ['🌟', '🎤', '💃', '✨', '🎵', '🎭', '🎨', '🎪']
  const name = currentUser.value?.name || ''
  if (!name) return '🎤'
  return icons[name.charCodeAt(0) % icons.length]
})

function triggerFileInput() {
  fileInput.value?.click()
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  // 验证文件类型
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp']
  if (!validTypes.includes(file.type)) {
    MessagePlugin.error('不支持的图片格式，请使用 JPG/PNG/GIF/WebP/BMP')
    return
  }

  // 验证文件大小 (5MB)
  if (file.size > 5 * 1024 * 1024) {
    MessagePlugin.error('图片大小不能超过 5MB')
    return
  }

  if (!currentUser.value) return

  try {
    MessagePlugin.loading('正在上传头像...')
    const result = await uploadMyAvatar(file)
    // 更新本地用户头像（接口返回 { avatar, userId }，不含完整 user 对象）
    if (result.avatar) {
      const updatedUser = { ...currentUser.value, avatar: result.avatar }
      authStore.updateUser(updatedUser as any)
    }
    MessagePlugin.success('头像上传成功')
  } catch (e: any) {
    MessagePlugin.error(e.message || '头像上传失败')
  } finally {
    // 清空 input 以便再次选择同一文件
    if (input) input.value = ''
  }
}

async function handleDeleteAvatar() {
  if (!currentUser.value) return

  try {
    MessagePlugin.loading('正在删除头像...')
    await deleteMyAvatar()
    // 更新当前用户信息
    const updatedUser = { ...currentUser.value, avatar: null }
    authStore.updateUser(updatedUser)
    MessagePlugin.success('头像已删除')
  } catch (e: any) {
    MessagePlugin.error(e.message || '删除头像失败')
  }
}

const totalAttributes = computed(() => {
  if (!currentUser.value) return 0
  return currentUser.value.attributes.vocal +
         currentUser.value.attributes.dance +
         currentUser.value.attributes.charm
})

const highestAttr = computed(() => {
  if (!currentUser.value) return '-'
  const { vocal, dance, charm } = currentUser.value.attributes
  const max = Math.max(vocal, dance, charm)
  if (max === vocal) return `Vocal ${max}`
  if (max === dance) return `Dance ${max}`
  return `Charm ${max}`
})

const lowestAttr = computed(() => {
  if (!currentUser.value) return '-'
  const { vocal, dance, charm } = currentUser.value.attributes
  const min = Math.min(vocal, dance, charm)
  if (min === vocal) return `Vocal ${min}`
  if (min === dance) return `Dance ${min}`
  return `Charm ${min}`
})

const averageAttr = computed(() => {
  if (!currentUser.value) return '-'
  return Math.round(totalAttributes.value / 3)
})

onMounted(async () => {
  if (currentUser.value) {
    await trainingCardStore.fetchRecords(currentUser.value.id)
  }
})
</script>

<style lang="scss" scoped>
.player-profile {
color: var(--text-primary);
}

.profile-header {
  margin-bottom: 16px;
  text-align: center;

  h1 {
    font-size: 20px;
    font-weight: 700;
    margin: 0 0 6px 0;
    background: linear-gradient(135deg, #ffd700, #ff6b6b);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .subtitle {
    color: var(--text-tertiary);
    margin: 0 0 16px 0;
    font-size: 12px;
  }
}

/* ── 头像区域 ── */
.avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.avatar-container {
  position: relative;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);

  &:hover {
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.98);
  }
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-emoji {
  font-size: 40px;
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
  gap: 4px;

  .avatar-container:hover & {
    opacity: 1;
  }

  .overlay-icon {
    font-size: 20px;
  }

  .overlay-text {
    color: var(--text-primary);
    font-size: 11px;
    font-weight: 500;
  }
}

.avatar-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.upload-btn,
.delete-btn {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.upload-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: var(--text-primary);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  &:active {
    transform: translateY(0);
  }
}

.delete-btn {
  background: var(--hover-bg);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);

  &:hover {
    background: rgba(231, 76, 60, 0.2);
    border-color: rgba(231, 76, 60, 0.4);
    color: #e74c3c;
  }
}

.avatar-hint {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
}

.card {
  background: var(--card-bg);
  border-radius: 12px;
  padding: 16px;
}

/* ── 三个属性卡片 ── */
.main-attributes {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-bottom: 12px;
}

.attr-card {
  background: var(--card-bg);
  border-radius: 12px;
  padding: 16px;
  border-left: 3px solid transparent;

  &.vocal-card { border-left-color: #ff6b6b; }
  &.dance-card { border-left-color: #4ecdc4; }
  &.charm-card { border-left-color: #a29bfe; }
}

.card-icon {
  font-size: 36px;
  display: block;
  margin-bottom: 8px;
}

.card-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.attr-label {
  color: var(--text-tertiary);
  font-size: 13px;
}

.attr-value {
  color: var(--text-primary);
  font-size: 24px;
  font-weight: 700;
}

.attr-bar-track {
  height: 6px;
  background: var(--progress-bg);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 6px;
}

.attr-bar {
  height: 100%;
  border-radius: 3px;
  transition: width 0.5s ease;

  &.vocal { background: linear-gradient(90deg, #ff6b6b, #ee5a24); }
  &.dance { background: linear-gradient(90deg, #4ecdc4, #44a08d); }
  &.charm { background: linear-gradient(90deg, #a29bfe, #6c5ce7); }
}

.attr-description {
  color: var(--text-muted);
  font-size: 11px;
}

/* ── 统计卡片 ── */
.stats-summary {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 12px;
}

.summary-card {
  background: var(--card-bg);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.summary-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.summary-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.summary-label {
  color: var(--text-tertiary);
  font-size: 11px;
}

.summary-value {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 历史记录 ── */
.history-section {
  margin-top: 4px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;

  .header-icon { font-size: 18px; }
  .section-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.history-item {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  padding: 12px;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.record-card-name {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 13px;
}

.record-time {
  color: var(--text-muted);
  font-size: 11px;
}

.effect-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.effect-tag {
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;

  &.positive {
    background: rgba(46, 204, 113, 0.15);
    color: #2ecc71;
    border: 1px solid rgba(46, 204, 113, 0.3);
  }

  &.negative {
    background: rgba(231, 76, 60, 0.15);
    color: #e74c3c;
    border: 1px solid rgba(231, 76, 60, 0.3);
  }
}

.empty-state {
  text-align: center;
  padding: 16px;

  p {
    color: var(--text-muted);
    font-size: 13px;
    margin: 0 0 12px 0;
  }
}

.go-train-btn {
  display: inline-block;
  padding: 8px 20px;
  background: linear-gradient(135deg, #a29bfe, #6c5ce7);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s;
}

/* ── 桌面端 (>= 769px) ── */
@media (min-width: 769px) {
  .profile-header {
    margin-bottom: 24px;
    h1 { font-size: 28px; margin-bottom: 8px; }
    .subtitle { font-size: 13px; }
  }

  .main-attributes {
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 16px;
  }

  .attr-card {
    padding: 24px;
    border-radius: 16px;
    border-left-width: 4px;
  }

  .card-icon { font-size: 48px; margin-bottom: 12px; }
  .card-info { margin-bottom: 12px; }
  .attr-label { font-size: 14px; }
  .attr-value { font-size: 28px; }
  .attr-bar-track { height: 8px; margin-bottom: 8px; }
  .attr-description { font-size: 12px; }

  .stats-summary {
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 16px;
  }

  .summary-card {
    padding: 20px;
    border-radius: 16px;
  }

  .summary-icon { font-size: 28px; }
  .summary-label { font-size: 12px; }
  .summary-value { font-size: 18px; }

  .card { padding: 24px; border-radius: 16px; }
  .history-section { margin-top: 0; }
  .section-header { margin-bottom: 20px; .section-title { font-size: 16px; } }
  .history-list { gap: 12px; }
  .history-item { padding: 16px; border-radius: 12px; }
  .record-card-name { font-size: 14px; }
  .effect-tag { font-size: 12px; padding: 3px 10px; }
}
</style>
