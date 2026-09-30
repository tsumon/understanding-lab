# 项目交接：理解实验室

更新：2026-09-30。本文是实时接手入口；完整需求见[设计](superpowers/specs/2026-09-26-understanding-lab-design.md)，执行步骤见[实施计划](superpowers/plans/2026-09-26-understanding-lab.md)。

## 1. 这个项目是什么、要什么

独立于循环提醒应用的新产品。目标用户是 AI / 机器学习自学者，同时满足作者自用与展示大模型工程能力。合并“讲明白：反向课堂”与“看懂：交互实验室”：解释概念、预测实验现象、操作实验、重新解释并迁移到新场景。

首版只做中文“过拟合”一课，桌面与手机浏览器共用内核。不先做任意资料导入、原生应用、提醒打卡、知识百分制、多 Agent 平台或向量库。

验收目标：可暂停、可恢复的完整学习流程；可核对依据的反馈；主动保存到账号、跨设备接续并导出 / 删除；可选语音且文字确认后才评价。不能把跳过当掌握，不能用模型自评证明有效，不能把未接通的模块描述为完整功能。

## 2. 怎么做

React + TypeScript 响应式客户端、纯函数状态机、版本化材料 / 实验数据、Node / Express 同源服务、Better Auth GitHub 登录、持久 SQLite。首版单进程，不支持多副本。精确依赖见 `package-lock.json` 与 `tools/experiment/uv.lock`。

学习顺序：初始解释 → 最多两次澄清 → 预测 → 实验 → 再解释 → 迁移 → 小结。允许先探索、跳过、返回修改；保留答案版本与实验快照，旧反馈不得覆盖新状态。

实验是预计算数据，不是模型实时训练：3 个种子 × 3 种样本量 × 3 种噪声 × 12 阶多项式，共 324 组。探索只显示训练 / 验证误差，冻结选择后才揭示最终测试结果。模型不得计算或编造指标。

AI 输出经过结构、引用、动作校验；一次教学操作最多两次供应商尝试，共享 30 秒期限。笔记只有额外明确同意才进入提示。模型没有脚本、文件、数据库或网络工具权限。详见[关键决策](decisions.md)。

## 3. 当前进度

本轮接手检查点：`52dd8bc`，已在私有远端；该提交的 GitHub CI 已成功。任务 1–12 工程已有实现与审阅记录，不重新派发。这不代表完整 MVP 已完成或可正式上线。本轮复跑与后续修复见 [2026-09-30 验证记录](verification/2026-09-30.md)。

| 任务 | 状态 | 已有成果 / 还缺什么 |
| --- | --- | --- |
| 1 契约与材料 | 完成并审阅 | 严格 schema、中文主题初稿；`content/review.json` 记录 operator-authorized-agent 设计审阅，不代替人类材料复核 |
| 2 可复现实验 | 完成并审阅 | 324 组数据、Python 锁定环境、独立数值核验 |
| 3 学习状态机 | 完成并审阅 | 回答版本、两轮澄清、返回 / 跳过、快照与污染状态 |
| 4 本机学习闭环 | 完成并审阅 | 响应式工作台、草稿恢复 / 导出、公共资源离线缓存 |
| 5 反馈证据校验 | 完成并审阅 | 原话 / 来源 / 指标 / 动作校验、历史反馈展示 |
| 6 有限 AI 调用模块 | 完成并审阅 | 适配器、一次格式修复、超时取消、旧请求保护；仅 mock 验证 |
| 7 账号服务基础 | 完成并审阅 | 同源认证、SQLite 显式迁移、权限限制与日志脱敏；未跑真实 OAuth |
| 8 账号记录与同步 | 完成并审阅 | 所有者隔离、CAS、幂等、墓碑删除、2MiB 会话路由、冲突保留与另存新尝试；离线重试复用 UUID / 幂等键；独立审阅 10/10 通过 |
| 9 云端教学接线 | 完成并审阅 | 登录 UI、发送/保存分同意、POST /api/tutor、UTC 日额度 30/10、全局在途 4、退出清账号缓存；400 按 consent/invalid 分流。双浏览器用注入身份与真实本机服务验证；真实 OAuth / 模型未跑 |
| 10 录音转写 | 完成并审阅 | 可选录音、服务端 FFmpeg 时长校验、转写填草稿不自动确认；取消/收包计时已有修复。`ffmpeg-static` 真实解码短 wav、拒绝 61 秒测试通过；生产 FFmpeg 配置与真机麦克风另验 |
| 11 教学评测 | 完成并审阅 | 42 条 operator-authorized-agent 案例设计审阅与冻结检查通过；fixture 管线可运行。新增独立 `eval:release-check`，现有设计记录会被拒绝；真实运行/人类输出审阅尚缺，真实供应商评测 runner 尚未实现 |
| 12 最终验收 | 完成并审阅 | 跳过≠掌握、隐私、同步冲突/删除、额度、axe、离线与三种浏览器配置已有回归；技术 CI 运行 `eval:check` 与 fixture。5 人/OAuth/模型/公共部署仍 not-run 或 blocked |

