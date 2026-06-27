export interface TrainingCard {
  id: string
  name: string
  type: 'vocal' | 'dance' | 'charm' | 'mixed' | 'event' | 'self_select'
  description: string
  effect: TrainingEffect
  weight: number
  enabled: boolean
  icon?: string
}

export interface TrainingEffect {
  vocal?: number
  dance?: number
  charm?: number
  randomOne?: number
  randomTwo?: number
  highest?: number
  lowest?: number
  selfSelect?: number   // 自选属性 +/-N，由前端弹出选择
  multiply?: number     // 随机一项属性乘以该倍数（1.5=+50%, 2=翻倍, 0.5=减半），自动转换为加减值
  multiplyAll?: number  // 三项属性全部乘以该倍数，自动转换为加减值
}

export interface TrainingConfig {
  drawsPerPlayer: number
  currentRound: number
  totalRounds: number
}

// 训练统计（根据新接口文档）
export interface TrainingStats {
  totalPlayers: number
  activePlayers: number
  playersInTeams: number
  playersNotInTeams: number
  totalTrainingCount: number
  averageTrainingCount: number
  completedTrainingPlayers: number
  completionRate: number
  trainingDistribution: Record<string, number>
  topImprovers: {
    userId: string
    name: string
    improvement: number
  }[]
}

export interface TrainingRecord {
  id: string
  userId: string
  userName?: string
  cardId: string
  cardName: string
  cardType: TrainingCard['type']
  effect: TrainingEffect
  attributesAfter?: {
    vocal: number
    dance: number
    charm: number
  }
  round?: number
  createdAt: string
}

export interface TrainingDrawResult {
  record: TrainingRecord
  user: {
    id: string
    name: string
    attributes: {
      vocal: number
      dance: number
      charm: number
    }
    trainingCount: number
    remainingDraws: number
  }
}

export interface AutoCompleteResult {
  processedCount: number
  totalDraws: number
  results: {
    playerId: string
    playerName: string
    drawsCount: number
    draws: {
      cardName: string
      effect: TrainingEffect
    }[]
    finalAttributes: {
      vocal: number
      dance: number
      charm: number
    }
  }[]
}

export interface TrainingRecordQuery {
  round?: number
  userId?: string
  cardId?: string
  startDate?: string
  endDate?: string
  page?: number
  pageSize?: number
}

export interface TrainingRecordListResponse {
  list: TrainingRecord[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface PresetCard {
  name: string
  type: TrainingCard['type']
  description: string
  effect: TrainingEffect
  weight: number
}
