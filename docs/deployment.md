# 同源服务部署

使用 Node 22.23.2（最低 22.12），单进程 Express 5 服务和持久磁盘 SQLite。当前不支持多副本，不部署到无持久磁盘的临时实例。SQLite 启用 WAL、`foreign_keys=ON`、`busy_timeout=5000`。备份时应使用 SQLite 的一致性备份方式，或停止服务后备份数据库及相关 WAL 文件；数据库包含私人认证记录，不提交 Git。

## 匿名本机试玩

`npm ci` 后运行 `npm run dev`，或使用已有的静态/离线构建流程。此阶段不需要 `.env`、GitHub 应用、服务端启动或模型密钥，已打开的静态预览也独立于账号服务。

## 账号服务

部署者自行注册 GitHub OAuth 应用并配置回调 `<PUBLIC_ORIGIN>/api/auth/callback/github`。只申请身份/email 信息，不申请 repo scope。真实 OAuth 登录流程尚未验收，测试使用进程内身份注入、假凭据与隔离 SQLite，不接入生产请求头、查询参数或身份绕过开关。

复制 `.env.example` 为不提交 Git 的 `.env`，填写至少 32 字符随机 `BETTER_AUTH_SECRET`、`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`、`PUBLIC_ORIGIN` 与持久 `DB_PATH`。公开部署 Origin 必须为 HTTPS 且不含路径、查询、用户信息；HTTP 只用于明确的本机 loopback Origin，`NODE_ENV=production` 时必须 HTTPS。`PORT` 默认 3001。仅使用文档中的认证环境变量，不扩展 Better Auth 的跨域信任 Origin。

```sh
NPM_CONFIG_CACHE=/Applications/understanding-lab/.cache/npm npm ci
npm run db:migrate
npm run build
npm run server
```

迁移只通过 `db:migrate` 显式运行：先执行已安装 Better Auth 的官方迁移，再按顺序写入自有 `schema_migrations`。重复运行幂等。启动与请求不迁移 schema；未迁移时服务启动失败。依赖升级先备份数据库，并在隔离副本验证迁移。

服务绑定 `127.0.0.1:3001`，由同机反向代理终止 HTTPS，转发整个站点（页面、资源、`/api`）到此服务。`PUBLIC_ORIGIN` 必须等于浏览器看到的 Origin。不要直接公开本机 HTTP 端口。身份和 Origin 检查先于自有 JSON 解析；`/api/me` 的 JSON 限制为 128kb，`PUT /api/sessions/:id` 使用独立 2MiB parser，教学 JSON 保持 128kb。Better Auth 处理器先于 parser 注册，负责 OAuth 状态与 CSRF；自有写 API 额外要求精确匹配 Origin。没有跨域 cookie/CORS 开放。Helmet 提供 CSP，脚本仅允许自身；应用不渲染用户 raw HTML。

Vite 开发服务器将 `/api` 代理到本机 3001。需要测试账号登录时，让 `PUBLIC_ORIGIN` 精确匹配 Vite 的实际 Origin 和 OAuth 回调；`npm run dev` 仍不依赖服务存在。生产构建不向客户端暴露服务端环境变量。

## 显式模型启用

默认 `TUTOR_ENABLED=false`。仅部署者明确设置 `true` 并填写 `TUTOR_MODEL`、`OPENAI_API_KEY`、`OPENAI_BASE_URL` 后，在每次进程启动调用一次 Task 6 的激活探测，并在本进程保留返回的 provider。每次启动、进程管理器重启都可能计费。缺少配置、禁用或探测失败时注入只返回 unavailable 的适配器，普通请求不探测，不自动重试、激活或切换模型。Task 7 尚不开放教学/转写路由，转写模型字段为后续任务保留。

当前只用 mock HTTP 验证启用生命周期，没有调用真实供应商。真实端点/模型兼容性、教学质量和 GitHub OAuth 登录需要部署者的配置与另行授权验收。日志只含固定事件和失败分类，不输出原始错误或环境值。
