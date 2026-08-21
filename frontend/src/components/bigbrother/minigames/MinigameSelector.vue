<template>
  <div class="minigame-selector">
    <div v-if="!selectedId" class="game-list">
      <h3>选择小游戏</h3>
      <div class="game-cards">
        <div v-for="game in games" :key="game.id" class="game-card"
          @click="$emit('select', game.id)">
          <div class="game-card-icon">{{ game.icon }}</div>
          <div class="game-card-name">{{ game.name }}</div>
          <div class="game-card-desc">{{ game.description }}</div>
          <div class="game-card-meta">
            <span>{{ game.playerCount.min }}-{{ game.playerCount.max }}人</span>
            <span>{{ categoryName(game.category) }}</span>
          </div>
        </div>
      </div>
      <div v-if="loading" class="loading">加载中...</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { bbGetMinigameList } from '../../../services/bbApi'
import type { MinigameDef } from '../../../types/bigbrother'

const props = defineProps<{ selectedId: string | null }>()
defineEmits<{ (e: 'select', id: string): void }>()

const games = ref<MinigameDef[]>([])
const loading = ref(false)

function categoryName(cat: string) {
  const map: Record<string, string> = {
    reaction: '反应', memory: '记忆', intellect: '智力', skill: '技巧', strategy: '策略'
  }
  return map[cat] || cat
}

onMounted(async () => {
  loading.value = true
  try { games.value = await bbGetMinigameList() } catch {}
  loading.value = false
})
</script>

<style scoped>
.minigame-selector { padding: 10px 0; }
.game-list h3 { font-size: 16px; color: #e0e0e0; margin-bottom: 12px; }
.game-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.game-card {
  background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 16px;
  cursor: pointer; transition: all 0.2s; text-align: center;
}
.game-card:hover { border-color: #00ff88; background: #00ff8808; }
.game-card-icon { font-size: 36px; margin-bottom: 8px; }
.game-card-name { font-size: 15px; font-weight: 600; color: #e0e0e0; margin-bottom: 6px; }
.game-card-desc { font-size: 12px; color: #888; line-height: 1.4; margin-bottom: 8px; }
.game-card-meta { display: flex; gap: 12px; justify-content: center; font-size: 11px; color: #666; }
.loading { text-align: center; color: #666; padding: 20px; }
</style>
