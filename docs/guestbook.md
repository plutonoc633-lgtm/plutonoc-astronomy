# 留言簿维护

公开页面：`https://plutonoc.cn/guestbook.html`。入口在 INDEX；首页不加载留言代码或请求留言接口。

## 管理

现有 CloudBase 后台的“留言簿”标签复用管理员登录。待审核、已公开、已隐藏各每页 50 条。审核公开后进入公开列表；隐藏会同时隐藏作者回复；回复支持修改和清空。永久删除前确认。

公开列表按公开时间及 ID 倒序，每页 20 条。重新公开隐藏留言会更新公开时间。所有内容按纯文字呈现，昵称最多 20 个 Unicode 字符，正文及作者回复最多 1000 个；空昵称为“访客”。

管理修改带 revision，冲突会要求刷新，不覆盖另一管理操作。模块切换、退出登录会使旧请求失效。模块脚本缺失不影响其他标签。

## 云端

- 环境：`activity-book-web-d7djhe7bb1e834`，上海。
- `plutonoc-guestbook-public`：独立 HTTP `/guestbook`，GET 仅公开列表，POST 仅创建待审核留言，OPTIONS 预检。
- `plutonoc-guestbook-admin`：管理员列表、审核、隐藏、回复、删除，无公共 HTTP 路由。
- `plutonoc-guestbook-cleanup`：`plutonoc-guestbook-hourly` 每小时第 10 分钟清理过期限流记录，独立随机触发密钥。
- 私有集合：`plutonoc_guestbook_messages`、`plutonoc_guestbook_limits`，均为 ADMINONLY。

限流与提交使用数据库事务：同网络 10 分钟 5 条、每天 20 条，全站每分钟 60 条。CloudBase 网关提供的网络地址只在内存中用于按天加盐 HMAC，不存原始 IP、不关联访客统计；线上已验证伪造 X-Real-IP / X-Forwarded-For 不绕过限流。限流摘要记录在两天内到期，下次每小时清理删除。数据库失败、超时、清理积压不会被报告为成功。

浏览器对同一次失败提交保留随机 requestId，输入变更后生成新编号；云端用编号摘要去重。删除会清除正文、昵称、回复、时间和正文摘要，只留不可逆请求编号及 deleted 标记，防止迟到重试恢复已删留言。公开与后台列表均排除此标记。

## 构建及部署

1. `node tools/build-guestbook.mjs` 生成 work 下三个函数目录。
2. 设置 `PLUTONOC_TCB_CLI`，执行 `node tools/deploy-guestbook.mjs deploy`。
3. `node tools/deploy-guestbook.mjs timer` 复核已有触发密钥与启用状态；`acl` 核对权限。
4. `tools/deploy-admin-cloudbase.ps1` 发布后台，包含独立 `admin-guestbook.js`。
5. 核对远端内容，再按现有 main / Pages 流程发布。

首次创建才用构建参数 `--initialize` 和部署的 `initialize` / `route`。私有配置保存在 **未跟踪** 的 `work/guestbook-private.json`，不要提交、打印或打进 Pages 包。迁移维护环境时安全保留这份配置；普通构建缺少配置应失败，不自动轮换已部署密钥。

前端开关：`guestbook-config.js` 的 `enabled`；关闭后页面停止请求与提交。公共接口还会保持既有能力；如需云端同时关闭，用 CloudBase 管理指定 `/guestbook` 路由，勿更改其他服务。

## 验证

`node --test tools/test-guestbook.cjs` 覆盖去重、Unicode 输入、数据库限流、权限、审核状态、冲突、稳定分页、删除后重试、清理及数据库失败。

本地启动 HTTP 服务后运行 `node tools/test-guestbook-browser.cjs`；可用 `PLUTONOC_PLAYWRIGHT` 指向 Playwright 包、`PLUTONOC_TEST_URL` 指向本地服务。测试请求通过模拟接口，不创建正式留言。浏览器测试覆盖文本安全、失败恢复、分页、窄屏布局、后台迟到请求和 INDEX 导航。

真实云端测试使用明确的 `[GUESTBOOK QA]` 标记，完成后删除。不要用普通访客留言做测试，不删除不属于测试的记录。
