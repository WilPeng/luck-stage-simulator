<template>
  <div class="perf-page">
    <!-- ===== Phase 0: 公演还未开始 ===== -->
    <div v-if="phase === 0" class="locked-stage">
      <div class="locked-glow"></div>
      <div class="locked-icon">🔒</div>
      <h2>第{{ currentRound }}公演</h2>
      <p>公演还未开始，请等待管理员进入公演管理</p>
      <div class="waiting-dots"><span></span><span></span><span></span></div>
    </div>

    <!-- ===== Phase 1: 等待管理员开启公演 ===== -->
    <div v-else-if="phase === 1" class="waiting-stage">
      <div class="waiting-glow"></div>
      <div class="waiting-icon">🎭</div>
      <h2>公演尚未开启</h2>
      <p>当前管理员还未开始公演，请耐心等待</p>
      <div class="waiting-dots"><span></span><span></span><span></span></div>
    </div>

    <!-- ===== Phase 2: 发挥值已提前抽取，此处仅展示或引导抽取 ===== -->
    <div v-else-if="phase === 2 && !hasDrawn" class="draw-stage">
      <div class="stage-badge">🌟 公演已开启</div>
      <div class="draw-area">
        <div class="draw-icon">🎲</div>
        <h2>发挥值尚未抽取</h2>
        <p class="draw-hint">发挥值已提前到并发行动阶段抽取，请前往抽取</p>
        <router-link :to="`/games/${authStore.currentGameId}/player/round/${currentRound}/performance-draw`" class="draw-btn go-draw-btn">
          🎲 前往抽取发挥值
        </router-link>
      </div>
    </div>

    <!-- ===== Phase 2/3/4/5: 已抽取，显示结果页 ===== -->
    <div v-else class="results-stage">
      <div class="results-header">
        <h1>第{{ currentRound }}公演·公演结果</h1>
        <p class="subtitle" v-if="phase === 2">发挥值已确定，等待公演结算</p>
        <p class="subtitle" v-else-if="phase === 3">结算已完成</p>
        <p class="subtitle" v-else-if="phase === 4 && !showRanking">大众评审投票已公布</p>
        <p class="subtitle" v-else>最终结果已公布</p>
      </div>

      <!-- 发挥值展示 -->
      <div class="perf-card">
        <span class="perf-label">你的发挥值</span>
        <span class="perf-value" :class="resultLevel">{{ drawValue }}</span>
        <span class="perf-text" :class="resultLevel">{{ resultText }}</span>
        <div v-if="hasDrawn && perfBucketInfo" class="perf-bucket" :class="perfBucketInfo.cls">
          <span class="pb-range">本轮发挥值 {{ perfBucketInfo.range }}</span>
          <span class="pb-sep">·</span>
          <span class="pb-bonus">{{ perfBucketInfo.bonusText }}</span>
        </div>
      </div>

      <!-- 3.3 个人评级掷骰 -->
      <div class="rating-roll-card">
        <div class="rr-title">🎯 个人评级</div>
        <div v-if="ratingResult" class="rr-result">
          <span class="rr-badge" :class="'r-' + ratingResult.rating">{{ ratingResult.rating }} · {{ ratingResult.ratingText }}</span>
          <span class="rr-detail">
            歌曲「{{ ratingResult.songName }}」 · 难度 {{ ratingResult.difficulty }} 面骰 · 掷出 {{ ratingResult.roll ?? '—' }}
            （A面{{ ratingResult.faces.a }} / B面{{ ratingResult.faces.b }} / C面{{ ratingResult.faces.c }} / D面{{ ratingResult.faces.d ?? 0 }}） · 主属性 {{ ratingResult.mainAttr }}
          </span>
        </div>
        <div v-else-if="ratingError" class="rr-error">{{ ratingError }}</div>
        <button v-else class="rr-btn" :disabled="rolling" @click="doRollRating">
          {{ rolling ? '掷骰中…' : '🎲 点击掷骰，评定个人评级' }}
        </button>
      </div>

      <!-- 团队得票揭晓（所有团队） -->
      <div class="results-preview">
        <div class="section-title-bar"><span class="section-icon">🎫</span><span>团队得票揭晓</span></div>
        <div class="team-votes-list">
          <div
            v-for="t in performanceStore.teamPerformanceResults"
            :key="t.teamId"
            class="team-vote-item"
            :class="{ 'is-my-team': t.teamId === myTeamId }"
          >
            <span class="tv-name" @click="toggleVoteTeam(t.teamId)">
              {{ t.teamName }}<template v-if="t.songName">《{{ t.songName }}》</template>
              <span class="tv-caret">{{ expandedVoteTeams.has(t.teamId) ? '▲' : '▼' }}</span>
            </span>
            <VoteRevealDigits
              :votes="t.finalVotes || 0"
              :reveal="{ hundreds: !!t.revealHundreds, tens: !!t.revealTens, units: !!t.revealUnits }"
            />
            <div v-if="expandedVoteTeams.has(t.teamId)" class="tv-members">
              <span v-for="m in teamMembersSorted(t.teamId)" :key="m.playerId" class="tv-member">
                <UserAvatar class="tv-av" :name="m.player?.name" :avatar="m.player?.avatar" />
                {{ m.player?.name || '未知' }}<em v-if="m.playerId === teamCaptainId(t.teamId)">队长</em>
              </span>
            </div>
          </div>
          <div v-if="performanceStore.teamPerformanceResults.length === 0" class="info-card dim"><span>等待公演结算</span></div>
        </div>
      </div>

      <!-- ===== 已揭晓队伍的大众评审投票矩阵（管理员逐个揭晓后展示） ===== -->
      <div v-if="phase >= 3" class="teams-ranking-section">
        <div class="section-title-bar">
          <span class="section-icon">🎭</span>
          <span>已揭晓队伍 · 大众评审投票</span>
        </div>
        <div v-if="revealedTeams.length === 0" class="no-revealed">
          <p>管理员正在逐个揭晓队伍，请稍候...</p>
        </div>
        <div v-else class="revealed-list">
          <div
            v-for="team in revealedTeams"
            :key="team.teamId"
            class="revealed-card"
            :class="{ 'is-my-team': team.teamId === currentTeam?.id }"
          >
            <div class="revealed-header" @click="toggleTeamExpand(team.teamId)">
              <div class="revealed-title">
                <span class="revealed-badge">🎭</span>
                <div>
                  <div class="revealed-name">{{ team.teamName }}</div>
                  <div v-if="team.songName" class="revealed-song">{{ team.songName }}</div>
                </div>
              </div>
              <span class="revealed-toggle">{{ expandedTeamId === team.teamId ? '▲' : '▼' }}</span>
            </div>

            <div v-if="expandedTeamId === team.teamId" class="team-rank-detail" @click.stop>
              <div class="member-list">
                <div v-for="p in (team.players || team.playerPerformances || [])" :key="p.playerId" class="member-item">
                  <span class="member-name">{{ p.playerName }}</span>
                </div>
              </div>

              <!-- 大众评审投票矩阵（与管理员端一致） -->
              <div class="detail-item audience-matrix-block">
                <div class="matrix-header">
                  <span class="matrix-title">大众评审投票矩阵</span>
                </div>
                <div v-if="loadingTeamMatrix[team.teamId]" class="matrix-loading">
                  <t-loading size="small" text="加载评审矩阵中..." />
                </div>
                <div v-else-if="!teamAudienceMatrices[team.teamId]?.length" class="matrix-empty">
                  暂无大众评审投票记录
                </div>
                <div v-else class="audience-matrix">
                  <div
                    v-for="seat in teamAudienceMatrices[team.teamId]"
                    :key="`${team.teamId}-${seat.seatNumber}`"
                    class="matrix-seat"
                    :class="{ yes: seat.votedYes }"
                  >
                    <t-tooltip placement="top">
                      <template #content>
                        <div>{{ seat.seatNumber }}号 · {{ seat.name || '未知评审' }}</div>
                        <div style="font-size:12px;opacity:0.8">{{ seat.gender }} · {{ seat.age }}岁 · {{ seat.occupation }}</div>
                        <div style="font-size:12px;opacity:0.8">{{ seat.votedYes ? '投了 YES' : '未投 YES' }}</div>
                      </template>
                      <div class="seat-inner">
                        <div class="seat-name">{{ seat.name || '未知' }}</div>
                        <div class="seat-gender-age">{{ seat.gender }} {{ seat.age }}岁</div>
                        <div class="seat-occupation">{{ seat.occupation }}</div>
                      </div>
                    </t-tooltip>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 得分计算详情 ===== -->
      <div v-if="scoreBreakdown && phase >= 3" class="score-detail-section">
        <div class="section-title-bar">
          <span class="section-icon">📊</span>
          <span>得分计算详情</span>
        </div>

        <!-- 个人评级（骰子制，不再展示旧的分数公式） -->
        <div class="detail-block" v-if="myPerformance">
          <div class="detail-block-title">① 个人评级</div>
          <table class="breakdown-table">
            <tr>
              <td class="label">评级</td>
              <td class="value"><strong>{{ myPerformance.stageRating }}</strong> · {{ myPerformance.stageRatingText }}
                <span v-if="myPerformance.ratingRoll != null">（骰子 {{ myPerformance.ratingRoll }} 点）</span>
              </td>
            </tr>
            <tr v-if="myPerformance.ratingMainAttr">
              <td class="label">主属性</td>
              <td class="value">
                {{ { vocal: '🎤 声乐', dance: '💃 舞蹈', charm: '✨ 魅力' }[myPerformance.ratingMainAttr] || myPerformance.ratingMainAttr }}
                · 难度 {{ myPerformance.ratingDifficulty }} 面骰 · 风险值 {{ myPerformance.ratingRisk }}
              </td>
            </tr>
            <tr v-if="myPerformance.ratingFaces">
              <td class="label">骰面构成</td>
              <td class="value">
                A {{ myPerformance.ratingFaces.a }} / B {{ myPerformance.ratingFaces.b }} / C {{ myPerformance.ratingFaces.c }} / D {{ myPerformance.ratingFaces.d || 0 }}
              </td>
            </tr>
          </table>
        </div>

        <!-- 队伍得分拆解 -->
        <div class="detail-block">
          <div class="detail-block-title">② 团队得分 & 最终票数</div>
          <table class="breakdown-table">
            <tr>
              <td class="label">团队平均分</td>
              <td class="value">round(所有成员个人分平均值) = <strong>{{ scoreBreakdown.teamScore }}分</strong></td>
            </tr>
            <tr>
              <td class="label">基础票数</td>
              <td class="value">500</td>
            </tr>
            <tr>
              <td class="label">团队得分加成</td>
              <td class="value">{{ scoreBreakdown.teamScore }} × 3 = <strong>+{{ scoreBreakdown.teamScore * 3 }}</strong></td>
            </tr>
            <tr>
              <td class="label">平均魅力加成</td>
              <td class="value">魅力平均值 {{ scoreBreakdown.avgCharm }} → <strong>+{{ scoreBreakdown.avgCharm }}</strong></td>
            </tr>
            <tr class="result-row">
              <td class="label">最终票数</td>
              <td class="value highlight">500 + {{ scoreBreakdown.teamScore }}×3 + {{ scoreBreakdown.avgCharm }} = <strong>{{ scoreBreakdown.finalVotes }}票</strong></td>
            </tr>
          </table>
        </div>
      </div>

      <!-- ===== 大众评审席（1000座）===== -->
      <div v-if="showSeats" class="audience-seats-section">
        <div class="section-title-bar">
          <span class="section-icon">🎭</span>
          <span>大众评审席（1000座）</span>
        </div>
        <div class="seats-toolbar">
          <span class="seats-info">总座位：1000</span>
          <span class="seats-info voted-count">已投票：{{ votedSeatCount }}</span>
          <span class="seats-tip">点击已投票座位查看详情</span>
          <t-space class="filter-group" v-if="votedSeatCount > 0">
            <t-select v-model="filterGender" placeholder="性别" clearable size="small" style="width:110px">
              <t-option value="" label="全部" />
              <t-option value="男" :label="`男（${genderStats.male}）`" />
              <t-option value="女" :label="`女（${genderStats.female}）`" />
            </t-select>
            <t-select v-model="filterAge" placeholder="年龄" clearable size="small" style="width:115px">
              <t-option value="" label="全部" />
              <t-option v-for="r in ageStats" :key="r.label" :value="r.label" :label="`${r.label}（${r.count}）`" />
            </t-select>
            <t-select v-model="filterOccupation" placeholder="职业" clearable size="small" style="width:120px">
              <t-option value="" label="全部" />
              <t-option v-for="o in occupationStats" :key="o.name" :value="o.name" :label="`${o.name}（${o.count}）`" />
            </t-select>
            <span v-if="filterGender || filterAge || filterOccupation" class="filter-result">{{ filteredSeats.length }}人</span>
          </t-space>
        </div>
        <div class="seats-grid">
          <div
            v-for="seat in filteredSeats"
            :key="seat.id"
            class="seat-item"
            :class="{ voted: seat.voted, selected: selectedSeat === seat.seatNumber }"
            @click="handleSeatClick(seat)"
          >
            <div class="seat-inner">
              <template v-if="seat.voted && seat.gender">
                <t-tooltip placement="top">
                  <template #content>
                    <div>{{ seat.seatNumber }}号评审</div>
                    <div style="font-size:12px;opacity:0.8">{{ seat.gender }} · {{ seat.age }}岁 · {{ seat.occupation }}</div>
                  </template>
                  <span class="seat-gender-age">{{ seat.gender }} {{ seat.age }}岁</span>
                </t-tooltip>
                <span class="seat-occupation">{{ seat.occupation }}</span>
              </template>
              <t-tooltip v-else placement="top" :content="`${seat.seatNumber}号评审`">
                <span class="seat-empty">—</span>
              </t-tooltip>
            </div>
          </div>
        </div>

        <!-- 座位投票详情弹窗（只读） -->
        <t-dialog
          v-model:visible="detailVisible"
          :header="`${selectedSeatNumber}号大众评审投票详情`"
          width="420px"
          :destroy-on-close="true"
          :footer="false"
        >
          <div v-if="seatDetailLoading" class="detail-loading">加载中...</div>
          <div v-else-if="seatDetailVotes.length === 0" class="detail-empty">该评审尚未投票</div>
          <div v-else class="seat-detail-list">
            <!-- 评审档案 -->
            <div v-if="seatDetailProfile" class="reviewer-profile">
              <span class="profile-tag gender">{{ seatDetailProfile.gender }}</span>
              <span class="profile-tag age">{{ seatDetailProfile.age }}岁</span>
              <span class="profile-tag occupation">{{ seatDetailProfile.occupation }}</span>
            </div>
            <div
              v-for="vote in seatDetailVotes"
              :key="vote.voteOrder"
              class="seat-detail-item"
            >
              <span class="vote-order">第{{ vote.voteOrder }}票</span>
              <span class="vote-player">{{ vote.playerName }}</span>
            </div>
          </div>
        </t-dialog>
      </div>

      <!-- ===== 个人喜爱度排名 ===== -->
      <div v-if="showRanking" class="audience-section">
        <div class="section-title-bar">
          <span class="section-icon">❤️</span>
          <span>个人喜爱度排名</span>
        </div>
        <div class="my-rank-card">
          <div class="rank-number" :class="rankClass">{{ myAudienceRanking?.rank }}</div>
          <div class="rank-detail">
            <span class="rank-label">你的喜爱度排名</span>
            <span class="rank-votes">{{ myAudienceRanking?.votes || 0 }}票</span>
          </div>
        </div>
        <div class="rank-list">
          <div
            v-for="item in audienceRankings"
            :key="item.playerId"
            class="rank-item"
            :class="{ 'is-me': item.playerId === currentUser?.id }"
          >
            <span class="rank-pos">{{ item.rank }}</span>
            <span class="rank-name">{{ item.playerName }}</span>
            <div class="rank-bar-track">
              <div class="rank-bar-fill" :style="{ width: (item.votes / maxVotes) * 100 + '%' }"></div>
            </div>
            <span class="rank-vote-count">{{ item.votes || 0 }}票</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/authStore'
