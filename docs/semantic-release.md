# 语义发布准备检查

目的：把“模型输出确实经过人类逐条审阅”变成缺证据即失败的独立门槛，而不是把 fixture 或代理案例设计审阅当作发布通过。

当前没有真实模型运行及对应的人类输出审阅证据。门槛实现的单元测试可以通过，**当前项目的语义发布准备仍被阻止**。此项通过也不代替材料/样本的人类复核、真实 OAuth、真机测试、五位学习者观察、生产备份恢复与其他验收项。

## 与现有命令的区别

- `eval:check`：数据集、案例设计审阅元数据、验收集冻结完整性。目前的 operator-authorized-agent 记录可以通过这项检查，不代表人类签署。
- `eval:run`：目前只有确定性 fixture runner。配置 `EVAL_RUN=true` 和预算不会启用一个尚未实现的真实供应商 runner。
- `eval:release-check`：读取明确选定的一份真实运行记录和一份对应的人类语义审阅；不联网、不运行模型、不产生审阅签名、不自动挑选“最新”报告。

## 运行方式

```sh
npm run --silent eval:release-check -- --run ./reviews/runs/selected-run.json --review ./reviews/runs/selected-human-review.json
```

两个路径必须显式指定。示例文件名不表示仓库已有合格证据；`reviews/runs/` 默认被 Git 忽略。检查器输出 JSON `{ "ok": boolean, "errors": string[] }`；`--silent` 省去 npm 自己的命令回显，便于程序读取。缺文件、无效证据或语义失败均非零退出。没有证据时失败是预期结果，不应通过编造签名消除。

## 证据格式 v1

所有哈希均为 `sha256(canonicalJson(value))` 的小写十六进制结果，使用 `tools/evaluate.ts` 导出的现有辅助函数，不是原始 JSON 文件字节的哈希。`acceptanceHash` 必须等于当前提交的 `eval/acceptance.sha256`，且重新计算冻结验收集仍匹配。v1 使用严格字段结构，不能直接拿带其他字段的 fixture 报告当作合格运行文件。

真实运行文件字段：

| 字段 | 要求 |
| --- | --- |
| `schemaVersion` | `1` |
| `execution` | 声明为 `real`；fixture/mock/synthetic 不能作为真实运行证据 |
| `runId`、`provider`、`model`、`promptVersion` | 明确的运行身份及供应商/模型/提示版本 |
| `acceptanceHash` | 冻结验收集哈希 |
| `rows` | 恰好覆盖全部 14 个验收案例，各一次 |
| 每行 `caseId`、`caseHash`、`inputHash` | 绑定当前案例 ID、整个案例对象、该案例的 `input` |
| 每行 `output`、`outputHash` | 实际结构化输出及其哈希；必须通过运行时结构校验和重新计算的程序检查 |
| 每行可选 `check: { ok, errors }` | 已有运行记录的程序结果；报告失败会阻止通过，报告成功不替代重新计算 |

人类审阅文件字段：

| 字段 | 要求 |
| --- | --- |
| `schemaVersion` | `1` |
| `provenance`、`humanAttested` | `human`、`true`，必须由真实人类审阅后声明；代理设计审阅不可改名充当 |
| `reviewer`、`reviewedAt` | 审阅者标识与带明确时区的 ISO 8601 审阅时间（`Z` 或时区偏移） |
| `runHash` | 整个选定运行对象的规范化哈希；运行元数据或任何输出变化都会使旧审阅失效 |
| `runId`、`model`、`promptVersion` | 与选定运行一致 |
| `rows` | 恰好 14 行，各案例一次；`caseId`、`caseHash`、`inputHash`、`outputHash` 与该次运行一致 |
| 每行 `evidenceSupported` | 输出结论的证据支持检查 |
| 每行 `unfairRejection` | 没有把明确正确的回答判错的检查 |
| 每行 `fabricatedSources` | 没有编造来源的检查 |
| 每行 `fabricatedMetrics` | 没有编造指标的检查 |

四项语义判断使用 `pass` / `fail` / `not-run`，只有 `pass` 才能通过。尤其 `unfairRejection: "pass"` 表示“未发现不公正否定”，不是“发生了不公正否定”。缺项、未审、失败均阻止通过；不要用原来的 `reviews/labels.json`（案例设计分类）替代这份输出审阅。

## 检查能证明什么

它检查证据结构、覆盖、版本/哈希绑定、程序规则和**所声明的**人类审阅来源。程序部分重用现有输出结构及 kind/必需概念/禁句规则，不证明教学语义正确。软件不能独立证明签署者真的存在、真的逐条审阅或判断正确，也不能证明一份手写报告确实来自供应商。真实执行与人类签署需要操作者的可信流程；这不是密码学身份认证或学习效果证明。

合成单元测试只用内存中的假数据证明门槛逻辑，不生成真实通过记录。普通技术 CI 跑这些回归；不得为让 CI 绿灯而调用付费模型、改冻结题集或补造人类签名。

## 后续实际验收

1. 取得真实评测的供应商、密钥使用和预算授权，另行实现/审核受预算约束的 runner；当前命令不会执行此步骤。
2. 在同一个冻结验收集上运行并保留确切模型/提示版本、实际输出和规范化哈希。
3. 人类逐条核对实际输出，记录四项判断和审阅来源，绑定整个运行哈希。
4. 显式选中这两个文件运行检查。任何关键失败先修复，再用同一冻结集合重跑、重新审阅；不能删除失败案例来提高通过率。
5. 即使该项通过，继续按 [验收表](acceptance.md) 完成其他发布门槛。所有含敏感信息的原始记录保持在获准存储位置，不随源码默认上传。
