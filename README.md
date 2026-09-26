# 理解实验室

一个以“过拟合”为内置主题的中文学习实验。当前版本提供版本化主题初稿、公共数据契约和可浏览的第一个问题。教学内容仍待人工核对。

## 本地运行

需要 Node.js 22.12 或更新版本。使用锁文件安装依赖：

```sh
npm ci
npm run dev
```

开发页绑定到 `127.0.0.1`。`npm test` 运行单元测试，`npm run typecheck` 检查类型，`npm run build` 执行类型检查并生成静态页面。

`content/overfitting.v1.json` 是主题初稿；`content/review.json` 的 `pending` 表示尚未完成人工内容审阅。页面目前只展示材料和第一个问题，不保存回答，也不提供 AI 评价。