import { useTeamStore } from '../../stores/teamStore'
import { usePerformanceStore } from '../../stores/performanceStore'
import {
  getPlayerPerformanceStatus, getAudienceFinalRanking,
  getPerformanceRoundStatus, getPlayerAudienceSeats,
  getPlayerAudienceSeatDetail, getMyRatingInfo
} from '../../services/api'
import { useSfRefresh } from '../../composables/useSfRefresh'
import VoteRevealDigits from '../../components/common/VoteRevealDigits.vue'
import UserAvatar from '../../components/common/UserAvatar.vue'
import { savePlayerStatuses, loadPlayerStatuses } from '../../services/performanceService'
import { rollPerformanceRating } from '../../services/api'
import type { AudienceSeat, PerformanceGenerationMode } from '../../types/performance'

const route = useRoute()
const authStore = useAuthStore()
const teamStore = useTeamStore()
const performanceStore = usePerformanceStore()

const currentRound = computed(() => Number(route.params.round) || 1)

// 3.3 个人评级掷骰
const ratingResult = ref<any>(null)
const ratingError = ref('')
const rolling = ref(false)
async function doRollRating() {
  if (rolling.value) return
  rolling.value = true
  ratingError.value = ''
  try {
    const res: any = await rollPerformanceRating(`round-${currentRound.value}`)
    ratingResult.value = res
  } catch (e: any) {
    ratingError.value = e?.message || '掷骰失败'
  } finally {
    rolling.value = false
  }
}
const currentUser = computed(() => authStore.currentUser)
const roundId = computed(() => `round-${currentRound.value}`)

