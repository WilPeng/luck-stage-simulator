<template>
  <div class="admin-song-manage">
    <div class="page-header">
      <div>
        <h1>歌曲库管理</h1>
        <p>管理全局歌曲库，所有轮次公演均可使用</p>
      </div>
      <t-space>
        <t-button theme="primary" variant="outline" @click="handleRandomSong('male')" :loading="randomSongLoading">
          <template #icon><RocketIcon /></template>
          随机添加男歌手歌曲
        </t-button>
        <t-button theme="danger" variant="outline" @click="handleRandomSong('female')" :loading="randomSongLoading">
          <template #icon><RocketIcon /></template>
          随机添加女歌手歌曲
        </t-button>
        <t-button theme="primary" variant="outline" @click="exportSongsCsv">
          <template #icon><span>📥</span></template>
          导出表格
        </t-button>
        <t-button theme="primary" variant="outline" @click="triggerImportCsv">
          <template #icon><span>📤</span></template>
          导入表格
        </t-button>
        <input
          ref="csvImportInput"
          type="file"
          accept=".csv,text/csv"
          style="display: none"
          @change="handleImportCsv"
        />
        <t-button theme="primary" variant="outline" @click="showBatchDialog = true">
          <template #icon><FileIcon /></template>
          批量导入
        </t-button>
        <t-popconfirm content="确定清空歌曲库？此操作不可恢复。" theme="danger" @confirm="handleClearAllSongs">
          <t-button theme="danger" variant="outline">清空歌曲库</t-button>
        </t-popconfirm>
        <t-button theme="primary" @click="showAddDialog = true">
          <template #icon><AddIcon /></template>
          新增歌曲
        </t-button>
      </t-space>
    </div>

    <!-- 筛选栏 -->
    <t-card :bordered="false" class="filter-card">
      <t-form layout="inline">
        <t-form-item label="歌名">
          <t-input v-model="filters.keyword" placeholder="搜索歌名" clearable @enter="resetPageAndLoad" />
        </t-form-item>
        <t-form-item label="类型">
          <t-select v-model="filters.type" placeholder="全部" clearable style="width: 120px" @change="resetPageAndLoad">
            <t-option value="solo" label="独唱" />
            <t-option value="duet" label="合唱" />
            <t-option value="group" label="团秀" />
            <t-option value="team_show" label="公演" />
          </t-select>
        </t-form-item>
        <t-form-item label="风格">
          <t-select v-model="filters.style" placeholder="全部" clearable style="width: 120px" @change="resetPageAndLoad">
            <t-option value="流行" label="流行" />
            <t-option value="摇滚" label="摇滚" />
            <t-option value="民谣" label="民谣" />
            <t-option value="R&B" label="R&B" />
            <t-option value="电子" label="电子" />
          </t-select>
        </t-form-item>
        <t-form-item label="歌手性别">
          <t-select v-model="filters.singerGender" placeholder="全部" clearable style="width: 120px" @change="resetPageAndLoad">
            <t-option value="male" label="男歌手" />
            <t-option value="female" label="女歌手" />
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
        :loading="loading"
        size="medium"
      >
        <template #difficulty="{ row }">
          <span class="difficulty-num">{{ row.difficulty || 3 }}</span>
        </template>
        <template #mainAttribute="{ row }">
          <span>{{ mainAttrLabel(row.mainAttribute) }}</span>
        </template>
        <template #type="{ row }">
          <t-tag :theme="typeTheme(row.type)" variant="light" size="small">
            {{ typeLabel(row.type) }}
          </t-tag>
        </template>
        <template #singerGender="{ row }">
          <t-tag v-if="row.singerGender" :theme="genderTheme(row.singerGender)" variant="light" size="small">
            {{ genderLabel(row.singerGender) }}
          </t-tag>
          <span v-else>-</span>
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
      <div class="songs-pager">
        <t-pagination
          v-model="pagination.page"
          :total="pagination.total"
          :page-size="pagination.pageSize"
          :page-size-options="[10, 20, 50, 100]"
          show-jumper
          @change="resetPageAndLoad"
          @page-size-change="onPageSizeChange"
        />
      </div>
    </t-card>

    <!-- 新增/编辑弹窗 -->
    <t-dialog
      v-model:visible="showAddDialog"
      :header="editingSong ? '编辑歌曲' : '新增歌曲'"
      :confirm-btn="{ content: '保存', loading: saving }"
      :cancel-btn="{}"
      width="720px"
      @confirm="doSave"
    >
      <t-form ref="formRef" :data="form" :rules="rules" label-width="96px" class="song-form">
        <div class="form-section-title">基本信息</div>
        <div class="form-grid">
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
          <t-form-item label="歌手性别" name="singerGender">
            <t-radio-group v-model="form.singerGender" variant="default-filled">
              <t-radio-button value="male">男歌手</t-radio-button>
              <t-radio-button value="female">女歌手</t-radio-button>
            </t-radio-group>
          </t-form-item>
          <t-form-item label="风格" name="style">
            <t-input v-model="form.style" placeholder="如：流行、摇滚" />
          </t-form-item>
        </div>

        <div class="form-section-title">评分配置</div>
        <div class="form-grid">
          <t-form-item label="难度" name="difficulty">
            <div class="field-with-hint">
              <t-input-number v-model="form.difficulty" :min="2" :max="10" />
              <span class="field-hint">评级骰子面数（2~10）</span>
            </div>
          </t-form-item>
          <t-form-item label="主属性" name="mainAttribute">
            <t-select v-model="form.mainAttribute">
              <t-option value="vocal" label="🎤 声乐" />
              <t-option value="dance" label="💃 舞蹈" />
              <t-option value="charm" label="✨ 魅力" />
            </t-select>
          </t-form-item>
          <t-form-item label="基准Vocal">
            <t-input-number v-model="form.baseVocal" :min="0" :max="200" />
          </t-form-item>
          <t-form-item label="基准Dance">
            <t-input-number v-model="form.baseDance" :min="0" :max="200" />
          </t-form-item>
          <t-form-item label="风险值">
            <t-input-number v-model="form.risk" :min="1" :max="100" />
          </t-form-item>
        </div>

        <div class="form-section-title">其他</div>
        <t-form-item label="描述">
          <t-textarea v-model="form.description" :rows="2" placeholder="选填" />
        </t-form-item>
      </t-form>
    </t-dialog>

    <!-- 批量导入弹窗 -->
    <t-dialog
      v-model:visible="showBatchDialog"
      header="批量导入歌曲"
      :confirm-btn="{ content: '确认导入（共 ' + batchSongList.length + ' 首）', loading: batchSaving }"
      :cancel-btn="{}"
      width="900px"
      @confirm="doBatchImport"
      @close="resetBatchForm"
    >
      <div class="batch-import">
        <t-alert theme="info" message="填写每首歌曲的配置信息，至少填写歌名" close style="margin-bottom: 12px" />

        <div class="batch-rows">
          <div
            v-for="(item, idx) in batchSongList"
            :key="idx"
            class="batch-row-card"
          >
            <div class="batch-row-header">
              <span class="batch-row-index">#{{ idx + 1 }}</span>
              <t-button
                v-if="batchSongList.length > 1"
                variant="text"
                theme="danger"
                size="small"
                @click="removeBatchRow(idx)"
              >删除</t-button>
            </div>
            <div class="batch-row-body">
              <div class="batch-row-left">
                <div class="batch-field">
                  <label class="batch-label">歌名</label>
                  <t-input v-model="item.name" placeholder="必填" />
                </div>
                <div class="batch-field">
                  <label class="batch-label">类型</label>
                  <t-select v-model="item.type">
                    <t-option value="team_show" label="公演" />
                    <t-option value="solo" label="独唱" />
                    <t-option value="duet" label="合唱" />
                    <t-option value="group" label="团秀" />
                  </t-select>
                </div>
                <div class="batch-field">
                  <label class="batch-label">歌手性别</label>
                  <t-select v-model="item.singerGender" placeholder="选填">
                    <t-option value="male" label="男歌手" />
                    <t-option value="female" label="女歌手" />
                  </t-select>
                </div>
                <div class="batch-field">
                  <label class="batch-label">风格</label>
                  <t-input v-model="item.style" placeholder="流行" />
                </div>
                <div class="batch-field">
                  <label class="batch-label">难度</label>
                  <t-input-number v-model="item.difficulty" :min="2" :max="10" />
                </div>
              </div>
              <div class="batch-row-right">
                <div class="batch-field">
                  <label class="batch-label">主属性</label>
                  <t-select v-model="item.mainAttribute">
                    <t-option value="vocal" label="声乐" />
                    <t-option value="dance" label="舞蹈" />
                    <t-option value="charm" label="魅力" />
                  </t-select>
                </div>
                <div class="batch-field">
                  <label class="batch-label">基准Vocal</label>
                  <t-input-number v-model="item.baseVocal" :min="0" :max="200" />
                </div>
                <div class="batch-field">
                  <label class="batch-label">基准Dance</label>
                  <t-input-number v-model="item.baseDance" :min="0" :max="200" />
                </div>
                <div class="batch-field">
                  <label class="batch-label">风险值</label>
                  <t-input-number v-model="item.risk" :min="1" :max="100" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <t-button variant="dashed" block style="margin-top: 12px" @click="addBatchRow">
          <template #icon><AddIcon /></template>
          添加一首歌曲
        </t-button>
      </div>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { AddIcon, FileIcon, RocketIcon } from 'tdesign-icons-vue-next'
