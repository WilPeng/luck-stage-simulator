import type { Song } from '../types/song'

export const mockSongs: Song[] = [
  {
    id: 's001',
    name: '逆光飞翔',
    type: 'team_show',
    style: '流行',
    difficulty: 3,
    mainAttribute: 'vocal',
    baseVocal: 35,
    baseDance: 30,
    risk: 10,
    singerGender: 'male'
  },
  {
    id: 's002',
    name: '舞动奇迹',
    type: 'team_show',
    style: '舞曲',
    difficulty: 4,
    mainAttribute: 'dance',
    baseVocal: 25,
    baseDance: 40,
    risk: 12,
    singerGender: 'female'
  },
  {
    id: 's003',
    name: '星光大道',
    type: 'team_show',
    style: '抒情',
    difficulty: 3,
    mainAttribute: 'vocal',
    baseVocal: 40,
    baseDance: 25,
    risk: 8,
    singerGender: 'male'
  },
  {
    id: 's004',
    name: '魅力四射',
    type: 'team_show',
    style: '动感',
    difficulty: 4,
    mainAttribute: 'charm',
    baseVocal: 30,
    baseDance: 30,
    risk: 11,
    singerGender: 'female'
  },
  {
    id: 's005',
    name: '乘风破浪',
    type: 'team_show',
    style: '励志',
    difficulty: 5,
    mainAttribute: 'dance',
    baseVocal: 35,
    baseDance: 35,
    risk: 15,
    singerGender: 'female'
  },
  {
    id: 's006',
    name: '梦想舞台',
    type: 'team_show',
    style: '流行',
    difficulty: 3,
    mainAttribute: 'vocal',
    baseVocal: 30,
    baseDance: 35,
    risk: 10,
    singerGender: 'male'
  }
]
