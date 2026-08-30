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
          <!-- 批量排练操作区 -->
          <div class="batch-train-bar" v-if="selectedUserCount > 0 || paginatedUsers.length > 0">
            <span class="batch-selected">已选 <strong>{{ selectedUserCount }}</strong> 位选手</span>
            <t-button
              theme="success"
              size="small"
              :loading="batchTrainingUserId === 'batch'"
              :disabled="selectedUserCount === 0"
              @click="handleBatchRandomTrain"
            >
              🎲 随机排练所选（每人 1~{{ expectedTrainingCount }} 次）
            </t-button>
            <t-button variant="text" size="small" @click="toggleUserSelectAll(selectedUserCount === 0)">
              {{ selectedUserCount === paginatedUsers.length && paginatedUsers.length > 0 ? '取消全选' : '全选本页' }}
            </t-button>
            <t-button variant="text" size="small" @click="clearUserSelection">清空选择</t-button>
          </div>

          <div class="training-users-table">
            <div class="table-header">
              <span class="col-select" style="width: 44px">
                <t-checkbox
                  :checked="selectedUserCount > 0 && selectedUserCount === paginatedUsers.length"
                  :indeterminate="selectedUserCount > 0 && selectedUserCount < paginatedUsers.length"
                  @change="(checked: any) => toggleUserSelectAll(checked)"
                />
              </span>
              <span class="col-player">选手</span>
              <span class="col-records">本轮训练卡牌</span>
              <span class="col-attributes">训练后数值</span>
              <span class="col-actions">操作</span>
            </div>
            <div
              v-for="user in paginatedUsers"
              :key="user.userId"
              class="table-row"
              :class="{
                completed: user.recordCount >= expectedTrainingCount,
                eliminated: user.eliminated,
                selected: selectedUserIds.has(user.userId)
              }"
            >
              <div class="col-select">
                <t-checkbox
                  :checked="selectedUserIds.has(user.userId)"
                  @change="(checked: any) => toggleUserSelect(user.userId, checked)"
                />
              </div>
              <div class="col-player">
                <span class="player-name">
                  {{ user.userName || user.userId }}
                  <t-tag v-if="user.eliminated" theme="danger" variant="light" size="small" class="eliminated-tag">已淘汰</t-tag>
                </span>
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

      <!-- 训练日志 -->
      <div class="training-logs-section">
        <div class="section-header">
          <h2>训练日志</h2>
          <t-tag theme="primary" variant="light">
            共 {{ logsTotal }} 条记录
          </t-tag>
        </div>

        <!-- 筛选工具栏 -->
        <div class="logs-filter-bar">
          <t-date-picker
            v-model="logsStartDate"
            mode="date"
            enable-time-picker
            placeholder="开始时间"
            size="small"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 170px"
          />
          <span class="filter-sep">至</span>
          <t-date-picker
            v-model="logsEndDate"
            mode="date"
            enable-time-picker
            placeholder="结束时间"
            size="small"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 170px"
          />
          <t-select
            v-model="logsFilterPlayer"
            placeholder="全部选手"
            clearable
            filterable
            size="small"
            style="width: 160px"
          >
            <t-option v-for="p in players" :key="p.id" :value="p.id" :label="p.name" />
          </t-select>
          <t-select
            v-model="logsFilterType"
            placeholder="全部类型"
            clearable
            size="small"
            style="width: 130px"
          >
            <t-option v-for="t in logsTypeOptions" :key="t" :value="t" :label="getTypeText(t)" />
          </t-select>
          <t-button theme="primary" size="small" :loading="logsLoading" @click="onLogsSearch">
            查询
          </t-button>
          <t-button variant="outline" size="small" @click="clearLogsFilter">
            重置
          </t-button>
          <t-button variant="outline" theme="success" size="small" @click="exportTrainingLogsCsv">
            导出CSV
          </t-button>
        </div>

        <!-- 统计概览 -->
        <div class="logs-stats">
          <div class="logs-stat-item">
            <span class="stat-num">{{ logsStats.total }}</span>
            <span class="stat-label">训练次数</span>
          </div>
          <div class="logs-stat-item">
            <span class="stat-num">{{ logsStats.players }}</span>
            <span class="stat-label">参与选手</span>
          </div>
          <div class="logs-stat-item">
            <span class="stat-num">{{ logsStats.cards }}</span>
            <span class="stat-label">卡牌种类</span>
          </div>
          <div class="logs-stat-item">
            <span class="stat-num">{{ logsStats.avgPerPlayer }}</span>
            <span class="stat-label">人均次数</span>
          </div>
          <div class="logs-stat-types">
            <t-tag
              v-for="(count, type) in logsStats.types"
              :key="type"
              :theme="getTypeTheme(type)"
              variant="light"
              size="small"
            >
              {{ getTypeText(type) }} {{ count }}
            </t-tag>
          </div>
        </div>

        <div v-if="logsLoading" class="logs-loading">
          <t-loading text="加载中..." size="small" />
        </div>

        <div v-else-if="trainingLogs.length === 0" class="empty-logs">
          <t-empty description="暂无训练日志" />
        </div>

        <div v-else>
          <div class="logs-batch-actions" v-if="logsSelectedIds.length > 0 || trainingLogs.length > 0">
            <t-space>
              <span class="selected-count">已选 {{ logsSelectedIds.length }} 条</span>
              <t-button theme="danger" size="small" :loading="deletingLogIds.length > 0" @click="handleBatchDeleteLogs">
                批量撤销
              </t-button>
              <t-button variant="text" size="small" @click="toggleLogsSelectAll">
                {{ logsSelectedIds.length === trainingLogs.length && trainingLogs.length > 0 ? '取消全选' : '全选本页' }}
              </t-button>
              <t-button variant="text" size="small" @click="clearLogsSelection">
                清空选择
              </t-button>
            </t-space>
          </div>

          <div class="training-logs-table">
            <div class="table-header">
              <span class="col-select" style="width: 50px;"></span>
              <span class="col-time" style="width: 160px;">时间</span>
              <span class="col-player" style="width: 140px;">选手</span>
              <span class="col-card">卡牌</span>
              <span class="col-effect" style="width: 200px;">效果</span>
              <span class="col-attrs" style="width: 200px;">训练后属性</span>
              <span class="col-actions" style="width: 100px;">操作</span>
            </div>
            <div
              v-for="record in trainingLogs"
              :key="record.id"
              class="table-row"
            >
              <div class="col-select">
                <t-checkbox
                  :checked="logsSelectedIds.includes(record.id)"
                  @change="(checked) => toggleLogSelection(record.id, checked)"
                />
              </div>
              <div class="col-time">{{ formatDateTime(record.createdAt) }}</div>
              <div class="col-player">
                <span class="player-name">{{ record.userName }}</span>
              </div>
              <div class="col-card">
                <t-tag theme="primary" variant="light" size="small">
                  {{ record.cardName }}
                </t-tag>
                <t-tag :theme="getTypeTheme(record.cardType)" variant="outline" size="small">
                  {{ getTypeText(record.cardType) }}
                </t-tag>
              </div>
              <div class="col-effect">
                <span class="effect-text">{{ getRecordTooltip(record) }}</span>
              </div>
              <div class="col-attrs">
                <t-tag theme="danger" variant="light" size="small">
                  声乐 {{ record.attributesAfter?.vocal || 0 }}
                </t-tag>
                <t-tag theme="success" variant="light" size="small">
                  舞蹈 {{ record.attributesAfter?.dance || 0 }}
                </t-tag>
                <t-tag theme="primary" variant="light" size="small">
                  魅力 {{ record.attributesAfter?.charm || 0 }}
                </t-tag>
              </div>
              <div class="col-actions">
                <t-button
                  theme="danger"
                  variant="outline"
                  size="small"
                  :loading="deletingLogIds.includes(record.id)"
                  @click="handleDeleteLog(record)"
                >
                  撤销
                </t-button>
              </div>
            </div>
          </div>

          <div class="pagination-wrapper">
            <t-pagination
              v-model="logsPage"
              v-model:pageSize="logsPageSize"
              :total="logsTotal"
              :pageSizeOptions="[10, 20, 50]"
              size="small"
              showJumper
              @change="onLogsPageChange"
              @page-size-change="onLogsPageSizeChange"
            />
          </div>
        </div>
      </div>

      <!-- 卡牌列表 -->
      <div class="cards-section">
        <div class="section-header">
          <h2>卡牌列表</h2>
          <t-space>
            <t-tag theme="primary" variant="light">
              {{ store.enabledCards.length }} / {{ store.cards.length }} 启用
            </t-tag>
            <t-button theme="primary" variant="outline" size="small" @click="exportCards">
              导出卡牌
            </t-button>
            <t-button theme="success" variant="outline" size="small" @click="triggerImportCards">
              导入卡牌
            </t-button>
            <input
              ref="cardsImportInput"
              type="file"
              accept=".json"
              style="display: none"
              @change="handleImportCards"
            />
          </t-space>
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
              <div v-if="card.effect.multiply" class="effect-row">
                <span class="effect-label">🎲 随机倍率</span>
                <span class="effect-value" :class="getMultiplyClass(card.effect.multiply)">
                  ×{{ card.effect.multiply }}
                </span>
              </div>
              <div v-if="card.effect.multiplyAll" class="effect-row">
                <span class="effect-label">🌐 全体倍率</span>
                <span class="effect-value" :class="getMultiplyClass(card.effect.multiplyAll)">
                  ×{{ card.effect.multiplyAll }}
                </span>
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
          <t-form-item label="随机倍率效果">
            <t-input-number v-model="cardForm.effect.multiply" :min="0.1" :max="5" :step="0.1" :decimalPlaces="1" theme="column" placeholder="1=不变，1.5=+50%" />
          </t-form-item>
          <t-form-item label="全体倍率效果">
            <t-input-number v-model="cardForm.effect.multiplyAll" :min="0.1" :max="5" :step="0.1" :decimalPlaces="1" theme="column" placeholder="1=不变，2=翻倍" />
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
import { useRoute } from 'vue-router'
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import { useTrainingCardStore } from '../../stores/trainingCardStore'
import { useSeasonStore } from '../../stores/seasonStore'
import { getUsers, doRequest, getTrainingRecords, deleteTrainingRecord, batchDeleteTrainingRecords } from '../../services/api'
import type { TrainingCard, AutoCompleteResult, TrainingRecord, TrainingRecordListResponse } from '../../types/training'
import type { User } from '../../types/user'

