# 验收门槛

状态只能是 `pass` / `fail` / `not-run` / `blocked`。代码已写不能代替通过。评测样本是合成内容，不是真实用户私密回答。5 人观察不是统计显著实验，不能据此宣称学习效率百分比。

| requirement | test | evidence | status |
| --- | --- | --- | --- |
| 跳过不能显示已掌握 | `tests/e2e/learning-loop.spec.ts` | 小结文案是「未验证」/「已记录」，无「已掌握」 | pass |
| 确认路径走完解释-预测-实验-再解释-迁移 | `tests/e2e/learning-loop.spec.ts` | 本机 e2e；无真实 AI | pass |
| 导出无 cookie/token/密钥 | `tests/e2e/privacy.spec.ts` | 本机导出 JSON | pass |
| 前端包无模型/OAuth 密钥；SW 不缓存 API | `tests/e2e/privacy.spec.ts` | 扫描 `dist/` | pass |
| 日志不含密钥与原文 | `tests/integration/logging.test.ts` | mock 失败分类 | pass |
| 至少 40 条案例设计审阅记录 | `npm run eval:check` | 42 条由 operator-authorized-agent 于 2026-09-29 审阅设计；是代理审阅，不是人类签署 | pass |
| 至少 40 条人类审阅样本 | 独立人类审阅记录 | 代理设计审阅不能代替；尚无人类签署证据 | not-run |
| 材料代理设计复核 | `content/review.json` | `status: approved`，记录同一代理的审阅；当时 sklearn 页面未能抓取，不代表已核验最新原文 | pass |
| 材料人类复核 | 人类材料审阅记录 | 尚无人类复核证据 | not-run |
| 验收集冻结 | `eval/acceptance.sha256` | canonical SHA-256 一致 | pass |
| 七类配额 4 开发 / 2 验收，family 不跨集合 | `tests/unit/evaluation.test.ts` | 结构检查通过 | pass |
| 程序检查不把模型自评当通过 | `checkTutorOutput` | 只检查 kind / 概念 / 禁句 | pass |
| `eval:run` 默认不打真实接口 | `EVAL_RUN` 未授权则退出 2 | 单元测试覆盖 | pass |
| 明确正确被判错、编造来源或数值则阻止发布 | 与具体运行/输出绑定的人类语义审阅 | 案例设计已审；真实模型运行与输出语义标签仍 `not-run`。fixture 运行不改变此项 | not-run |
| 5 位学习者观察（含手机与桌面） | 去标识化记录，过程中不给答案 | 协议见 `reviews/learner-protocol.md`；记录 0/5 | not-run |
| 真实 GitHub OAuth | 部署者应用 + 回调 | 仅假凭据注入 | not-run |
| 真实模型兼容性 / 数据保留政策 | 部署者启用后的 smoke | 仅 mock HTTP | not-run |
| 真机麦克风 / 完整无障碍 | 真 iPhone / Android | Playwright 模拟不是真机 | not-run |
| 注入身份的双浏览器本机服务同步 | `tests/e2e/live-sync.spec.ts` | 测试身份注入；Desktop / Android / WebKit 通过。不是真 GitHub OAuth | pass |
| 键盘跳转与 skip link | `tests/e2e/a11y.spec.ts` | 桌面键盘路径；不是真机无障碍审核 | pass |
| axe WCAG 2 A/AA 严重项 | `tests/e2e/a11y.spec.ts` | 首页与开始学习后无 critical/serious。不是真机审核 | pass |
| 真实 FFmpeg 解码 | `tests/integration/audio-ffmpeg.test.ts` | 使用 `ffmpeg-static` 解码短 wav，拒绝 61s | pass |
| SQLite 在线备份工具 | `tests/unit/backup.test.ts`、`docs/backup.md` | 临时库 backup→restore 通过 | pass |
| 公共部署备份与恢复演练 | 真实 `DB_PATH` 演练记录 | 工具有了，生产演练未做 | blocked |
| fixture 评测管线 | `EVAL_PROVIDER=fixture` | 确定性夹具，不是付费模型，也不是人类语义审阅 | pass |
| 同账号修订冲突 | `tests/e2e/live-sync.spec.ts` | 另存新尝试保留本机稿，另一设备云端稿不变 | pass |
| 远程删除后保存 | `tests/e2e/live-sync.spec.ts` | 410 后本机草稿仍在，不复活旧编号 | pass |
| 载入云端版本 | `tests/e2e/live-sync.spec.ts` | 冲突后编辑器换成云端稿 | pass |
| UTC 第 31 次教学 | `tests/e2e/tutor-quota.spec.ts` | 429 quota-exhausted，不是学习对错 | pass |
| 缺同意 / 第 5 路在途 | `tests/e2e/tutor-quota.spec.ts` | 400 consent-required；五路并发一条 503 | pass |
| UTC 第 11 次转写 | `tests/e2e/tutor-quota.spec.ts` | 429；无同意为 400 | pass |
| 未登录 / 跨源 / 重复 requestId | `tests/e2e/tutor-quota.spec.ts` | 401 / 403 / 409 already-used | pass |
| 第三路转写解码 | `tests/e2e/tutor-quota.spec.ts` | 两路成功，一路 503 | pass |
| CI（接手提交） | `.github/workflows/ci.yml` | `52dd8bc` 的 [GitHub run 36508046436](https://github.com/tsumon/understanding-lab/actions/runs/36508046436) 成功；不自动覆盖后续修改 | pass |

没有实际备份策略时不得公共部署，也不虚构「7 天删除」。远程删除不会立刻擦掉其他设备上的离线副本。应用不承诺端到端加密。
