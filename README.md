# Kayou

基于需求文档搭建的卡牌网页游戏开发基座，采用 `npm workspaces` 管理以下模块：

- `apps/game`: 游戏端（Vue 3 + TypeScript + PixiJS + Element Plus + Pinia）
- `apps/admin`: 后台管理端（Vue 3 + TypeScript + Element Plus + Pinia）
- `apps/server`: 服务端（Node.js + Express + Socket.IO + MySQL）
- `packages/shared`: 前后端共享类型与演示数据

## 快速开始

1. 安装依赖：`npm install`
2. 复制服务端环境变量：`cp apps/server/.env.example apps/server/.env`
3. 初始化数据库：`mysql -u root -p < database/init/001_base_schema.sql`
4. 默认开发库账号：`kayou` / `kayou`
5. 默认后台管理员：`admin` / `kayouadmin`
6. 启动开发环境：`npm run dev`

## 常用命令

- `npm run dev`: 同时启动游戏端、后台端、服务端
- `npm run build`: 构建全部工作区
- `npm run typecheck`: 进行全部工作区类型检查
