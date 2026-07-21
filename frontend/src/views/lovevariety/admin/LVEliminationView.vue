<template>
  <div class="lv-elimination">
    <div class="page-header">
      <h1>淘汰管理</h1>
      <span class="round-tag">第{{ $route.params.round }}轮</span>
    </div>

    <div class="action-section">
      <h3>淘汰选手</h3>
      <div class="eliminate-form">
        <select v-model="selectedPlayerId" class="lv-select">
          <option value="" disabled>选择要淘汰的选手</option>
          <option v-for="p in activePlayers" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <button class="lv-btn lv-btn-danger" @click="eliminatePlayer" :disabled="!selectedPlayerId">
          确认淘汰
        </button>
      </div>
    </div>

    <div class="history-section">
      <h3>本轮淘汰记录</h3>
      <div class="table-container">
        <table class="lv-table">
          <thead><tr><th>选手</th><th>时间</th></tr></thead>
          <tbody>
            <tr v-for="e in eliminations" :key="e.id">
              <td class="highlight">{{ e.eliminatedName }}</td>
              <td class="time">{{ formatTime(e.createdAt) }}</td>
            </tr>
            <tr v-if="eliminations.length === 0"><td colspan="2" class="empty-cell">暂无淘汰记录</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { lvGetActivePlayers, lvGetRoundEliminations, lvEliminatePlayer } from '../../../services/lovevarietyApi'

const route = useRoute()
const activePlayers = ref<{ id: string; name: string }[]>([])
const eliminations = ref<any[]>([])
const selectedPlayerId = ref('')

const roundId = computed(() => `round-${route.params.round}`)

async function fetchData() {
  try {
    activePlayers.value = await lvGetActivePlayers()
    eliminations.value = await lvGetRoundEliminations(roundId.value)
  } catch {}
}

async function eliminatePlayer() {
  if (!selectedPlayerId.value) return
  const player = activePlayers.value.find(p => p.id === selectedPlayerId.value)
  if (!confirm(`确定淘汰 ${player?.name} 吗？`)) return
  try {
    await lvEliminatePlayer(selectedPlayerId.value, player?.name || '')
    selectedPlayerId.value = ''
    await fetchData()
    alert('淘汰完成')
  } catch (e: any) { alert(e.message) }
}

function formatTime(t: string) {
  return t ? new Date(t).toLocaleString('zh-CN') : ''
}

onMounted(fetchData)
</script>

<style scoped>
.lv-elimination { max-width: 800px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag {
  background: #ff69b422; color: #ff69b4; padding: 2px 12px;
  border-radius: 10px; font-size: 12px; border: 1px solid #ff69b444;
}
.lv-btn {
  background: transparent; border: 1px solid #ff69b444; color: #ff69b4;
  padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s;
}
.lv-btn:hover { background: #ff69b422; }
.lv-btn-danger { border-color: #ff4444; color: #ff4444; }
.lv-btn-danger:hover { background: #ff444422; }
.lv-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.lv-select {
  background: #1a0f2e; border: 1px solid #ff69b422; color: #e0e0e0;
  padding: 8px 12px; border-radius: 6px; font-size: 14px; outline: none; cursor: pointer; flex: 1;
}
.action-section {
  background: #1a0f2e; border: 1px solid #ff69b422; border-radius: 10px;
  padding: 20px; margin-bottom: 20px;
}
.action-section h3 { margin: 0 0 12px; font-size: 16px; color: #e0e0e0; }
.eliminate-form { display: flex; gap: 12px; align-items: center; }
.history-section h3 { font-size: 16px; color: #e0e0e0; margin: 0 0 12px; }
.table-container { overflow-x: auto; }
.lv-table { width: 100%; border-collapse: collapse; }
.lv-table th, .lv-table td { padding: 10px 16px; text-align: left; border-bottom: 1px solid #ff69b411; font-size: 14px; color: #ccc; }
.lv-table th { color: #888; font-size: 12px; text-transform: uppercase; }
.highlight { color: #ff4444; font-weight: 500; }
.time { font-size: 12px; color: #666; }
.empty-cell { text-align: center; color: #666; padding: 32px; }
</style>
