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

默认 `TUTOR_ENABLED=false`、`TRANSCRIBE_ENABLED=false`。教学与转写可分别打开。转写需要 `TRANSCRIBE_ENABLED=true` 以及 `TRANSCRIBE_MODEL`、`OPENAI_API_KEY`、`OPENAI_BASE_URL`。转写不在启动时做计费探测。解码依赖本机 `ffmpeg`（可用 `FFMPEG_PATH` 覆盖），参数数组启动、`shell=false`、只允许 `pipe` 协议。镜像应安装固定可更新版本的 FFmpeg。缺少配置时 `/api/transcribe` 返回 `feature-disabled`，文字路径仍可用。

当前只用 mock HTTP 验证启用生命周期，没有调用真实供应商。真实端点/模型兼容性、教学质量和 GitHub OAuth 登录需要部署者的配置与另行授权验收。日志只含固定事件和失败分类，不输出原始错误或环境值。

## 公共部署阻断

公开 HTTPS 部署还需要：持久磁盘、单进程、迁移前备份、恢复演练记录、实际供应商与模型名、账户配额、预算告警、供应商数据保留政策链接。缺任一项就保持 `blocked`，不要上公共域名。没有已披露的备份保留策略时，禁止公共部署，也不要写虚构的「7 天删除」。

CI 见 `.github/workflows/ci.yml`：`contents: read`，Node 22.23.2，不调用付费 API。无人标签时 `eval:check` 必须失败，CI 会断言这次失败；不要用 `continue-on-error` 把发布门槛做成全绿。签完 40 条并批准材料后，再改该步为期望通过。

