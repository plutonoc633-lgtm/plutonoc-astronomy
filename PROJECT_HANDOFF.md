# PlutonoC 项目交接文档

更新时间：2026-07-20
线上地址：https://plutonoc.cn/
GitHub Pages：https://plutonoc633-lgtm.github.io/plutonoc-astronomy/
项目目录：`C:\Users\komorebi\Documents\Codex\2026-06-05\plugin-computer-use-openai-bundled\outputs`
分支：`main`
当前 HEAD：`705f3f8 Strengthen progress motion and navigation state`

## 1. 项目目标

这是 PlutonoC 的个人摄影与天文观测网站。`PlutonoC` 是作者网名，不是机构名称，也不要恢复实名。网站用于展示天文摄影、自然与城市摄影、动态影像、公开记录、设备和社交主页。

核心栏目目前为：

1. 首页
2. 摄影作品
3. 动态影像
4. 可公开的情报
5. 设备
6. 结尾

摄影分类顺序：`深空 / 日月 / 行星 / 星野 / 大地`。动态影像独立，不计入照片数量。

## 2. 用户明确要求与禁区

- 全站只使用 `PlutonoC`，禁止出现作者实名及其英文拼写。
- 不使用证件照，不暴露学院、专业、年级；只保留“江南大学天见天文协会创始人”这一公开身份信息（当前页面可按最新版排版决定是否可见）。
- 不要空泛、AI 味浓的说明文字，不要在大标题末尾加句号、逗号。
- 已否决：米色画册风、超大衬线标题堆叠、普通卡片瀑布流、白色光束/细线、宇航员进度图标、滚动身份信息条、作品手记、太湖至内蒙古章节。
- 当前进度符号必须是“偏离与校准”的构成主义几何符号：三组断环、折线路径、红色定位点；不能恢复宇航员。
- 首页桌面五栏 hover 必须是真正改变栏宽：当前栏约 `44%`，另外四栏各约 `14%`；不是只放大内部图片。手机端使用横向吸附卡片。
- 摄影作品使用原生 Canvas 2D 无限二维画布，不能退回普通 DOM 网格。
- Canvas 保持图片原始方向和比例，不用 `object-fit: cover` 裁掉主体；灯箱加载原图并完整显示。
- 设备区保持双标签与现有文字，图片使用中心放大、两侧缩小的无限轮播。
- 结尾文字固定为 `循此苦旅 / 以达天际`，小字为 `PER ASPERA AD ASTRA`，不能替换成“光最终抵达这里”等对白。
- 抖音主页链接固定：`https://v.douyin.com/pswzeVgv1D0/`。
- 不新增大型动画库、外部字体 CDN、粒子模板、玻璃拟态或自定义鼠标。
- 支持 `prefers-reduced-motion`，手机端优先流畅和无横向溢出。

## 3. 当前视觉与交互状态

### 首页

- 首页由五个摄影分类入口和一个独立动态影像入口组成。
- 首页已合并“云隐珠峰”个人视觉页，主文字为 `择日成星`。
- 最新未提交修改：减小 `择日成星` 字号和动效；移除底图上的 `PlutonoC`，改为在五个分类栏整体中央悬浮小号 `PlutonoC`。
- 五栏点击后直接筛选并进入 Canvas 对应分类。

### 几何进度符号

- 使用三组断环、折线和红点表示全页滚动进度。
- 顶部明显偏离，随滚动逐渐校准，页面底部三环对齐。
- 不应遮挡操作；INDEX、灯箱、视频弹层打开时隐藏；最后约 6% 页面淡出，避免遮住手机页脚。

### Canvas 与灯箱

- 真实照片数量：深空 31、日月 7、行星 4、星野 14、大地 60，总计 116。
- 视觉副本只用于填充无限画布，不改变计数，也不进入灯箱序列。
- 支持鼠标拖拽、触摸、惯性、四向循环、键盘和点击阈值。
- 卡片圆角、hover 阴影；点击后应先居中当前图、淡出其他图，再进入灯箱。
- 灯箱详情字段按存在与否显示，不显示“暂无 / 未知 / 待补充”。

