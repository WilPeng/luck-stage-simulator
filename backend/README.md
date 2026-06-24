# 乘风2026运气赛后端

## 项目简介
乘风2026运气赛管理系统后端API服务

## 技术栈
- Node.js + Express
- MongoDB + Mongoose
- JWT 认证

## 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
复制 `.env.example` 为 `.env` 并修改配置：
```
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/luck-stage
JWT_SECRET=your_secret_key
```

### 3. 初始化数据
```bash
npm run seed
```

### 4. 启动服务
```bash
npm start
# 或开发模式
npm run dev
```

## API 接口

### 认证模块 `/api/auth`
- POST `/login` - 登录
- GET `/me` - 获取当前用户
- POST `/logout` - 登出

### 赛季模块 `/api/season`
- GET `/` - 获取当前赛季
- PUT `/stage` - 切换阶段

### 用户模块 `/api/users`
- GET `/` - 获取用户列表
- GET `/:id` - 获取指定用户
- PUT `/:id` - 更新用户信息

### 队伍模块 `/api/teams`
- GET `/` - 获取队伍列表
- GET `/:id` - 获取指定队伍
- POST `/` - 创建队伍
- POST `/:teamId/apply` - 申请入队
- POST `/:teamId/invite` - 邀请入队
- POST `/:teamId/invite/:userId/accept` - 接受邀请
- POST `/:teamId/invite/:userId/reject` - 拒绝邀请
- POST `/:teamId/lock` - 锁定队伍
- DELETE `/:teamId/members/:userId` - 移出队员
- POST `/:teamId/song` - 选择歌曲

### 歌曲模块 `/api/songs`
- GET `/` - 获取歌曲列表
- POST `/` - 添加歌曲
- PUT `/:id` - 更新歌曲

### 训练模块 `/api/training`
- GET `/cards` - 获取训练卡列表
- POST `/cards` - 添加训练卡
- PUT `/cards/:id` - 更新训练卡
- DELETE `/cards/:id` - 删除训练卡
- POST `/draw/:userId` - 抽卡
- GET `/records` - 获取训练记录

### 彩排模块 `/api/rehearsal`
- GET `/` - 获取彩排结果
- POST `/:teamId` - 开始彩排

### 公演模块 `/api/performance`
- GET `/` - 获取队伍公演结果
- GET `/players` - 获取选手得分
- POST `/calculate` - 执行公演结算

### 淘汰模块 `/api/elimination`
- GET `/` - 获取淘汰结果
- POST `/` - 生成淘汰

### 日志模块 `/api/logs`
- GET `/` - 获取操作日志
- POST `/` - 添加日志

## 默认登录码
- 管理员: `ADMIN2026`
- 选手: `CF2026-A001` ~ `CF2026-A016`
