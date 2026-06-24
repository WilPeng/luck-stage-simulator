<template>
  <div class="admin-training-page">
    <!-- 加载状态 -->
    <div v-if="store.loading" class="loading-overlay">
      <t-loading text="加载中..." size="large" />
    </div>

    <template v-else>
      <!-- 操作按钮区 -->
      <div class="action-section">
        <t-space direction="vertical" :size="12" style="width: 100%">
          <t-button theme="success" block :loading="autoCompleting" @click="handleAutoCompleteAll">
            <template #icon><t-icon name="check-circle" /></template>
            一键完成所有训练
          </t-button>
        </t-space>
      </div>

      <!-- 训练情况查询 -->
      <div class="training-records-section">
        <div class="section-header">
          <h2>选手训练情况</h2>
          <t-space>
            <span class="expected-count-label">期望训练次数</span>
            <t-input-number v-model="expectedTrainingCount" :min="1" :max="20" size="small" />
            <t-button
              theme="primary"
              variant="outline"
              size="small"
              :loading="store.saving"
              @click="handleSaveExpectedCount"
            >
              保存
            </t-button>
            <t-tag theme="primary" variant="light">
              {{ trainingUsers.length }} 位选手 / {{ trainingRecords.length }} 条记录
            </t-tag>
          </t-space>
        </div>

        <div v-if="recordsLoading || playersLoading" class="records-loading">
          <t-loading text="加载中..." size="small" />
        </div>

        <div v-else-if="trainingUsers.length === 0" class="empty-records">
          <t-empty description="暂无选手数据" />
        </div>

        <div v-else>
          <div class="training-users-table">
            <div class="table-header">
              <span class="col-player">选手</span>
              <span class="col-records">本轮训练卡牌</span>
              <span class="col-attributes">训练后数值</span>
              <span class="col-actions">操作</span>
            </div>
            <div
              v-for="user in paginatedUsers"
              :key="user.userId"
              class="table-row"
              :class="{ completed: user.recordCount >= expectedTrainingCount }"
            >
              <div class="col-player">
                <span class="player-name">{{ user.userName || user.userId }}</span>
                <t-tag
                  :theme="user.recordCount >= expectedTrainingCount ? 'success' : 'warning'"
                  variant="light"
                  size="small"
                >
                  {{ user.recordCount }} / {{ expectedTrainingCount }}
                </t-tag>
              </div>
              <div class="col-records">
                <div v-if="user.records.length === 0" class="no-records">暂无训练记录</div>
                <div v-else class="record-tags">
                  <t-tooltip
                    v-for="record in user.records"
                    :key="record.id"
                    :content="getRecordTooltip(record)"
                    placement="top"
                  >
                    <t-tag theme="primary" variant="light" size="small" class="record-tag">
                      {{ record.cardName }}
                    </t-tag>
                  </t-tooltip>
                </div>
              </div>
              <div class="col-attributes">
                <div class="attr-tags">
                  <t-tag theme="danger" variant="light" size="small">
                    声乐 {{ getLatestAttributes(user).vocal }}
                  </t-tag>
                  <t-tag theme="success" variant="light" size="small">
                    舞蹈 {{ getLatestAttributes(user).dance }}
                  </t-tag>
                  <t-tag theme="primary" variant="light" size="small">
                    魅力 {{ getLatestAttributes(user).charm }}
                  </t-tag>
                </div>
              </div>
              <div class="col-actions">
                <t-button
                  theme="success"
                  variant="outline"
                  size="small"
                  :loading="trainingUserId === user.userId"
                  @click="handleTrainOnce(user.userId)"
                >
                  排练1次
                </t-button>
                <t-button
                  theme="danger"
                  variant="outline"
                  size="small"
                  :loading="cancelingUserId === user.userId"
                  @click="handleCancelRound(user.userId, user.userName)"
                >
                  取消本轮成果
                </t-button>
              </div>
            </div>
          </div>

          <div class="pagination-wrapper">
            <t-pagination
              v-model="currentPage"
              v-model:pageSize="pageSize"
              :total="trainingUsers.length"
              :pageSizeOptions="[5, 10, 20]"
              size="small"
              showJumper
            />
          </div>
        </div>
      </div>

      <!-- 卡牌列表 -->
      <div class="cards-section">
        <div class="section-header">
          <h2>卡牌列表</h2>
          <t-tag theme="primary" variant="light">
            {{ store.enabledCards.length }} / {{ store.cards.length }} 启用
          </t-tag>
        </div>
        <div class="cards-grid">
          <div
            v-for="card in store.cards"
            :key="card.id"
            class="card-item"
            :class="{ disabled: !card.enabled }"
          >
            <div class="card-header">
              <t-tag :theme="getTypeTheme(card.type)" variant="light" size="small">
                {{ getTypeText(card.type) }}
              </t-tag>
              <t-tag v-if="!card.enabled" theme="default" variant="outline" size="small">
                已停用
              </t-tag>
            </div>
            <h3 class="card-name">{{ card.name }}</h3>
            <p class="card-desc">{{ card.description }}</p>
            <div class="card-effects">
              <div v-if="card.effect.vocal" class="effect-row">
                <span class="effect-label">🎤 Vocal</span>
                <span class="effect-value" :class="getEffectClass(card.effect.vocal)">
                  {{ formatEffect(card.effect.vocal) }}
                </span>
              </div>
              <div v-if="card.effect.dance" class="effect-row">
                <span class="effect-label">💃 Dance</span>
                <span class="effect-value" :class="getEffectClass(card.effect.dance)">
                  {{ formatEffect(card.effect.dance) }}
                </span>
              </div>
              <div v-if="card.effect.charm" class="effect-row">
                <span class="effect-label">✨ Charm</span>
                <span class="effect-value" :class="getEffectClass(card.effect.charm)">
                  {{ formatEffect(card.effect.charm) }}
                </span>
              </div>
              <div v-if="card.effect.randomOne" class="effect-row">
                <span class="effect-label">🎲 随机一项</span>
                <span class="effect-value positive">+{{ card.effect.randomOne }}</span>
              </div>
              <div v-if="card.effect.lowest" class="effect-row">
                <span class="effect-label">📉 最低属性</span>
                <span class="effect-value positive">+{{ card.effect.lowest }}</span>
              </div>
              <div v-if="card.effect.highest" class="effect-row">
                <span class="effect-label">📈 最高属性</span>
                <span class="effect-value positive">+{{ card.effect.highest }}</span>
              </div>
            </div>
            <div class="card-footer">
              <span class="weight-info">权重: {{ card.weight }}</span>
              <t-space>
                <t-button theme="primary" variant="text" size="small" @click="handleEditCard(card)">
                  编辑
                </t-button>
                <t-button
                  :theme="card.enabled ? 'warning' : 'success'"
                  variant="text"
                  size="small"
                  @click="handleToggleEnable(card)"
                >
                  {{ card.enabled ? '停用' : '启用' }}
                </t-button>
                <t-button theme="danger" variant="text" size="small" @click="handleDeleteCard(card)">
                  删除
                </t-button>
              </t-space>
            </div>
          </div>
        </div>
        <t-empty v-if="store.cards.length === 0" description="暂无卡牌数据" />
      </div>
    </template>

    <!-- 新增/编辑卡牌弹窗 -->
    <t-dialog
      v-model:visible="cardDialogVisible"
      :header="editingCard ? '编辑卡牌' : '新增卡牌'"
      width="500px"
      :close-on-overlay-click="false"
      :destroy-on-close="true"
    >
      <t-form :data="cardForm" :rules="cardRules" layout="vertical">
        <t-form-item label="卡牌名称" name="name">
          <t-input v-model="cardForm.name" placeholder="请输入卡牌名称" />
        </t-form-item>
        <t-form-item label="卡牌类型" name="type">
          <t-select v-model="cardForm.type" placeholder="请选择卡牌类型">
            <t-option value="vocal" label="声乐" />
            <t-option value="dance" label="舞蹈" />
            <t-option value="charm" label="魅力" />
            <t-option value="mixed" label="综合" />
            <t-option value="event" label="事件" />
          </t-select>
        </t-form-item>
        <t-form-item label="卡牌描述" name="description">
          <t-textarea v-model="cardForm.description" placeholder="请输入卡牌描述" />
        </t-form-item>
        <t-form-item label="权重" name="weight">
          <t-input-number v-model="cardForm.weight" :min="1" :max="100" theme="column" />
        </t-form-item>
        <t-form-item label="是否启用">
          <t-switch v-model="cardForm.enabled" />
        </t-form-item>
        <div class="effect-section">
          <h4>效果设置</h4>
          <t-form-item label="Vocal 效果">
            <t-input-number v-model="cardForm.effect.vocal" :min="-20" :max="20" theme="column" placeholder="留空为无效果" />
          </t-form-item>
          <t-form-item label="Dance 效果">
            <t-input-number v-model="cardForm.effect.dance" :min="-20" :max="20" theme="column" placeholder="留空为无效果" />
          </t-form-item>
          <t-form-item label="Charm 效果">
            <t-input-number v-model="cardForm.effect.charm" :min="-20" :max="20" theme="column" placeholder="留空为无效果" />
          </t-form-item>
          <t-form-item label="随机一项效果">
            <t-input-number v-model="cardForm.effect.randomOne" :min="1" :max="20" theme="column" placeholder="留空为无效果" />
          </t-form-item>
          <t-form-item label="随机两项效果">
            <t-input-number v-model="cardForm.effect.randomTwo" :min="1" :max="20" theme="column" placeholder="留空为无效果" />
          </t-form-item>
          <t-form-item label="最高属性加成">
            <t-input-number v-model="cardForm.effect.highest" :min="1" :max="20" theme="column" placeholder="留空为无效果" />
          </t-form-item>
          <t-form-item label="最低属性加成">
            <t-input-number v-model="cardForm.effect.lowest" :min="1" :max="20" theme="column" placeholder="留空为无效果" />
          </t-form-item>
        </div>
      </t-form>
      <template #footer>
        <t-space>
          <t-button @click="cardDialogVisible = false">取消</t-button>
          <t-button theme="primary" :loading="saving" @click="handleSaveCard">确定</t-button>
        </t-space>
      </template>
    </t-dialog>

    <!-- 一键完成结果弹窗 -->
    <t-dialog
      v-model:visible="resultDialogVisible"
      header="训练完成"
      width="500px"
      :destroy-on-close="true"
    >
      <div class="result-content">
        <t-empty description="训练已完成">
          <template #image>
            <t-icon name="check-circle" style="font-size: 64px; color: #2ecc71" />
          </template>
        </t-empty>
        <div class="result-stats">
          <div class="result-item">
            <span class="label">处理人数</span>
            <span class="value">{{ autoCompleteResult?.processedCount || 0 }}</span>
          </div>
          <div class="result-item">
            <span class="label">完成人数</span>
            <span class="value">{{ autoCompleteResult?.processedCount || 0 }}</span>
          </div>
        </div>
        <div v-if="autoCompleteResults.length > 0" class="result-details">
          <h4>详细结果</h4>
          <div class="result-list">
            <div v-for="item in autoCompleteResults" :key="item.playerId" class="result-item-row">
              <span class="user-info">{{ item.playerName || item.playerId }}</span>
              <t-tag theme="success" size="small">
                已完成
              </t-tag>
              <span class="record-count">{{ item.draws?.length || 0 }} 张卡牌</span>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <t-button theme="primary" block @click="resultDialogVisible = false">确定</t-button>
      </template>
    </t-dialog>

    <!-- 删除确认弹窗 -->
    <t-dialog
      v-model:visible="deleteDialogVisible"
      header="确认删除"
      width="400px"
      :destroy-on-close="true"
    >
      <p>确定要删除卡牌「{{ deletingCard?.name }}」吗？此操作无法撤销。</p>
      <template #footer>
        <t-space>
          <t-button @click="deleteDialogVisible = false">取消</t-button>
          <t-button theme="danger" :loading="saving" @click="confirmDelete">删除</t-button>
        </t-space>
      </template>
    </t-dialog>

    <!-- 重置预设确认弹窗 -->
    <t-dialog
      v-model:visible="resetDialogVisible"
      header="确认重置"
      width="400px"
      :destroy-on-close="true"
    >
      <p>确定要重置为预设卡牌吗？当前自定义卡牌将被替换。</p>
      <template #footer>
        <t-space>
          <t-button @click="resetDialogVisible = false">取消</t-button>
          <t-button theme="warning" :loading="saving" @click="confirmReset">重置</t-button>
        </t-space>
      </template>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import { useTrainingCardStore } from '../../stores/trainingCardStore'