// ===== 轮次状态 =====
interface RoundStatus { started: boolean; settled: boolean; released: boolean; opened: boolean; seasonStage: string | null; generationMode: PerformanceGenerationMode }
const roundStatus = ref<RoundStatus | null>(null)
const generationMode = computed<PerformanceGenerationMode>(() => roundStatus.value?.generationMode || 'random')

const phase = computed(() => {
  if (!roundStatus.value) return -1
  const rs = roundStatus.value
  if (!rs.opened) return 0
  if (!rs.started) return 1
  if (rs.released) return 4 // 释放后→显示评审席
  if (rs.settled) return 3
  return 2
})

// 释放后始终显示大众评审席
const showSeats = computed(() => phase.value >= 4 && seatsLoaded.value)

// ===== 抽取状态 =====
const hasDrawn = ref(false)
const drawValue = ref(0)
const perfBucket = ref<number | null>(null)
const perfBonus = ref<number | null>(null)

const PERF_BUCKETS: Record<number, { range: string; cls: string }> = {
  1: { range: '排名前 20%', cls: 'b1' },
  2: { range: '排名 20%~40%', cls: 'b2' },
  3: { range: '排名 40%~60%', cls: 'b3' },
  4: { range: '排名 60%~80%', cls: 'b4' },
  5: { range: '排名后 20%', cls: 'b5' }
}
const perfBucketInfo = computed(() => {
  if (perfBucket.value == null) return null
  const meta = PERF_BUCKETS[perfBucket.value]
  if (!meta) return null
  const bonus = perfBonus.value ?? 0
  const pct = Math.round(Math.abs(bonus) * 100)
  let bonusText = '本次公演魅力不变'
  if (bonus > 0) bonusText = `本次公演魅力 +${pct}%`
  else if (bonus < 0) bonusText = `本次公演魅力 -${pct}%`
  return { ...meta, bonus, pct, bonusText }
})

const resultLevel = computed(() => {
  const v = drawValue.value
  if (v >= 80) return 'legendary'
  if (v >= 60) return 'epic'
  if (v >= 40) return 'rare'
  if (v >= 20) return 'normal'
  return 'poor'
})
const resultText = computed(() => {
  const v = drawValue.value
  if (v >= 80) return '非常出色！'
  if (v >= 60) return '表现优秀'
  if (v >= 40) return '表现良好'
  if (v >= 20) return '发挥一般'
  return '发挥欠佳'
})

// ===== 队伍结果 =====
const currentTeam = computed(() => teamStore.getTeamById(currentUser.value?.teamId || ''))

// 自己所属队伍（优先按本轮队伍成员匹配，兼容 user.teamId 未设置的情况）
const myTeamId = computed(() => {
  const uid = currentUser.value?.id
  if (!uid) return ''
  const t = (teamStore.teams || []).find((team: any) => team.members?.some((m: any) => m.playerId === uid))
  return t?.id || currentTeam.value?.id || ''
})
const teamResult = computed(() =>
  performanceStore.teamPerformanceResults.find(t => t.teamId === currentTeam.value?.id)
)

// 团队得票卡片展开：显示成员名单（队长在前，其余按姓名排序，不显示得分）
const expandedVoteTeams = ref<Set<string>>(new Set())
function toggleVoteTeam(teamId: string) {
  const s = new Set(expandedVoteTeams.value)
  if (s.has(teamId)) s.delete(teamId)
  else s.add(teamId)
  expandedVoteTeams.value = s
}
function teamCaptainId(teamId: string): string {
  return (teamStore.teams || []).find((t: any) => t.id === teamId)?.captainId || ''
}
function teamMembersSorted(teamId: string): any[] {
  const team: any = (teamStore.teams || []).find((t: any) => t.id === teamId)
  const members = [...(team?.members || [])]
  const cap = team?.captainId
  return members.sort((a: any, b: any) => {
    if (a.playerId === cap) return -1
    if (b.playerId === cap) return 1
    return String(a.player?.name || '').localeCompare(String(b.player?.name || ''), 'zh')
  })
}

// 当前选手的个人演出数据
const myPerformance = computed(() => {
  if (!teamResult.value) return null
  const perf = teamResult.value.playerPerformances?.find((p: any) => p.playerId === currentUser.value?.id)
  return perf || null
})

