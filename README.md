# Kayou

`Kayou` 是一个用于制作卡牌素材的管理后台项目，当前重点放在两条工作流：

- 卡牌图片 AI 生成与素材整理
- 卡牌属性编辑与卡牌制作初版

项目当前采用前后端分离结构：

- `frontend/`: Vue 3 + Vite + Element Plus 管理后台
- `backend/`: Node.js + Express API 服务
- `docs/`: 需求与说明文档

## 当前能力

- 管理员登录
- 人物管理
- 大模型生成人物描述与绘图提示词
- MX API 绘图、手动上传图片、自动/手动裁切
- WebP 转换、预览、删除
- 卡牌属性编辑
- 卡牌制作初版预览与配置保存

## 技术栈

- Frontend: Vue 3, Vite, Element Plus, Pinia, Vue Router
- Backend: Node.js, Express, MySQL, Sharp

## 开发运行

根目录提供统一启动脚本：

```bash
npm run dev
```

这会调用 `run-dev.sh`，按需启动：

- 前端开发服务: `5174`
- 后端服务: `3174`

## 一键部署

根目录提供了一键部署脚本：

```bash
bash ./deploy.sh
```

或：

```bash
npm run deploy
```

脚本会自动完成：

- 安装 `backend` 与 `frontend` 依赖
- 构建前端 `dist`
- 停止旧的后端进程
- 以生产模式重新启动后端

部署完成后，后端会直接托管 `frontend/dist`，默认访问地址为：

- `http://127.0.0.1:3174`

## 数据库

当前默认使用 MySQL，默认连接参数为：

- Host: `127.0.0.1`
- Port: `3306`
- Database: `kayou`
- Username: `kayou`
- Password: `kayou`

如需从旧版 SQLite 迁移数据，可执行：

```bash
cd backend
npm run migrate:mysql
```

## 仓库说明

以下内容通常不会提交到仓库：

- `node_modules`
- 本地数据库文件
- 运行期生成的图片/WebP素材
- 编辑器私有配置

具体规则见根目录 `.gitignore`。

## License

本项目采用 MIT License，详见根目录 `LICENSE`。
