<template>
  <div class="bb-power-challenge">
    <div class="page-header">
      <h1>💪 实力大挑战 - 题目池管理</h1>
      <button class="bb-btn bb-btn-primary" @click="openCreate">新建题目池</button>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <span>加载题目池...</span>
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
            <span class="tag" :class="pool.enabled ? 'tag-ok' : 'tag-off'">
              {{ pool.enabled ? '启用' : '禁用' }}
            </span>
            <span class="meta-text">更新：{{ formatDate(pool.updatedAt) }}</span>
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
import {
  bbGetPowerChallengePools, bbCreatePowerChallengePool, bbUpdatePowerChallengePool,
  bbDeletePowerChallengePool, bbTogglePowerChallengePool
} from '../../../services/bbApi'
import type { PowerChallengePool } from '../../../types/bigbrother'
import PowerChallengeEditor from '../../../components/bigbrother/admin/PowerChallengeEditor.vue'

const pools = ref<PowerChallengePool[]>([])
const loading = ref(false)
const showEditor = ref(false)
const editingPool = ref<PowerChallengePool>({} as PowerChallengePool)

function formatDate(d: string): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('zh-CN')
}

async function loadPools() {
  loading.value = true
  try { pools.value = await bbGetPowerChallengePools() } catch {}
  loading.value = false
}

function openCreate() {
  editingPool.value = {
    id: '', gameId: 'bigbrother', name: '实力大挑战', theme: '',
    questions: [{ id: crypto.randomUUID(), text: '', options: ['A', 'B'], correctAnswer: '' }],
    enabled: true, createdAt: '', updatedAt: new Date().toISOString()
  }
  showEditor.value = true
}

function openEdit(pool: PowerChallengePool) {
  editingPool.value = { ...pool }
  showEditor.value = true
}

async function toggle(pool: PowerChallengePool) {
  try { await bbTogglePowerChallengePool(pool.id); await loadPools() } catch {}
}

async function remove(pool: PowerChallengePool) {
  if (!confirm(`确认删除题目池 "${pool.name}"？`)) return
  try { await bbDeletePowerChallengePool(pool.id); await loadPools() } catch {}
}

async function onSave() {
  try {
    const data = { ...editingPool.value }
    if (data.id) {
      await bbUpdatePowerChallengePool(data.id, { name: data.name, theme: data.theme, questions: data.questions })
    } else {
      await bbCreatePowerChallengePool({ name: data.name, theme: data.theme, questions: data.questions })
    }
    showEditor.value = false
    await loadPools()
  } catch (e: any) {
    console.error('保存失败:', e)
  }
}

onMounted(loadPools)
</script>

<style scoped>
.bb-power-challenge { max-width: 800px; margin: 0 auto; padding: 16px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.page-header h1 { font-size: 24px; color: #e0e0e0; margin: 0; }
.pool-list { display: flex; flex-direction: column; gap: 12px; }
.pool-card { background: #141430; border: 1px solid #ffffff12; border-radius: 12px; padding: 18px; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.pool-info { flex: 1; }
.pool-name { font-size: 16px; font-weight: 600; color: #e0e0e0; margin-bottom: 4px; }
.pool-theme { color: #00ff88; font-size: 14px; margin-bottom: 8px; }
.pool-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tag { padding: 2px 8px; border-radius: 6px; font-size: 11px; background: #ffffff12; color: #aaa; }
.tag-ok { background: #00ff8822; color: #00ff88; }
.tag-off { background: #ff444422; color: #ff4444; }
.meta-text { color: #666; font-size: 11px; }
.pool-actions { display: flex; gap: 6px; flex-shrink: 0; }
.loading-state, .empty-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 20px; color: #666; font-size: 14px; }
.empty-icon { font-size: 48px; opacity: 0.5; }
.loading-spinner { width: 32px; height: 32px; border: 3px solid #00ff8822; border-top-color: #00ff88; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
