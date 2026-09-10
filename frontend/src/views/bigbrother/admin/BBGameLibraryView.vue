<template>
  <div class="bb-game-library">
    <div class="page-header">
      <h1>游戏库</h1>
      <button class="bb-btn bb-btn-primary" @click="openCreate">新建自定义游戏</button>
    </div>

    <!-- 内置游戏 -->
    <section class="game-section">
      <h2>内置游戏</h2>
      <div class="game-grid">
        <div v-for="g in builtinGames" :key="g.id" class="game-card builtin" :class="{ 'is-power-challenge': g.id === 'power-challenge' }">
          <div class="game-icon">{{ g.icon }}</div>
          <div class="game-info">
            <div class="game-name">{{ g.name }}</div>
            <div class="game-desc">{{ g.description }}</div>
            <div class="game-meta">
              <span class="tag">{{ g.category }}</span>
              <span class="meta-text">{{ g.playerCount.min }}-{{ g.playerCount.max }}人</span>
              <span class="meta-text">{{ g.duration }}s</span>
            </div>
          </div>
          <div class="game-badge builtin-badge">内置</div>
          <button v-if="g.id === 'power-challenge'" class="bb-btn-xs btn-edit" style="position:absolute;top:8px;right:36px" @click="goManage">管理题目</button>
        </div>
      </div>
    </section>

    <!-- 自定义游戏 -->
    <section class="game-section">
      <h2>自定义游戏</h2>
      <div v-if="customGames.length === 0" class="empty-state">暂无自定义游戏，点击上方按钮创建</div>
      <div class="game-grid">
        <div v-for="g in customGames" :key="g.id" class="game-card" :class="{ disabled: !g.enabled }">
          <div class="game-icon">{{ g.icon }}</div>
          <div class="game-info">
            <div class="game-name">{{ g.name }}</div>
            <div class="game-desc">{{ g.description || '暂无描述' }}</div>
            <div class="game-meta">
              <span class="tag" :class="g.type === 'quiz' ? 'tag-quiz' : 'tag-score'">
                {{ g.type === 'quiz' ? '答题' : '积分' }}
              </span>
              <span class="tag">{{ g.winCondition === 'first_correct' ? '首答胜' : g.winCondition === 'highest_score' ? '高分胜' : '多答胜' }}</span>
              <span class="meta-text">{{ g.questions.length }}题</span>
              <span class="meta-text">{{ g.playerCount.min }}-{{ g.playerCount.max }}人</span>
            </div>
          </div>
          <div class="game-actions">
            <button class="bb-btn-xs" :class="g.enabled ? 'btn-warn' : 'btn-success'" @click="toggleGame(g)">
              {{ g.enabled ? '禁用' : '启用' }}
            </button>
            <button class="bb-btn-xs btn-edit" @click="openEdit(g)">编辑</button>
            <button class="bb-btn-xs btn-danger" @click="deleteGame(g)">删除</button>
          </div>
        </div>
      </div>
    </section>

    <!-- 编辑器弹窗 -->
    <CustomGameEditor
      v-if="showEditor"
      :game="editingGame"
      @save="onSave"
      @close="showEditor = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  bbGetMinigameList, bbGetCustomGameList, bbDeleteCustomGame, bbToggleCustomGame
} from '../../../services/bbApi'
import type { MinigameDef, BBCustomGameDef } from '../../../types/bigbrother'
import CustomGameEditor from '../../../components/bigbrother/admin/CustomGameEditor.vue'

const router = useRouter()
const builtinGames = ref<MinigameDef[]>([])
const customGames = ref<BBCustomGameDef[]>([])
const showEditor = ref(false)
const editingGame = ref<BBCustomGameDef | null>(null)

async function fetchData() {
  try {
    const all = await bbGetMinigameList()
    builtinGames.value = (all || []).filter((g: any) => !g.isCustom)
  } catch {}
  try {
    customGames.value = await bbGetCustomGameList()
  } catch {}
}

function openCreate() {
  editingGame.value = null
  showEditor.value = true
}

function openEdit(game: BBCustomGameDef) {
  editingGame.value = { ...game }
  showEditor.value = true
}

async function deleteGame(game: BBCustomGameDef) {
  if (!confirm(`确定删除「${game.name}」？`)) return
  try {
    await bbDeleteCustomGame(game.id)
    await fetchData()
  } catch {}
}

async function toggleGame(game: BBCustomGameDef) {
  try {
    await bbToggleCustomGame(game.id)
    await fetchData()
  } catch {}
}

async function onSave() {
  showEditor.value = false
  await fetchData()
}

function goManage() {
  router.push('/games/bigbrother/admin/power-challenge')
}

onMounted(fetchData)
</script>

<style scoped>
.bb-game-library { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.bb-btn { background: transparent; border: 1px solid #00ff8844; color: #00ff88; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
.bb-btn:hover { background: #00ff8822; }
.bb-btn-primary { border-color: #00ff88; background: #00ff8822; }
.bb-btn-xs { padding: 4px 12px; font-size: 12px; border-radius: 4px; border: 1px solid #00ff8833; background: transparent; color: #00ff88; cursor: pointer; transition: all 0.2s; }
.bb-btn-xs:hover { background: #00ff8822; }
.btn-warn { border-color: #ffaa0066; color: #ffaa00; }
.btn-warn:hover { background: #ffaa0022; }
.btn-success { border-color: #00ff8866; color: #00ff88; }
.btn-success:hover { background: #00ff8822; }
.btn-edit { border-color: #4488ff66; color: #4488ff; }
.btn-edit:hover { background: #4488ff22; }
.btn-danger { border-color: #ff444466; color: #ff4444; }
.btn-danger:hover { background: #ff444422; }
.game-section { margin-bottom: 32px; }
.game-section h2 { font-size: 18px; color: #aaa; margin: 0 0 16px 0; font-weight: 500; }
.empty-state { color: #666; font-size: 14px; padding: 20px 0; }
.game-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
.game-card { display: flex; align-items: flex-start; gap: 16px; padding: 16px; border: 1px solid #00ff8822; border-radius: 10px; background: #0a1a1044; transition: all 0.2s; position: relative; }
.game-card:hover { border-color: #00ff8844; background: #0a1a1066; }
.game-card.builtin { opacity: 0.7; }
.game-card.disabled { opacity: 0.5; }
.game-icon { font-size: 36px; line-height: 1; flex-shrink: 0; }
.game-info { flex: 1; min-width: 0; }
.game-name { font-size: 16px; font-weight: 600; color: #e0e0e0; margin-bottom: 4px; }
.game-desc { font-size: 13px; color: #888; margin-bottom: 8px; line-height: 1.4; }
.game-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tag { font-size: 11px; padding: 2px 8px; border-radius: 4px; background: #00ff8815; color: #00ff88; }
.tag-quiz { background: #4488ff15; color: #4488ff; }
.tag-score { background: #ffaa0015; color: #ffaa00; }
.meta-text { font-size: 12px; color: #666; }
.game-badge { position: absolute; top: 8px; right: 8px; font-size: 10px; padding: 2px 6px; border-radius: 3px; background: #00ff8815; color: #00ff88; }
.game-actions { display: flex; gap: 6px; flex-shrink: 0; align-items: flex-start; }
</style>