import { useSeasonStore } from '../../stores/seasonStore'
import { getUsers } from '../../services/api'
import type { TrainingCard, AutoCompleteResult, TrainingRecord } from '../../types/training'
import type { User } from '../../types/user'

const store = useTrainingCardStore()
const seasonStore = useSeasonStore()

// 当前轮次（从 seasonStore 获取）
const currentRound = computed(() => seasonStore.currentRoundIndex)

// 状态
const autoCompleting = ref(false)
const saving = ref(false)
const recordsLoading = ref(false)
const trainingRecords = ref<TrainingRecord[]>([])
const players = ref<User[]>([])
const playersLoading = ref(false)

// 期望训练次数（页面可临时调整，初始化时从配置读取）
const expectedTrainingCount = ref(3)

// 按用户分组的训练记录（包含所有选手，未训练者记录为空）
const trainingUsers = computed(() => {
  // 建立选手基础属性映射
  const playerMap = new Map<string, User>()
  players.value.forEach(player => playerMap.set(player.id, player))

  const map = new Map<string, { userId: string; userName: string; records: TrainingRecord[]; recordCount: number; attributes: { vocal: number; dance: number; charm: number } }>()

  // 先插入所有选手
  players.value.forEach(player => {
    map.set(player.id, {
      userId: player.id,
      userName: player.name || player.id,
      records: [],
      recordCount: 0,
      attributes: player.attributes || { vocal: 0, dance: 0, charm: 0 }
    })
  })

  // 再叠加训练记录
  trainingRecords.value.forEach(record => {
    const userId = record.userId
    if (!map.has(userId)) {
      map.set(userId, {
        userId,
        userName: record.userName || userId,
        records: [],
        recordCount: 0
      })
    }
    const user = map.get(userId)!
    user.records.push(record)
    user.recordCount++
  })

  // 已完成训练放前面，再按记录数降序
  return Array.from(map.values()).sort((a, b) => {
    const aCompleted = a.recordCount >= expectedTrainingCount.value ? 1 : 0
    const bCompleted = b.recordCount >= expectedTrainingCount.value ? 1 : 0
    if (bCompleted !== aCompleted) return bCompleted - aCompleted
    return b.recordCount - a.recordCount
  })
})

