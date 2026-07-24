# PlutonoC 视频后台配置

网站前台在未配置 CloudBase 时会展示 `video-data.js` 中的静态影像清单；完成以下配置后，前台可优先读取云端已发布内容。

> 当前环境使用 CloudBase 体验版。该套餐拒绝新增 Web 安全域名和修改文件存储安全规则，因此 `cloudbase-config.js` 启用 `staticManifest: true`：既有视频与封面继续保存在 CloudBase 的公开静态托管路径。`/admin.html` 只使用 CloudBase 身份认证，摄影数据、视频资料和封面改由 GitHub 内容后台发布，不再从网页查询 `videos` 集合。

## 1. 创建环境

1. 登录腾讯云 CloudBase 控制台，创建上海地域环境。
2. 开启身份认证中的“账号密码登录”，关闭匿名登录和公开注册入口。
3. 在用户管理中创建或完成验证唯一的站长账号。
4. 创建文档数据库集合 `videos`，并启用云存储。

## 2. 安全规则

数据库规则应满足：

- 未登录访客只能读取 `status == "published"` 的记录。
- 已登录用户可以读取、创建、更新和删除记录。
- 不允许未登录用户写入。

云存储规则应满足：

- 所有人可读取视频与封面。
- 只有已登录用户可上传、覆盖和删除文件。

本站不提供注册页面。环境中只保留一个有效账号，因此所有已登录写入均来自站长。若以后增加用户，必须改成按管理员 UID 或角色判断。

## 3. Web 安全来源

将以下来源加入 CloudBase Web 安全域名：

- `plutonoc.cn`
- `www.plutonoc.cn`（如果启用）
- 本地测试使用的 `127.0.0.1` 或 `localhost`

## 4. 填写公开配置

编辑 `cloudbase-config.js`：

```js
window.PLUTONOC_CLOUDBASE = {
  envId: '你的环境 ID',
  region: 'ap-shanghai',
  clientId: '控制台要求时填写客户端 ID，否则留空',
  accessKey: '控制台要求时填写 Publishable Key，否则留空',
  collection: 'videos',
  staticManifest: true
};
```

`Publishable Key` 是 Web 端公开标识，不是腾讯云 `SecretId` 或 `SecretKey`。严禁把后两者写入仓库。

## 5. 使用

部署后打开 `/admin.html`，使用站长账号和密码登录即可管理内容。浏览器不再接触 GitHub 凭据；`plutonoc-content-publisher` 云函数会校验唯一管理员 UID，并使用服务器端环境变量中的仓库凭据代为提交。摄影作品可直接新增、替换、编辑和隐藏；视频资料与封面也在后台维护。大型 MP4 先在 CloudBase 静态托管控制台上传，再把公开地址填入后台。公开网站只展示已发布记录。

发布函数的仓库凭据只允许限定到 `plutonoc633-lgtm/plutonoc-astronomy`，Repository permissions 只开启 `Contents: Read and write`。本地维护时使用进程环境变量 `PLUTONOC_GITHUB_TOKEN` 解析 `cloudbaserc.json` 中的占位符，真实值不得写入配置文件、Git、日志或交接文档。
