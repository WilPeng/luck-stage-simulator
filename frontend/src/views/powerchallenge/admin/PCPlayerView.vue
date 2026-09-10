<template>
  <div class="pc-players">
    <div class="page-header">
      <h1>👥 玩家管理</h1>
      <button class="bb-btn bb-btn-primary" @click="openCreate">添加玩家</button>
    </div>

    <div class="table-wrapper">
      <table class="player-table">
        <thead>
          <tr>
            <th>姓名</th>
            <th>登录码</th>
            <th>角色</th>
            <th>状态</th>
            <th>登录时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in players" :key="p.id">
            <td>{{ p.name }}</td>
            <td><code>{{ p.loginCode }}</code></td>
            <td>{{ p.role === 'admin' ? '管理员' : '选手' }}</td>
            <td><span :class="['status-badge', p.status]">{{ p.status === 'active' ? '活跃' : '禁用' }}</span></td>
            <td>{{ formatDate(p.createdAt) }}</td>
            <td>
              <button class="bb-btn-xs" @click="toggleStatus(p)">{{ p.status === 'active' ? '禁用' : '启用' }}</button>
              <button class="bb-btn-xs btn-danger" @click="removePlayer(p)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="players.length === 0" class="empty-state">暂无玩家</div>
    </div>

    <!-- 添加弹窗 -->
    <div v-if="showCreate" class="modal-overlay" @click.self="showCreate = false">
      <div class="modal">
        <h3>添加玩家</h3>
        <div class="form-group">
          <label>姓名</label>
          <input v-model="newPlayer.name" class="form-input" placeholder="玩家姓名" />
        </div>
        <div class="form-group">
          <label>登录码</label>
          <input v-model="newPlayer.loginCode" class="form-input" placeholder="登录码（如 PC001）" />
        </div>
        <div class="modal-actions">
          <button class="bb-btn bb-btn-primary" @click="createPlayer" :disabled="!newPlayer.name || !newPlayer.loginCode">确认</button>
          <button class="bb-btn" @click="showCreate = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { pcGetPlayers, pcCreatePlayer, pcUpdatePlayer, pcDeletePlayer } from '../../../services/pcApi'
import type { PCPlayer } from '../../../types/powerchallenge'

const players = ref<PCPlayer[]>([])
const showCreate = ref(false)
const newPlayer = ref({ name: '', loginCode: '' })

async function loadPlayers() {
  try { players.value = await pcGetPlayers() } catch {}
}

async function toggleStatus(p: PCPlayer) {
  try {
    await pcUpdatePlayer(p.id, { status: p.status === 'active' ? 'inactive' : 'active' })
    await loadPlayers()
  } catch {}
}

async function removePlayer(p: PCPlayer) {
  if (!confirm(`确认删除玩家 ${p.name}？`)) return
  try { await pcDeletePlayer(p.id); await loadPlayers() } catch {}
}

async function createPlayer() {
  try { await pcCreatePlayer(newPlayer.value); showCreate.value = false; newPlayer.value = { name: '', loginCode: '' }; await loadPlayers() } catch {}
}

function formatDate(d: string): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('zh-CN')
}

onMounted(loadPlayers)
</script>

<style scoped>
.pc-players { max-width: 1000px; margin: 0 auto; padding: 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.page-header h1 { font-size: 24px; color: #e0e0e0; margin: 0; }
.table-wrapper { overflow-x: auto; }
.player-table { width: 100%; border-collapse: collapse; }
.player-table th, .player-table td { padding: 10px 14px; text-align: left; border-bottom: 1px solid #ffffff12; }
.player-table th { color: #888; font-size: 12px; font-weight: 600; }
.player-table td { color: #e0e0e0; font-size: 14px; }
.status-badge { padding: 2px 8px; border-radius: 4px; font-size: 11px; }
.status-badge.active { background: #00ff8822; color: #00ff88; }
.status-badge.inactive { background: #ff444422; color: #ff4444; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 200; }
.modal { background: #141430; border: 1px solid #ffffff15; border-radius: 12px; padding: 24px; width: 400px; max-width: 90vw; }
.modal h3 { color: #e0e0e0; margin: 0 0 16px; }
.form-group { margin-bottom: 12px; }
.form-group label { display: block; color: #888; font-size: 12px; margin-bottom: 4px; }
.form-input { width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ffffff15; background: #0f0f2e; color: #e0e0e0; font-size: 13px; box-sizing: border-box; }
.modal-actions { display: flex; gap: 8px; margin-top: 16px; }
.empty-state { text-align: center; color: #666; padding: 40px; }
</style>
