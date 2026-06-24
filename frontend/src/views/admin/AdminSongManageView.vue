<template>
  <div class="admin-song-manage">
    <div class="page-header">
      <div>
        <h1>歌曲库管理</h1>
        <p>管理全局歌曲库，所有轮次公演均可使用</p>
      </div>
      <t-button theme="primary" @click="showAddDialog = true">
        <template #icon><AddIcon /></template>
        新增歌曲
      </t-button>
    </div>

    <!-- 筛选栏 -->
    <t-card :bordered="false" class="filter-card">
      <t-form layout="inline">
        <t-form-item label="歌名">
          <t-input v-model="filters.keyword" placeholder="搜索歌名" clearable @enter="loadSongs" />
        </t-form-item>
        <t-form-item label="类型">
          <t-select v-model="filters.type" placeholder="全部" clearable style="width: 120px" @change="loadSongs">
            <t-option value="solo" label="独唱" />
            <t-option value="duet" label="合唱" />
            <t-option value="group" label="团秀" />
            <t-option value="team_show" label="公演" />
          </t-select>
        </t-form-item>
        <t-form-item label="风格">
          <t-select v-model="filters.style" placeholder="全部" clearable style="width: 120px" @change="loadSongs">
            <t-option value="流行" label="流行" />
            <t-option value="摇滚" label="摇滚" />
            <t-option value="民谣" label="民谣" />
            <t-option value="R&B" label="R&B" />
            <t-option value="电子" label="电子" />
          </t-select>
        </t-form-item>
        <t-form-item>
          <t-button variant="outline" @click="resetFilters">重置</t-button>
        </t-form-item>
      </t-form>
    </t-card>

    <!-- 歌曲列表 -->
    <t-card :bordered="false" :loading="loading" class="songs-card">
      <t-table
        :data="songs"
        :columns="columns"
        row-key="id"
        :pagination="pagination"
        :loading="loading"
        @page-change="onPageChange"
        size="medium"
      >
        <template #difficulty="{ row }">
          <t-rate :value="row.difficulty" :count="5" size="small" disabled />
        </template>
        <template #weights="{ row }">
          <div class="weights-bar">
            <span class="weight-tag vocal">声{{ row.vocalWeight || 3 }}</span>
            <span class="weight-tag dance">舞{{ row.danceWeight || 3 }}</span>
            <span class="weight-tag charm">魅{{ row.charmWeight || 3 }}</span>
          </div>
        </template>
        <template #type="{ row }">
          <t-tag :theme="typeTheme(row.type)" variant="light" size="small">
            {{ typeLabel(row.type) }}
          </t-tag>
        </template>
        <template #enabled="{ row }">
          <t-switch :value="row.enabled" :label="row.enabled ? '启用' : '禁用'" disabled />
        </template>
        <template #action="{ row }">
          <t-space>
            <t-button variant="text" theme="primary" size="small" @click="editSong(row)">编辑</t-button>
            <t-popconfirm content="确定删除该歌曲？" @confirm="doDelete(row.id)">
              <t-button variant="text" theme="danger" size="small">删除</t-button>
            </t-popconfirm>
          </t-space>
        </template>
      </t-table>
    </t-card>

    <!-- 新增/编辑弹窗 -->
    <t-dialog
      v-model:visible="showAddDialog"
      :header="editingSong ? '编辑歌曲' : '新增歌曲'"
      :confirm-btn="{ content: '保存', loading: saving }"
      :cancel-btn="{}"
      width="600px"
      @confirm="doSave"
    >
      <t-form ref="formRef" :data="form" :rules="rules" label-width="80px">
        <t-form-item label="歌名" name="name">
          <t-input v-model="form.name" placeholder="请输入歌名" />
        </t-form-item>
        <t-form-item label="类型" name="type">
          <t-select v-model="form.type">
            <t-option value="team_show" label="公演" />
            <t-option value="solo" label="独唱" />
            <t-option value="duet" label="合唱" />
            <t-option value="group" label="团秀" />
          </t-select>
        </t-form-item>
        <t-form-item label="风格" name="style">
          <t-input v-model="form.style" placeholder="如：流行、摇滚" />
        </t-form-item>
        <t-form-item label="难度" name="difficulty">
          <t-rate v-model="form.difficulty" :count="5" />
        </t-form-item>
        <div class="weights-form-row">
          <t-form-item label="声乐权重" class="weight-item">
            <t-slider v-model="form.vocalWeight" :min="1" :max="10" />
          </t-form-item>
          <t-form-item label="舞蹈权重" class="weight-item">
            <t-slider v-model="form.danceWeight" :min="1" :max="10" />
          </t-form-item>
          <t-form-item label="魅力权重" class="weight-item">
            <t-slider v-model="form.charmWeight" :min="1" :max="10" />
          </t-form-item>
        </div>
        <t-form-item label="基础分">
          <t-input-number v-model="form.baseScore" :min="0" :max="200" />
        </t-form-item>
        <t-form-item label="风险系数">
          <t-input-number v-model="form.riskFactor" :min="0" :max="1" :step="0.1" />
        </t-form-item>
        <t-form-item label="描述">
          <t-textarea v-model="form.description" :rows="2" placeholder="选填" />
        </t-form-item>
      </t-form>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { AddIcon } from 'tdesign-icons-vue-next'