// 详细得分拆解（使用后端返回的真实数据）
const scoreBreakdown = computed(() => {
  const tr = teamResult.value
  const myPerf = myPerformance.value
  if (!tr || !myPerf) return null

  const attrs = currentUser.value?.attributes || { vocal: 0, dance: 0, charm: 0 }
  const sw = tr.songWeights || { vocal: 0.34, dance: 0.33, charm: 0.33 }

  // 使用后端返回的实际计算值
  const attrScore = myPerf.attributeScore ?? Math.round(attrs.vocal * sw.vocal + attrs.dance * sw.dance + attrs.charm * sw.charm)
  const difficultyFactor = myPerf.difficultyFactor ?? 0.80
  const perfValue = myPerf.performanceValue || 0
  const performanceBonus = myPerf.performanceBonus ?? (perfValue * 2)

  // 根据 difficultyFactor 反推难度等级
  const difficulty = Math.round(1 - (difficultyFactor - 1) / 0.1)

  // 原始分
  const rawScore = attrScore * difficultyFactor + performanceBonus

  // 最终分（优先用后端返回的）
  const finalScore = myPerf.playerScore || Math.round(Math.max(0, Math.min(120, rawScore)))

  const avgCharm = tr.teamAttributes?.charm || 0
  const teamScore = tr.teamScore || 0
  const finalVotes = tr.finalVotes || 0

  return {
    attrs,
    songWeights: sw,
    attrScore,
    difficulty,
    difficultyFactor,
    perfValue,
    performanceBonus,
    rawScore: +rawScore.toFixed(1),
    finalScore,
    teamScore,
    avgCharm,
    finalVotes
  }
})

// ===== 评审席 =====
const seats = ref<AudienceSeat[]>([])
const seatsLoaded = ref(false)
const selectedSeat = ref(0)
const detailVisible = ref(false)
const selectedSeatNumber = ref(0)
const seatDetailLoading = ref(false)
const seatDetailVotes = ref<{ voteOrder: number; playerName: string }[]>([])
const seatDetailProfile = ref<{ gender: string; age: number; occupation: string } | null>(null)

// 筛选状态
const filterGender = ref<string>('')
const filterAge = ref<string>('')
const filterOccupation = ref<string>('')

const votedSeatCount = computed(() => seats.value.filter(s => s.voted).length)

const genderStats = computed(() => {
  const voted = seats.value.filter(s => s.voted && s.gender)
  return { male: voted.filter(s => s.gender === '男').length, female: voted.filter(s => s.gender === '女').length }
})

const AGE_RANGES = [
  { label: '18-22岁', min: 18, max: 22 },
  { label: '23-30岁', min: 23, max: 30 },
  { label: '31-40岁', min: 31, max: 40 },
  { label: '41-50岁', min: 41, max: 50 },
  { label: '51-60岁', min: 51, max: 60 }
]

const ageStats = computed(() => AGE_RANGES.map(r => ({
  ...r,
  count: seats.value.filter(s => s.voted && s.age && s.age >= r.min && s.age <= r.max).length
})))

const occupationStats = computed(() => {
  const map: Record<string, number> = {}
  for (const s of seats.value) {
    if (s.voted && s.occupation) map[s.occupation] = (map[s.occupation] || 0) + 1
  }
  return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
})

const filteredSeats = computed(() => seats.value.filter(s => {
  if (filterGender.value && s.gender !== filterGender.value) return false
  if (filterAge.value) {
    const range = AGE_RANGES.find(r => r.label === filterAge.value)
    if (range && (!s.age || s.age < range.min || s.age > range.max)) return false
  }
  if (filterOccupation.value && s.occupation !== filterOccupation.value) return false
  return true
}))

async function fetchSeats() {
  try {
    const res = await getPlayerAudienceSeats(roundId.value)
    seats.value = res.seats || []
    seatsLoaded.value = true
  } catch {
    seatsLoaded.value = false
  }
}

async function handleSeatClick(seat: AudienceSeat) {
  if (!seat.voted) return
  selectedSeat.value = seat.seatNumber
  selectedSeatNumber.value = seat.seatNumber
  detailVisible.value = true
  seatDetailLoading.value = true
  seatDetailVotes.value = []
  seatDetailProfile.value = null
  try {
    const res = await getPlayerAudienceSeatDetail(roundId.value, seat.seatNumber)
    // 提取评审档案
    if (res.detail?.gender) {
      seatDetailProfile.value = {
        gender: res.detail.gender,
        age: res.detail.age,
        occupation: res.detail.occupation
      }
    }
    seatDetailVotes.value = res.detail?.votes?.map((v: any) => ({
      voteOrder: v.voteOrder,
      playerName: v.playerName || '未知选手'
    })) || []
  } catch {
    seatDetailVotes.value = []
  }
  seatDetailLoading.value = false
}

// ===== 个人喜爱度排名（Phase 5）=====
const audienceRankings = ref<any[]>([])
const myAudienceRanking = ref<{ rank: number; playerName: string; votes: number } | null>(null)

// 进入淘汰阶段后额外显示个人喜爱度排名（seasonStage 不再是 'performance'）
const showRanking = computed(() => {
  if (!roundStatus.value) return false
  return roundStatus.value.released && roundStatus.value.seasonStage !== 'performance' && audienceRankings.value.length > 0
})

const rankClass = computed(() => {
  const r = myAudienceRanking.value?.rank
  if (!r) return ''
  if (r === 1) return 'rank-gold'
  if (r === 2) return 'rank-silver'
  if (r === 3) return 'rank-bronze'
  if (r <= 5) return 'rank-top'
  return 'rank-normal'
})

// ===== 团队排名展开 =====
const expandedTeamId = ref('')
let revealedTimer: number | undefined
// 各团队评审投票矩阵（选手端展示 yes/no 情况）
const teamAudienceMatrices = ref<Record<string, any[]>>({})
const loadingTeamMatrix = ref<Record<string, boolean>>({})
// 已揭晓团队（管理员逐个点击揭晓后，选手端逐步展示）
const revealedTeamIds = ref<string[]>([])

// 已揭晓的团队对象（从全部团队结果中筛出已揭晓的）
const revealedTeams = computed(() => {
  const all = performanceStore.sortedTeamPerformanceResults
  const idSet = new Set(revealedTeamIds.value)
  return all.filter(t => idSet.has(t.teamId))
})

// 加载已揭晓团队并预加载它们的评审矩阵
async function loadRevealedTeamsData() {
  try {
    const { getRevealedTeams } = await import('../../services/api')
    const res = await getRevealedTeams(roundId.value)
    if (res?.revealedTeamIds) {
      revealedTeamIds.value = res.revealedTeamIds
      // 为每个已揭晓团队加载评审矩阵
      for (const teamId of res.revealedTeamIds) {
        if (!teamAudienceMatrices.value[teamId] && !loadingTeamMatrix.value[teamId]) {
          loadingTeamMatrix.value[teamId] = true
          try {
            const { getPlayerTeamAudienceMatrix } = await import('../../services/api')
            const m = await getPlayerTeamAudienceMatrix(roundId.value, teamId)
            if (m?.seats) {
              teamAudienceMatrices.value[teamId] = m.seats
            }
          } catch (_) { /* 静默 */ } finally {
            loadingTeamMatrix.value[teamId] = false
          }
        }
      }
    }
  } catch (_) { /* 静默 */ }
}

async function toggleTeamExpand(teamId: string) {
  expandedTeamId.value = expandedTeamId.value === teamId ? '' : teamId
  // 展开时加载该团评审投票矩阵（仅加载一次）
  if (expandedTeamId.value === teamId && !teamAudienceMatrices.value[teamId] && !loadingTeamMatrix.value[teamId]) {
    loadingTeamMatrix.value[teamId] = true
    try {
      const { getPlayerTeamAudienceMatrix } = await import('../../services/api')
      const res = await getPlayerTeamAudienceMatrix(roundId.value, teamId)
      if (res?.seats) {
        teamAudienceMatrices.value[teamId] = res.seats
      }
    } catch (_) { /* 静默 */ } finally {
      loadingTeamMatrix.value[teamId] = false
    }
  }
}

