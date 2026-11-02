# Understanding Lab — static course candidate / 静态课程候选版

This archive contains 12 bilingual interactive AI chapters plus the original overfitting lesson. No account, model key, npm, Node.js or backend is needed to study. It is **not** a hosted account/AI service release.

本包包含 12 章中英双语互动 AI 课程及原版过拟合课；无需账号、模型密钥、npm、Node 或后台服务。它**不是**账号同步 / AI 服务的生产上线包。

## Start / 启动

Install Python 3.9+ if needed, extract this archive, open a terminal in the extracted folder, then:

```sh
python3 serve.py
```

Windows may use `py serve.py` instead. Open **http://127.0.0.1:4173/**. Keep the terminal running until the app says its material is cached. Stop with Ctrl+C. Do not open index.html using file://; offline service workers require HTTP localhost or HTTPS. This simple server is for your own local study, not public hosting.

解压后进入目录，运行上面命令，打开 **http://127.0.0.1:4173/**。等待“学习材料与实验数据已缓存”后即可离线刷新；Ctrl+C 停止服务。不要直接双击 index.html；请勿将这个本地服务器暴露到公网。

## Safety and updates / 数据与升级

- Keep the same browser, hostname and port: storage belongs to that origin. Other ports/localhost names are different sites.
- Export your course record and original lesson draft **before updating**. Browser storage can be cleared/evicted; it is not encrypted or a durable backup. The course export is a recovery record, not an automatic import workflow.
- To update, stop the old local server, extract the new archive to a separate folder, serve its site directory at the same address, visit online and wait for the update/cache status. Reload if prompted. Do not clear site data to upgrade; this also deletes records.
- External source links require internet. Account saving, tutor and transcription are excluded; use typing and local export instead.
- Course completion records practice and corrected quizzes, not certified mastery. The simulations are deterministic educational simplifications; human educational effectiveness and physical-device acceptance are not established.
- 同一浏览器、主机名、端口才是同一存储空间。升级前分别导出课程记录和原版草稿；不要通过清除站点数据来升级。浏览器数据可能被回收，导出不是自动导入功能。外部来源链接需联网；本包不提供账号同步、AI 辅导、语音转写。

## Integrity / 校验

On systems with sha256sum, run `sha256sum -c SHA256SUMS` inside this folder. Check the archive's companion `.sha256` before extraction if supplied. BUILD.json identifies the source/version; SHA-256 detects changed bytes, not publisher identity. Preserve LICENSE, THIRD_PARTY_NOTICES.md and licenses/ when redistributing.

The bundled `serve.py` uses only the Python standard library, binds only to 127.0.0.1, disables directory listings and conditional 304 responses so normalized archive timestamps cannot hide updates. Do not substitute plain `python -m http.server` for update acceptance. / 随包 serve.py 仅使用 Python 标准库，固定回环监听，禁用目录列表和条件 304，避免归档规范化时间戳掩盖新版。