### INDEX

- 任意滚动位置可打开，支持键盘、Esc、焦点返回和当前栏目高亮。
- 最新未提交修改：预览框改为横向 `16:10`，图片 `cover`，切换时交叉淡入。
- 大地预览固定为 `assets/gallery/previews/earth/earth-022.webp`（大地之树）。
- 结尾预览固定为 `assets/gallery/previews/earth/earth-052.webp`（香格里拉）。
- 手机端隐藏大预览图，仅保留栏目列表。
- “可公开的情报”INDEX 过场使用英文：小字 `ARCHIVE OPENED`，大字 `DECLASSIFIED`。

### 结尾

- 最新未提交修改：减小结尾字号；加入低饱和红色斜切块、细线和圆弧等构成主义元素。
- `循此苦旅` 与 `以达天际`保持非对称、轻微持续漂移，不能和 `PER ASPERA AD ASTRA` 重叠。
- 社交链接和页脚已调整为正常文档流，并增加手机安全区。

## 4. 代码结构

- `index.html`：前台所有栏目、INDEX、灯箱、视频弹层、设备和结尾 DOM。
- `style.css`：全站布局、响应式、动画、INDEX、Canvas 容器、设备轮播和灯箱。
- `script.js`：分类数据整合、首页交互、Canvas 2D、灯箱、INDEX、视频读取、设备轮播、滚动进度和动效。
- `gallery-data.js`：旧天文摄影数据。
- `gallery-earth-data.js`：新增大地摄影数据。
- `cloudbase-config.js`：CloudBase 公共配置，只允许环境 ID 等公开配置，不得写入密码、SecretId、SecretKey。
- `admin.html / admin.js / admin.css`：CloudBase 视频管理后台。
- `assets/gallery/originals/`：灯箱原图。
- `assets/gallery/previews/`：Canvas 与首页预览资源。
- `assets/videos/jupiter.mp4`：本地 6.084 秒木星兜底视频。
- `assets/videos/jupiter-poster.webp`：木星封面。
- `CNAME`：`plutonoc.cn`。

## 5. 当前未提交改动

工作区有 4 个修改文件，禁止回退：

```text
M cloudbase-config.js
M index.html
M script.js
M style.css
```

改动规模：68 行新增、41 行删除。主要内容是本交接文档第 3 节所述视觉修正，以及 CloudBase 环境 ID 配置。

`cloudbase-config.js` 当前为：

```js
window.PLUTONOC_CLOUDBASE = {
  envId: 'activity-book-web-d7djhe7bb1e834',
  region: 'ap-shanghai',
  clientId: '',
  accessKey: '',
  collection: 'videos'
};
```

## 6. CloudBase 当前状态

腾讯官方 CloudBase CLI 已成功登录，凭据缓存在本机。优先使用 CLI，浏览器扩展读取腾讯云重页面时多次超时，不要再把浏览器自动化作为主路径。

CLI 使用方式：

```powershell
npx --yes --package @cloudbase/cli@3.6.3 tcb <command>
```

环境：

```text
envId: activity-book-web-d7djhe7bb1e834
region: ap-shanghai
status: NORMAL
数据库类型: 文档型数据库
```

已确认：

- `tcb env list --json` 可正常返回环境，说明 CLI 登录有效。
- 对 `videos` 执行查询返回空数组，但集合是否已在控制台正式创建、权限是否设置完成仍需确认。
- 当前云存储权限为 `PRIVATE`（仅创建者及管理员可读写），需要改为公开读取、管理员写入。
- 当前安全域名列表还没有 `plutonoc.cn`、GitHub Pages 地址、本地测试地址。
- 已有管理员账号名 `administrator`，密码未知且不得写入代码或交接文档。

PowerShell 给 `tcb db nosql execute --command` 传 JSON 时，必须保留反斜杠转义，否则 Windows 命令行会吃掉双引号。例如：

