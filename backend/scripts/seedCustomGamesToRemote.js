/**
 * 把示例自定义游戏（含新增 5 种对战模式）推送到远程后端。
 *
 * 用法（在 backend 目录下）：
 *   node scripts/seedCustomGamesToRemote.js [baseUrl] [adminCode]
 *
 * 例：
 *   node scripts/seedCustomGamesToRemote.js https://luck-stage-simulator.onrender.com BB_ADMIN
 *
 * 也可用环境变量：
 *   BB_REMOTE_URL、BB_ADMIN_CODE
 *
 * 说明：
 *  - 通过远程后端的 REST API（/api/bigbrother/custom-game）创建，幂等（同名已存在则跳过）。
 *  - 若远程后端尚未部署「支持新模式（elim-last/first-pick/duel/survive-tb/score-tb）」的最新代码，
 *    创建会因「游戏类型无效」失败——此时请先部署最新代码，重启后后端会自动 seed（ensureCustomGameExamples）。
 */
const { EXAMPLES } = require('../src/games/bigbrother/seedCustomGames')

const BASE = (process.argv[2] || process.env.BB_REMOTE_URL || 'https://luck-stage-simulator.onrender.com').replace(/\/$/, '')
const CODE = process.argv[3] || process.env.BB_ADMIN_CODE || 'BB_ADMIN'
const API = `${BASE}/api/bigbrother`

async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: CODE })
  })
  let json = {}
  try { json = await res.json() } catch {}
  if (!res.ok || !json.token) throw new Error(`登录失败 (HTTP ${res.status})：${json.error || ''}`)
  return json.token
}

async function main() {
  console.log(`目标后端：${API}`)
  const token = await login()
  const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }

  let existing = []
  try {
    const res = await fetch(`${API}/custom-game/list`, { headers: H })
    const json = await res.json()
    existing = (json.data || json || []).map(g => g.name)
  } catch (e) {
    console.warn('获取现有游戏列表失败（继续尝试创建）：', e.message)
  }
  const existingSet = new Set(existing)
  console.log(`远程现有自定义游戏：${existing.length} 个`)

  let created = 0, skipped = 0, failed = 0
  for (const def of EXAMPLES) {
    if (existingSet.has(def.name)) { skipped++; console.log('⏭  已存在，跳过：', def.name); continue }
    const body = { ...def, playerCount: def.playerCount || { min: 2, max: 20 } }
    try {
      const res = await fetch(`${API}/custom-game`, { method: 'POST', headers: H, body: JSON.stringify(body) })
      let json = {}
      try { json = await res.json() } catch {}
      if (res.ok && json.success !== false) {
        created++
        console.log('✅ 创建：', def.name)
      } else {
        failed++
        console.log('❌ 失败：', def.name, '->', json.error || `HTTP ${res.status}`)
      }
    } catch (e) {
      failed++
      console.log('❌ 失败：', def.name, '->', e.message)
    }
  }

  console.log(`\n完成：新建 ${created}，跳过 ${skipped}，失败 ${failed}`)
  if (failed > 0) {
    console.log('提示：若失败原因为「游戏类型无效 / 参数错误」，说明远程后端尚未部署支持新模式的最新代码，请先部署最新后端。')
  }
}

main().catch(e => { console.error('脚本执行失败：', e.message); process.exit(1) })