const maxVotes = computed(() => {
  if (audienceRankings.value.length === 0) return 1
  return Math.max(...audienceRankings.value.map(r => r.votes || 0), 1)
})

async function fetchRankings() {
  try {
    const res = await getAudienceFinalRanking(roundId.value)
    if (res.released && res.rankings?.length > 0) {
      audienceRankings.value = res.rankings
      const uid = currentUser.value?.id
      const myRank = res.rankings.find((r: any) => r.playerId === uid)
      if (myRank) {
        myAudienceRanking.value = {
          rank: myRank.rank,
          playerName: myRank.playerName || currentUser.value?.name || '',
          votes: myRank.votes || 0
        }
      }
    }
  } catch { /* ignore */ }
}

// ===== 抽取发挥值已迁移至独立页面（performance-draw），此处仅展示结果 =====

async function loadRoundStatus() {
  try {
    roundStatus.value = await getPerformanceRoundStatus(roundId.value)
  } catch {
    roundStatus.value = { started: false, settled: false, released: false, opened: false, seasonStage: null, generationMode: 'random' }
  }
}

async function loadMyRating() {
  try {
    const info = await getMyRatingInfo()
    if (info?.rating) {
      const RT: Record<string, string> = { S: '超级完美', A: '完美', B: '正常', C: '翻车', D: '超级翻车' }
      ratingResult.value = {
        rating: info.rating,
        ratingText: RT[info.rating] || info.rating,
        roll: info.roll ?? null,
        difficulty: info.faces?.difficulty ?? info.song?.difficulty ?? 0,
        faces: info.faces?.faces || { a: 0, b: 0, c: 0, d: 0 },
        mainAttr: info.faces?.mainAttr || info.song?.mainAttribute || '',
        songName: info.song?.name || ''
      }
    }
  } catch { /* ignore */ }
}

// websocket：管理员开始公演 / 揭晓队伍后，选手端实时刷新（含自动进入下一阶段）
useSfRefresh(() => {
  loadRoundStatus()
  loadMyRating()
  loadRevealedTeamsData()
  performanceStore.fetchPlayerPerformanceResults(String(currentRound.value)).catch(() => {})
}, '/performance')

onMounted(async () => {
  const uid = currentUser.value?.id
  if (!uid) return

  // 1. 获取轮次状态
  try {
    const status = await getPerformanceRoundStatus(roundId.value)
    roundStatus.value = status
  } catch {
    roundStatus.value = { started: false, settled: false, released: false, opened: false, seasonStage: null, generationMode: 'random' }
  }

  // 2. 恢复 localStorage 发挥值
  try {
    const saved = loadPlayerStatuses(roundId.value).find((p: any) => p.playerId === uid)
    if (saved?.generated && saved?.performanceValue !== null) {
      hasDrawn.value = true
      drawValue.value = saved.performanceValue
    }
  } catch { /* ignore */ }

  // 3. 从后端检查发挥值
  try {
    const status = await getPlayerPerformanceStatus(roundId.value)
    if (roundStatus.value && roundStatus.value.started !== status.started) {
      roundStatus.value.started = status.started
    }
    const myStatus = (status.players || []).find((p: any) => p.playerId === uid || (p as any).player_id === uid)
    if (myStatus?.generated && myStatus?.performanceValue !== null) {
      hasDrawn.value = true
      drawValue.value = myStatus.performanceValue
      perfBucket.value = myStatus.perfBucket ?? null
      perfBonus.value = myStatus.perfBonus ?? null
    } else {
      // ★ 后端显示未生成 → 覆盖 localStorage 的旧数据 ★
      hasDrawn.value = false
      drawValue.value = 0
      perfBucket.value = null
      perfBonus.value = null
      // 清理 localStorage 中该选手的旧数据
      const statuses = loadPlayerStatuses(roundId.value)
      const filtered = statuses.filter((s: any) => s.playerId !== uid)
      savePlayerStatuses(roundId.value, filtered)
    }
    // 3.3 恢复已投掷的个人评级（选手只能投一次）
    if (myStatus?.rating && !ratingResult.value) {
      const RT: Record<string, string> = { S: '超级完美', A: '完美', B: '正常', C: '翻车', D: '超级翻车' }
      ratingResult.value = {
        rating: myStatus.rating,
        ratingText: RT[myStatus.rating] || myStatus.rating,
        roll: myStatus.ratingRoll,
        difficulty: myStatus.ratingFaces?.difficulty || 0,
        faces: myStatus.ratingFaces || { a: 0, b: 0, c: 0 },
        mainAttr: myStatus.ratingMainAttr,
        songName: '',
        alreadyRolled: true
      }
    }
  } catch { /* ignore */ }

  // 4. 加载队伍和结果数据
  await Promise.all([
    teamStore.fetchTeams(roundId.value),
    performanceStore.fetchPlayerPerformanceResults(String(currentRound.value))
  ])

  // 5. 根据当前阶段预加载数据
  const rs = roundStatus.value
  if (rs?.released) {
    // 无论相位 4 还是 5，都加载评审席和排名
    await Promise.all([
      fetchSeats(),
      fetchRankings()
    ])
  }

  // 加载已揭晓队伍评审矩阵（管理员逐个揭晓后逐步展示）
  await loadRevealedTeamsData()
  // 3.3 加载本人公演骰子信息（歌曲/难度/各点数评级，补全展示）
  await loadMyRating()
  // 轮询刷新：管理员揭晓新队伍后选手端自动更新
  revealedTimer = window.setInterval(() => { if (!document.hidden) loadRevealedTeamsData() }, 8000)
})

onBeforeUnmount(() => {
  if (revealedTimer) window.clearInterval(revealedTimer)
})
</script>

<style scoped lang="scss">
.perf-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  // justify-content: center 在结果页用 flex-start
  color: var(--text-primary);
  background: var(--bg-primary);
  padding: 20px;
}

// ===== Phase 0 =====
.locked-stage { text-align: center; position: relative;
  .locked-glow { position: absolute; top: 50%; left: 50%; width: 300px; height: 300px; transform: translate(-50%, -50%); background: radial-gradient(circle, rgba(100,100,100,0.1) 0%, transparent 70%); }
  .locked-icon { font-size: 80px; margin-bottom: 20px; }
  h2 { font-size: 24px; font-weight: 700; margin: 0 0 10px; }
  p { color: var(--text-muted); font-size: 14px; margin: 0; }
}

// ===== Phase 1 =====
.waiting-stage { text-align: center; position: relative;
  .waiting-glow { position: absolute; top: 50%; left: 50%; width: 300px; height: 300px; transform: translate(-50%, -50%); background: radial-gradient(circle, rgba(162,155,254,0.1) 0%, transparent 70%); }
  .waiting-icon { font-size: 80px; margin-bottom: 20px; animation: float 3s ease-in-out infinite; }
  h2 { font-size: 24px; font-weight: 700; margin: 0 0 10px; }
  p { color: var(--text-muted); font-size: 14px; margin: 0; }
  .waiting-dots { display: flex; gap: 8px; justify-content: center; margin-top: 24px;
    span { width: 8px; height: 8px; border-radius: 50%; background: rgba(162,155,254,0.3); animation: dotBounce 1.4s ease-in-out infinite; &:nth-child(2) { animation-delay: 0.2s; } &:nth-child(3) { animation-delay: 0.4s; } }
  }
}

