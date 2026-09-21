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
 * 生成难度 4-10
 */
function generateDifficulty() {
  return randomInt(4, 10)
}

/**
 * 生成主属性
 */
function generateMainAttribute() {
  return randomPick(['vocal', 'dance', 'charm'])
}

/**
 * 生成基准声乐/舞蹈（20-50）
 */
function generateBaseAttributes() {
  return { baseVocal: randomInt(20, 50), baseDance: randomInt(20, 50) }
}

/**
 * 生成风险值（5-15）
 */
function generateRisk() {
  return randomInt(5, 15)
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
  const base = generateBaseAttributes()

  return {
    name: songInfo.title,
    artist: songInfo.artist,
    style,
    difficulty: generateDifficulty(),
    mainAttribute: generateMainAttribute(),
    baseVocal: base.baseVocal,
    baseDance: base.baseDance,
    risk: generateRisk(),
    type,
    description: generateDescription(songInfo, type, style),
    enabled: true
  }
}

module.exports = {
  generateRandomSong,
  generateDifficulty,
  generateMainAttribute,
  generateBaseAttributes,
  generateRisk,
  generateType,
  generateDescription,
  randomInt,
  randomPick,
  randomWeighted
}
