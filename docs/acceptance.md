# 验收门槛

状态只能是 `pass` / `fail` / `not-run` / `blocked`。代码已写不能代替通过。评测样本是合成内容，不是真实用户私密回答。

| requirement | test | evidence | status |
| --- | --- | --- | --- |
| 至少 40 条人工审阅样本 | `npm run eval:check` | 当前 42 条候选均为 `reviewedBy: null` | fail |
| 材料人工复核 | `content/review.json` | `status: pending` | fail |
| 验收集冻结 | `eval/acceptance.sha256` | 与 `cases.acceptance.json` 的 canonical SHA-256 一致 | pass |
| 七类配额 4 开发 / 2 验收，family 不跨集合 | `tests/unit/evaluation.test.ts` | 结构检查通过 | pass |
| 程序检查不把模型自评当通过 | `checkTutorOutput` | 只检查 kind / 概念 / 禁句 | pass |
| `eval:run` 默认不打真实接口 | `EVAL_RUN` 未授权则退出 2 | 单元测试覆盖 | pass |
| 明确正确被判错、编造来源或数值则阻止发布 | 人工字段 `unfair_rejection` / `fabricated_metric` | `reviews/labels.json` 仍空 | not-run |
| 5 位学习者观察 | 去标识化记录 | 未邀请 | not-run |
| 真机麦克风 / 完整无障碍 | Task 10 / 12 | 未跑 | not-run |

小样本不能保证所有用户反馈正确。修复验收失败时，必须在同一冻结集上重跑，不能删题或改答案来提高表面通过率。
