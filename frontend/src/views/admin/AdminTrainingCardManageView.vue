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
              {{ effectLabel(key) }} {{ formatEffectDisplay(key, val) }}
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
      width="920px"
      :dialog-style="{ maxWidth: '94vw' }"
      @confirm="doSave"
    >
      <t-form :data="form" :rules="rules" label-width="80px">
        <!-- 基础信息 -->
        <div class="form-block">
          <div class="block-title">📇 基础信息</div>
          <t-row :gutter="12">
            <t-col :xs="24" :sm="12">
              <t-form-item label="卡牌名称" name="name">
                <t-input v-model="form.name" placeholder="如：声乐特训" />
              </t-form-item>
            </t-col>
            <t-col :xs="24" :sm="12">
              <t-form-item label="卡牌类型" name="type">
                <t-select v-model="form.type">
                  <t-option value="vocal" label="🎤 声乐" />
                  <t-option value="dance" label="💃 舞蹈" />
                  <t-option value="charm" label="✨ 魅力" />
                  <t-option value="mixed" label="🔀 综合" />
                  <t-option value="event" label="⚡ 事件" />
                  <t-option value="self_select" label="🎯 自选属性" />
                </t-select>
              </t-form-item>
            </t-col>
            <t-col :xs="24" :sm="12">
              <t-form-item label="抽卡权重">
                <t-input-number v-model="form.weight" :min="1" :max="100" style="width: 100%" />
                <span class="form-hint">权重越大越容易被抽到</span>
              </t-form-item>
            </t-col>
            <t-col :xs="24" :sm="12">
              <t-form-item label="启用">
                <t-switch v-model="form.enabled" />
              </t-form-item>
            </t-col>
          </t-row>
        </div>

        <!-- 属性效果 -->
        <div class="form-block">
          <div class="block-title">📊 属性效果（填写生效，0 表示不使用）</div>
          <div class="effect-grid">
            <!-- 固定属性 -->
            <div class="effect-card fixed">
              <div class="effect-card-title">🔧 固定属性</div>
              <div class="effect-field">
                <label>🎤 声乐</label>
                <t-input-number v-model="form.effect.vocal" :min="-10" :max="10" size="small" />
              </div>
              <div class="effect-field">
                <label>💃 舞蹈</label>
                <t-input-number v-model="form.effect.dance" :min="-10" :max="10" size="small" />
              </div>
              <div class="effect-field">
                <label>✨ 魅力</label>
                <t-input-number v-model="form.effect.charm" :min="-10" :max="10" size="small" />
              </div>
            </div>

            <!-- 随机效果 -->
            <div class="effect-card random">
              <div class="effect-card-title">🎲 随机效果</div>
              <div class="effect-field">
                <label>随机单属性</label>
                <t-input-number v-model="form.effect.randomOne" :min="-10" :max="10" size="small" />
              </div>
              <div class="effect-field">
                <label>随机双属性</label>
                <t-input-number v-model="form.effect.randomTwo" :min="-10" :max="10" size="small" />
              </div>
              <div class="effect-field">
                <label>幸运加成</label>
                <t-input-number v-model="form.effect.lucky" :min="-10" :max="15" size="small" />
                <span class="field-hint">随机一项大幅提升</span>
              </div>
            </div>

            <!-- 策略效果 -->
            <div class="effect-card strategy">
              <div class="effect-card-title">🧠 策略效果</div>
              <div class="effect-field">
                <label>补弱（最低项）</label>
                <t-input-number v-model="form.effect.lowest" :min="-10" :max="10" size="small" />
              </div>
              <div class="effect-field">
                <label>增强（最高项）</label>
                <t-input-number v-model="form.effect.highest" :min="-10" :max="10" size="small" />
              </div>
              <div class="effect-field">
                <label>均衡化</label>
                <t-input-number v-model="form.effect.balance" :min="-10" :max="10" size="small" />
                <span class="field-hint">拉近属性差距</span>
              </div>
            </div>

            <!-- 倍率与全员 -->
            <div class="effect-card boost">
              <div class="effect-card-title">⚡ 倍率 / 全员</div>
              <div class="effect-field">
                <label>随机倍率</label>
                <t-input-number v-model="form.effect.multiply" :min="0.1" :max="5" :step="0.1" :decimal-places="1" size="small" />
                <span class="field-hint">1=不变</span>
              </div>
              <div class="effect-field">
                <label>全体倍率</label>
                <t-input-number v-model="form.effect.multiplyAll" :min="0.1" :max="5" :step="0.1" :decimal-places="1" size="small" />
                <span class="field-hint">1=不变</span>
              </div>
              <div class="effect-field">
                <label>团队共振</label>
                <t-input-number v-model="form.effect.teamAll" :min="-10" :max="10" size="small" />
                <span class="field-hint">三项等额提升</span>
              </div>
            </div>

            <!-- 自选 -->
            <div class="effect-card self">
              <div class="effect-card-title">🎯 自选</div>
              <div class="effect-field">
                <label>自选属性</label>
                <t-input-number v-model="form.effect.selfSelect" :min="-10" :max="10" size="small" />
                <span class="field-hint">选手自行选择</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 描述 -->
        <div class="form-block">
          <div class="block-title">📝 卡牌描述</div>
          <t-form-item label="描述">
            <t-textarea v-model="form.description" :rows="2" placeholder="选填，展示给选手" />
          </t-form-item>
        </div>
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
    lucky: 0,
    lowest: 0,
    highest: 0,
    balance: 0,
    selfSelect: 0,
    multiply: 0,
    multiplyAll: 0,
    teamAll: 0
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
  const map: Record<string, string> = {
    vocal: '声乐', dance: '舞蹈', charm: '魅力',
    randomOne: '随机单', randomTwo: '随机双', lucky: '幸运',
    lowest: '补弱', highest: '增强', balance: '均衡',
    selfSelect: '自选', multiply: '随机倍率', multiplyAll: '全体倍率', teamAll: '团队共振'
  }
  return map[key] || key
}