// 分页
const currentPage = ref(1)
const pageSize = ref(5)
const paginatedUsers = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return trainingUsers.value.slice(start, end)
})

// 操作按钮 loading 状态
const trainingUserId = ref<string | null>(null)
const cancelingUserId = ref<string | null>(null)

// 卡牌弹窗
const cardDialogVisible = ref(false)
const editingCard = ref<TrainingCard | null>(null)
const cardForm = ref({
  name: '',
  type: 'vocal' as TrainingCard['type'],
  description: '',
  weight: 10,
  enabled: true,
  effect: {
    vocal: undefined as number | undefined,
    dance: undefined as number | undefined,
    charm: undefined as number | undefined,
    randomOne: undefined as number | undefined,
    randomTwo: undefined as number | undefined,
    highest: undefined as number | undefined,
    lowest: undefined as number | undefined
  }
})

const cardRules = {
  name: [{ required: true, message: '请输入卡牌名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择卡牌类型', trigger: 'change' }],
  description: [{ required: true, message: '请输入卡牌描述', trigger: 'blur' }],
  weight: [{ required: true, message: '请输入权重', trigger: 'blur' }]
}

// 结果弹窗
const resultDialogVisible = ref(false)
const autoCompleteResult = ref<AutoCompleteResult | null>(null)
const autoCompleteResults = computed(() => autoCompleteResult.value?.results || [])

