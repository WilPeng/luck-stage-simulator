<template>
  <div class="admin-card-manage">
    <div class="page-header">
      <div>
        <h1>训练卡牌库管理</h1>
        <p>管理全局卡牌库，所有轮次训练均从此库中抽卡</p>
      </div>
      <t-button theme="primary" @click="showAddDialog = true">
        <template #icon><AddIcon /></template>
        新增卡牌
      </t-button>
    </div>

    <t-card :bordered="false" :loading="loading" class="cards-card">
      <t-table
        :data="cards"
        :columns="columns"
        row-key="id"
        size="medium"
      >
        <template #type="{ row }">
          <t-tag :theme="typeTheme(row.type)" variant="light" size="small">
            {{ typeLabel(row.type) }}
          </t-tag>
        </template>
        <template #effect="{ row }">
          <div class="effect-list">
            <span v-for="(val, key) in row.effect" :key="key" class="effect-item">
              {{ effectLabel(key) }} {{ val >= 0 ? '+' : '' }}{{ val }}
            </span>
            <span v-if="!row.effect || Object.keys(row.effect).length === 0" class="no-effect">无效果</span>
          </div>
        </template>
        <template #weight="{ row }">
          <span class="weight-value">{{ row.weight }}</span>
        </template>
        <template #enabled="{ row }">
          <t-switch :value="row.enabled !== false" disabled />
        </template>
        <template #action="{ row }">
          <t-space>
            <t-button variant="text" theme="primary" size="small" @click="editCard(row)">编辑</t-button>
            <t-popconfirm content="确定删除该卡牌？" @confirm="doDelete(row.id)">
              <t-button variant="text" theme="danger" size="small">删除</t-button>
            </t-popconfirm>
          </t-space>
        </template>
      </t-table>
    </t-card>

    <t-dialog
      v-model:visible="showAddDialog"
      :header="editingCard ? '编辑卡牌' : '新增卡牌'"
      :confirm-btn="{ content: '保存', loading: saving }"
      :cancel-btn="{}"
      width="560px"
      @confirm="doSave"
    >
      <t-form :data="form" :rules="rules" label-width="90px">
        <t-form-item label="卡牌名称" name="name">
          <t-input v-model="form.name" placeholder="如：声乐特训" />
        </t-form-item>
        <t-form-item label="卡牌类型" name="type">
          <t-select v-model="form.type">
            <t-option value="vocal" label="声乐" />
            <t-option value="dance" label="舞蹈" />
            <t-option value="charm" label="魅力" />
            <t-option value="mixed" label="综合" />
            <t-option value="event" label="事件" />
            <t-option value="self_select" label="自选属性" />
          </t-select>
        </t-form-item>
        <t-form-item label="抽卡权重">
          <t-input-number v-model="form.weight" :min="1" :max="100" />
          <span class="form-hint">权重越大越容易被抽到</span>
        </t-form-item>
        <t-form-item label="属性效果">
          <div class="effect-form">
            <div class="effect-row">
              <label>声乐</label>
              <t-input-number v-model="form.effect.vocal" :min="-10" :max="10" size="small" />
              <label>舞蹈</label>
              <t-input-number v-model="form.effect.dance" :min="-10" :max="10" size="small" />
              <label>魅力</label>
              <t-input-number v-model="form.effect.charm" :min="-10" :max="10" size="small" />
            </div>
            <div class="effect-row">
              <label>随机单属性</label>
              <t-input-number v-model="form.effect.randomOne" :min="-10" :max="10" size="small" />
              <label>随机双属性</label>
              <t-input-number v-model="form.effect.randomTwo" :min="-10" :max="10" size="small" />
              <label>补弱</label>
              <t-input-number v-model="form.effect.lowest" :min="-10" :max="10" size="small" />
              <label>增强</label>
              <t-input-number v-model="form.effect.highest" :min="-10" :max="10" size="small" />
            </div>
            <div class="effect-row">
              <label>自选属性</label>
              <t-input-number v-model="form.effect.selfSelect" :min="-10" :max="10" size="small" />
            </div>
          </div>
        </t-form-item>
        <t-form-item label="启用">
          <t-switch v-model="form.enabled" />
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
import type { TrainingCard } from '../../types/training'

const cards = ref<TrainingCard[]>([])
const loading = ref(false)
const saving = ref(false)
const showAddDialog = ref(false)
const editingCard = ref<TrainingCard | null>(null)

const form = reactive({
  name: '',
  type: 'mixed',
  description: '',
  effect: {
    vocal: 0,
    dance: 0,
    charm: 0,
    randomOne: 0,
    randomTwo: 0,
    lowest: 0,
    highest: 0,
    selfSelect: 0
  },
  weight: 10,
  enabled: true
})

const rules = {
  name: [{ required: true, message: '请输入卡牌名称', type: 'error' }]
}

