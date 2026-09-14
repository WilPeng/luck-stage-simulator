/**
 * 自定义游戏示例题（幂等）
 * 为新增的 5 种对战模式各提供一套可直接用于测试的题目。
 * 仅当同名示例不存在时才创建。
 */
const BBCustomGame = require('./models/BBCustomGame')

function q(id, text, qtype, correctAnswer, options, extra) {
  return { id, text, qtype, options: options || [], correctAnswer, points: 1, ...(extra || {}) }
}

const EXAMPLES = [
  {
    name: '示例9·模式1·最后作答出局',
    description: '同时作答，每轮最后一个提交者出局（可见他人提交情况）',
    icon: '🐢',
    type: 'elim-last',
    eliminateRule: 'last',
    showSubmissions: true,
    playerCount: { min: 2, max: 20 },
    questions: [
      q('q1', '中国的首都是？', 'choice', '北京', ['北京', '上海', '广州', '深圳']),
      q('q2', '太阳从东边升起。', 'judge', '对', ['对', '错']),
      q('q3', '7 × 8 = ?', 'number', 56),
      q('q4', '一年有几个月？', 'text', '12'),
      q('q5', '水的化学式是？', 'text', 'H2O')
    ]
  },
  {
    name: '示例10·模式1·首个答错出局',
    description: '同时作答，每轮第一个答错者出局（不可见他人提交）',
    icon: '❌',
    type: 'elim-last',
    eliminateRule: 'first_wrong',
    showSubmissions: false,
    playerCount: { min: 2, max: 20 },
    questions: [
      q('q1', '2 + 2 × 2 = ?', 'number', 6),
      q('q2', '冰是水的一种形态。', 'judge', '对', ['对', '错']),
      q('q3', '下列哪个是哺乳动物？', 'choice', '鲸鱼', ['鲨鱼', '鲸鱼', '章鱼', '鳄鱼']),
      q('q4', '12 的平方根是多少？（整数）', 'number', 3),
      q('q5', '一年中最短的月份英文名是？', 'text', 'February')
    ]
  },
  {
    name: '示例11·模式2·首个作答定胜负',
    description: '只判定第一个作答者：答对可任选一人出局，答错自己出局',
    icon: '⚡',
    type: 'first-pick',
    playerCount: { min: 2, max: 20 },
    questions: [
      q('q1', '5 × 5 = ?', 'number', 25),
      q('q2', '地球是太阳系中最大的行星。', 'judge', '错', ['对', '错']),
      q('q3', '下列哪个不是编程语言？', 'choice', 'HTML', ['Python', 'Java', 'HTML', 'Go']),
      q('q4', '100 - 37 = ?', 'number', 63),
      q('q5', '中国的国庆节是几月几日？（如 10-01）', 'text', '10-01')
    ]
  },
  {
    name: '示例12·模式3·1v1对决',
    description: '候选池随机/指定两人 1v1，只判第一个作答者，胜者回池，直至决赛',
    icon: '⚔️',
    type: 'duel',
    playerCount: { min: 2, max: 20 },
    questions: [
      q('q1', '3 + 4 = ?', 'number', 7),
      q('q2', '猫属于犬科。', 'judge', '错', ['对', '错']),
      q('q3', '下列哪个是中国的直辖市？', 'choice', '重庆', ['成都', '重庆', '杭州', '南京']),
      q('q4', '9 × 9 = ?', 'number', 81),
      q('q5', '太阳系中离太阳最近的行星是？', 'text', '水星'),
      q('q6', '一年有多少个星期？（约）', 'number', 52)
    ]
  },
  {
    name: '示例13·模式4·限时淘汰+数字TB',
    description: '基本题限时锁定，错误/未作答出局；基本题用完后进入数字加时题',
    icon: '⏱️',
    type: 'survive-tb',
    basicTimeLimit: 20,
    tiebreakTimeLimit: 20,
    playerCount: { min: 2, max: 20 },
    questions: [
      q('q1', '6 × 7 = ?', 'number', 42),
      q('q2', '水在标准大气压下的沸点是 100℃。', 'judge', '对', ['对', '错']),
      q('q3', '下列哪个是水果？', 'choice', '番茄', ['土豆', '番茄', '胡萝卜', '洋葱']),
      q('q4', '一年有四个季节。', 'judge', '对', ['对', '错']),
      q('q5', '数字加时题：在 0~100 中猜一个不超过目标的数字（目标 68）', 'number', 68, [], { tb: true })
    ]
  },
  {
    name: '示例14·模式5·限时积分+数字TB',
    description: '基本题限时锁定，正确积 1 分；唯一最高分获胜，否则数字加时题',
    icon: '🧮',
    type: 'score-tb',
    basicTimeLimit: 20,
    tiebreakTimeLimit: 20,
    playerCount: { min: 2, max: 20 },
    questions: [
      q('q1', '8 + 9 = ?', 'number', 17),
      q('q2', '光速比声速快。', 'judge', '对', ['对', '错']),
      q('q3', '下列哪个是行星？', 'choice', '火星', ['月球', '火星', '太阳', '彗星']),
      q('q4', '15 × 4 = ?', 'number', 60),
      q('q5', '数字加时题：在 0~100 中猜一个不超过目标的数字（目标 88）', 'number', 88, [], { tb: true })
    ]
  }
]

async function ensureCustomGameExamples() {
  let created = 0
  for (const def of EXAMPLES) {
    try {
      const existing = await BBCustomGame.findOne({ gameId: 'bigbrother', name: def.name })
      if (existing) continue
      const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const game = new BBCustomGame({ ...def, id, gameId: 'bigbrother', enabled: true })
      await game.save()
      created++
      // 避免同一毫秒生成的 id 冲突
      await new Promise(r => setTimeout(r, 5))
    } catch (e) {
      console.error('[CustomGameSeed] failed to create', def.name, e)
    }
  }
  if (created > 0) console.log(`[CustomGameSeed] created ${created} example games`)
  return created
}

module.exports = { ensureCustomGameExamples, EXAMPLES }