// 删除弹窗
const deleteDialogVisible = ref(false)
const deletingCard = ref<TrainingCard | null>(null)

// 重置弹窗
const resetDialogVisible = ref(false)

// 方法
function getTypeText(type: string): string {
  const texts: Record<string, string> = {
    vocal: '声乐',
    dance: '舞蹈',
    charm: '魅力',
    mixed: '综合',
    event: '事件'
  }
  return texts[type] || type
}

function getTypeTheme(type: string): 'primary' | 'warning' | 'danger' | 'success' | 'default' {
  const themes: Record<string, 'primary' | 'warning' | 'danger' | 'success' | 'default'> = {
    vocal: 'danger',
    dance: 'success',
    charm: 'primary',
    mixed: 'warning',
    event: 'default'
  }
  return themes[type] || 'default'
}

function getEffectClass(value: number | undefined): string {
  if (!value) return ''
  return value > 0 ? 'positive' : 'negative'
}

function formatEffect(value: number | undefined): string {
  if (!value) return '0'
  return value > 0 ? `+${value}` : `${value}`
}

function getAttrLabel(key: string): string {
  const labels: Record<string, string> = {
    vocal: 'Vocal',
    dance: 'Dance',
    charm: 'Charm',
    randomOne: '随机',
    randomTwo: '随机两项',
    highest: '最高',
    lowest: '最低'
  }
  return labels[key] || key
}

