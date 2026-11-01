<template>
  <div class="bb-game-library">
    <div class="page-header">
      <h1>游戏库</h1>
      <button class="bb-btn bb-btn-primary" @click="openCreate">新建自定义游戏</button>
    </div>

    <!-- 文件夹筛选 -->
    <div class="folder-bar">
      <button class="folder-chip" :class="{ active: selectedFolderId === null }" @click="selectedFolderId = null">
        全部 <span class="chip-count">{{ allGames.length }}</span>
      </button>
      <div v-for="f in folders" :key="f.id" class="folder-chip-wrap">
        <button class="folder-chip" :class="{ active: selectedFolderId === f.id }" @click="selectedFolderId = f.id">
          📁 {{ f.name }} <span class="chip-count">{{ folderGameCount(f) }}</span>
        </button>
        <button class="chip-op" title="重命名文件夹" @click="renameFolder(f)">✏️</button>
        <button class="chip-op" title="删除文件夹" @click="deleteFolder(f)">🗑️</button>
      </div>
      <button class="folder-chip add-folder" @click="createFolder">+ 新建文件夹</button>
    </div>

    <div v-if="visibleGames.length === 0" class="empty-state">
      {{ selectedFolderId ? '该文件夹中暂无游戏，使用游戏卡片上的「文件夹」按钮添加' : '暂无游戏，点击上方按钮创建自定义游戏' }}
    </div>

    <div class="game-grid">
      <div
        v-for="(g, idx) in visibleGames"
        :key="g.key"
        class="game-card"
        :class="{ disabled: g.isCustom && !g.custom?.enabled, builtin: !g.isCustom, 'menu-open': openMenuKey === g.key }"
      >
        <div v-if="selectedFolderId === null" class="reorder">
          <button class="reorder-btn" :disabled="idx === 0" title="上移" @click="moveGame(g.key, -1)">↑</button>
          <button class="reorder-btn" :disabled="idx === visibleGames.length - 1" title="下移" @click="moveGame(g.key, 1)">↓</button>
        </div>

        <div class="game-icon">{{ g.icon }}</div>
        <div class="game-info">
          <div class="game-name">{{ g.name }}</div>
          <div class="game-desc">{{ g.description || '暂无描述' }}</div>
          <div class="game-meta">
            <template v-if="g.isCustom && g.custom">
              <span class="tag" :class="g.custom.type === 'quiz' ? 'tag-quiz' : 'tag-score'">
                {{ g.custom.type === 'quiz' ? '答题' : '积分' }}
              </span>
              <span class="tag">{{ winConditionLabel(g.custom) }}</span>
              <span class="meta-text">{{ g.custom.questions.length }}题</span>
              <span class="meta-text">{{ g.custom.playerCount.min }}-{{ g.custom.playerCount.max }}人</span>
            </template>
            <template v-else-if="g.builtin">
              <span class="tag">{{ g.builtin.category }}</span>
              <span class="meta-text">{{ g.builtin.playerCount.min }}-{{ g.builtin.playerCount.max }}人</span>
              <span class="meta-text">{{ g.builtin.duration }}s</span>
            </template>
          </div>
          <div v-if="foldersOf(g.key).length" class="game-folders">
            <span v-for="f in foldersOf(g.key)" :key="f.id" class="folder-tag">📁 {{ f.name }}</span>
          </div>

          <div class="card-footer">
            <details class="folder-menu" @toggle="onMenuToggle(g.key, $event)">
              <summary class="folder-menu-btn">文件夹</summary>
              <div class="folder-menu-list">
                <p v-if="folders.length === 0" class="folder-menu-empty">暂无文件夹</p>
                <label v-for="f in folders" :key="f.id" class="folder-menu-item">
                  <input
                    type="checkbox"
                    :checked="f.games.includes(g.key)"
                    @change="toggleGameInFolder(f, g.key)"
                  />
                  {{ f.name }}
                </label>
              </div>
            </details>
            <button v-if="!g.isCustom && g.key === 'power-challenge'" class="bb-btn-xs btn-edit" @click="goManage">管理题目</button>
            <template v-if="g.isCustom && g.custom">
              <button class="bb-btn-xs" :class="g.custom.enabled ? 'btn-warn' : 'btn-success'" @click="toggleGame(g.custom)">
                {{ g.custom.enabled ? '禁用' : '启用' }}
              </button>
              <button class="bb-btn-xs btn-edit" @click="openEdit(g.custom)">编辑</button>
              <button class="bb-btn-xs btn-danger" @click="deleteGame(g.custom)">删除</button>
            </template>
          </div>
        </div>

        <div class="game-badge" :class="g.isCustom ? 'custom-badge' : 'builtin-badge'">
          {{ g.isCustom ? '自定义' : '内置' }}
        </div>
      </div>
    </div>

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
import { ref, computed, onMounted } from 'vue'
import { useBbRefresh } from '../../../composables/useBbRefresh'
import { useRouter } from 'vue-router'
import {
  bbGetMinigameList, bbGetCustomGameList, bbDeleteCustomGame, bbToggleCustomGame,
  bbGetGameLibrary, bbSaveGameLibraryOrder, bbCreateGameFolder, bbUpdateGameFolder,
  bbToggleGameInFolder, bbDeleteGameFolder
} from '../../../services/bbApi'
import type {
  MinigameDef, BBCustomGameDef, BBGameLibrary, BBGameFolder
} from '../../../types/bigbrother'
import CustomGameEditor from '../../../components/bigbrother/admin/CustomGameEditor.vue'