const columns = [
  { colKey: 'name', title: '卡牌名称', width: 160 },
  { colKey: 'type', title: '类型', width: 80 },
  { colKey: 'effect', title: '属性效果', width: 260 },
  { colKey: 'weight', title: '权重', width: 80 },
  { colKey: 'enabled', title: '状态', width: 80 },
  { colKey: 'description', title: '描述', width: 200, ellipsis: true },
  { colKey: 'action', title: '操作', width: 120 }
]

function typeTheme(type?: string) {
  const map: Record<string, string> = { vocal: 'warning', dance: 'primary', charm: 'success', mixed: 'default', event: 'danger', self_select: 'warning' }
  return map[type || 'mixed'] || 'default'
}

function typeLabel(type?: string) {
  const map: Record<string, string> = { vocal: '声乐', dance: '舞蹈', charm: '魅力', mixed: '综合', event: '事件', self_select: '自选' }
  return map[type || 'mixed'] || type || '综合'
}

function effectLabel(key: string): string {
  const map: Record<string, string> = { vocal: '声乐', dance: '舞蹈', charm: '魅力', randomOne: '随机单', randomTwo: '随机双', lowest: '补弱', highest: '增强', selfSelect: '自选' }
  return map[key] || key
}

async function loadCards() {
  loading.value = true
  try {
    const { getTrainingCards } = await import('../../services/api')
    const data = await getTrainingCards()
    cards.value = data
  } catch (e: any) {
    MessagePlugin.error('加载卡牌列表失败: ' + e.message)
  } finally {
    loading.value = false
  }
}

function editCard(card: TrainingCard) {
  editingCard.value = card
  form.name = card.name
  form.type = card.type || 'mixed'
  form.description = card.description || ''
  form.effect = {
    vocal: (card.effect as any)?.vocal ?? 0,
    dance: (card.effect as any)?.dance ?? 0,
    charm: (card.effect as any)?.charm ?? 0,
    randomOne: (card.effect as any)?.randomOne ?? 0,
    randomTwo: (card.effect as any)?.randomTwo ?? 0,
    lowest: (card.effect as any)?.lowest ?? 0,
    highest: (card.effect as any)?.highest ?? 0,
    selfSelect: (card.effect as any)?.selfSelect ?? 0
  }
  form.weight = card.weight ?? 10
  form.enabled = card.enabled !== false
  showAddDialog.value = true
}

function resetForm() {
  editingCard.value = null
  form.name = ''
  form.type = 'mixed'
  form.description = ''
  form.effect = { vocal: 0, dance: 0, charm: 0, randomOne: 0, randomTwo: 0, lowest: 0, highest: 0, selfSelect: 0 }
  form.weight = 10
  form.enabled = true
}

async function doSave() {
  if (!form.name.trim()) {
    MessagePlugin.warning('请输入卡牌名称')
    return
  }
  saving.value = true

  // 保留所有非 0 的效果值（允许负数）
  const effect: Record<string, number> = {}
  Object.entries(form.effect).forEach(([k, v]) => {
    if (v !== 0) effect[k] = v
  })

  const payload = {
    name: form.name,
    type: form.type,
    description: form.description,
    effect,
    weight: form.weight,
    enabled: form.enabled
  }

  try {
    const { createTrainingCard, updateTrainingCard } = await import('../../services/api')
    if (editingCard.value) {
      await updateTrainingCard(editingCard.value.id, payload)
      MessagePlugin.success('卡牌已更新')
    } else {
      await createTrainingCard(payload)
      MessagePlugin.success('卡牌已添加')
    }
    showAddDialog.value = false
    resetForm()
    await loadCards()
  } catch (e: any) {
    MessagePlugin.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function doDelete(id: string) {
  try {
    const { deleteTrainingCard } = await import('../../services/api')
    await deleteTrainingCard(id)
    MessagePlugin.success('卡牌已删除')
    await loadCards()
  } catch (e: any) {
    MessagePlugin.error(e.message || '删除失败')
  }
}

onMounted(loadCards)
</script>

<style scoped lang="scss">
.admin-card-manage {
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

.cards-card {
  border-radius: 12px;
}

.effect-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.effect-item {
  font-size: 12px;
  padding: 1px 6px;
  background: #f0f5ff;
  color: #0052d9;
  border-radius: 4px;
  white-space: nowrap;
}

.no-effect {
  font-size: 12px;
  color: #999;
}

.weight-value {
  font-weight: 600;
  color: #e67e22;
}

.form-hint {
  font-size: 11px;
  color: #999;
  margin-left: 8px;
}

.effect-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;

  .effect-row {
    display: flex;
    align-items: center;
    gap: 8px;

    label {
      font-size: 12px;
      color: #666;
      white-space: nowrap;
      min-width: 60px;
    }
  }
}
</style>