async function fetchPlayers(): Promise<void> {
  playersLoading.value = true
  try {
    // 队长本质上也是选手，需要参与训练，因此同时包含 player 和 captain
    const result = await getUsers({ pageSize: 1000 })
    players.value = (result.list || []).filter(
      u => u.role === 'player' || u.role === 'captain'
    )
  } catch (error: any) {
    MessagePlugin.error(error.message || '获取选手列表失败')
    players.value = []
  } finally {
    playersLoading.value = false
  }
}

async function fetchTrainingRecords(): Promise<void> {
  recordsLoading.value = true
  try {
    const result = await store.fetchRecords({
      round: currentRound.value,
      pageSize: 1000
    })
    trainingRecords.value = result
  } catch (error: any) {
    MessagePlugin.error(error.message || '获取训练记录失败')
    trainingRecords.value = []
  } finally {
    recordsLoading.value = false
  }
}

function getRecordTooltip(record: TrainingRecord): string {
  const effects = Object.entries(record.effect)
    .filter(([, value]) => value)
    .map(([key, value]) => `${getAttrLabel(key)} ${(value as number) > 0 ? '+' : ''}${value}`)
  return effects.length > 0 ? effects.join('，') : '无效果'
}

function getLatestAttributes(user: { records: TrainingRecord[]; attributes: { vocal: number; dance: number; charm: number } }): { vocal: number; dance: number; charm: number } {
  // 如果有训练记录，取最后一条训练的 attributesAfter
  if (user.records.length > 0) {
    const sorted = [...user.records].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    const lastAttrs = sorted[0].attributesAfter
    if (lastAttrs) return lastAttrs
  }
  // 没有训练记录或训练记录没有 attributesAfter，返回选手基础属性
  return user.attributes || { vocal: 0, dance: 0, charm: 0 }
}