当前网页默认仍可匿名离线试玩。登录、保存到账号、发送给 AI 是分开的操作。未确认文字不进入云端正文；笔记默认不进模型。真实 GitHub OAuth 与计费模型仍未验收。已加入视觉 token 与 axe 检查，不代表最终品牌设计或真机无障碍审核完成。

2026-09-30 接手复跑：`npm test` 29 文件 222/222、类型/离线构建、Python 6/6、`eval:check` 均通过；三配置 e2e 首跑 64 通过、13 跳过、1 失败（WebKit 修改解释后小结未找到最新版本）。有限定位中的三次 WebKit 文件回归各 8/8 通过，但根因未证实；只补诊断断言，未改业务代码，问题仍未解决。不得用后续绿灯覆盖首次失败。见 [acceptance.md](acceptance.md) 与当日验证记录。

语义门槛集成后复跑：30 文件 **231/231** 单元/集成测试、类型/离线构建、`eval:check` 通过；客户端产物未变。诊断检查点的完整三配置 e2e **65 通过、13 预期跳过**，不据此关闭 WebKit 间歇问题。

## 4. 接手需要知道的文件与接口

| 路径 | 职责 |
| --- | --- |
| `src/domain/contracts.ts`、`session.ts` | 唯一公共会话契约与学习 reducer，勿另建平行 schema |
| `content/`、`public/experiments/`、`src/experiment/` | 稳定材料 ID、审阅状态、数值包、指标与揭示规则 |
| `src/client/App.tsx`、各 Panel | 本机学习流程与材料 / 实验 / 反馈 / 小结 |
| `src/client/local-store.ts` | `DraftEnvelope`：未确认输入、按步骤草稿、探索状态 |
| `src/client/ai-client.ts`、`auth-client.ts`、`sync.ts`、`recording.ts`、`Recorder.tsx` | 教学请求、登录、账号保存、可选录音与转写 |
| `src/tutor/`、`src/server/providers/openai.ts` | 提示、wire schema、证据验证、受限调用和模型适配 |
| `src/server/`、`ai-routes.ts`、`quota.ts`、`audio.ts`、`audio-route.ts` | 同源服务、教学路由、额度、FFmpeg 解码与转写 |
| `tests/`、`tools/experiment/` | JS / 浏览器 / SQLite / 数值验证和生成工具 |
| `tools/semantic-release.ts`、`docs/semantic-release.md` | 离线语义发布检查与严格的运行/审阅证据格式；不调用供应商、不伪造签名 |

后续集成约束：

- 持久化 `LearningSession.clarificationRound: 1|2` 与答案轮次，不能从累计次数推测正在回看的轮次。
- 冲突与恢复保留整个 `DraftEnvelope`；未确认输入不发模型。
- 活跃反馈只引用各答案 ID 最新确认版本；历史反馈按原版本核对，不能套用当前步骤动作白名单。
- `TutorRequestGuard.start(contentRevision)` 返回 token 或 null；null 忽略重复请求。`finish(requestId)` 只能结束自己的请求；步骤 / 轮次改变也必须 invalidate，不能只看内容版本。
- AI JSON 限 128kb；账号保存独立限 2MiB。认证与 Origin 检查先于解析，不能加一个全局小 parser。
- `.superpowers/` 是被忽略的本机过程记录，不是远端恢复前提；旧 ledger 未同步 Grok 的全部提交，不能据此重做任务。以 Git、本文和当日验证记录互相核对，换机器无需旧聊天或代理 ID。

## 5. How to 从 GitHub 恢复开发