interface LibraryGame {
  key: string
  icon: string
  name: string
  description: string
  isCustom: boolean
  builtin?: MinigameDef
  custom?: BBCustomGameDef
}

const router = useRouter()
const builtinGames = ref<MinigameDef[]>([])
const customGames = ref<BBCustomGameDef[]>([])
const library = ref<BBGameLibrary>({ id: 'bigbrother', order: [], folders: [] })
const selectedFolderId = ref<string | null>(null)
const openMenuKey = ref<string | null>(null)
const showEditor = ref(false)
const editingGame = ref<BBCustomGameDef | null>(null)

const folders = computed<BBGameFolder[]>(() => library.value.folders || [])

const allGames = computed<LibraryGame[]>(() => {
  const map = new Map<string, LibraryGame>()
  for (const g of builtinGames.value) {
    map.set(g.id, { key: g.id, icon: g.icon, name: g.name, description: g.description, isCustom: false, builtin: g })
  }
  for (const g of customGames.value) {
    map.set(g.id, { key: g.id, icon: g.icon, name: g.name, description: g.description, isCustom: true, custom: g })
  }
  const result: LibraryGame[] = []
  const seen = new Set<string>()
  for (const key of library.value.order || []) {
    const game = map.get(key)
    if (game && !seen.has(key)) {
      result.push(game)
      seen.add(key)
    }
  }
  for (const game of map.values()) {
    if (!seen.has(game.key)) result.push(game)
  }
  return result
})

const visibleGames = computed<LibraryGame[]>(() => {
  if (!selectedFolderId.value) return allGames.value
  const folder = folders.value.find(f => f.id === selectedFolderId.value)
  if (!folder) return allGames.value
  const keys = new Set(folder.games)
  return allGames.value.filter(g => keys.has(g.key))
})

function foldersOf(gameKey: string): BBGameFolder[] {
  return folders.value.filter(f => f.games.includes(gameKey))
}

function onMenuToggle(gameKey: string, event: Event) {
  const open = (event.target as HTMLDetailsElement).open
  if (open) openMenuKey.value = gameKey
  else if (openMenuKey.value === gameKey) openMenuKey.value = null
}

function folderGameCount(folder: BBGameFolder): number {
  const keys = new Set(allGames.value.map(g => g.key))
  return folder.games.filter(k => keys.has(k)).length
}