```powershell
$cmd = '[{\"TableName\":\"videos\",\"CommandType\":\"QUERY\",\"Command\":\"{\\\"find\\\":\\\"videos\\\",\\\"filter\\\":{},\\\"limit\\\":5}\"}]'
npx --yes --package @cloudbase/cli@3.6.3 tcb -e activity-book-web-d7djhe7bb1e834 db nosql execute --command $cmd --json
```

不要传此前控制台 URL 中的 `tnt-76embdeba` 给 `--instance-id`；CLI 会报 `ResourceNotFound.Connector`。不传实例 ID即可访问默认文档数据库。

## 7. 待上传视频

用户已明确授权上传以下文件到其腾讯 CloudBase：

1. `C:\Users\komorebi\Desktop\新增\视频\星辰行梦.mp4`
   - 432,757,530 bytes
   - 约 4:45
   - 标题：`星辰行梦`
   - 排序：1
2. `C:\Users\komorebi\Desktop\新增\视频\江南大学天文协会宣传片.mp4`
   - 188,148,377 bytes
   - 约 2:31
   - 标题：`江南大学天文协会宣传片`
   - 排序：2
3. `assets/videos/jupiter.mp4`
   - 6.084 秒
   - 标题：`木星观测`
   - 排序：3

不要把前两条大视频提交到 GitHub。前台最终显示三条视频，第一条为重点视频，后两条进入列表。不要虚构日期、地点、简介、设备或参数。

上传前检查编码；网页发布格式应为 H.264/AAC。不兼容时生成兼容副本上传，但不能改动桌面原文件。后台应自动读取时长、画幅并截取独立封面。

## 8. 新窗口的执行顺序

### A. 完成 CloudBase 配置

1. 验证 CLI 登录：

```powershell
npx --yes --package @cloudbase/cli@3.6.3 tcb env list --json
```

2. 确认或创建 `videos` 集合。
3. 设置数据库权限：匿名用户只能读取 `status == 'published'`，管理员/已授权后台可写。
4. 设置存储权限为公开读、管理员写。CLI 可先查看：

```powershell
npx --yes --package @cloudbase/cli@3.6.3 tcb -e activity-book-web-d7djhe7bb1e834 storage rules get --json
```

CLI 规则更新命令：

```powershell
npx --yes --package @cloudbase/cli@3.6.3 tcb -e activity-book-web-d7djhe7bb1e834 storage rules update --acl ADMINWRITE --json
```

5. 添加安全域名：

```powershell
npx --yes --package @cloudbase/cli@3.6.3 tcb -e activity-book-web-d7djhe7bb1e834 cors add "plutonoc.cn,plutonoc633-lgtm.github.io,localhost,127.0.0.1" --json
```

先用 `cors list --json` 检查重复，不要删除已有域名。

### B. 上传与发布视频

优先使用现有 `admin.html` 上传，因为它已实现元数据、封面、草稿、发布、编辑和删除。若后台登录必须输入密码，只让用户在页面中自行输入管理员密码，然后继续剩余操作；不要索要或保存密码。

如后台上传不稳定，可使用 CLI：

```powershell
npx --yes --package @cloudbase/cli@3.6.3 tcb -e activity-book-web-d7djhe7bb1e834 storage upload "C:\Users\komorebi\Desktop\新增\视频\星辰行梦.mp4" "videos/star-dream.mp4" --times 3 --json
npx --yes --package @cloudbase/cli@3.6.3 tcb -e activity-book-web-d7djhe7bb1e834 storage upload "C:\Users\komorebi\Desktop\新增\视频\江南大学天文协会宣传片.mp4" "videos/tianjian-promo.mp4" --times 3 --json
npx --yes --package @cloudbase/cli@3.6.3 tcb -e activity-book-web-d7djhe7bb1e834 storage upload "assets\videos\jupiter.mp4" "videos/jupiter.mp4" --times 3 --json
```

随后为每条生成/上传封面，并向 `videos` 写入文档字段：

