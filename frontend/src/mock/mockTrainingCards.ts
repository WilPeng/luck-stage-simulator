import type { TrainingCard } from '../types/training'

export const mockTrainingCards: TrainingCard[] = [
  {
    id: 'tc001',
    name: '声乐老师加课',
    type: 'vocal',
    description: '声乐老师单独辅导，Vocal大幅提升',
    effect: { vocal: 5 },
    weight: 15,
    enabled: true
  },
  {
    id: 'tc002',
    name: '高强度舞蹈课',
    type: 'dance',
    description: '魔鬼训练，Dance能力大幅提升',
    effect: { dance: 5 },
    weight: 15,
    enabled: true
  },
  {
    id: 'tc003',
    name: '镜头感爆发',
    type: 'charm',
    description: '突然开窍，Charm大幅提升',
    effect: { charm: 5 },
    weight: 15,
    enabled: true
  },
  {
    id: 'tc004',
    name: '状态稳定',
    type: 'mixed',
    description: '状态良好，三项属性均有提升',
    effect: { vocal: 2, dance: 2, charm: 2 },
    weight: 20,
    enabled: true
  },
  {
    id: 'tc005',
    name: '摆烂一天',
    type: 'event',
    description: '状态不佳，随机一项属性下降',
    effect: { randomOne: -4 },
    weight: 10,
    enabled: true
  },
  {
    id: 'tc006',
    name: '黑马时刻',
    type: 'event',
    description: '潜力爆发，最低属性大幅提升',
    effect: { lowest: 6 },
    weight: 10,
    enabled: true
  },
  {
    id: 'tc007',
    name: '全能特训',
    type: 'mixed',
    description: '全面训练，两项属性提升',
    effect: { randomTwo: 3 },
    weight: 10,
    enabled: true
  },
  {
    id: 'tc008',
    name: '巅峰突破',
    type: 'event',
    description: '突破瓶颈，最高属性大幅提升',
    effect: { highest: 4 },
    weight: 5,
    enabled: true
  },
  {
    id: 'tc009',
    name: '自主特训',
    type: 'self_select',
    description: '自由选择一项属性增加或减少',
    effect: { selfSelect: 5 },
    weight: 8,
    enabled: true
  }
]