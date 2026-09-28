# 理解实验室 · Understanding Lab

用“讲出来 + 做实验 + 再解释”检验自己是否真的理解一个 AI 概念。它是独立于 Reminder 的新应用，不是提醒工具的扩展，也不是通用聊天框。

面向 AI / 机器学习自学者，首个主题是 **过拟合**。电脑与手机先共用响应式 Web 应用；原生安装包不在首版范围。“理解实验室”是工作名。

> 开发中：任务 1–9 已实现并审阅。离线学习流程可用。录音尚未完成。材料人工复核、教学效果、真实 OAuth / 模型接入均未验收。未发送给 AI 时，离线引导不是 AI 评价。

## 项目文档

- **接手 / 继续开发：** [交接文档](docs/handoff.md)，目标、进度、恢复步骤和下一项任务。
- **为何这样设计：** [架构与关键决策](docs/decisions.md)。
- **已验证与未验证：** [2026-09-28 验证记录](docs/verification/2026-09-28.md)。
- **账号服务：** [部署说明](docs/deployment.md)、[隐私与数据边界](docs/privacy.md)。
- **完整需求：** [产品设计](docs/superpowers/specs/2026-09-26-understanding-lab-design.md)、[12 项实施计划](docs/superpowers/plans/2026-09-26-understanding-lab.md)。旧计划是执行蓝本，实时状态以交接文档为准。

## 本机试玩

已验证 Node.js **22.23.2** / npm **10.9.8**，工具链最低 Node 22.12。使用锁文件安装：

```sh
npm ci
npm run dev
```

打开终端显示的本机地址。无需 `.env`、账号或模型密钥。`better-sqlite3` 含原生模块，若当前平台没有对应预构建产物，安装需要本机编译工具；不要通过改锁文件绕过安装错误。

试一次：解释过拟合 → 最多两轮澄清（可跳过）→ 预测 → 调整曲线拟合实验 → 再解释 → 迁移问题 → 小结。回答和笔记保存在当前浏览器；换设备不会自动出现。冻结选择后才揭示测试误差，改参数后重新隐藏并保留污染提示。

离线版本需先联网加载，等页面确认缓存就绪。开发服务器不是离线验收版本：

```sh
npm run build:offline
npm run preview:offline
```

## 开发命令

| 命令 | 作用 / 前提 |
| --- | --- |
| `npm run dev` | 本机 Vite 开发页，可独立匿名运行 |
| `npm test` | 单元和本机 HTTP / SQLite 集成测试，不调用真实模型 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run build` | 类型检查并构建前端 |
| `npm run build:offline` | 构建并生成公共离线缓存清单 |
| `npm run preview:offline` | 在本机 4173 端口预览构建产物 |
| `npm run test:e2e` | Chrome / iPhone WebKit 回归；首次先执行 `npx playwright install chromium webkit` |
| `npm run experiment:test` | uv、锁定 Python 3.12 / NumPy 环境，独立核验数值 |
| `npm run experiment:generate` | 重建 324 组数据，会更新生成文件；之后须复核差异和数值测试 |
| `npm run db:migrate` | 显式迁移 SQLite，先阅读部署说明并填写本地 `.env` |
| `npm run server` | 启动已配置、已迁移的同源账号服务，不是完整云端教学产品 |

## 数据与 AI 边界

匿名回答默认只在本机。“发送给 AI”和“保存到账号”设计为两个独立同意；私人笔记默认不发送。模型只建议受约束的下一步，不能运行代码或任意工具。反馈须引用确切回答版本、材料和实验记录；数值由程序提供。结构与引用合法不等于教学结论正确。

`TUTOR_ENABLED=false` 是默认值。只有部署者明确启用且配置完整时，服务启动才做一次可能计费的兼容性探测；每次重启都可能再次计费。试玩无需开启它。

私有 GitHub 仓库只备份**源码与项目交接信息**，不备份浏览器草稿、`.env`、数据库、录音、依赖或构建产物。
