# 0.2.0-rc.1 静态课程发布候选检查

## 发布范围与门槛

此版本只交付匿名、本地优先的 12 章中英双语互动课程及保留的原版过拟合课程。不是公共账号同步 / AI 辅导 / 语音服务上线；不宣称教学效果、正式认证或真实设备验收。现有 package 为 0.1.0、无发布 tag，本轮新增多章节课程，选择 **0.2.0-rc.1** 候选版本；只有明确批准后才创建正式 release/tag、合并或部署。

有限验收门槛：
1. 锁定依赖在全新 node_modules 目录 `npm ci` 成功，typecheck / offline build 成功。
2. 最新源代码的 CI 完整通过；新增的缓存更新/未保存保护回归通过。历史 WebKit 间歇现象保留记录，不靠增加重试/等待预算掩盖。
3. 归档只包含公共静态文件、许可证、说明及校验数据；不包含 `.env`、SQLite、账号数据、模型密钥、node_modules、FFmpeg、测试录音或日志。
4. 归档解包后以随包 `serve.py` 本地静态服务器运行，无 npm / Vite / API / 真实账号依赖；Chromium + WebKit 证明目录、课程、双语、离线刷新及本地记录保留。
5. 相同源、依赖、Node 版本和工作区状态重复打包得到相同 SHA-256；归档及内部文件校验通过。版本、源码身份和 dirty 状态写入 BUILD.json；用于正式发布的候选必须来自干净提交。
6. 最新内容审查、数据安全审查和明确的已知限制在文档可见；无尚未处理的阻断级问题。

## 可复现构建

构建机器需要 Node >=22.12、npm、Git、GNU tar 和 gzip。CI 基线 Node22.23.2；本轮云端打包额外在 Node24.22.1 验证。源码依赖包含原生 SQLite，缺少对应预编译包时需要系统编译工具。最终静态包的使用者只需要 Python3.9+ 和浏览器。

```sh
npm ci
npm run package:static
cd tmp/releases
sha256sum -c understanding-lab-0.2.0-rc.1-static.tar.gz.sha256
tar -xzf understanding-lab-0.2.0-rc.1-static.tar.gz
cd understanding-lab-0.2.0-rc.1-static
sha256sum -c SHA256SUMS
python3 serve.py
```

打开 http://127.0.0.1:4173/。不可用 file:// 打开；不可把 Python 测试服务器暴露到公网。更新时先导出两套记录，保持同一浏览器、主机名、端口；不要清除站点数据。完整使用/更新说明也随归档提供，见 [static-release-readme.md](static-release-readme.md)。

`package:static` 总是先执行 `build:offline`，打包器拒绝未替换的 service-worker 模板、符号链接或非公开文件类型。Vite 根据实际被打入 JavaScript 的依赖模块收集完整 license/notice 原文至 `site/THIRD_PARTY_LICENSES.txt`，不是仅复制许可证摘要。该文本不是学习运行必需内容，不进入 service-worker 缓存；原始归档始终包含它。

输出位于忽略的 `tmp/releases/`，不提交二进制到仓库。SHA-256 是字节完整性校验，不是发布者身份签名。归档 tar 元数据和 gzip 时间戳固定；BUILD.json 中 Node 版本、源提交和工作区状态变化会有意改变归档。

## 剩余边界

- localStorage 非加密、非持久备份；课程导出是恢复记录，暂无课程导入界面。跨标签页写入检查不是原子 CAS。
- 功能验收不等于人类教学效果 / 翻译研究；约 7 小时是编辑估时。真实手机语音与真实 OAuth 未验收。
- 教学/转写默认关闭，静态包没有后台服务。公开账号 / AI 服务仍必须另行完成 [deployment.md](deployment.md) 的密钥、HTTPS、持久盘、备份恢复、预算和供应商隐私门槛。
- 初期本地全量浏览器结果及启动前提修正见 [课程验证记录](verification/2026-11-02-course.md)；本轮候选最终 CI / 打包结果另行记录，不覆盖旧失败证据。

The bundled `serve.py` uses only the Python standard library, binds only to 127.0.0.1, disables directory listings and conditional 304 responses so normalized archive timestamps cannot hide updates. Do not substitute plain `python -m http.server` for update acceptance. / 随包 serve.py 仅使用 Python 标准库，固定回环监听，禁用目录列表和条件 304，避免归档规范化时间戳掩盖新版。