const route = useRoute()
const store = useTrainingCardStore()
const seasonStore = useSeasonStore()

// 当前轮次（优先从路由参数获取，回退到 seasonStore）
const currentRound = computed(() => {
  const roundFromRoute = parseInt(route.params.round as string) || 0
  return roundFromRoute > 0 ? roundFromRoute : seasonStore.currentRoundIndex
})

// 状态
const autoCompleting = ref(false)
const saving = ref(false)
const recordsLoading = ref(false)
const trainingRecords = ref<TrainingRecord[]>([])
const players = ref<User[]>([])
const playersLoading = ref(false)

// 训练日志状态
const logsLoading = ref(false)
const trainingLogs = ref<TrainingRecord[]>([])
const logsTotal = ref(0)
const logsPage = ref(1)
const logsPageSize = ref(20)
const logsStartDate = ref('')
const logsEndDate = ref('')
const logsFilterPlayer = ref('')
const logsFilterType = ref('')
const logsSelectedIds = ref<string[]>([])
const deletingLogIds = ref<string[]>([])

// 期望训练次数（页面可临时调整，初始化时从配置读取）
const expectedTrainingCount = ref(3)

// 按用户分组的训练记录（包含所有选手，未训练者记录为空）
const trainingUsers = computed(() => {
  // 建立选手基础属性映射
  const playerMap = new Map<string, User>()
  players.value.forEach(player => playerMap.set(player.id, player))

  const map = new Map<string, { userId: string; userName: string; records: TrainingRecord[]; recordCount: number; attributes: { vocal: number; dance: number; charm: number }; status?: string; eliminated: boolean }>()

  // 先插入所有选手
  players.value.forEach(player => {
    map.set(player.id, {
      userId: player.id,
      userName: player.name || player.id,
      records: [],
      recordCount: 0,
      attributes: player.attributes || { vocal: 0, dance: 0, charm: 0 },
      status: player.status || 'active',
      eliminated: player.status === 'eliminated'
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
        recordCount: 0,
        status: 'active',
        eliminated: false
      })
    }
    const user = map.get(userId)!
    user.records.push(record)
    user.recordCount++
  })

  // 排序：已淘汰放最后；其余已完成训练放前面，再按记录数降序
  return Array.from(map.values()).sort((a, b) => {
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1
    const aCompleted = a.recordCount >= expectedTrainingCount.value ? 1 : 0
    const bCompleted = b.recordCount >= expectedTrainingCount.value ? 1 : 0
    if (bCompleted !== aCompleted) return bCompleted - aCompleted
    return b.recordCount - a.recordCount
  })
})