async function handleTrainOnce(userId: string): Promise<void> {
  trainingUserId.value = userId
  try {
    await store.doDraw(userId, currentRound.value)
    MessagePlugin.success('已帮该选手排练1次')
    await fetchTrainingRecords()
  } catch (error: any) {
    MessagePlugin.error(error.message || '排练失败')
  } finally {
    trainingUserId.value = null
  }
}

async function handleCancelRound(userId: string, userName?: string): Promise<void> {
  const confirm = DialogPlugin.confirm({
    header: '确认取消',
    body: `确定要取消「${userName || userId}」本轮所有训练成果吗？此操作无法撤销。`,
    confirmBtn: '确定取消',
    cancelBtn: '再想想',
    theme: 'danger',
    onConfirm: async () => {
      confirm.destroy()
      cancelingUserId.value = userId
      try {
        // 调用后端接口删除该用户本轮训练记录
        await store.clearUserRoundRecords(userId, currentRound.value)
        MessagePlugin.success('已取消该选手本轮训练成果')
        await fetchTrainingRecords()
      } catch (error: any) {
        MessagePlugin.error(error.message || '取消失败')
      } finally {
        cancelingUserId.value = null
      }
    }
  })
}

function resetCardForm(): void {
  editingCard.value = null
  cardForm.value = {
    name: '',
    type: 'vocal',
    description: '',
    weight: 10,
    enabled: true,
    effect: {
      vocal: undefined,
      dance: undefined,
      charm: undefined,
      randomOne: undefined,
      randomTwo: undefined,
      highest: undefined,
      lowest: undefined
    }
  }
}

function populateCardForm(card: TrainingCard): void {
  cardForm.value = {
    name: card.name,
    type: card.type,
    description: card.description,
    weight: card.weight,
    enabled: card.enabled,
    effect: {
      vocal: card.effect.vocal,
      dance: card.effect.dance,
      charm: card.effect.charm,
      randomOne: card.effect.randomOne,
      randomTwo: card.effect.randomTwo,
      highest: card.effect.highest,
      lowest: card.effect.lowest
    }
  }
}

function handleAddCard(): void {
  resetCardForm()
  cardDialogVisible.value = true
}

function handleEditCard(card: TrainingCard): void {
  populateCardForm(card)
  cardDialogVisible.value = true
}

async function handleSaveCard(): Promise<void> {
  saving.value = true
  try {
    // 清理空值效果
    const effect: Record<string, number | undefined> = {}
    Object.entries(cardForm.value.effect).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        effect[key] = value
      }
    })

    if (editingCard.value) {
      await store.editCard(editingCard.value.id, {
        name: cardForm.value.name,
        type: cardForm.value.type,
        description: cardForm.value.description,
        weight: cardForm.value.weight,
        enabled: cardForm.value.enabled,
        effect: effect as any
      })
      MessagePlugin.success('卡牌已更新')
    } else {
      await store.addCard({
        name: cardForm.value.name,
        type: cardForm.value.type,
        description: cardForm.value.description,
        weight: cardForm.value.weight,
        enabled: cardForm.value.enabled,
        effect: effect as any
      })
      MessagePlugin.success('卡牌已创建')
    }
    cardDialogVisible.value = false
  } catch (e: any) {
    MessagePlugin.error(e.message || '操作失败')
  } finally {
    saving.value = false
  }
}

function handleDeleteCard(card: TrainingCard): void {
  deletingCard.value = card
  deleteDialogVisible.value = true
}

async function confirmDelete(): Promise<void> {
  if (!deletingCard.value) return
  saving.value = true
  try {
    await store.removeCard(deletingCard.value.id)
    MessagePlugin.success('卡牌已删除')
    deleteDialogVisible.value = false
    deletingCard.value = null
  } catch (e: any) {
    MessagePlugin.error(e.message || '删除失败')
  } finally {
    saving.value = false
  }
}

