const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { initStore, getCollection } = require('./src/config/db');

async function test() {
  const store = await initStore();
  const col = getCollection('LVPlayer');
  const players = await col.find({ gameId: 'lovevariety', avatar: { $ne: null, $ne: '' } }).toArray();
  console.log('有头像的选手数:', players.length);

  const archiver = require('archiver');
  const https = require('https');
  const fs = require('fs');
  const uploadsBase = path.resolve(__dirname);

  for (const player of players) {
    const avatar = player.avatar;
    console.log(`处理选手 ${player.id}: avatar="${avatar}" (type=${typeof avatar})`);
    
    try {
      let imageBuffer = null;
      let ext = 'jpg';

      if (avatar.startsWith('/uploads/')) {
        const filePath = path.join(uploadsBase, avatar);
        console.log(`  本地路径: ${filePath}, 存在: ${fs.existsSync(filePath)}`);
        if (fs.existsSync(filePath)) {
          ext = path.extname(avatar).replace('.', '') || 'jpg';
          imageBuffer = fs.readFileSync(filePath);
        }
      } else {
        console.log(`  未知的 avatar 格式`);
      }

      if (imageBuffer) {
        console.log(`  成功读取图片`);
      } else {
        console.log(`  跳过 - 无图片数据`);
      }
    } catch (err) {
      console.log(`  错误: ${err.message}`);
    }
  }

  await store.close();
}
test().catch(e => console.error('测试失败:', e));