// 选手训练情况的多选状态
const selectedUserIds = ref<Set<string>>(new Set())
const batchTrainingUserId = ref<string | null>(null)

const selectedUserCount = computed(() =>
  paginatedUsers.value.filter(u => selectedUserIds.value.has(u.userId)).length
)

function toggleUserSelect(userId: string, checked: boolean) {
  if (checked) selectedUserIds.value.add(userId)
  else selectedUserIds.value.delete(userId)
  selectedUserIds.value = new Set(selectedUserIds.value)
}

function toggleUserSelectAll(checked: boolean) {
  if (checked) {
    paginatedUsers.value.forEach(u => selectedUserIds.value.add(u.userId))
  } else {
    paginatedUsers.value.forEach(u => selectedUserIds.value.delete(u.userId))
  }
  selectedUserIds.value = new Set(selectedUserIds.value)
}

function clearUserSelection() {
  selectedUserIds.value = new Set()
}

// 对选中的选手，每人随机排练 1~期望次数 之间的随机整数次
async function handleBatchRandomTrain() {
  const targetUsers = paginatedUsers.value.filter(u => selectedUserIds.value.has(u.userId))
  if (targetUsers.length === 0) {
    MessagePlugin.warning('请先选择要排练的选手')
    return
  }
  const confirmed = window.confirm(`将为选中的 ${targetUsers.length} 位选手每人随机排练 1~${expectedTrainingCount.value} 次。是否继续？`)
  if (!confirmed) return
  batchTrainingUserId.value = 'batch'
  let totalDraws = 0
  try {
    for (const user of targetUsers) {
      const times = 1 + Math.floor(Math.random() * expectedTrainingCount.value)
      for (let i = 0; i < times; i++) {
        await store.doDraw(user.userId, currentRound.value)
        totalDraws++
      }
    }
    MessagePlugin.success(`已为 ${targetUsers.length} 位选手排练，共 ${totalDraws} 次`)
    await fetchTrainingRecords()
    clearUserSelection()
  } catch (e: any) {
    MessagePlugin.error(e.message || '批量排练失败')
  } finally {
    batchTrainingUserId.value = null
  }
}

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
    lowest: undefined as number | undefined,
    multiply: undefined as number | undefined,
    multiplyAll: undefined as number | undefined
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

