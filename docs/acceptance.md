# 验收门槛

状态只能是 `pass` / `fail` / `not-run` / `blocked`。代码已写不能代替通过。评测样本是合成内容，不是真实用户私密回答。5 人观察不是统计显著实验，不能据此宣称学习效率百分比。

| requirement | test | evidence | status |
| --- | --- | --- | --- |
| 跳过不能显示已掌握 | `tests/e2e/learning-loop.spec.ts` | 小结文案是「未验证」/「已记录」，无「已掌握」 | pass |
| 确认路径走完解释-预测-实验-再解释-迁移 | `tests/e2e/learning-loop.spec.ts` | 本机 e2e；无真实 AI | pass |
| 导出无 cookie/token/密钥 | `tests/e2e/privacy.spec.ts` | 本机导出 JSON | pass |
| 前端包无模型/OAuth 密钥；SW 不缓存 API | `tests/e2e/privacy.spec.ts` | 扫描 `dist/` | pass |
| 日志不含密钥与原文 | `tests/integration/logging.test.ts` | mock 失败分类 | pass |
| 至少 40 条人工审阅样本 | `npm run eval:check` | 42 条候选均为 `reviewedBy: null` | fail |
| 材料人工复核 | `content/review.json` | `status: pending` | fail |
| 验收集冻结 | `eval/acceptance.sha256` | canonical SHA-256 一致 | pass |
| 七类配额 4 开发 / 2 验收，family 不跨集合 | `tests/unit/evaluation.test.ts` | 结构检查通过 | pass |
| 程序检查不把模型自评当通过 | `checkTutorOutput` | 只检查 kind / 概念 / 禁句 | pass |
| `eval:run` 默认不打真实接口 | `EVAL_RUN` 未授权则退出 2 | 单元测试覆盖 | pass |
| 明确正确被判错、编造来源或数值则阻止发布 | 人工字段 `unfair_rejection` / `fabricated_metric` | `reviews/labels.json` 仍空 | not-run |
| 5 位学习者观察（含手机与桌面） | 去标识化记录，过程中不给答案 | 未获招募授权 | not-run |
| 真实 GitHub OAuth | 部署者应用 + 回调 | 仅假凭据注入 | not-run |
| 真实模型兼容性 / 数据保留政策 | 部署者启用后的 smoke | 仅 mock HTTP | not-run |
| 真机麦克风 / 完整无障碍 | 真 iPhone / Android | Playwright 模拟不是真机 | not-run |
| 双浏览器 live 同步 | 两个已登录上下文 | 未跑真实 OAuth | not-run |
| 公共部署备份与恢复演练 | deployment.md | 无已披露的备份保留策略；阻止公共部署 | blocked |
| CI | `.github/workflows/ci.yml` | 工作流已提交；本机未代替 GitHub 跑该 workflow | not-run |

没有实际备份策略时不得公共部署，也不虚构「7 天删除」。远程删除不会立刻擦掉其他设备上的离线副本。应用不承诺端到端加密。