function winConditionLabel(game: BBCustomGameDef): string {
  switch (game.winCondition) {
    case 'first_correct': return '首答胜'
    case 'highest_score': return '高分胜'
    case 'all_correct': return '全对胜'
    case 'target_correct': return '达标胜'
    case 'admin_judge': return '管理员评判'
    default: return '多答胜'
  }
}

async function fetchData() {
  try {
    const all = await bbGetMinigameList()
    builtinGames.value = (all || []).filter((g: any) => !g.isCustom)
  } catch {}
  try {
    customGames.value = await bbGetCustomGameList()
  } catch {}
  try {
    library.value = await bbGetGameLibrary()
    if (!Array.isArray(library.value.order)) library.value.order = []
    if (!Array.isArray(library.value.folders)) library.value.folders = []
  } catch {}
}

async function persistOrder(keys: string[]) {
  const prev = library.value.order
  library.value = { ...library.value, order: keys }
  try {
    await bbSaveGameLibraryOrder(keys)
  } catch {
    library.value = { ...library.value, order: prev }
  }
}

async function moveGame(key: string, dir: number) {
  if (selectedFolderId.value) return
  const keys = allGames.value.map(g => g.key)
  const idx = keys.indexOf(key)
  const target = idx + dir
  if (idx < 0 || target < 0 || target >= keys.length) return
  ;[keys[idx], keys[target]] = [keys[target], keys[idx]]
  await persistOrder(keys)
}

async function createFolder() {
  const name = prompt('新建文件夹名称')
  if (!name || !name.trim()) return
  try {
    const folder = await bbCreateGameFolder(name.trim())
    library.value = { ...library.value, folders: [...folders.value, folder] }
  } catch {}
}

async function renameFolder(folder: BBGameFolder) {
  const name = prompt('重命名文件夹', folder.name)
  if (!name || !name.trim() || name.trim() === folder.name) return
  try {
    const updated = await bbUpdateGameFolder(folder.id, { name: name.trim() })
    library.value = {
      ...library.value,
      folders: folders.value.map(f => (f.id === updated.id ? updated : f))
    }
  } catch {}
}

async function deleteFolder(folder: BBGameFolder) {
  if (!confirm(`确定删除文件夹「${folder.name}」？游戏本身不会被删除。`)) return
  try {
    await bbDeleteGameFolder(folder.id)
    library.value = { ...library.value, folders: folders.value.filter(f => f.id !== folder.id) }
    if (selectedFolderId.value === folder.id) selectedFolderId.value = null
  } catch {}
}