// 卡牌导入 input
const cardsImportInput = ref<HTMLInputElement | null>(null)
const importingCards = ref(false)

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

function getMultiplyClass(value: number | undefined): string {
  if (!value) return ''
  return value > 1 ? 'positive' : value < 1 ? 'negative' : ''
}

function getAttrLabel(key: string): string {
  const labels: Record<string, string> = {
    vocal: 'Vocal',
    dance: 'Dance',
    charm: 'Charm',
    randomOne: '随机',
    randomTwo: '随机两项',
    highest: '最高',
    lowest: '最低',
    multiply: '随机倍率',
    multiplyAll: '全体倍率'
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
    // 直接调用后端 API，不使用 safeCall（避免静默降级到 mock 数据）
    const query = new URLSearchParams()
    query.append('roundId', `round-${currentRound.value}`)
    query.append('pageSize', '999')
    const result = await doRequest<TrainingRecordListResponse>(`/training/records?${query.toString()}`)
    trainingRecords.value = result.list || []
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
    .map(([key, value]) => {
      if (key === 'multiply' || key === 'multiplyAll') {
        return `${getAttrLabel(key)} ×${value}`
      }
      return `${getAttrLabel(key)} ${(value as number) > 0 ? '+' : ''}${value}`
    })
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
      lowest: undefined,
      multiply: undefined,
      multiplyAll: undefined
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
      lowest: card.effect.lowest,
      multiply: card.effect.multiply,
      multiplyAll: card.effect.multiplyAll
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

// ===== 卡牌导出/导入 =====

function exportCards(): void {
  try {
    if (store.cards.length === 0) {
      MessagePlugin.warning('没有卡牌可导出')
      return
    }
    // 导出字段：name/type/description/effect/weight/enabled/icon（去掉服务端生成的 id）
    const exportData = store.cards.map(c => ({
      name: c.name,
      type: c.type,
      description: c.description,
      effect: c.effect || {},
      weight: c.weight,
      enabled: c.enabled !== false,
      icon: c.icon
    }))
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const dateStr = new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')
    a.href = url
    a.download = `训练卡牌_${dateStr}.json`
    a.click()
    URL.revokeObjectURL(url)
    MessagePlugin.success(`已导出 ${exportData.length} 张卡牌`)
  } catch (e: any) {
    MessagePlugin.error('导出失败: ' + (e.message || '未知错误'))
  }
}

function triggerImportCards(): void {
  cardsImportInput.value?.click()
}

async function handleImportCards(e: Event): Promise<void> {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const parsed = JSON.parse(text)
    const cardsArr = Array.isArray(parsed) ? parsed : parsed.cards
    if (!Array.isArray(cardsArr) || cardsArr.length === 0) {
      MessagePlugin.warning('文件中没有有效的卡牌数据')
      return
    }

    // 校验并规范化导入的卡牌
    const validTypes = ['vocal', 'dance', 'charm', 'mixed', 'event', 'self_select']
    const cardsData = cardsArr
      .filter(c => c && typeof c === 'object')
      .map((c: any) => ({
        name: String(c.name || '').trim(),
        type: validTypes.includes(c.type) ? c.type : 'mixed',
        description: String(c.description || ''),
        effect: (c.effect && typeof c.effect === 'object') ? c.effect : {},
        weight: typeof c.weight === 'number' && c.weight > 0 ? c.weight : 10,
        enabled: c.enabled !== false
      }))
      .filter(c => c.name)

    if (cardsData.length === 0) {
      MessagePlugin.warning('没有有效的卡牌数据可导入')
      return
    }

    const confirm = DialogPlugin.confirm({
      header: '确认导入',
      body: `将导入 ${cardsData.length} 张卡牌（新增，不清除现有卡牌）。是否继续？`,
      confirmBtn: '确认导入',
      cancelBtn: '取消',
      onConfirm: async () => {
        confirm.destroy()
        importingCards.value = true
        try {
          await store.addCardsBatch(cardsData as any)
          await store.fetchCards()
          MessagePlugin.success(`成功导入 ${cardsData.length} 张卡牌`)
        } catch (err: any) {
          MessagePlugin.error('导入失败: ' + (err.message || '未知错误'))
        } finally {
          importingCards.value = false
        }
      }
    })
  } catch (err: any) {
    MessagePlugin.error('解析文件失败: ' + (err.message || '未知错误'))
  }

  target.value = ''
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

// ===== 训练日志功能 =====

async function fetchTrainingLogs(): Promise<void> {
  logsLoading.value = true
  try {
    const params = {
      round: currentRound.value,
      page: logsPage.value,
      pageSize: logsPageSize.value,
      startDate: logsStartDate.value,
      endDate: logsEndDate.value,
      userId: logsFilterPlayer.value || undefined,
      cardType: logsFilterType.value || undefined
    }
    const res = await getTrainingRecords(params)
    trainingLogs.value = res.list || []
    logsTotal.value = res.total
    logsSelectedIds.value = []
  } catch (e: any) {
    MessagePlugin.error(e.message || '获取训练日志失败')
    trainingLogs.value = []
    logsTotal.value = 0
  } finally {
    logsLoading.value = false
  }
}

// 日志统计概览（基于当前筛选条件下的全量记录，用大 pageSize 拉取计算）
const logsStats = ref<{ total: number; players: number; cards: number; types: Record<string, number>; avgPerPlayer: number }>({
  total: 0, players: 0, cards: 0, types: {}, avgPerPlayer: 0
})

async function refreshLogsStats(): Promise<void> {
  try {
    const params = {
      round: currentRound.value,
      pageSize: 999,
      startDate: logsStartDate.value,
      endDate: logsEndDate.value,
      userId: logsFilterPlayer.value || undefined,
      cardType: logsFilterType.value || undefined
    }
    const res = await getTrainingRecords(params)
    const list = res.list || []
    const players = new Set(list.map(r => r.userId || r.userName))
    const cards = new Set(list.map(r => r.cardName))
    const types: Record<string, number> = {}
    for (const r of list) {
      const t = r.cardType || 'mixed'
      types[t] = (types[t] || 0) + 1
    }
    logsStats.value = {
      total: list.length,
      players: players.size,
      cards: cards.size,
      types,
      avgPerPlayer: players.size ? +(list.length / players.size).toFixed(1) : 0
    }
  } catch {
    logsStats.value = { total: 0, players: 0, cards: 0, types: {}, avgPerPlayer: 0 }
  }
}

const logsTypeOptions = computed(() => {
  const types = new Set((store.cards || []).map(c => c.type))
  store.cards.forEach(c => { if (c.type) types.add(c.type) })
  return Array.from(types)
})

function clearLogsFilter(): void {
  logsStartDate.value = ''
  logsEndDate.value = ''
  logsFilterPlayer.value = ''
  logsFilterType.value = ''
  logsPage.value = 1
  fetchTrainingLogs()
}

function onLogsSearch(): void {
  logsPage.value = 1
  fetchTrainingLogs()
  refreshLogsStats()
}

function toggleLogsSelectAll(): void {
  if (logsSelectedIds.value.length === trainingLogs.value.length && trainingLogs.value.length > 0) {
    logsSelectedIds.value = []
  } else {
    logsSelectedIds.value = trainingLogs.value.map(r => r.id)
  }
}

function exportTrainingLogsCsv(): void {
  try {
    if (trainingLogs.value.length === 0) {
      MessagePlugin.warning('当前没有可导出的日志')
      return
    }
    const header = ['时间', '选手', '卡牌', '类型', '效果', '声乐', '舞蹈', '魅力']
    const rows = trainingLogs.value.map(r => [
      formatDateTime(r.createdAt),
      r.userName || r.userId,
      r.cardName,
      getTypeText(r.cardType),
      getRecordTooltip(r),
      r.attributesAfter?.vocal ?? '',
      r.attributesAfter?.dance ?? '',
      r.attributesAfter?.charm ?? ''
    ])
    const csv = [header.join(','), ...rows.map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const dateStr = new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')
    a.href = url
    a.download = `训练日志_${dateStr}.csv`
    a.click()
    URL.revokeObjectURL(url)
    MessagePlugin.success(`已导出 ${rows.length} 条训练日志`)
  } catch (e: any) {
    MessagePlugin.error('导出失败: ' + (e.message || '未知错误'))
  }
}

function onLogsPageChange(pageInfo: { current: number }): void {
  logsPage.value = pageInfo.current
  fetchTrainingLogs()
}

function onLogsPageSizeChange(pageSize: number): void {
  logsPageSize.value = pageSize
  logsPage.value = 1
  fetchTrainingLogs()
}

function toggleLogSelection(recordId: string, checked: boolean): void {
  if (checked) {
    if (!logsSelectedIds.value.includes(recordId)) {
      logsSelectedIds.value.push(recordId)
    }
  } else {
    const idx = logsSelectedIds.value.indexOf(recordId)
    if (idx >= 0) logsSelectedIds.value.splice(idx, 1)
  }
}

function clearLogsSelection(): void {
  logsSelectedIds.value = []
}

async function handleDeleteLog(record: TrainingRecord): Promise<void> {
  const confirm = DialogPlugin.confirm({
    header: '确认撤销',
    body: `确定要撤销「${record.userName}」的训练记录「${record.cardName}」吗？这将回滚该次训练带来的属性变化。`,
    confirmBtn: '确定撤销',
    cancelBtn: '取消',
    theme: 'danger',
    onConfirm: async () => {
      confirm.destroy()
      deletingLogIds.value.push(record.id)
      try {
        await deleteTrainingRecord(record.id)
        // 刷新训练记录和玩家属性
        await fetchTrainingRecords()
        await fetchPlayers()
        await fetchTrainingLogs()
        await refreshLogsStats()
        MessagePlugin.success('撤销成功，已回滚属性')
      } catch (e: any) {
        MessagePlugin.error(e.message || '撤销失败')
      } finally {
        const idx = deletingLogIds.value.indexOf(record.id)
        if (idx >= 0) deletingLogIds.value.splice(idx, 1)
      }
    }
  })
}

async function handleBatchDeleteLogs(): Promise<void> {
  if (logsSelectedIds.value.length === 0) return

  const confirm = DialogPlugin.confirm({
    header: '确认批量撤销',
    body: `确定要批量撤销选中的 ${logsSelectedIds.value.length} 条训练记录吗？这将回滚这些训练带来的属性变化。`,
    confirmBtn: '确定批量撤销',
    cancelBtn: '取消',
    theme: 'danger',
    onConfirm: async () => {
      confirm.destroy()
      deletingLogIds.value = [...logsSelectedIds.value]
      try {
        const result = await batchDeleteTrainingRecords(logsSelectedIds.value)
        await fetchTrainingRecords()
        await fetchPlayers()
        await fetchTrainingLogs()
        await refreshLogsStats()
        MessagePlugin.success(`批量撤销成功，共 ${result.deletedCount} 条记录，已回滚属性`)
      } catch (e: any) {
        MessagePlugin.error(e.message || '批量撤销失败')
      } finally {
        deletingLogIds.value = []
        logsSelectedIds.value = []
      }
    }
  })
}

function formatDateTime(isoString?: string): string {
  if (!isoString) return '-'
  const date = new Date(isoString)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

onMounted(async () => {
  await store.initialize()
  await seasonStore.fetchRounds()
  await fetchPlayers()
  await fetchTrainingRecords()

  // 训练日志
  await fetchTrainingLogs()
  await refreshLogsStats()

  // 从配置初始化期望训练次数
  if (store.config?.drawsPerPlayer) {
    expectedTrainingCount.value = store.config.drawsPerPlayer
  }
})
</script>

<style lang="scss" scoped>
.admin-training-page {
  background: var(--bg-primary);
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
  background: var(--card-bg);
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
  color: var(--text-primary);
  line-height: 1.2;
}

.stat-label {
  font-size: 12px;
  color: var(--text-tertiary);
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
  color: var(--text-secondary);
}

// 操作按钮区
.action-section {
  margin-bottom: 16px;
}

// 训练情况区域
.training-records-section {
  background: var(--card-bg);
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

// 批量排练操作区
.batch-train-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
  padding: 10px 12px;
  background: rgba(102, 126, 234, 0.08);
  border: 1px solid rgba(102, 126, 234, 0.2);
  border-radius: 8px;

  .batch-selected {
    font-size: 13px;

    strong {
      color: #667eea;
    }
  }
}

.training-users-table {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;

  .eliminated-tag {
    margin-left: 6px;
  }
  .table-header {
    display: grid;
    grid-template-columns: 44px 140px 1fr 180px 200px;
    gap: 12px;
    padding: 12px 16px;
    background: var(--bg-primary);
    font-weight: 600;
    font-size: 14px;
    color: var(--text-primary);
    border-bottom: 1px solid var(--border-color);

    @media (max-width: 768px) {
      display: none;
    }
  }

  .table-row {
    display: grid;
    grid-template-columns: 44px 140px 1fr 180px 200px;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color);
    align-items: center;
    transition: background 0.2s ease;

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background: var(--table-header-bg);
    }

    &.completed {
      background: #f0fff4;

      &:hover {
        background: #e6f7ed;
      }
    }

    &.eliminated {
      background: #fff1f0;

      &:hover {
        background: #ffecec;
      }

      .player-name {
        color: #e74c3c;
      }
    }

    &.selected {
      background: rgba(102, 126, 234, 0.08);
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
      color: var(--text-primary);
    }
  }

  .col-records {
    .no-records {
      color: var(--text-tertiary);
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
      color: var(--text-tertiary);
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
  background: var(--hover-bg);
  border-radius: 8px;
}

.user-name {
  font-size: 14px;
  color: var(--text-primary);
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
    color: var(--text-primary);
    margin: 0;
  }

  .expected-count-label {
    font-size: 13px;
    color: var(--text-secondary);
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
  background: var(--card-bg);
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
    background: var(--hover-bg);
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
  color: var(--text-primary);
  margin: 0 0 6px 0;
}

.card-desc {
  font-size: 12px;
  color: var(--text-tertiary);
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
  background: var(--hover-bg);
  border-radius: 6px;
}

.effect-label {
  font-size: 12px;
  color: var(--text-secondary);
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
  border-top: 1px solid var(--border-color);
}

.weight-info {
  font-size: 11px;
  color: var(--text-tertiary);
}

// 弹窗样式
.effect-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed var(--border-color);

  h4 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
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
      color: var(--text-tertiary);
    }

    .value {
      font-size: 28px;
      font-weight: 700;
      color: var(--text-primary);
    }
  }
}

.result-details {
  margin-top: 20px;

  h4 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
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
  background: var(--hover-bg);
  border-radius: 6px;

  .user-info {
    flex: 1;
    font-size: 13px;
    color: var(--text-primary);
  }

  .record-count {
    font-size: 12px;
    color: var(--text-tertiary);
  }
}

// ===== 训练日志区 =====
.training-logs-section {
  margin-bottom: 16px;
  background: var(--card-bg);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

// 日志筛选工具栏
.logs-filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 12px;
  background: var(--bg-primary);
  border-radius: 8px;

  .filter-sep {
    font-size: 13px;
    color: var(--text-tertiary);
  }
}

// 日志统计概览
.logs-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px;
  margin-bottom: 14px;
  padding: 12px 14px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.08), rgba(118, 75, 162, 0.06));
  border: 1px solid rgba(102, 126, 234, 0.2);
  border-radius: 10px;

  .logs-stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 64px;

    .stat-num {
      font-size: 22px;
      font-weight: 800;
      color: #667eea;
      line-height: 1.2;
    }

    .stat-label {
      font-size: 11px;
      color: var(--text-tertiary);
      margin-top: 2px;
    }
  }

  .logs-stat-types {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-left: auto;
    max-width: 60%;
  }
}

