const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { initStore, getCollection } = require('./src/config/db');

async function test() {
  const store = await initStore();
  const col = getCollection('LVPlayer');
  const players = await col.find({ gameId: 'lovevariety', avatar: { $ne: null, $ne: '' } }).toArray();
  console.log('有头像的选手数:', players.length);
  for (const p of players) {
    console.log(`  ID: ${p.id}, avatar: "${p.avatar}"`);
  }
  await store.close();
}
test().catch(e => console.error('错误:', e));
