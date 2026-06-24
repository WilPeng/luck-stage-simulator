import type { StageType, StageInfo } from '../types/season'

export const STAGE_LIST: StageType[] = [
  'preparation',
  'setup',
  'captain',
  'team',
  'song',
  'training',
  'rehearsal',
  'performance',
  'elimination',
  'completed'
]

export const STAGE_INFO_MAP: Record<StageType, Omit<StageInfo, 'status'>> = {
  preparation: { type: 'preparation', name: '赛季准备', description: '管理选手、歌曲和基础配置' },
  setup: { type: 'setup', name: '队伍配置', description: '配置当前公演轮次' },
  login: { type: 'login', name: '登录确认', description: '选手登录确认阶段' },
  initial_luck: { type: 'initial_luck', name: '初始命运', description: '抽取初始属性加成' },
  captain: { type: 'captain', name: '队长产生', description: '产生各队队长' },
  team: { type: 'team', name: '组队阶段', description: '选手组队阶段' },
  song: { type: 'song', name: '选歌阶段', description: '选择公演歌曲' },
  training: { type: 'training', name: '训练阶段', description: '训练翻牌提升属性' },
  rehearsal: { type: 'rehearsal', name: '彩排阶段', description: '彩排获得修正分' },
  performance: { type: 'performance', name: '公演阶段', description: '公演比拼' },
  elimination: { type: 'elimination', name: '淘汰阶段', description: '公布淘汰结果' },
  completed: { type: 'completed', name: '本轮完成', description: '当前公演轮次已完成' },
  review: { type: 'review', name: '复盘阶段', description: '本季总结复盘' }
}

export function getStageInfoList(currentStage: StageType): StageInfo[] {
  return STAGE_LIST.map(type => {
    const index = STAGE_LIST.indexOf(type)
    const currentIndex = STAGE_LIST.indexOf(currentStage)
    let status: StageInfo['status'] = 'pending'
    
    if (index < currentIndex) {
      status = 'completed'
    } else if (index === currentIndex) {
      status = 'active'
    }
    
    return {
      ...STAGE_INFO_MAP[type],
      status
    }
  })
}

export function getNextStage(currentStage: StageType): StageType | null {
  const index = STAGE_LIST.indexOf(currentStage)
  if (index < STAGE_LIST.length - 1) {
    return STAGE_LIST[index + 1]
  }
  return null
}

export function getPrevStage(currentStage: StageType): StageType | null {
  const index = STAGE_LIST.indexOf(currentStage)
  if (index > 0) {
    return STAGE_LIST[index - 1]
  }
  return null
}