.logs-loading,
.empty-logs {
  padding: 32px 0;
  display: flex;
  justify-content: center;
}

.logs-batch-actions {
  margin-bottom: 12px;
  padding: 12px;
  background: #fff3f0;
  border-radius: 8px;
  border: 1px solid #ffccc7;
}

.selected-count {
  font-size: 13px;
  color: #cf1322;
  font-weight: 500;
}

.training-logs-table {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;

  .table-header {
    display: grid;
    grid-template-columns: 50px 160px 140px 1fr 200px 200px 100px;
    gap: 12px;
    padding: 12px 16px;
    background: var(--bg-primary);
    font-weight: 600;
    font-size: 14px;
    color: var(--text-primary);
    border-bottom: 1px solid var(--border-color);

    @media (max-width: 1024px) {
      display: none;
    }
  }

  .table-row {
    display: grid;
    grid-template-columns: 50px 160px 140px 1fr 200px 200px 100px;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color);
    align-items: center;
    transition: background 0.2s ease;

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background: var(--table-header-bg);
    }

    @media (max-width: 1024px) {
      grid-template-columns: 1fr;
      gap: 8px;
    }
  }

  .col-select {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .col-time {
    font-size: 12px;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .col-player {
    .player-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-primary);
    }
  }

  .col-card {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .col-effect {
    .effect-text {
      font-size: 12px;
      color: var(--text-secondary);
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .col-attrs {
    .attr-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
  }

  .col-actions {
    display: flex;
    justify-content: flex-end;
  }
}

.pagination-wrapper {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
