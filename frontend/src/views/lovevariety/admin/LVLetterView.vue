<template>
  <div class="lv-admin-letters">
    <div class="page-header">
      <h1>信件管理</h1>
      <div class="header-actions">
        <button class="lv-btn" @click="showAddCountModal = true">✉ 增加寄信次数</button>
        <button class="lv-btn" @click="fetchLetters">刷新</button>
      </div>
    </div>

    <!-- 筛选条件 -->
    <div class="filter-bar">
      <div class="filter-group">
        <label>发出方</label>
        <select v-model="filterSenderId" class="lv-select">
          <option value="">全部</option>
          <option v-for="p in players" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>
      <div class="filter-group">
        <label>接收方</label>
        <select v-model="filterReceiverId" class="lv-select">
          <option value="">全部</option>
          <option v-for="p in players" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>
      <div class="filter-group">
        <label>关键词</label>
        <input v-model="filterKeyword" class="lv-input" placeholder="搜索内容/人名" @keyup.enter="fetchLetters" />
      </div>
      <button class="lv-btn lv-btn-primary" @click="fetchLetters">筛选</button>
    </div>

    <!-- 统计信息 -->
    <div class="stats-row">
      <div class="stat-card">
        <span class="stat-label">总信件数</span>
        <span class="stat-value">{{ totalLetters }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">当前页</span>
        <span class="stat-value">{{ currentPage }} / {{ totalPages }}</span>
      </div>
    </div>

    <!-- 选手寄信次数 -->
    <div class="letter-count-section">
      <h3>选手寄信次数</h3>
      <div class="count-grid">
        <div v-for="p in playersWithCount" :key="p.id" class="count-card">
          <LvAvatar :name="p.name" :avatar="p.avatar" size="sm" />
          <span class="count-name">{{ p.name }}</span>
          <div class="count-values">
            <span class="count-item">
              <span class="count-type">实名</span>
              <span class="count-value" :class="{ zero: (p.publicCount ?? 0) <= 0 }">{{ p.publicCount ?? 0 }}</span>
            </span>
            <span class="count-item">
              <span class="count-type">匿名</span>
              <span class="count-value" :class="{ zero: (p.anonCount ?? 0) <= 0 }">{{ p.anonCount ?? 0 }}</span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 信件列表 -->
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="letters.length === 0" class="empty-tip">暂无信件</div>
    <div v-else class="letter-list">
      <div v-for="letter in letters" :key="letter.id" class="letter-card">
        <div class="letter-header">
          <div class="letter-sender">
            <span class="label">发件人</span>
            <LvAvatar :name="letter.senderName" :avatar="letter.senderAvatar" size="sm" />
            <span class="value">{{ letter.senderName }}</span>
            <span v-if="letter.isAnonymous" class="anon-badge">匿名</span>
          </div>
          <div class="letter-arrow">→</div>
          <div class="letter-receiver">
            <span class="label">收件人</span>
            <LvAvatar :name="letter.receiverName" :avatar="letter.receiverAvatar" size="sm" />
            <span class="value">{{ letter.receiverName }}</span>
          </div>
          <span class="letter-time">{{ formatTime(letter.createdAt) }}</span>
        </div>
        <div class="letter-content">{{ letter.content }}</div>
        <div class="letter-footer">
          <span class="letter-round">第{{ letter.roundId?.replace('round-', '') || '?' }}轮</span>
          <button class="lv-btn lv-btn-sm lv-btn-danger" @click="confirmDelete(letter)">删除</button>
        </div>
      </div>
    </div>

    <!-- 分页 -->
    <div v-if="totalPages > 1" class="pagination">
      <button class="lv-btn lv-btn-sm" :disabled="currentPage <= 1" @click="changePage(currentPage - 1)">上一页</button>
      <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
      <button class="lv-btn lv-btn-sm" :disabled="currentPage >= totalPages" @click="changePage(currentPage + 1)">下一页</button>
    </div>

    <!-- 删除确认弹窗 -->
    <Teleport to="body">
      <div v-if="showDeleteConfirm" class="lv-modal-overlay" @click.self="showDeleteConfirm = false">
        <div class="lv-modal lv-modal-sm">
          <div class="lv-modal-header">
            <h3>确认删除</h3>
            <button class="close-btn" @click="showDeleteConfirm = false">✕</button>
          </div>
          <div class="lv-modal-body">
            <p class="confirm-text">确定要删除这封信件吗？</p>
            <p class="confirm-detail" v-if="deletingLetter">
              {{ deletingLetter.senderName }} → {{ deletingLetter.receiverName }}
            </p>
            <div v-if="proxyError" class="error-msg">{{ proxyError }}</div>
            <div class="form-actions">
              <button class="lv-btn" @click="showDeleteConfirm = false">取消</button>
              <button class="lv-btn lv-btn-danger" @click="handleDelete" :disabled="deletingLoading">
                {{ deletingLoading ? '删除中...' : '确认删除' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 增加寄信次数弹窗 -->
    <Teleport to="body">
      <div v-if="showAddCountModal" class="lv-modal-overlay" @click.self="showAddCountModal = false">
        <div class="lv-modal">
          <div class="lv-modal-header">
            <h3>增加寄信次数</h3>
            <button class="close-btn" @click="showAddCountModal = false">✕</button>
          </div>
          <div class="lv-modal-body">
            <div class="form-group">
              <label>类型</label>
              <div class="radio-group">
                <label class="radio-item">
                  <input type="radio" v-model="addCountType" value="public" />
                  实名
                </label>
                <label class="radio-item">
                  <input type="radio" v-model="addCountType" value="anonymous" />
                  匿名
                </label>
              </div>
            </div>
            <div class="form-group">
              <label>选择选手</label>
              <div class="checkbox-group">
                <label class="checkbox-item">
                  <input type="checkbox" v-model="selectAll" @change="toggleAll" />
                  全选（{{ activePlayers.length }}人）
                </label>
                <label v-for="p in activePlayers" :key="p.id" class="checkbox-item">
                  <input type="checkbox" v-model="selectedPlayerIds" :value="p.id" />
                  <LvAvatar :name="p.name" size="sm" />
                  {{ p.name }}
                </label>
              </div>
            </div>
            <div class="form-group">
              <label>增加次数</label>
              <input v-model.number="addCountAmount" type="number" class="lv-input" min="1" placeholder="请输入次数" />
            </div>
            <div class="form-actions">
              <button class="lv-btn" @click="showAddCountModal = false">取消</button>
              <button class="lv-btn lv-btn-primary" @click="handleAddCount" :disabled="addCountLoading">
                {{ addCountLoading ? '处理中...' : '确认增加' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { lvGetAllLetters, lvGetActivePlayers, lvAddLetterCount, lvDeleteLetter } from '../../../services/lovevarietyApi'
import type { LVLetter, LVPlayer } from '../../../types/lovevariety'
import LvAvatar from '../../../components/lovevariety/LvAvatar.vue'

const letters = ref<LVLetter[]>([])
const players = ref<{ id: string; name: string; publicCount: number; anonCount: number; avatar?: string | null }[]>([])
const loading = ref(false)

// 筛选
const filterSenderId = ref('')
const filterReceiverId = ref('')
const filterKeyword = ref('')
const currentPage = ref(1)
const totalLetters = ref(0)
const totalPages = ref(1)

// 增加次数弹窗
const showAddCountModal = ref(false)
const selectedPlayerIds = ref<string[]>([])
const selectAll = ref(false)
const addCountAmount = ref(1)
const addCountType = ref<'public' | 'anonymous'>('public')
const addCountLoading = ref(false)

// 删除确认
const showDeleteConfirm = ref(false)
const deletingLetter = ref<LVLetter | null>(null)
const deletingLoading = ref(false)
const proxyError = ref('')

const activePlayers = computed(() => players.value)

function confirmDelete(letter: LVLetter) {
  deletingLetter.value = letter
  showDeleteConfirm.value = true
  proxyError.value = ''
}

async function handleDelete() {
  if (!deletingLetter.value) return
  deletingLoading.value = true
  try {
    await lvDeleteLetter(deletingLetter.value.id)
    showDeleteConfirm.value = false
    deletingLetter.value = null
    await fetchLetters()
    await fetchPlayers()
  } catch (e: any) {
    console.error('删除信件失败:', e)
    proxyError.value = e.message || '删除失败'
    showDeleteConfirm.value = false
  } finally {
    deletingLoading.value = false
  }
}

async function fetchLetters() {
  loading.value = true
  try {
    const result = await lvGetAllLetters({
      senderId: filterSenderId.value || undefined,
      receiverId: filterReceiverId.value || undefined,
      keyword: filterKeyword.value || undefined,
      page: currentPage.value,
      pageSize: 50
    })
    letters.value = result.list
    totalLetters.value = result.total
    totalPages.value = result.totalPages
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function fetchPlayers() {
  try {
    const list = await lvGetActivePlayers()
    players.value = list.map(p => ({
      id: p.id, name: p.name,
      publicCount: (p as any).letterPublicCount ?? 0,
      anonCount: (p as any).letterAnonymousCount ?? 0,
      avatar: p.avatar
    }))
  } catch {}
}

const playersWithCount = computed(() => players.value)

function changePage(page: number) {
  currentPage.value = page
  fetchLetters()
}

function formatTime(t: string): string {
  if (!t) return ''
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function toggleAll() {
  if (selectAll.value) {
    selectedPlayerIds.value = activePlayers.value.map(p => p.id)
  } else {
    selectedPlayerIds.value = []
  }
}

async function handleAddCount() {
  if (addCountAmount.value < 1) return
  addCountLoading.value = true
  try {
    await lvAddLetterCount({
      playerIds: selectedPlayerIds.value.length > 0 ? selectedPlayerIds.value : undefined,
      amount: addCountAmount.value,
      letterType: addCountType.value
    })
    showAddCountModal.value = false
    selectedPlayerIds.value = []
    selectAll.value = false
    alert('寄信次数已增加')
  } catch (e: any) {
    alert(e.message)
  } finally {
    addCountLoading.value = false
  }
}

onMounted(() => {
  fetchPlayers()
  fetchLetters()
})
</script>

<style scoped>
.lv-admin-letters { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.header-actions { display: flex; gap: 8px; }
.lv-btn {
  background: transparent; border: 1px solid #ff69b444; color: #ff69b4;
  padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s;
}
.lv-btn:hover { background: #ff69b422; }
.lv-btn-primary { background: #ff69b422; border-color: #ff69b4; }
.lv-btn-sm { padding: 6px 16px; font-size: 13px; }
.lv-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.lv-input {
  background: #1a0f2e; border: 1px solid #ff69b422; color: #e0e0e0;
  padding: 8px 12px; border-radius: 6px; font-size: 14px; outline: none; width: 100%;
}
.lv-select {
  background: #1a0f2e; border: 1px solid #ff69b422; color: #e0e0e0;
  padding: 8px 12px; border-radius: 6px; font-size: 14px; outline: none; cursor: pointer;
}
.filter-bar {
  display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap;
  background: #1a0f2e; border: 1px solid #ff69b422; border-radius: 10px;
  padding: 16px 20px; margin-bottom: 16px;
}
.filter-group { display: flex; flex-direction: column; gap: 4px; min-width: 140px; }
.filter-group label { font-size: 12px; color: #888; }
.stats-row { display: flex; gap: 12px; margin-bottom: 16px; }
.stat-card {
  background: #1a0f2e; border: 1px solid #ff69b422; border-radius: 8px;
  padding: 12px 20px; display: flex; flex-direction: column; gap: 4px;
}
.stat-label { font-size: 11px; color: #888; text-transform: uppercase; }
.stat-value { font-size: 22px; font-weight: 700; color: #ff69b4; }
.loading { text-align: center; color: #888; padding: 40px; }
.letter-count-section { margin-bottom: 16px; }
.letter-count-section h3 { font-size: 14px; color: #e0e0e0; margin: 0 0 10px; }
.count-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.count-card {
  background: #1a0f2e; border: 1px solid #ff69b422; border-radius: 8px;
  padding: 8px 14px; display: flex; align-items: center; gap: 8px; min-width: 150px;
}
.count-name { font-size: 13px; color: #ccc; }
.count-values { display: flex; gap: 10px; margin-left: auto; }
.count-item { display: flex; align-items: center; gap: 4px; }
.count-type { font-size: 10px; color: #888; }
.count-value { font-size: 16px; font-weight: 700; color: #ff69b4; }
.count-value.zero { color: #ff4444; }
.empty-tip { text-align: center; color: #666; padding: 40px; }
.letter-list { display: flex; flex-direction: column; gap: 10px; }
.letter-card {
  background: #1a0f2e; border: 1px solid #ff69b422; border-radius: 10px;
  padding: 16px 20px; transition: all 0.2s;
}
.letter-card:hover { border-color: #ff69b444; }
.letter-header {
  display: flex; align-items: center; gap: 12px; margin-bottom: 10px; flex-wrap: wrap;
}
.letter-sender, .letter-receiver { display: flex; align-items: center; gap: 6px; }
.letter-sender .label, .letter-receiver .label { font-size: 11px; color: #888; }
.letter-sender .value, .letter-receiver .value { font-size: 14px; font-weight: 600; color: #e0e0e0; }
.letter-arrow { color: #ff69b4; font-size: 18px; }
.anon-badge { background: #ffaa0022; color: #ffaa00; font-size: 10px; padding: 1px 6px; border-radius: 6px; border: 1px solid #ffaa0044; }
.letter-time { margin-left: auto; font-size: 12px; color: #666; }
.letter-content {
  font-size: 14px; color: #ccc; line-height: 1.6;
  padding: 10px 12px; background: #0a0a1a; border-radius: 6px;
  margin-bottom: 8px;
}
.letter-footer { display: flex; justify-content: space-between; align-items: center; }
.letter-round { font-size: 11px; color: #555; }
.lv-btn-danger { border-color: #ff444488; color: #ff4444; }
.lv-btn-danger:hover { background: #ff444422; }
.pagination {
  display: flex; align-items: center; justify-content: center; gap: 16px;
  margin-top: 20px; padding: 16px;
}
.page-info { font-size: 14px; color: #888; }

/* 弹窗 */
.lv-modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.lv-modal {
  background: #2d1b4e; border: 1px solid #ff69b444;
  border-radius: 12px; width: 420px; max-width: 90vw; max-height: 80vh; overflow-y: auto;
}
.lv-modal-sm { width: 360px; }
.confirm-text { color: #e0e0e0; font-size: 15px; text-align: center; margin-bottom: 8px; }
.confirm-detail { color: #888; font-size: 13px; text-align: center; margin-bottom: 16px; }
.lv-modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px; border-bottom: 1px solid #ff69b422;
}
.lv-modal-header h3 { margin: 0; color: #ff69b4; font-size: 16px; }
.close-btn { background: none; border: none; color: #888; cursor: pointer; font-size: 18px; }
.lv-modal-body { padding: 20px; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 13px; color: #aaa; margin-bottom: 6px; }
.checkbox-group { max-height: 240px; overflow-y: auto; }
.checkbox-item {
  display: flex; align-items: center; gap: 8px; padding: 6px 0;
  font-size: 14px; color: #ccc; cursor: pointer;
}
.checkbox-item input[type="checkbox"] { accent-color: #ff69b4; }
.radio-group { display: flex; gap: 16px; }
.radio-item { display: flex; align-items: center; gap: 6px; font-size: 14px; color: #ccc; cursor: pointer; }
.radio-item input[type="radio"] { accent-color: #ff69b4; }
.form-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; }
.error-msg { text-align: center; color: #ff4444; font-size: 13px; margin-bottom: 12px; }
</style>