function formatEffectDisplay(key: string, val: number): string {
  // 倍数效果显示为 ×1.5 格式
  if (key === 'multiply' || key === 'multiplyAll') {
    return '×' + val
  }
  return (val >= 0 ? '+' : '') + val
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
    lucky: (card.effect as any)?.lucky ?? 0,
    lowest: (card.effect as any)?.lowest ?? 0,
    highest: (card.effect as any)?.highest ?? 0,
    balance: (card.effect as any)?.balance ?? 0,
    selfSelect: (card.effect as any)?.selfSelect ?? 0,
    multiply: (card.effect as any)?.multiply ?? 0,
    multiplyAll: (card.effect as any)?.multiplyAll ?? 0,
    teamAll: (card.effect as any)?.teamAll ?? 0
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
  form.effect = { vocal: 0, dance: 0, charm: 0, randomOne: 0, randomTwo: 0, lucky: 0, lowest: 0, highest: 0, balance: 0, selfSelect: 0, multiply: 0, multiplyAll: 0, teamAll: 0 }
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
  background: var(--bg-primary);
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  background: var(--hover-bg);
  color: #0052d9;
  border-radius: 4px;
  white-space: nowrap;
}

.no-effect {
  font-size: 12px;
  color: var(--text-tertiary);
}

.weight-value {
  font-weight: 600;
  color: #e67e22;
}

.form-hint {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-left: 8px;
}

// 表单区块
.form-block {
  margin-bottom: 20px;

  .block-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border-color);
  }
}

// 效果分组网格（宽屏 3 列，窄屏自适应）
.effect-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.effect-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 12px;
  min-width: 0;

  &.fixed { border-left: 3px solid #3498db; }
  &.random { border-left: 3px solid #f39c12; }
  &.strategy { border-left: 3px solid #8e44ad; }
  &.boost { border-left: 3px solid #e74c3c; }
  &.self { border-left: 3px solid #27ae60; }

  .effect-card-title {
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 10px;
    color: var(--text-primary);
  }

  .effect-field {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    min-width: 0;

    &:last-child {
      margin-bottom: 0;
    }

    label {
      font-size: 12px;
      color: var(--text-secondary);
      white-space: nowrap;
      flex-shrink: 0;
      min-width: 64px;
    }

    .t-input-number {
      width: 110px;
      flex-shrink: 0;

      :deep(.t-input__inner) {
        min-width: 0;
        font-size: 13px;
      }
    }

    .field-hint {
      font-size: 10px;
      color: var(--text-tertiary);
      white-space: nowrap;
      flex-shrink: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
}

@media (max-width: 768px) {
  .effect-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .effect-grid {
    grid-template-columns: 1fr;
  }
}
</style>
