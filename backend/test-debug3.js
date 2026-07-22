const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { initStore, getCollection } = require('./src/config/db');
const LVPlayer = require('./src/games/lovevariety/models/LVPlayer');

async function test() {
  const store = await initStore();

  // 方式1：直接查询
  const col = getCollection('LVPlayer');
  const players1 = await col.find({ gameId: 'lovevariety', avatar: { $ne: null, $ne: '' } }).toArray();
  console.log('=== 直接查询 ===');
  players1.forEach(p => {
    const avatar = p.avatar;
    console.log(`  ID:${p.id} avatar=${JSON.stringify(avatar)} type=${typeof avatar} !avatar=${!avatar}`);
  });

  // 方式2：使用 LVPlayer.findOne
  console.log('\n=== 使用 LVPlayer.findOne ===');
  for (const p of players1) {
    const player = await LVPlayer.findOne({ id: p.id, gameId: 'lovevariety' });
    if (player) {
      const avatar = player.avatar;
      console.log(`  ID:${p.id} avatar=${JSON.stringify(avatar)} type=${typeof avatar} !avatar=${!avatar}`);
    }
  }

  await store.close();
}
test().catch(e => console.error('测试失败:', e));