私有仓库：[tsumon/understanding-lab](https://github.com/tsumon/understanding-lab)。分支：`codex/understanding-lab-mvp`。原本机路径 `/Applications/understanding-lab` 不是运行必需路径。

需要仓库读取权限及 Node 22.23.2 / npm 10.9.8。在新的空目录克隆，不覆盖已有工作：

```sh
git clone --branch codex/understanding-lab-mvp https://github.com/tsumon/understanding-lab.git
cd understanding-lab
git status --short --branch
npm ci
npm test
npm run build:offline
```

克隆命令供接手者执行，本轮没有另行克隆。数值测试需要 uv / Python 3.12；浏览器测试先 `npx playwright install chromium webkit`。完整命令表在 [README](../README.md)。

原机器继续时先检查 `git status --short --branch`、`git log -5 --oneline`。保留并辨认未提交修改；不 `reset --hard`、不重新初始化、不为恢复上下文重做已完成任务。

常见问题：

- `listen EPERM`：执行环境禁止本机监听。取得测试权限后重跑，勿改断言伪装通过。
- 受限网络中的 GitHub 认证错误：先允许正常联网再只读确认账号，勿盲目重登或打印 token。
- Playwright 缺浏览器：安装项目锁定版本，不混用别的工具的缓存。
- WebKit `setOffline(true)` 刷新内部错误：现有回归关闭测试自有源站验证缓存刷新；不能表述为真机飞行模式通过。
- 账号服务缺配置 / 迁移：按[部署说明](deployment.md)处理。匿名试玩无需服务，不得借用助手的 GitHub 凭据作 OAuth 凭据。

## 6. 接下来具体做什么

12 项工程计划已有实现与审阅记录。当前补齐回归与可执行发布门槛，不扩展新主题。

1. WebKit 间歇回归仍开放：现有断言已分别检查第二次填写、第二版确认后持久化内容、小结前持久化内容与最终显示。再次复现时先看哪个边界首次错误，区分第二版确认了旧文本、导航后版本丢失或纯渲染问题；没有证据前不改 reducer/增加同步锁，不把诊断断言算作修复。
2. 独立语义门槛已实现，正在完成独立审阅与整体验证。接口及后续真实验收步骤见 [semantic-release.md](semantic-release.md)。现有 `eval:check` 保持数据集/设计完整性用途，普通 CI 只用合成单测验证拦截逻辑；真实评测 runner 仍需在供应商与预算获准后另行实现，不能直接用 fixture 通过发布。
3. **仍阻塞发布：** 人类材料/案例及真实输出复核、五位学习者观察、真实 OAuth/模型、生产备份恢复演练、真机麦克风。新增门槛不会自动完成这些事项。

跟踪小项：真实手机输入法、麦克风、完整无障碍人工审核仍未做。CI 已钉 Python 3.12.13；另存新尝试在已登录时写入账号缓存而不是匿名槽。

## 7. 额度用完也能接上：工作与备份约定

用户偏好：确定的小测试 / 脚本用 Luna，常规多文件集成用 Sol，核心状态 / 同步 / 安全架构与最终整体审阅用 Astra。仅无共享写冲突的任务并行；原实现者修复，独立审阅者复核，不因换模型重做已有工作。

每个可验证小任务：更新交接与验证 → 按文件名检查 / 暂存 → 提交 → 扫描上传内容及历史 → 推送私有分支 → 核对远端 SHA。额度中断先保留修改并记录未跑的测试，不冒充完成、不强推。

```sh
git status --short --branch
git diff --check
git push origin HEAD:refs/heads/codex/understanding-lab-mvp
git rev-parse HEAD
git ls-remote origin refs/heads/codex/understanding-lab-mvp
```

两个 SHA 相同才算保存成功；仓库创建、本地提交不等于上传。不得提交 `.env`、数据库 / WAL、录音、个人学习数据或缓存。源码备份不含浏览器草稿；将来生产数据库另做一致性备份。

当前授权是既定实现及上述**私有**仓库备份，不包含公开仓库、公开部署、付费模型测试、购买服务、代建 OAuth 应用或邀请学习者；需要时另行确认。

可直接交给下一位助手：

> 请先读 README、docs/handoff.md、docs/decisions.md 和最新验证记录，再检查 Git 与实际代码。12 项工程计划已实现并审阅。发布前完成人工阻塞项；不重做离线内核，不把 mock 当真实 OAuth / 模型验收。简单任务 Luna，常规集成 Sol，架构 Astra。每个可验证小任务更新交接、提交并推送现有私有分支，核对远端 SHA。保护未提交修改与隐私，不公开部署、不调用付费模型。