async function handleToggleEnable(card: TrainingCard): Promise<void> {
  try {
    await store.editCard(card.id, { enabled: !card.enabled })
    MessagePlugin.success(card.enabled ? '卡牌已停用' : '卡牌已启用')
  } catch (e: any) {
    MessagePlugin.error(e.message || '操作失败')
  }
}

function handleResetPresets(): void {
  resetDialogVisible.value = true
}

async function confirmReset(): Promise<void> {
  saving.value = true
  try {
    const result = await store.resetToPresets()
    MessagePlugin.success(`已重置，共 ${result.resetCount} 张预设卡牌`)
    resetDialogVisible.value = false
  } catch (e: any) {
    MessagePlugin.error(e.message || '重置失败')
  } finally {
    saving.value = false
  }
}

async function handleSaveExpectedCount(): Promise<void> {
  try {
    await store.saveConfig({ drawsPerPlayer: expectedTrainingCount.value })
    MessagePlugin.success('期望训练次数已保存')
  } catch (error: any) {
    MessagePlugin.error(error.message || '保存失败')
  }
}

async function handleAutoCompleteAll(): Promise<void> {
  const confirm = DialogPlugin.confirm({
    header: '确认操作',
    body: `确定要完成第 ${currentRound.value} 轮所有未完成选手的训练吗？`,
    confirmBtn: '确定',
    cancelBtn: '取消',
    onConfirm: async () => {
      confirm.destroy()
      autoCompleting.value = true
      try {
        const result = await store.doAutoCompleteAll(currentRound.value)
        autoCompleteResult.value = result
        resultDialogVisible.value = true
        // 完成后刷新训练记录
        await fetchTrainingRecords()
      } catch (e: any) {
        MessagePlugin.error(e.message || '操作失败')
      } finally {
        autoCompleting.value = false
      }
    }
  })
}

onMounted(async () => {
  await store.initialize()
  await seasonStore.fetchRounds()
  await fetchPlayers()
  await fetchTrainingRecords()

  // 从配置初始化期望训练次数
  if (store.config?.drawsPerPlayer) {
    expectedTrainingCount.value = store.config.drawsPerPlayer
  }
})
</script>

<style lang="scss" scoped>
.admin-training-page {
  background: #f5f7fa;
  min-height: 100%;
  padding: 16px;
}

.loading-overlay {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

// 统计卡片区
.stats-section {
  margin-bottom: 16px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;

  @media (min-width: 768px) {
    grid-template-columns: repeat(4, 1fr);
  }
}

.stat-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;

  &.total {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: #fff;
  }

  &.completed {
    background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
    color: #fff;
  }

  &.incomplete {
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    color: #fff;
  }

  &.rate {
    background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
    color: #fff;
  }
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: #1a1a1a;
  line-height: 1.2;
}

.stat-label {
  font-size: 12px;
  color: #8a8a8a;
  margin-top: 2px;
}

// 配置区
.config-section {
  margin-bottom: 16px;

  :deep(.t-card) {
    border-radius: 12px;
  }

  :deep(.t-card__header) {
    padding: 16px 20px 12px;
  }

  :deep(.t-card__body) {
    padding: 12px 20px 20px;
  }
}

.config-content {
  display: flex;
  flex-direction: column;
  gap: 16px;

  @media (min-width: 768px) {
    flex-direction: row;
    justify-content: space-between;
  }
}

.config-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.config-label {
  font-size: 14px;
  color: #666;
}

// 操作按钮区
.action-section {
  margin-bottom: 16px;
}