// ===== Phase 2 抽取 =====
.draw-stage { text-align: center; width: 100%; max-width: 420px; }
.stage-badge { display: inline-flex; padding: 6px 20px; background: rgba(255,215,0,0.15); border: 1px solid rgba(255,215,0,0.3); border-radius: 20px; font-size: 14px; font-weight: 600; color: #ffd700; margin-bottom: 32px; }
.draw-area {
  .draw-icon { font-size: 64px; margin-bottom: 16px; }
  h2 { font-size: 22px; font-weight: 700; margin: 0 0 8px; }
  .draw-hint { color: var(--text-muted); font-size: 13px; margin: 0 0 28px; }
}
.draw-btn { padding: 16px 48px; font-size: 18px; font-weight: 700; background: linear-gradient(135deg, #ffd700, #ff6b6b); border: none; border-radius: 14px; color: var(--text-primary); cursor: pointer; transition: all 0.25s ease; letter-spacing: 1px; box-shadow: 0 6px 25px rgba(255,215,0,0.25); &:hover { transform: translateY(-3px); box-shadow: 0 10px 35px rgba(255,215,0,0.35); } &:active { transform: translateY(0); } }
.draw-btn.stop-btn { background: linear-gradient(135deg, #ff6b6b, #e74c3c); box-shadow: 0 6px 25px rgba(231,76,60,0.25); }
// 引导前往抽取按钮（router-link 表现得像按钮）
.go-draw-btn {
  display: inline-block;
  padding: 14px 36px;
  font-size: 16px;
  font-weight: 700;
  text-decoration: none;
  background: linear-gradient(135deg, #6c5ce7, #a29bfe);
  border-radius: 14px;
  color: #fff;
  letter-spacing: 1px;
  box-shadow: 0 6px 25px rgba(108, 92, 231, 0.3);
  transition: all 0.25s ease;

  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 10px 35px rgba(108, 92, 231, 0.4);
  }
}

// ===== 结果展示 =====
.result-reveal { margin-top: 20px; position: relative; animation: revealIn 0.6s ease; }
.result-glow { position: absolute; top: 50%; left: 50%; width: 200px; height: 200px; transform: translate(-50%, -50%); border-radius: 50%;
  &.legendary { background: radial-gradient(circle, rgba(255,215,0,0.3) 0%, transparent 70%); }
  &.epic { background: radial-gradient(circle, rgba(155,89,182,0.3) 0%, transparent 70%); }
  &.rare { background: radial-gradient(circle, rgba(52,152,219,0.2) 0%, transparent 70%); }
  &.normal { background: radial-gradient(circle, rgba(46,204,113,0.15) 0%, transparent 70%); }
  &.poor { background: radial-gradient(circle, rgba(231,76,60,0.15) 0%, transparent 70%); }
  &.disaster { background: radial-gradient(circle, rgba(139,0,0,0.2) 0%, transparent 70%); }
}
.result-value { font-size: 72px; font-weight: 800; line-height: 1; position: relative;
  &.legendary { color: #ffd700; text-shadow: 0 0 30px rgba(255,215,0,0.5); } &.epic { color: #9b59b6; text-shadow: 0 0 25px rgba(155,89,182,0.4); } &.rare { color: #3498db; text-shadow: 0 0 20px rgba(52,152,219,0.3); } &.normal { color: #2ecc71; } &.poor { color: #e67e22; } &.disaster { color: #8b0000; text-shadow: 0 0 15px rgba(139,0,0,0.3); }
}
.result-label { font-size: 18px; font-weight: 700; margin-top: 10px;
  &.legendary { color: #ffd700; } &.epic { color: #9b59b6; } &.rare { color: #3498db; } &.normal { color: #2ecc71; } &.poor { color: #e67e22; } &.disaster { color: #8b0000; }
}
.result-bar { height: 6px; background: var(--progress-bg); border-radius: 4px; margin-top: 16px; overflow: hidden;
  .bar-fill { height: 100%; border-radius: 4px; transition: width 1s ease;
    &.legendary { background: linear-gradient(90deg, #ffd700, #ff6b6b); } &.epic { background: linear-gradient(90deg, #9b59b6, #8e44ad); } &.rare { background: linear-gradient(90deg, #3498db, #2980b9); } &.normal { background: linear-gradient(90deg, #2ecc71, #27ae60); } &.poor { background: linear-gradient(90deg, #e67e22, #d35400); } &.disaster { background: linear-gradient(90deg, #8b0000, #5a0000); }
  }
}

// ===== 结果页 (Phase 2-5) =====
.results-stage {
  width: 100%; max-width: 700px;
  padding-top: 20px;
  // 结果页整体在选手端水平居中
  align-self: center;
}
.results-header { margin-bottom: 20px; text-align: left;
  h1 { font-size: 24px; font-weight: 800; margin: 0 0 4px; letter-spacing: 1px; }
  .subtitle { color: var(--text-tertiary); margin: 0; font-size: 13px; }
}
.perf-card { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 28px; background: var(--hover-bg); border: 1px solid var(--border-color); border-radius: 16px; margin-bottom: 16px;
  .perf-label { font-size: 14px; color: var(--text-tertiary); }
  .perf-value { font-size: 48px; font-weight: 800; line-height: 1;
    &.legendary { color: #ffd700; text-shadow: 0 0 20px rgba(255,215,0,0.3); } &.epic { color: #9b59b6; } &.rare { color: #3498db; } &.normal { color: #2ecc71; } &.poor { color: #e67e22; } &.disaster { color: #8b0000; }
  }
  .perf-text { font-size: 16px; font-weight: 600;
    &.legendary { color: #ffd700; } &.epic { color: #9b59b6; } &.rare { color: #3498db; } &.normal { color: #2ecc71; } &.poor { color: #e67e22; } &.disaster { color: #8b0000; }
  }
  .perf-bucket {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 16px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 600;
    border: 1px solid transparent;

    .pb-sep { opacity: 0.5; }

    &.b1 { background: rgba(39, 174, 96, 0.15); color: #27ae60; border-color: rgba(39, 174, 96, 0.4); }
    &.b2 { background: rgba(46, 204, 113, 0.13); color: #1eae6a; border-color: rgba(46, 204, 113, 0.35); }
    &.b3 { background: rgba(127, 140, 141, 0.15); color: #7f8c8d; border-color: rgba(127, 140, 141, 0.35); }
    &.b4 { background: rgba(243, 156, 18, 0.15); color: #f39c12; border-color: rgba(243, 156, 18, 0.4); }
    &.b5 { background: rgba(231, 76, 60, 0.15); color: #e74c3c; border-color: rgba(231, 76, 60, 0.4); }
  }
}
.info-card { padding: 12px 18px; background: var(--hover-bg); border: 1px solid var(--border-color); border-radius: 12px; display: flex; justify-content: space-between; align-items: center;
  &.dim { justify-content: center; color: var(--text-muted); }
}

// ===== 团队排名 =====
.teams-ranking-section { margin-top: 8px; }
.teams-ranking-list { display: flex; flex-direction: column; gap: 10px; }

// ===== 已揭晓队伍（评审矩阵） =====
.no-revealed {
  padding: 24px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 14px;
  background: var(--hover-bg);
  border: 1px dashed var(--border-color);
  border-radius: 12px;
}
.revealed-list { display: flex; flex-direction: column; gap: 12px; }
.revealed-card {
  background: var(--hover-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.2s ease;
  &.is-my-team { border-color: rgba(102, 126, 234, 0.5); box-shadow: 0 0 0 1px rgba(102, 126, 234, 0.1); }
}
.revealed-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  cursor: pointer;
  &:hover { background: var(--bg-primary); }
}
.revealed-title { display: flex; align-items: center; gap: 12px; }
.revealed-badge { font-size: 24px; }
.revealed-name { font-size: 15px; font-weight: 700; color: var(--text-primary); }
.revealed-song { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
.revealed-toggle { color: var(--text-tertiary); font-size: 12px; }

.team-rank-card {
  background: var(--hover-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover { border-color: rgba(102, 126, 234, 0.4); }
  &.is-my-team { border-color: rgba(102, 126, 234, 0.5); box-shadow: 0 0 0 1px rgba(102, 126, 234, 0.1); }
  &.expanded { border-color: rgba(102, 126, 234, 0.5); }
}
.team-rank-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
}
.team-rank-main { display: flex; align-items: center; gap: 12px; }
.team-rank-pos {
  width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 800; flex-shrink: 0; background: var(--progress-bg); color: var(--text-secondary);
  &.rank-gold { background: linear-gradient(135deg, #ffd700, #ffb300); color: var(--text-primary); }
  &.rank-silver { background: linear-gradient(135deg, #bdc3c7, #95a5a6); color: var(--text-primary); }
  &.rank-bronze { background: linear-gradient(135deg, #e67e22, #d35400); color: var(--text-primary); }
  &.rank-top { background: linear-gradient(135deg, #667eea, #764ba2); color: var(--text-primary); }
}
.team-rank-info { display: flex; flex-direction: column; gap: 2px; }
.team-rank-name { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.team-rank-song { font-size: 12px; color: var(--text-tertiary); }
.team-rank-votes { display: flex; align-items: baseline; gap: 2px; }
.votes-value { font-size: 20px; font-weight: 800; color: #667eea; }
.votes-label { font-size: 12px; color: var(--text-tertiary); }
.team-rank-detail {
  padding: 0 16px 14px;
  border-top: 1px solid var(--border-color);
  animation: revealIn 0.25s ease;
  .detail-line { font-size: 13px; color: var(--text-secondary); padding: 10px 0 6px; }
}
.member-list { display: flex; flex-wrap: wrap; gap: 8px; }
.member-item {
  display: flex; align-items: center;
  padding: 6px 12px; background: var(--card-bg); border-radius: 16px; font-size: 13px;
  .member-name { color: var(--text-primary); font-weight: 500; }
}

// ===== 大众评审投票矩阵（选手端，与管理员端一致） =====
.audience-matrix-block {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--border-color);

  .matrix-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;

    .matrix-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }
  }

  .matrix-loading,
  .matrix-empty {
    padding: 20px;
    text-align: center;
    color: var(--text-secondary);
    background: #f7f8fa;
    border-radius: 8px;
  }

  .audience-matrix {
    display: grid;
    grid-template-columns: repeat(20, 1fr);
    gap: 3px;
    max-height: 420px;
    overflow-y: auto;
    padding: 8px;
    background: #f7f8fa;
    border-radius: 8px;

    .matrix-seat {
      aspect-ratio: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #ffffff;
      border: 1px solid #e5e6eb;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s ease;
      overflow: hidden;
      min-width: 0;

      .seat-inner {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0;
        line-height: 1.1;
        text-align: center;
        width: 100%;
        padding: 1px;
      }

      .seat-name {
        font-size: 8px;
        font-weight: 600;
        color: var(--text-primary);
        white-space: nowrap;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .seat-gender-age {
        font-size: 8px;
        font-weight: 600;
        color: #667eea;
        white-space: nowrap;
      }

      .seat-occupation {
        font-size: 7px;
        color: var(--text-tertiary);
        white-space: nowrap;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      &:hover {
        transform: scale(1.15);
        border-color: #0052d9;
        z-index: 1;
      }

      &.yes {
        background: #00a870;
        border-color: #00a870;

        .seat-name,
        .seat-gender-age,
        .seat-occupation {
          color: #ffffff;
        }
      }
    }
  }
}

// ===== 通用区块标题 =====
.section-title-bar { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 600; margin: 20px 0 12px; color: var(--text-primary);
  .section-icon { font-size: 20px; }
}

// ===== 评审席 (Phase 4) =====
.audience-seats-section { margin-top: 8px; }
.seats-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; flex-wrap: wrap;
  .seats-info { font-size: 13px; color: var(--text-tertiary); }
  .voted-count { color: rgba(102,126,234,0.8); }
  .seats-tip { font-size: 12px; color: var(--text-muted); margin-left: auto; }
  .filter-group { margin-left: auto; }
  .filter-result { font-size: 12px; color: var(--text-tertiary); white-space: nowrap; }
}
.seats-grid { display: grid; grid-template-columns: repeat(20, 1fr); gap: 4px; }
.seat-item { display: flex; align-items: center; justify-content: center; aspect-ratio: 1; cursor: default; border-radius: 4px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-color); transition: all 0.15s; overflow: hidden;
  .seat-inner { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0; line-height: 1.15; text-align: center; width: 100%; padding: 2px; }
  .seat-gender-age { font-size: 10px; font-weight: 600; color: rgba(180,160,255,0.9); white-space: nowrap; }
  .seat-occupation { font-size: 8px; color: var(--text-muted); white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .seat-empty { font-size: 11px; color: rgba(255,255,255,0.15); }
  &.voted { background: rgba(102,126,234,0.12); border-color: rgba(102,126,234,0.25); cursor: pointer;
    &:hover { background: rgba(102,126,234,0.22); border-color: rgba(102,126,234,0.4); transform: scale(1.1); z-index: 1; }
  }
  &.selected { border-color: #667eea; box-shadow: 0 0 6px rgba(102,126,234,0.4); }
}

// 评审详情弹窗
.detail-loading, .detail-empty { padding: 24px; text-align: center; color: var(--text-tertiary); font-size: 14px; }
.seat-detail-list { display: flex; flex-direction: column; gap: 8px; }
.seat-detail-item { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: var(--hover-bg); border-radius: 8px;
  .vote-order { font-size: 13px; color: var(--text-tertiary); min-width: 48px; }
  .vote-player { font-size: 14px; font-weight: 600; color: var(--text-primary); }
}
.reviewer-profile { display: flex; gap: 8px; padding: 8px 12px; background: linear-gradient(135deg, rgba(102,126,234,0.08), rgba(118,75,162,0.08)); border-radius: 8px; align-items: center; margin-bottom: 4px;
  .profile-tag { font-size: 12px; padding: 2px 10px; border-radius: 12px; color: var(--text-primary);
    &.gender { background: #667eea; }
    &.age { background: #f093fb; }
    &.occupation { background: #4facfe; }
  }
}

// ===== 个人喜爱度排名 (Phase 5) =====
.audience-section { margin-top: 8px; }
.my-rank-card { display: flex; align-items: center; gap: 16px; padding: 18px; background: var(--hover-bg); border: 1px solid var(--border-color); border-radius: 14px; margin-bottom: 16px; }
.rank-number { width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 800; flex-shrink: 0; background: var(--hover-bg); color: var(--text-secondary);
  &.rank-gold { background: linear-gradient(135deg, #ffd700, #ffb300); color: var(--text-primary); }
  &.rank-silver { background: linear-gradient(135deg, #bdc3c7, #95a5a6); color: var(--text-primary); }
  &.rank-bronze { background: linear-gradient(135deg, #e67e22, #d35400); color: var(--text-primary); }
  &.rank-top { background: linear-gradient(135deg, #667eea, #764ba2); color: var(--text-primary); }
}
.rank-detail { display: flex; flex-direction: column; gap: 4px;
  .rank-label { font-size: 14px; color: var(--text-tertiary); }
  .rank-votes { font-size: 18px; font-weight: 700; color: var(--text-primary); }
}
.rank-list { display: flex; flex-direction: column; gap: 6px; }
.rank-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: var(--hover-bg); border-radius: 8px;
  &.is-me { background: rgba(102,126,234,0.12); border: 1px solid rgba(102,126,234,0.3); }
}
.rank-pos { font-size: 13px; font-weight: 700; color: var(--text-tertiary); width: 22px; text-align: center; }
.rank-name { font-size: 13px; color: var(--text-secondary); width: 80px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rank-bar-track { flex: 1; height: 6px; background: var(--progress-bg); border-radius: 3px; overflow: hidden; }
.rank-bar-fill { height: 100%; background: linear-gradient(90deg, #667eea, #764ba2); border-radius: 3px; transition: width 0.5s; }
.rank-vote-count { font-size: 12px; color: var(--text-tertiary); width: 50px; text-align: right; flex-shrink: 0; }

// ===== 动画 =====
@keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
@keyframes dotBounce { 0%, 80%, 100% { transform: translateY(0); opacity: 0.3; } 40% { transform: translateY(-12px); opacity: 1; } }
@keyframes revealIn { from { opacity: 0; transform: scale(0.5) translateY(20px); } to { opacity: 1; transform: scale(1) translateY(0); } }

// ===== 移动端 =====
@media (max-width: 768px) {
  .perf-page { min-height: calc(100vh - 56px); padding: 12px; padding-bottom: 72px; }
  .locked-stage, .waiting-stage {
    .locked-glow, .waiting-glow { width: 200px; height: 200px; }
    .locked-icon, .waiting-icon { font-size: 60px; }
    h2 { font-size: 20px; }
  }
  .draw-stage .stage-badge { font-size: 12px; padding: 4px 16px; }
  .draw-area .draw-icon { font-size: 48px; } .draw-area h2 { font-size: 18px; }
  .draw-btn { padding: 14px 36px; font-size: 16px; }
  .result-value { font-size: 56px; }
  .result-label { font-size: 16px; }
  .results-stage { padding-top: 12px; }
  .results-header h1 { font-size: 20px; }
  .perf-card { padding: 20px; .perf-value { font-size: 40px; } }
  .seats-grid { grid-template-columns: repeat(15, 1fr); gap: 3px; }
  .seat-item .seat-icon { font-size: 12px; }
}
@media (max-width: 480px) {
  .perf-page { min-height: calc(100vh - 48px); padding: 10px; padding-bottom: 66px; }
  .result-value { font-size: 44px; }
  .perf-card { padding: 16px; .perf-value { font-size: 32px; } }
  .seats-grid { grid-template-columns: repeat(10, 1fr); gap: 2px; }
  .seat-item .seat-icon { font-size: 10px; }
}
// ===== 得分详情 =====
.score-detail-section {
  width: 100%;
  max-width: 700px;
  margin-top: 20px;
}

.section-title-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 600;
  color: #ffd700;
}

.section-icon { font-size: 20px; }

.detail-block {
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
}

.detail-block-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.breakdown-table {
  width: 100%;
  border-collapse: collapse;

  tr {
    border-bottom: 1px solid var(--border-color);
  }

  tr:last-child { border-bottom: none; }

  td {
    padding: 8px 4px;
    font-size: 13px;
  }

  .label {
    color: var(--text-tertiary);
    white-space: nowrap;
    width: 90px;
    vertical-align: top;
  }

  .value {
    color: var(--text-secondary);

    &.formula {
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 12px;
      color: var(--text-tertiary);
      line-height: 1.6;
    }

    strong {
      color: var(--text-primary);
      font-weight: 700;
    }

    &.highlight {
      strong {
        color: #ffd700;
        font-size: 15px;
      }
    }
  }

  .formula-row td { padding: 10px 4px; }

  .result-row td {
    padding: 10px 4px 6px;
    border-top: 1px solid var(--border-color);
  }
}

.results-preview {
  width: 100%;
  max-width: 700px;
  margin-top: 20px;

  .info-card {
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 16px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
}


.rating-roll-card { margin: 16px auto; max-width: 520px; padding: 16px; border-radius: 12px; border: 1px solid rgba(0,214,164,0.3); background: rgba(0,214,164,0.06); text-align: center; }
.rr-title { font-size: 15px; font-weight: 600; margin-bottom: 10px; }
.rr-result { display: flex; flex-direction: column; gap: 6px; align-items: center; }
.rr-badge { font-size: 22px; font-weight: 800; padding: 4px 16px; border-radius: 10px; }
.rr-badge.r-S { color: #ffcc00; background: rgba(255,204,0,0.15); }
.rr-badge.r-A { color: #00d6a4; background: rgba(0,214,164,0.15); }
.rr-badge.r-B { color: #409eff; background: rgba(64,158,255,0.15); }
.rr-badge.r-C { color: #ff9900; background: rgba(255,153,0,0.15); }
.rr-badge.r-D { color: #f56c6c; background: rgba(245,108,108,0.15); }
.rr-detail { font-size: 12px; opacity: .8; line-height: 1.6; }
.rr-error { color: #f56c6c; font-size: 13px; }
.rr-btn { padding: 12px 28px; border: none; border-radius: 10px; background: linear-gradient(135deg,#00d6a4,#00b48a); color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; }
.rr-btn:disabled { opacity: .6; cursor: not-allowed; }
.team-votes-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
  margin-top: 8px;
}
@media (min-width: 700px) {
  .team-votes-list { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
}
.team-vote-item {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 12px 8px; border-radius: 14px;
  background:
    radial-gradient(circle at 50% 0%, rgba(0, 82, 217, 0.06), rgba(0, 0, 0, 0) 70%),
    var(--card-bg);
  border: 1px solid var(--border-color);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.07);
  transition: transform 0.2s, box-shadow 0.2s;
}
.team-vote-item:hover { transform: translateY(-2px); box-shadow: 0 8px 22px rgba(0, 0, 0, 0.12); }
.team-vote-item .tv-name { font-size: 13px; font-weight: 700; cursor: pointer; user-select: none; }
.team-vote-item .tv-caret { font-size: 10px; margin-left: 4px; opacity: 0.7; }
.tv-members { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 6px; border-top: 1px dashed var(--border-color); padding-top: 6px; width: 100%; }
.tv-members .tv-member { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; padding: 2px 6px; border-radius: 10px; background: var(--hover-bg); }
.tv-members .tv-member em { color: #ffb300; font-style: normal; font-size: 10px; }
.tv-members .tv-av { width: 16px; height: 16px; border-radius: 50%; overflow: hidden; display: inline-flex; flex-shrink: 0; }
.team-vote-item.is-my-team {
  border: 2px solid #ffd700;
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.18), rgba(255, 215, 0, 0.06));
  box-shadow: 0 0 16px rgba(255, 215, 0, 0.55);
}
.team-vote-item.is-my-team .tv-name { color: #ffb300; }
.team-vote-item.is-my-team::after {
  content: '我的队伍';
  font-size: 10px;
  color: #ffb300;
  font-weight: 700;
}
.team-vote-item :deep(.digit-slot) { width: 34px; height: 48px; }
.team-vote-item :deep(.digit-slot .digit-num) { font-size: 26px; }
</style>