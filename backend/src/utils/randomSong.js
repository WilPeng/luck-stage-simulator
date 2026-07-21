/**
 * 随机歌曲属性生成工具
 * 用于从歌曲库中随机选取歌曲并生成游戏属性
 */

const SONG_TYPES = ['solo', 'duet', 'group', 'team_show']
const SONG_STYLES = ['流行', '摇滚', '民谣', 'R&B', '电子', '舞曲', '抒情', '动感', '励志', '嘻哈', '爵士', '国风']

/**
 * 带权重的随机整数
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @returns {number}
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * 随机选取数组元素
 */
function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * 按权重随机选择（正态分布偏向中间值）
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomWeighted(min, max) {
  // 使用两个随机数平均，产生偏向中间值的分布
  const r1 = Math.random()
  const r2 = Math.random()
  const avg = (r1 + r2) / 2
  return Math.round(min + avg * (max - min))
}

/**
 * 生成难度 1-5（偏向中间 2-4）
 */
function generateDifficulty() {
  const weights = [1, 2, 3, 4, 5] // 值
  const probs = [0.05, 0.25, 0.35, 0.25, 0.1] // 权重分布：偏向3
  const total = probs.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < weights.length; i++) {
    r -= probs[i]
    if (r <= 0) return weights[i]
  }
  return 3
}

/**
 * 生成声乐/舞蹈/魅力权重（1-10，三项之和在15-25之间保证合理）
 */
function generateWeights() {
  // 先随机生成三个1-10的值
  let vocal = randomInt(3, 10)
  let dance = randomInt(3, 10)
  let charm = randomInt(3, 10)
  return { vocalWeight: vocal, danceWeight: dance, charmWeight: charm }
}

/**
 * 生成歌曲类型（按权重）
 */
function generateType() {
  const types = [
    { value: 'solo', weight: 15 },
    { value: 'duet', weight: 15 },
    { value: 'group', weight: 20 },
    { value: 'team_show', weight: 50 }
  ]
  const total = types.reduce((a, b) => a + b.weight, 0)
  let r = Math.random() * total
  for (const t of types) {
    r -= t.weight
    if (r <= 0) return t.value
  }
  return 'team_show'
}

/**
 * 生成基础分（80-150，偏向100-130）
 */
function generateBaseScore() {
  return randomWeighted(80, 150)
}

/**
 * 生成风险系数（0.05-0.50，步长0.05，偏向0.15-0.30）
 */
function generateRiskFactor() {
  const values = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50]
  const weights = [0.04, 0.10, 0.20, 0.22, 0.18, 0.12, 0.07, 0.04, 0.02, 0.01]
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < values.length; i++) {
    r -= weights[i]
    if (r <= 0) return values[i]
  }
  return 0.2
}

/**
 * 生成描述文本
 */
function generateDescription(song, type, style) {
  const typeMap = { solo: '独唱', duet: '双人对唱', group: '小组合唱', team_show: '团队公演' }
  const typeName = typeMap[type] || '公演'
  const templates = [
    `${song.artist}的热门${style}曲目，适合${typeName}舞台`,
    `${style}风格代表作，${song.artist}经典演绎，${typeName}佳选`,
    `传唱度极高的${style}金曲，${typeName}舞台上必将引爆全场`,
    `${song.artist}的这首${style}歌曲旋律动人，${typeName}效果极佳`,
    `${style}经典之作，由${song.artist}原唱，${typeName}氛围感拉满`
  ]
  return templates[Math.floor(Math.random() * templates.length)]
}

/**
 * 生成完整的随机歌曲属性
 * @param {object} songInfo - 从歌曲库中选取的歌曲信息 { title, artist }
 * @returns {object} 完整的歌曲对象（不含id）
 */
function generateRandomSong(songInfo) {
  const type = generateType()
  const style = randomPick(SONG_STYLES)
  const weights = generateWeights()

  return {
    name: songInfo.title,
    artist: songInfo.artist,
    style,
    difficulty: generateDifficulty(),
    vocalWeight: weights.vocalWeight,
    danceWeight: weights.danceWeight,
    charmWeight: weights.charmWeight,
    baseScore: generateBaseScore(),
    riskFactor: generateRiskFactor(),
    type,
    description: generateDescription(songInfo, type, style),
    enabled: true
  }
}

module.exports = {
  generateRandomSong,
  generateDifficulty,
  generateWeights,
  generateType,
  generateBaseScore,
  generateRiskFactor,
  generateDescription,
  randomInt,
  randomPick,
  randomWeighted
}