async function toggleGameInFolder(folder: BBGameFolder, gameKey: string) {
  try {
    const updated = await bbToggleGameInFolder(folder.id, gameKey)
    library.value = {
      ...library.value,
      folders: folders.value.map(f => (f.id === updated.id ? updated : f))
    }
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

useBbRefresh(fetchData)
onMounted(fetchData)
</script>

<style scoped>
.bb-game-library { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #ece7fb; margin: 0; }
.bb-btn { background: transparent; border: 1px solid #b39bff44; color: #b39bff; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
.bb-btn:hover { background: #b39bff22; }
.bb-btn-primary { border-color: #b39bff; background: #b39bff22; }
.bb-btn-xs { padding: 4px 12px; font-size: 12px; border-radius: 4px; border: 1px solid #b39bff33; background: transparent; color: #b39bff; cursor: pointer; transition: all 0.2s; }
.bb-btn-xs:hover { background: #b39bff22; }
.btn-warn { border-color: #e6c98866; color: #e6c988; }
.btn-warn:hover { background: #e6c98822; }
.btn-success { border-color: #b39bff66; color: #b39bff; }
.btn-success:hover { background: #b39bff22; }
.btn-edit { border-color: #4488ff66; color: #4488ff; }
.btn-edit:hover { background: #4488ff22; }
.btn-danger { border-color: #ff444466; color: #ff4444; }
.btn-danger:hover { background: #ff444422; }

.folder-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
.folder-chip-wrap { display: flex; align-items: center; gap: 2px; }
.folder-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; border: 1px solid #b39bff33; background: #17112a44; color: #a99bd0; font-size: 13px; cursor: pointer; transition: all 0.2s; }
.folder-chip:hover { border-color: #b39bff66; color: #ece7fb; }
.folder-chip.active { border-color: #b39bff; background: #b39bff22; color: #ece7fb; }
.chip-count { font-size: 11px; color: #8f83b8; background: #ffffff10; border-radius: 999px; padding: 0 6px; }
.chip-op { background: transparent; border: none; color: #8f83b8; cursor: pointer; font-size: 12px; padding: 2px 4px; border-radius: 4px; }
.chip-op:hover { background: #ffffff12; color: #ece7fb; }
.add-folder { border-style: dashed; color: #8f83b8; }

.empty-state { color: #6b5f92; font-size: 14px; padding: 20px 0; }
.game-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; }
.game-card { display: flex; align-items: flex-start; gap: 16px; padding: 16px; border: 1px solid #b39bff22; border-radius: 10px; background: #17112a44; transition: all 0.2s; position: relative; z-index: 1; }
.game-card:hover { border-color: #b39bff44; background: #17112a66; }
.game-card.menu-open { z-index: 50; }
.game-card.builtin { opacity: 0.85; }
.game-card.disabled { opacity: 0.5; }
.reorder { position: absolute; top: 34px; right: 10px; display: flex; flex-direction: column; gap: 2px; }
.reorder-btn { width: 22px; height: 22px; border-radius: 4px; border: 1px solid #b39bff33; background: #17112a; color: #b39bff; cursor: pointer; font-size: 12px; line-height: 1; }
.reorder-btn:hover:not(:disabled) { background: #b39bff22; }
.reorder-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.game-icon { font-size: 36px; line-height: 1; flex-shrink: 0; }
.game-info { flex: 1; min-width: 0; }
.game-name { font-size: 16px; font-weight: 600; color: #ece7fb; margin-bottom: 4px; }
.game-desc { font-size: 13px; color: #8f83b8; margin-bottom: 8px; line-height: 1.4; }
.game-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tag { font-size: 11px; padding: 2px 8px; border-radius: 4px; background: #b39bff15; color: #b39bff; }
.tag-quiz { background: #4488ff15; color: #4488ff; }
.tag-score { background: #e6c98815; color: #e6c988; }
.meta-text { font-size: 12px; color: #6b5f92; }
.game-folders { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.folder-tag { font-size: 11px; padding: 1px 7px; border-radius: 4px; background: #e6c98818; color: #e6c988; }
.game-badge { position: absolute; top: 8px; right: 8px; font-size: 10px; padding: 2px 6px; border-radius: 3px; background: #b39bff15; color: #b39bff; }
.builtin-badge { background: #8f83b815; color: #a99bd0; }
.custom-badge { background: #4488ff18; color: #4488ff; }
.card-footer { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.folder-menu { position: relative; }
.folder-menu[open] { z-index: 60; }
.folder-menu-btn { list-style: none; cursor: pointer; font-size: 12px; padding: 4px 12px; border-radius: 4px; border: 1px solid #e6c98866; color: #e6c988; user-select: none; }
.folder-menu-btn::-webkit-details-marker { display: none; }
.folder-menu[open] .folder-menu-btn { background: #e6c98822; }
.folder-menu-list { position: absolute; top: calc(100% + 6px); left: 0; z-index: 1000; min-width: 160px; max-height: 220px; overflow-y: auto; padding: 8px; border: 1px solid #b39bff33; border-radius: 8px; background: #1b1130; box-shadow: 0 8px 24px #00000066; }
.folder-menu-item { display: flex; align-items: center; gap: 8px; padding: 5px 6px; font-size: 13px; color: #cdc3ea; cursor: pointer; border-radius: 4px; }
.folder-menu-item:hover { background: #b39bff15; }
.folder-menu-empty { margin: 0; padding: 4px 6px; font-size: 12px; color: #6b5f92; }
</style>
