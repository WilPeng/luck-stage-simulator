<template>
  <div class="pc-pools">
    <div class="page-header">
      <h1>💪 题目池管理</h1>
      <button class="bb-btn bb-btn-primary" @click="openCreate">新建题目池</button>
    </div>

    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <span>加载中...</span>
    </div>

    <div v-else-if="pools.length === 0" class="empty-state">
      <span class="empty-icon">💪</span>
      <span>暂无题目池，点击上方按钮创建</span>
    </div>

    <div v-else class="pool-list">
      <div v-for="pool in pools" :key="pool.id" class="pool-card">
        <div class="pool-info">
          <div class="pool-name">{{ pool.name }}</div>
          <div class="pool-theme">主题：{{ pool.theme }}</div>
          <div class="pool-meta">
            <span class="tag">{{ pool.questions.length }} 题</span>
            <span class="tag" :class="pool.enabled ? 'tag-ok' : 'tag-off'">{{ pool.enabled ? '启用' : '禁用' }}</span>
          </div>
        </div>
        <div class="pool-actions">
          <button class="bb-btn-xs" :class="pool.enabled ? 'btn-warn' : 'btn-success'" @click="toggle(pool)">
            {{ pool.enabled ? '禁用' : '启用' }}
          </button>
          <button class="bb-btn-xs btn-edit" @click="openEdit(pool)">编辑</button>
          <button class="bb-btn-xs btn-danger" @click="remove(pool)">删除</button>
        </div>
      </div>
    </div>

    <!-- 编辑器弹窗 -->
    <PowerChallengeEditor
      v-if="showEditor"
      :pool="editingPool"
      @save="onSave"
      @close="showEditor = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { pcGetPools, pcTogglePool, pcDeletePool } from '../../../services/pcApi'
import type { PCPowerChallenge } from '../../../types/powerchallenge'
import PowerChallengeEditor from '../../../components/bigbrother/admin/PowerChallengeEditor.vue'

const pools = ref<PCPowerChallenge[]>([])
const loading = ref(false)
const showEditor = ref(false)
const editingPool = ref<PCPowerChallenge>({} as PCPowerChallenge)

async function loadPools() {
  loading.value = true
  try { pools.value = await pcGetPools() } catch {}
  loading.value = false
}

function openCreate() {
  editingPool.value = {
    id: '', gameId: 'powerchallenge', name: '实力大挑战', theme: '',
    questions: [{ id: crypto.randomUUID(), text: '', options: ['A', 'B'], correctAnswer: '' }],
    enabled: true, createdAt: '', updatedAt: new Date().toISOString()
  }
  showEditor.value = true
}

function openEdit(pool: PCPowerChallenge) {
  editingPool.value = { ...pool }
  showEditor.value = true
}

async function toggle(pool: PCPowerChallenge) {
  try { await pcTogglePool(pool.id); await loadPools() } catch {}
}

async function remove(pool: PCPowerChallenge) {
  if (!confirm(`确认删除题目池 "${pool.name}"？`)) return
  try { await pcDeletePool(pool.id); await loadPools() } catch {}
}

async function onSave() {
  showEditor.value = false
  await loadPools()
}

onMounted(loadPools)
</script>

<style scoped>
.pc-pools { max-width: 900px; margin: 0 auto; padding: 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.page-header h1 { font-size: 24px; color: #e0e0e0; margin: 0; }
.pool-list { display: flex; flex-direction: column; gap: 12px; }
.pool-card { background: #141430; border: 1px solid #ffffff12; border-radius: 12px; padding: 18px; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.pool-info { flex: 1; }
.pool-name { font-size: 16px; font-weight: 600; color: #e0e0e0; margin-bottom: 4px; }
.pool-theme { color: #00ff88; font-size: 14px; margin-bottom: 8px; }
.pool-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tag { padding: 2px 8px; border-radius: 4px; font-size: 11px; background: #ffffff12; color: #aaa; }
.tag-ok { background: #00ff8822; color: #00ff88; }
.tag-off { background: #ff444422; color: #ff4444; }
.pool-actions { display: flex; gap: 6px; flex-shrink: 0; }
.loading, .empty-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 20px; color: #666; font-size: 14px; }
.empty-icon { font-size: 48px; opacity: 0.5; }
.spinner { width: 32px; height: 32px; border: 3px solid #00ff8822; border-top-color: #00ff88; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