import { getSongs, createSong, updateSong, deleteSong } from '../../services/api'
import type { Song } from '../../types/song'

// 筛选条件
const filters = reactive({
  keyword: '',
  type: '',
  style: ''
})

const songs = ref<Song[]>([])
const loading = ref(false)
const saving = ref(false)
const showAddDialog = ref(false)
const editingSong = ref<Song | null>(null)
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
})

const form = reactive({
  name: '',
  type: 'team_show',
  style: '流行',
  difficulty: 3,
  vocalWeight: 3,
  danceWeight: 3,
  charmWeight: 3,
  baseScore: 100,
  riskFactor: 0.2,
  description: ''
})

const rules = {
  name: [{ required: true, message: '请输入歌名', type: 'error' }]
}

const columns = [
  { colKey: 'name', title: '歌名', width: 160, ellipsis: true },
  { colKey: 'style', title: '风格', width: 100 },
  { colKey: 'difficulty', title: '难度', width: 160 },
  { colKey: 'weights', title: '声/舞/魅', width: 150 },
  { colKey: 'type', title: '类型', width: 100 },
  { colKey: 'baseScore', title: '基础分', width: 80 },
  { colKey: 'riskFactor', title: '风险系数', width: 90 },
  { colKey: 'enabled', title: '状态', width: 80 },
  { colKey: 'action', title: '操作', width: 120 }
]

function typeTheme(type?: string) {
  const map: Record<string, string> = { solo: 'warning', duet: 'primary', group: 'success', team_show: 'default' }
  return map[type || 'team_show'] || 'default'
}

function typeLabel(type?: string) {
  const map: Record<string, string> = { solo: '独唱', duet: '合唱', group: '团秀', team_show: '公演' }
  return map[type || 'team_show'] || type || '公演'
}

async function loadSongs() {
  loading.value = true
  try {
    const data = await getSongs({
      type: filters.type || undefined,
      style: filters.style || undefined,
      keyword: filters.keyword || undefined
    } as any)
    songs.value = data
    pagination.total = data.length
  } catch (e: any) {
    MessagePlugin.error('加载歌曲列表失败: ' + e.message)
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.keyword = ''
  filters.type = ''
  filters.style = ''
  loadSongs()
}

function onPageChange(pageInfo: any) {
  pagination.page = pageInfo.current
  pagination.pageSize = pageInfo.pageSize
}

function editSong(song: Song) {
  editingSong.value = song
  form.name = song.name
  form.type = song.type || 'team_show'
  form.style = song.style || '流行'
  form.difficulty = song.difficulty || 3
  form.vocalWeight = song.vocalWeight || 3
  form.danceWeight = song.danceWeight || 3
  form.charmWeight = song.charmWeight || 3
  form.baseScore = song.baseScore || 100
  form.riskFactor = song.riskFactor ?? 0.2
  form.description = song.description || ''
  showAddDialog.value = true
}

function resetForm() {
  editingSong.value = null
  form.name = ''
  form.type = 'team_show'
  form.style = '流行'
  form.difficulty = 3
  form.vocalWeight = 3
  form.danceWeight = 3
  form.charmWeight = 3
  form.baseScore = 100
  form.riskFactor = 0.2
  form.description = ''
}

async function doSave() {
  if (!form.name.trim()) {
    MessagePlugin.warning('请输入歌名')
    return
  }
  saving.value = true
  try {
    if (editingSong.value) {
      await updateSong(editingSong.value.id, form as any)
      MessagePlugin.success('歌曲已更新')
    } else {
      await createSong(form as any)
      MessagePlugin.success('歌曲已添加')
    }
    showAddDialog.value = false
    resetForm()
    await loadSongs()
  } catch (e: any) {
    MessagePlugin.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function doDelete(id: string) {
  try {
    await deleteSong(id)
    MessagePlugin.success('歌曲已删除')
    await loadSongs()
  } catch (e: any) {
    MessagePlugin.error(e.message || '删除失败')
  }
}

onMounted(loadSongs)
</script>

<style scoped lang="scss">
.admin-song-manage {
  min-height: 100%;
  padding: 20px;
  background: #f5f7fa;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;

  h1 {
    margin: 0 0 4px;
    font-size: 22px;
    color: #1a1a2e;
  }

  p {
    margin: 0;
    color: #6b7280;
    font-size: 13px;
  }
}

.filter-card {
  margin-bottom: 16px;
  border-radius: 12px;
}

.songs-card {
  border-radius: 12px;
}

.weights-bar {
  display: flex;
  gap: 4px;
}

.weights-form-row {
  display: flex;
  gap: 16px;

  .weight-item {
    flex: 1;
  }
}

.weight-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 500;

  &.vocal {
    background: rgba(255, 107, 107, 0.1);
    color: #ff6b6b;
  }
  &.dance {
    background: rgba(78, 205, 196, 0.1);
    color: #4ecdc4;
  }
  &.charm {
    background: rgba(162, 155, 254, 0.1);
    color: #a29bfe;
  }
}
</style>