import { getSongs, getSongsPaged, createSong, updateSong, deleteSong, deleteAllSongs, batchCreateSongs, randomSong } from '../../services/api'
import type { Song } from '../../types/song'

// 筛选条件
const filters = reactive({
  keyword: '',
  type: '',
  style: '',
  singerGender: ''
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

// 批量导入
const showBatchDialog = ref(false)
const batchSaving = ref(false)

// 表格导入导出
const csvImportInput = ref<HTMLInputElement | null>(null)
const csvImporting = ref(false)

// CSV 导出：导出全部（按当前筛选）歌曲（UTF-8 BOM，兼容 Excel 中文）
async function exportSongsCsv() {
  let all: Song[] = []
  try {
    all = await getSongs({
      type: filters.type || undefined,
      style: filters.style || undefined,
      keyword: filters.keyword || undefined,
      singerGender: filters.singerGender || undefined
    } as any)
  } catch (e: any) {
    MessagePlugin.error('导出失败: ' + (e?.message || ''))
    return
  }
  if (!all.length) {
    MessagePlugin.warning('没有可导出的歌曲')
    return
  }
  const header = ['歌名', '类型', '歌手性别', '风格', '难度', '主属性', '基准Vocal', '基准Dance', '风险值']
  const typeText: Record<string, string> = { solo: '独唱', duet: '合唱', group: '团秀', team_show: '公演' }
  const genderText: Record<string, string> = { male: '男歌手', female: '女歌手' }
  const mainAttrText: Record<string, string> = { vocal: '声乐', dance: '舞蹈', charm: '魅力' }
  const rows = songs.value.map(s => [
    s.name,
    typeText[s.type || 'team_show'] || s.type || '公演',
    genderText[s.singerGender || ''] || '',
    s.style || '',
    s.difficulty ?? 3,
    mainAttrText[s.mainAttribute || 'vocal'] || '声乐',
    s.baseVocal ?? 30,
    s.baseDance ?? 30,
    s.risk ?? 10
  ])
  const csv = [header.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const dateStr = new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')
  a.href = url
  a.download = `歌曲库_${dateStr}.csv`
  a.click()
  URL.revokeObjectURL(url)
  MessagePlugin.success(`已导出 ${rows.length} 首歌曲`)
}

function triggerImportCsv() {
  csvImportInput.value?.click()
}

// CSV 导入：解析后追加导入（不覆盖原有）
async function handleImportCsv(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  try {
    const buffer = await file.arrayBuffer()
    const uint8 = new Uint8Array(buffer)
    let text = new TextDecoder('utf-8', { fatal: false }).decode(uint8)
    if (text.includes('\uFFFD')) {
      text = new TextDecoder('gbk', { fatal: false }).decode(uint8)
    }
    const lines = text.split('\n').map(l => l.trim()).filter(l => l)
    if (lines.length < 2) {
      MessagePlugin.warning('CSV 文件为空或格式不正确')
      return
    }

    // 解析表头（去掉 BOM）
    const headers = lines[0].replace(/^\uFEFF/, '').split(',').map(h => h.trim())
    const typeTextReverse: Record<string, string> = { 独唱: 'solo', 合唱: 'duet', 团秀: 'group', 公演: 'team_show' }
    const genderTextReverse: Record<string, string> = { 男歌手: 'male', 女歌手: 'female' }
    const mainAttrTextReverse: Record<string, string> = { 声乐: 'vocal', 舞蹈: 'dance', 魅力: 'charm' }

    // 解析一行（支持带引号）
    function parseLine(line: string): string[] {
      const result: string[] = []
      let cur = ''
      let inQuote = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (inQuote) {
          if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
          else if (ch === '"') inQuote = false
          else cur += ch
        } else {
          if (ch === '"') inQuote = true
          else if (ch === ',') { result.push(cur); cur = '' }
          else cur += ch
        }
      }
      result.push(cur)
      return result.map(v => v.trim())
    }

    const idx = (h: string) => headers.findIndex(x => x.trim() === h)
    const songsToImport: any[] = []
    const errors: string[] = []

    for (let i = 1; i < lines.length; i++) {
      const cols = parseLine(lines[i])
      const nameIdx = idx('歌名')
      const name = cols[nameIdx] || ''
      if (!name) {
        errors.push(`第 ${i + 1} 行: 缺少歌名`)
        continue
      }
      const typeVal = idx('类型') >= 0 ? (cols[idx('类型')] || '') : ''
      const genderVal = idx('歌手性别') >= 0 ? (cols[idx('歌手性别')] || '') : ''
      const mainAttrVal = idx('主属性') >= 0 ? (cols[idx('主属性')] || '') : ''
      songsToImport.push({
        name,
        type: typeTextReverse[typeVal] || typeVal || 'team_show',
        singerGender: genderTextReverse[genderVal] || genderVal || '',
        style: idx('风格') >= 0 ? cols[idx('风格')] : '流行',
        difficulty: idx('难度') >= 0 ? (parseInt(cols[idx('难度')]) || 3) : 3,
        mainAttribute: mainAttrTextReverse[mainAttrVal] || 'vocal',
        baseVocal: idx('基准Vocal') >= 0 ? (parseInt(cols[idx('基准Vocal')]) || 30) : 30,
        baseDance: idx('基准Dance') >= 0 ? (parseInt(cols[idx('基准Dance')]) || 30) : 30,
        risk: idx('风险值') >= 0 ? (parseInt(cols[idx('风险值')]) || 10) : 10
      })
    }

    if (songsToImport.length === 0) {
      MessagePlugin.warning('没有有效的歌曲数据可导入')
      return
    }

    const confirmed = window.confirm(`将从表格导入 ${songsToImport.length} 首歌曲（追加到现有歌曲库，不覆盖原有）${errors.length ? `，${errors.length} 行跳过` : ''}。是否继续？`)
    if (!confirmed) return

    csvImporting.value = true
    try {
      await batchCreateSongs(songsToImport)
      MessagePlugin.success(`成功导入 ${songsToImport.length} 首歌曲${errors.length ? `，${errors.length} 行跳过` : ''}`)
      await loadSongs()
    } catch (err: any) {
      MessagePlugin.error(err.message || '导入失败')
    } finally {
      csvImporting.value = false
    }
  } catch (err: any) {
    MessagePlugin.error('读取 CSV 文件失败: ' + (err.message || '未知错误'))
  }

  target.value = ''
}

// 随机产生歌曲
const randomSongLoading = ref(false)

interface BatchSongItem {
  name: string
  type: string
  style: string
  difficulty: number
  mainAttribute: string
  baseVocal: number
  baseDance: number
  risk: number
  singerGender: string
}

function createEmptyBatchSong(): BatchSongItem {
  return {
    name: '',
    type: 'team_show',
    style: '流行',
    difficulty: 3,
    mainAttribute: 'vocal',
    baseVocal: 30,
    baseDance: 30,
    risk: 10,
    singerGender: ''
  }
}

const batchSongList = ref<BatchSongItem[]>([createEmptyBatchSong()])

function addBatchRow() {
  batchSongList.value.push(createEmptyBatchSong())
}

function removeBatchRow(idx: number) {
  batchSongList.value.splice(idx, 1)
}

const form = reactive({
  name: '',
  type: 'team_show',
  style: '流行',
  difficulty: 3,
  baseVocal: 30,
  baseDance: 30,
  risk: 10,
  mainAttribute: 'vocal',
  description: '',
  singerGender: ''
})

const rules = {
  name: [{ required: true, message: '请输入歌名', type: 'error' }]
}

const columns = [
  { colKey: 'name', title: '歌名', width: 160, ellipsis: true },
  { colKey: 'style', title: '风格', width: 100 },
  { colKey: 'difficulty', title: '难度', width: 80 },
  { colKey: 'mainAttribute', title: '主属性', width: 100 },
  { colKey: 'baseVocal', title: '基准Vocal', width: 100 },
  { colKey: 'baseDance', title: '基准Dance', width: 100 },
  { colKey: 'risk', title: '风险值', width: 80 },
  { colKey: 'type', title: '类型', width: 100 },
  { colKey: 'singerGender', title: '歌手性别', width: 100 },
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

function mainAttrLabel(attr?: string) {
  const map: Record<string, string> = { vocal: '🎤 声乐', dance: '💃 舞蹈', charm: '✨ 魅力' }
  return map[attr || ''] || '🎤 声乐'
}

function genderTheme(gender?: string) {
  return gender === 'female' ? 'danger' : 'primary'
}

function genderLabel(gender?: string) {
  return gender === 'female' ? '女歌手' : gender === 'male' ? '男歌手' : gender || '-'
}

async function loadSongs() {
  loading.value = true
  try {
    const res = await getSongsPaged({
      page: pagination.page,
      pageSize: pagination.pageSize,
      type: filters.type || undefined,
      style: filters.style || undefined,
      keyword: filters.keyword || undefined,
      singerGender: filters.singerGender || undefined
    })
    songs.value = res.list
    pagination.total = res.total
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
  filters.singerGender = ''
  pagination.page = 1
  loadSongs()
}

function onPageSizeChange(size: number) {
  pagination.pageSize = size
  pagination.page = 1
  loadSongs()
}

function resetPageAndLoad() {
  pagination.page = 1
  loadSongs()
}

function editSong(song: Song) {
  editingSong.value = song
  form.name = song.name
  form.type = song.type || 'team_show'
  form.style = song.style || '流行'
  form.difficulty = song.difficulty || 3
  form.baseVocal = song.baseVocal ?? 30
  form.baseDance = song.baseDance ?? 30
  form.risk = song.risk ?? 10
  form.mainAttribute = song.mainAttribute || 'vocal'
  form.description = song.description || ''
  form.singerGender = song.singerGender || ''
  showAddDialog.value = true
}

function resetForm() {
  editingSong.value = null
  form.name = ''
  form.type = 'team_show'
  form.style = '流行'
  form.difficulty = 3
  form.baseVocal = 30
  form.baseDance = 30
  form.risk = 10
  form.mainAttribute = 'vocal'
  form.description = ''
  form.singerGender = ''
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

// 随机产生歌曲
async function handleRandomSong(gender: 'male' | 'female') {
  randomSongLoading.value = true
  try {
    const song = await randomSong(gender)
    MessagePlugin.success(`成功随机产生${gender === 'female' ? '女歌手' : '男歌手'}歌曲: ${song.name}`)
    await loadSongs()
  } catch (e: any) {
    MessagePlugin.error(e.message || '随机产生歌曲失败')
  } finally {
    randomSongLoading.value = false
  }
}

// 清空歌曲库
async function handleClearAllSongs() {
  try {
    const res = await deleteAllSongs()
    MessagePlugin.success(`已清空歌曲库，共删除 ${res.count} 首歌曲`)
    await loadSongs()
  } catch (e: any) {
    MessagePlugin.error(e.message || '清空歌曲库失败')
  }
}

// 批量导入
function resetBatchForm() {
  batchSongList.value = [createEmptyBatchSong()]
}

async function doBatchImport() {
  const validSongs = batchSongList.value.filter(s => s.name.trim())
  if (validSongs.length === 0) {
    MessagePlugin.warning('请至少填写一首歌的歌名')
    return
  }
  batchSaving.value = true
  try {
    await batchCreateSongs(validSongs as any)
    MessagePlugin.success(`成功导入 ${validSongs.length} 首歌曲`)
    showBatchDialog.value = false
    resetBatchForm()
    await loadSongs()
  } catch (e: any) {
    MessagePlugin.error(e.message || '批量导入失败')
  } finally {
    batchSaving.value = false
  }
}

onMounted(loadSongs)
</script>

<style scoped lang="scss">
.admin-song-manage {
  min-height: 100%;
  padding: 20px;
  background: var(--bg-primary);
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;

  h1 {
    margin: 0 0 4px;
    font-size: 22px;
    color: var(--text-primary);
  }

  p {
    margin: 0;
    color: var(--text-secondary);
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

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;

  @media (max-width: 560px) { grid-template-columns: 1fr; }
}

.song-form { overflow-x: hidden; }
.song-form :deep(.t-form__item) { min-width: 0; }
.song-form :deep(.t-form__controls-content) { min-width: 0; flex-wrap: wrap; }

.form-section-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary);
  margin: 4px 0 12px;
  padding-left: 8px;
  border-left: 3px solid #0052d9;
  line-height: 1;
}

.field-with-hint { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0; flex-wrap: wrap; }
.field-with-hint :deep(.t-input-number) { width: 120px !important; }
.field-with-hint .field-hint { font-size: 12px; color: var(--text-tertiary); white-space: nowrap; }

.song-form :deep(.t-input-number),
.song-form :deep(.t-select),
.song-form :deep(.t-input) {
  width: 100%;
}

.difficulty-num {
  font-weight: 600;
}

.batch-import {
  .batch-rows {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 500px;
    overflow-y: auto;
    padding-right: 4px;
  }

  .batch-row-card {
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 10px 14px;
    background: var(--table-header-bg);
    flex-shrink: 0;
    transition: border-color 0.2s;

    &:hover {
      border-color: #d0d0d0;
      background: var(--card-bg);
    }

    .batch-row-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;

      .batch-row-index {
        font-weight: 600;
        font-size: 13px;
        color: var(--text-tertiary);
      }
    }

    .batch-row-body {
      display: flex;
      gap: 16px;
      padding: 0;

      .batch-row-left,
      .batch-row-right {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
      }
    }

    .batch-field {
      display: flex;
      align-items: center;
      gap: 6px;

      .batch-label {
        font-size: 12px;
        color: var(--text-secondary);
        white-space: nowrap;
        flex-shrink: 0;
        width: 52px;
        text-align: right;
      }

      :deep(.t-input),
      :deep(.t-select),
      :deep(.t-input-number) {
        width: 100%;
      }

      :deep(.t-input-number) {
        width: 100%;
      }
    }
  }
}
</style>
