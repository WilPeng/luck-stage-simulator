const m = require('mongoose')
const conn = m.createConnection('mongodb://localhost:27017/luck-stage')
conn.on('connected', async () => {
  const col = conn.db.collection('TeamApplication')
  const r = await col.deleteMany({
    preferredCaptainId: { $exists: false },
    $expr: { $eq: ['$playerName', '$playerId'] }
  })
  console.log('deleted dirty:', r.deletedCount)
  process.exit(0)
})
