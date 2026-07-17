# PlutonoC 视频后台配置

网站前台在未配置 CloudBase 时会展示 `video-data.js` 中的两条本地视频；完成以下配置后，前台会优先读取云端已发布内容。

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
  collection: 'videos'
};
```

`Publishable Key` 是 Web 端公开标识，不是腾讯云 `SecretId` 或 `SecretKey`。严禁把后两者写入仓库。

## 5. 使用

部署后直接打开 `/admin.html`，使用站长账号登录。上传 MP4、填写资料并选择“保存草稿”或“发布影像”。公开网站只展示已发布记录。
