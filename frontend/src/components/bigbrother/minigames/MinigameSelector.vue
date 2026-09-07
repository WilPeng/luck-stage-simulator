<template>
  <div class="minigame-selector">
    <div class="selector-header">
      <div class="selector-title">
        <span class="selector-icon">🎮</span>
        <span>选择一个 HOH 竞争小游戏</span>
      </div>
      <div class="category-tabs">
        <button
          v-for="tab in categoryTabs"
          :key="tab.key"
          class="cat-tab"
          :class="{ active: activeCategory === tab.key }"
          @click="activeCategory = tab.key"
        >
          <span class="cat-tab-icon">{{ tab.icon }}</span>
          <span class="cat-tab-label">{{ tab.label }}</span>
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <span>加载小游戏列表...</span>
    </div>

    <div v-else-if="filteredGames.length === 0" class="empty-state">
      <span class="empty-icon">🔍</span>
      <span>该分类下暂无小游戏</span>
    </div>

    <div v-else class="game-grid">
      <button
        v-for="game in filteredGames"
        :key="game.id"
        class="game-card"
        @click="$emit('select', game.id)"
      >
        <div class="card-glow"></div>
        <div class="card-inner">
          <div class="card-top">
            <span class="card-icon">{{ game.icon }}</span>
            <span class="card-category-badge">{{ categoryName(game.category) }}</span>
          </div>
          <div class="card-name">{{ game.name }}</div>
          <div class="card-desc">{{ game.description }}</div>
          <div class="card-footer">
            <div class="card-meta">
              <span class="meta-item">
                <span class="meta-icon">👥</span>
                {{ game.playerCount.min }}-{{ game.playerCount.max }}人
              </span>
              <span class="meta-item">
                <span class="meta-icon">⏱</span>
                {{ game.duration }}s
              </span>
            </div>
            <span class="card-play-icon">▶</span>
          </div>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { bbGetMinigameList } from '../../../services/bbApi'
import type { MinigameDef } from '../../../types/bigbrother'

defineProps<{ selectedId: string | null }>()
defineEmits<{ (e: 'select', id: string): void }>()

const games = ref<MinigameDef[]>([])
const loading = ref(false)
const activeCategory = ref('all')

const categoryTabs = [
  { key: 'all', icon: '🎲', label: '全部' },
  { key: 'reaction', icon: '⚡', label: '反应' },
  { key: 'memory', icon: '🧠', label: '记忆' },
  { key: 'intellect', icon: '🧮', label: '智力' },
  { key: 'skill', icon: '🎯', label: '技巧' },
  { key: 'strategy', icon: '♟', label: '策略' },
]

const filteredGames = computed(() => {
  if (activeCategory.value === 'all') return games.value
  return games.value.filter(g => g.category === activeCategory.value)
})

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
.minigame-selector {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.selector-header {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.selector-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #e0e0e0;
}

.selector-icon {
  font-size: 20px;
}

.category-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.cat-tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid #ffffff12;
  background: #ffffff06;
  color: #888;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.cat-tab:hover {
  border-color: #00ff8833;
  color: #bbb;
  background: #00ff8808;
}

.cat-tab.active {
  border-color: #00ff8866;
  background: #00ff8815;
  color: #00ff88;
  font-weight: 500;
}

.cat-tab-icon {
  font-size: 13px;
}

.cat-tab-label {
  line-height: 1;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 20px;
  color: #666;
  font-size: 13px;
}

.loading-spinner {
  width: 28px;
  height: 28px;
  border: 2px solid #00ff8822;
  border-top-color: #00ff88;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 20px;
  color: #555;
  font-size: 13px;
}

.empty-icon {
  font-size: 28px;
  opacity: 0.5;
}

.game-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.game-card {
  position: relative;
  border: 1px solid #ffffff10;
  border-radius: 12px;
  background: transparent;
  padding: 0;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  text-align: left;
}

.game-card:hover {
  border-color: #00ff8855;
  transform: translateY(-2px);
}

.game-card:hover .card-glow {
  opacity: 1;
}

.game-card:active {
  transform: translateY(0);
}

.card-glow {
  position: absolute;
  inset: -1px;
  border-radius: 12px;
  background: radial-gradient(ellipse at 50% 0%, #00ff8815 0%, transparent 70%);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.card-inner {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 16px 14px;
  background: linear-gradient(165deg, #141430 0%, #0d0d24 100%);
  border-radius: 11px;
  height: 100%;
  box-sizing: border-box;
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-icon {
  font-size: 32px;
  line-height: 1;
  filter: drop-shadow(0 2px 8px rgba(0, 255, 136, 0.15));
}

.card-category-badge {
  font-size: 10px;
  color: #00ff8899;
  background: #00ff8812;
  border: 1px solid #00ff8822;
  border-radius: 10px;
  padding: 2px 8px;
  font-weight: 500;
}

.card-name {
  font-size: 15px;
  font-weight: 600;
  color: #e8e8e8;
  margin-top: 2px;
}

.card-desc {
  font-size: 12px;
  color: #777;
  line-height: 1.5;
  flex: 1;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  padding-top: 10px;
  border-top: 1px solid #ffffff08;
}

.card-meta {
  display: flex;
  gap: 12px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #555;
}

.meta-icon {
  font-size: 11px;
}

.card-play-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #00ff8818;
  color: #00ff88;
  font-size: 10px;
  opacity: 0;
  transform: scale(0.8);
  transition: all 0.25s ease;
}

.game-card:hover .card-play-icon {
  opacity: 1;
  transform: scale(1);
}
</style>
