# SQLite 备份与恢复

账号库含认证记录和学习正文。不要提交 Git，不要用普通文件复制正在写入的 WAL 库。

## 备份

服务可继续运行。使用 SQLite 在线 backup，不要 `cp data/*.sqlite*`。

```sh
node --import tsx tools/backup-sqlite.ts backup ./data/understanding.sqlite ./data/backups/understanding-$(date -u +%Y%m%dT%H%M%SZ).sqlite
```

## 恢复

先停服务，再覆盖目标文件，然后 `npm run db:migrate`（幂等），再启动。

```sh
node --import tsx tools/backup-sqlite.ts restore ./data/backups/understanding-YYYYMMDD.sqlite ./data/understanding.sqlite
```

## 保留

本仓库不向使用者承诺「7 天删除」或端到端加密。部署者自己决定保留多久、存在哪块盘、何时演练。没有做过一次恢复演练前，不要公共部署。

单元测试会在临时目录跑通 backup → restore。那只证明工具可用，不能代替你在真实 `DB_PATH` 上的演练记录。