// 训练情况区域
.training-records-section {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.records-loading,
.empty-records {
  padding: 32px 0;
  display: flex;
  justify-content: center;
}

.training-users-table {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;

  .table-header {
    display: grid;
    grid-template-columns: 140px 1fr 180px 200px;
    gap: 12px;
    padding: 12px 16px;
    background: #f5f7fa;
    font-weight: 600;
    font-size: 14px;
    color: #333;
    border-bottom: 1px solid #e5e7eb;

    @media (max-width: 768px) {
      display: none;
    }
  }

  .table-row {
    display: grid;
    grid-template-columns: 140px 1fr 180px 200px;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid #f0f0f0;
    align-items: center;
    transition: background 0.2s ease;

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background: #fafafa;
    }

    &.completed {
      background: #f0fff4;

      &:hover {
        background: #e6f7ed;
      }
    }

    @media (max-width: 768px) {
      grid-template-columns: 1fr;
      gap: 8px;
    }
  }

  .col-player {
    display: flex;
    flex-direction: column;
    gap: 6px;

    .player-name {
      font-size: 15px;
      font-weight: 600;
      color: #333;
    }
  }

  .col-records {
    .no-records {
      color: #999;
      font-size: 13px;
    }

    .record-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .record-tag {
      cursor: pointer;
    }
  }

  .col-attributes {
    .attr-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .no-attributes {
      color: #999;
      font-size: 13px;
    }
  }

  .col-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;

    @media (max-width: 768px) {
      justify-content: flex-start;
    }
  }
}

.pagination-wrapper {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

// 统计卡片区未完成选手区
.incomplete-section {
  margin-bottom: 16px;

  :deep(.t-card) {
    border-radius: 12px;
  }
}

.incomplete-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.incomplete-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #f8f9fa;
  border-radius: 8px;
}

.user-name {
  font-size: 14px;
  color: #333;
}

// 卡牌列表区
.cards-section {
  margin-bottom: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 12px;

  h2 {
    font-size: 16px;
    font-weight: 600;
    color: #1a1a1a;
    margin: 0;
  }

  .expected-count-label {
    font-size: 13px;
    color: #666;
    white-space: nowrap;
  }
}

.cards-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;

  @media (min-width: 480px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (min-width: 1024px) {
    grid-template-columns: repeat(3, 1fr);
  }
}

.card-item {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: all 0.3s;

  &:not(.disabled):hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  }

  &.disabled {
    opacity: 0.7;
    background: #f8f9fa;
  }
}

.card-header {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}

.card-name {
  font-size: 15px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0 0 6px 0;
}

.card-desc {
  font-size: 12px;
  color: #8a8a8a;
  margin: 0 0 12px 0;
  line-height: 1.4;
}

.card-effects {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.effect-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 10px;
  background: #f8f9fa;
  border-radius: 6px;
}

.effect-label {
  font-size: 12px;
  color: #666;
}

.effect-value {
  font-size: 13px;
  font-weight: 600;

  &.positive {
    color: #2ecc71;
  }

  &.negative {
    color: #e74c3c;
  }
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid #eee;
}

.weight-info {
  font-size: 11px;
  color: #8a8a8a;
}

// 弹窗样式
.effect-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed #eee;

  h4 {
    font-size: 14px;
    font-weight: 600;
    color: #333;
    margin: 0 0 12px 0;
  }
}

// 结果弹窗
.result-content {
  padding: 20px 0;
}

.result-stats {
  display: flex;
  justify-content: center;
  gap: 40px;
  margin: 20px 0;

  .result-item {
    display: flex;
    flex-direction: column;
    align-items: center;

    .label {
      font-size: 12px;
      color: #8a8a8a;
    }

    .value {
      font-size: 28px;
      font-weight: 700;
      color: #1a1a1a;
    }
  }
}

.result-details {
  margin-top: 20px;

  h4 {
    font-size: 14px;
    font-weight: 600;
    color: #333;
    margin: 0 0 12px 0;
  }
}

.result-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.result-item-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #f8f9fa;
  border-radius: 6px;

  .user-info {
    flex: 1;
    font-size: 13px;
    color: #333;
  }

  .record-count {
    font-size: 12px;
    color: #8a8a8a;
  }
}
</style>