```text
id, title, summary, date, location, category,
videoFileId, posterFileId, duration, aspectRatio,
status, sortOrder, createdAt, updatedAt
```

公共页面只读取 `status: published`。本地 `jupiter.mp4` 继续作为 CloudBase 不可用时兜底，不删除。

### C. 本地验证

至少执行：

```powershell
node --check script.js
node --check admin.js
git diff --check
git status --short
```

启动本地静态服务器，在 Edge/Chrome 验证桌面和 390px：

- 首页字号与五栏伸缩
- 五栏中央不再显示 `PlutonoC` 署名
- INDEX 预览无黑边，大地之树/香格里拉正确
- 手机首页高度与页脚安全区
- 几何进度符号不会遮挡底部
- Canvas 116 张计数和五类数量正确
- 三条视频排序、封面、播放和关闭后资源释放
- 控制台无错误、图片无 404、无横向溢出

### D. 提交和发布

确认未把桌面大视频、密码、密钥加入 Git：

```powershell
git diff --stat
git status --short
git add cloudbase-config.js index.html script.js style.css PROJECT_HANDOFF.md
git commit -m "Refine responsive visuals and connect CloudBase videos"
git push origin main
```

等待 GitHub Pages 完成后在线检查：

```text
https://plutonoc.cn/
https://plutonoc.cn/admin.html
```

若 DNS/CDN 缓存导致页面未更新，先比较线上资源版本，再强制刷新，不要重复提交相同改动。

## 9. 交接注意事项

- 工作区现有修改均为本轮已确认内容，不得 `git reset --hard`、`git checkout --` 或覆盖。
- 不要重新导入 `C:\Users\komorebi\Desktop\新增` 的 60 张大地照片；它们已进入项目。
- 不要重新设计设备栏目，只修复轮播体验和接入新增设备图。
- 不要恢复任何旧的“光的降落”对白、白光束、宇航员、实名或作品手记。
- 先完成当前计划、验证并发布，再讨论新的视觉方向，避免继续叠加补丁。

## 10. 2026-07-20 完成记录

- `videos` 集合已设置自定义安全规则：未登录用户只读 `status == 'published'`，登录用户可读写。
- 已发布三条记录：`星辰行梦`、`江南大学天文协会宣传片`、`木星观测`，排序为 1 / 2 / 3；简介、日期、地点均留空。
- 三段 H.264/AAC 视频与三张独立封面已上传到 CloudBase 文件存储，并同步到公开静态托管的 `plutonoc/videos/` 与 `plutonoc/video-posters/`。
- 体验版套餐拒绝修改文件存储规则和新增安全域名；前台因此启用 `staticManifest: true`，通过公开静态托管 URL 播放，数据库记录仍保留正式 `videoFileId` / `posterFileId`。
- 已完成 1440px、390px、三条视频播放与资源释放、INDEX、Canvas 116 张计数、页脚安全区和无横向溢出的本地验收。

## 11. 2026-07-20 手机端体验修正

- 首页“择日成星”字号与逐字动效已减弱；手机端四字使用统一基线并取消漂移、旋转。
- 原始透明水印已复制为 `assets/branding/plutonoc-watermark.png`，只显示在首页标题下方；桌面原文件未修改。
- 手机端珠峰图已放大并上移视觉中心；五栏改为固定宽度和中心点唯一高亮，移除会触发布局抖动的缩放与阈值观察逻辑。
- 刷新带 hash 的页面会返回首页；首次直接打开深链接、站内 INDEX、前进和后退仍保留对应栏目导航。
- “北京日报客户端”记录已删除，三条“中国国家天文”按 2026.02.11 / 02.05 / 01.28 置顶。
- 结尾删除红色几何构图，改为纯黑微纹理背景；手机端标题静止，社交链接进入正常文档流且不再遮挡标题。
- 已完成 1440px 与 390×844 验收：桌面五栏保持约 44% / 14%，手机五栏宽度固定、始终单项高亮，页面无横向溢出，控制台无错误。
