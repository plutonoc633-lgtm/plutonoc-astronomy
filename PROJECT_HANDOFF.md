# PlutonoC 项目交接文档

更新时间：2026-07-20
线上地址：https://plutonoc.cn/
GitHub Pages：https://plutonoc633-lgtm.github.io/plutonoc-astronomy/
项目目录：`C:\Users\komorebi\Documents\Codex\2026-06-05\plugin-computer-use-openai-bundled\outputs`
分支：`main`
当前发布基线：`main`（提交哈希以 `git log -1 --oneline` 为准）

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
- 结尾照片文字固定为单行 `择日成星`；账号、版权、英文口号和返回顶部必须位于照片后的独立信息区，不能重新铺在照片上。
- 抖音主页链接固定：`https://v.douyin.com/pswzeVgv1D0/`。
- 不新增大型动画库、外部字体 CDN、粒子模板、玻璃拟态或自定义鼠标。
- 支持 `prefers-reduced-motion`，手机端优先流畅和无横向溢出。

## 3. 当前视觉与交互状态

### 首页

- 首页由五个摄影分类入口和一个独立动态影像入口组成。
- 首页已合并“云隐珠峰”个人视觉页，主视觉为手写图片 `PER ASPERA AD ASTRA`，下方显示小号水印。
- 五个分类栏中央不显示 `PlutonoC` 署名；桌面端保留栏宽展开，手机端保持固定宽度与中心唯一高亮。
- 五栏点击后直接筛选并进入 Canvas 对应分类。

### 几何进度符号

- 使用三组断环、折线和红点表示全页滚动进度。
- 顶部明显偏离，随滚动逐渐校准，页面底部三环对齐。
- 不应遮挡操作；INDEX、灯箱、视频弹层打开时隐藏；最后约 6% 页面淡出，避免遮住手机页脚。

### Canvas 与灯箱

- 真实照片数量：深空 31、日月 7、行星 4、星野 14、大地 61，总计 117。
- 视觉副本只用于填充无限画布，不改变计数，也不进入灯箱序列。
- 支持鼠标拖拽、触摸、惯性、四向循环、键盘和点击阈值。
- 卡片圆角、hover 阴影；点击后应先居中当前图、淡出其他图，再进入灯箱。
- 灯箱详情字段按存在与否显示，不显示“暂无 / 未知 / 待补充”。

### INDEX

- 任意滚动位置可打开，支持键盘、Esc、焦点返回和当前栏目高亮。
- 预览框为横向 `16:10`，图片使用 `cover`，切换时交叉淡入。
- 大地预览固定为 `assets/gallery/previews/earth/earth-022.webp`（大地之树）。
- 结尾预览固定为 `assets/gallery/previews/earth/earth-052.webp`（香格里拉）。
- 手机端隐藏大预览图，仅保留栏目列表。
- “可公开的情报”INDEX 过场使用英文：小字 `ARCHIVE OPENED`，大字 `DECLASSIFIED`。

### 结尾

- 贵州夏季银河照片构成独立满屏主视觉，照片上只显示单行 `择日成星`。
- 设备区到照片通过顶部暗场、照片透明度与轻微缩放渐显；照片底部再渐变到深蓝星图信息区。
- Bilibili、抖音、小红书入口以及版权、英文口号、返回顶部均位于照片后的独立信息区；手机端保持一行三列头像入口和两行品牌栏。

## 4. 代码结构

- `index.html`：前台所有栏目、INDEX、灯箱、视频弹层、设备和结尾 DOM。
- `style.css`：全站布局、响应式、动画、INDEX、Canvas 容器、设备轮播和灯箱。
- `script.js`：分类数据整合、首页交互、Canvas 2D、灯箱、INDEX、视频读取、设备轮播、滚动进度和动效。
- `gallery-data.js`：旧天文摄影数据。
- `gallery-earth-data.js`：新增大地摄影数据。
- `cloudbase-config.js`：CloudBase 公共配置，只允许环境 ID 等公开配置，不得写入密码、SecretId、SecretKey。
- `admin.html / admin.js / admin.css`：CloudBase 身份认证 + GitHub 摄影与视频内容后台。
- `assets/gallery/originals/`：灯箱原图。
- `assets/gallery/previews/`：Canvas 与首页预览资源。
- `assets/videos/jupiter.mp4`：本地 6.084 秒木星兜底视频。
- `assets/videos/jupiter-poster.webp`：木星封面。
- `CNAME`：`plutonoc.cn`。

## 5. 工作区约束

本轮开始前 `main` 工作区干净。后续如出现未提交文件，一律先检查来源并保留用户修改，禁止直接回退或覆盖。

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
- 已有唯一管理员账号；账号名和密码仅在 CloudBase 用户管理中维护，不得写入代码或交接文档。

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

本节是旧版 CloudBase 视频上传流程，已由第 20 节取代。当前 `admin.html` 维护摄影数据、视频资料和封面；大型 MP4 先由用户在 CloudBase 静态托管控制台上传，再将公开地址填入后台。后台密码只由用户在页面中输入，不得索要或保存。

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
- Canvas 117 张计数和五类数量正确
- 三条视频排序、封面、播放和关闭后资源释放
- 控制台无错误、图片无 404、无横向溢出

### D. 提交和发布

确认未把桌面大视频、密码、密钥加入 Git：

```powershell
git diff --stat
git status --short
git add <本轮确认文件>
git commit -m "<准确描述本轮变更>"
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
- 已完成 1440px、390px、三条视频播放与资源释放、INDEX、Canvas 117 张计数、页脚安全区和无横向溢出的本地验收。

## 11. 2026-07-20 手机端体验修正

- 首页“择日成星”字号与逐字动效已减弱；手机端四字使用统一基线并取消漂移、旋转。
- 原始透明水印已复制为 `assets/branding/plutonoc-watermark.png`；优化版同时用于首页标题下方和公开站点页头品牌，桌面原文件未修改。
- 手机端珠峰图已放大并上移视觉中心；五栏改为固定宽度和中心点唯一高亮，移除会触发布局抖动的缩放与阈值观察逻辑。
- 刷新带 hash 的页面会返回首页；首次直接打开深链接、站内 INDEX、前进和后退仍保留对应栏目导航。
- “北京日报客户端”记录已删除，三条“中国国家天文”按 2026.02.11 / 02.05 / 01.28 置顶。
- 结尾删除红色几何构图，改为纯黑微纹理背景；手机端标题静止，社交链接进入正常文档流且不再遮挡标题。
- 已完成 1440px 与 390×844 验收：桌面五栏保持约 44% / 14%，手机五栏宽度固定、始终单项高亮，页面无横向溢出，控制台无错误。

## 12. 2026-07-20 性能与分享展示优化

- 首页珠峰改用现有 1600px / 2560px WebP 响应式资源，INDEX 同步使用轻量预览；`earth-007.jpg` 原图仍完整保留在摄影图库中。
- 五栏图片和视频封面改为延迟加载，首页木星视频使用 `preload="none"`，进入可见区域时仍沿用原有播放逻辑。
- 当时页面曾使用约 146KB 的 Source Han Serif 字符子集；该运行时方案已被第 15 节的系统字体栈替代。
- 原始水印保持不变，页面改用约 640px 的透明优化版本；新增 1200×630 珠峰品牌分享封面和由水印星球图案裁切的 favicon。
- 首页增加 canonical、Open Graph、Twitter Card 与绝对分享图片地址，不修改现有视觉布局、CloudBase、视频数据或摄影数据。
- `tools/build-web-assets.py` 当时同时生成字体与品牌衍生资源；最终职责已在第 15 节收敛为只生成品牌衍生资源。
- GitHub Pages 工作流已加入部署前 JavaScript / 静态资源检查和部署后线上冒烟验证。

## 13. 2026-07-20 结尾转场与信息区重构

- 第 06 节拆为满屏照片主视觉和独立账号信息区；贵州夏季银河照片上只保留 `择日成星`。
- 设备区进入照片时使用约一屏内完成的暗场、透明度和轻微缩放渐显，标题在照片显现后半程出现。
- 照片底部通过加长暗场交叠进入纯净深蓝信息区，不再出现照片与信息背景的直接硬切；信息区不使用星点、网格或圆环装饰。
- Bilibili、抖音、小红书均改为“平台头像 / PlutonoC / 平台名”的极简入口，不显示“官方账号”、ACCOUNT、FOLLOW、序号、箭头或大卡片边框。
- 三个平台分别使用各自公开头像的 256×256 本地 WebP，不热链平台 CDN；小红书稳定主页为 `https://www.xiaohongshu.com/user/profile/60e62ebb0000000001007f48`。
- 手机端三个账号保持一行三列；品牌栏仍采用口号居中、版权与返回顶部并列的两行结构，全页不得横向溢出。
- `© 2026 PLUTONOC`、`PER ASPERA AD ASTRA`、`BACK TO TOP ↑` 保留在独立品牌栏。

## 14. 2026-07-20 全站字体与视频封面更新（字体部分已被第 15 节替代）

- 公开站点和 `admin.html` 的运行时字体统一改为“得意黑 + 未来荧黑”：得意黑用于中文展示标题，未来荧黑 Normal 用于正文与界面、Compressed 用于编号和英文元信息。
- 构建脚本固定得意黑 `v2.0.1`、未来荧黑 `v0.93` 的官方发布包与 SHA-256；下载和完整字体只进入系统临时缓存，Git 仅保留四个 WOFF2 子集与两份 OFL 许可证。
- 四个运行时字体子集共 593,768 字节；得意黑使用官方 TTF 源生成，避免 CFF 子集在浏览器中出现轮廓超出字宽；旧思源与 IBM Plex 文件继续保留作历史构建源，但 HTML、公开 CSS 和后台 CSS 均不再引用。
- 视频标题使用得意黑并缩小：重点视频 `clamp(24px, 3vw, 44px)`，列表视频 `clamp(20px, 2vw, 28px)`，手机端约 20–24px，长标题允许自然换行。
- `星辰行梦` 封面改为原片 00:27 的“心脏星云 / IC1805”干净帧；`江南大学天文协会宣传片` 改为原片 00:02 的校徽联名干净帧，均输出 1920×1080 JPEG。
- 新封面以版本化文件名同步至 CloudBase 文件存储与公开静态托管，并更新数据库 `posterFileId`、`posterUrl`、`updatedAt` 和本地静态清单；旧封面未删除，可随时回滚。

## 15. 2026-07-20 最终字体、页头品牌与发布交接

- 影视飓风官网当前 CSS 使用 `PingFang SC`，没有自定义 `@font-face`。公开站点和 `admin.html` 最终统一采用系统字体栈：`PingFang SC / Microsoft YaHei / Noto Sans CJK SC / sans-serif`。
- Apple 设备优先使用苹方；Windows 使用微软雅黑；Android/Linux 使用可用的 Noto CJK 或无衬线系统回退。页面不下载字体、不依赖字体 CDN，运行时网页字体为 0 字节。
- 标题、品牌与强调信息最终统一使用 500，正文和元信息使用 400；已移除为得意黑窄斜字形设置的负字距，并校正中文标题行高。
- 得意黑、未来荧黑、旧思源与 IBM Plex 文件及许可证仍保留在仓库中作为历史回滚资源，但 HTML、公开 CSS、后台 CSS 和预载均不得引用它们。
- 公开站点页头左侧文字 `PlutonoC` 已替换为 `assets/branding/plutonoc-watermark-web.png`：桌面高 24px、手机高 20px，保留 640×175 固有尺寸和透明通道。中间 `01 首页`、右侧 `INDEX` 及后台页头文字保持不变。
- `tools/build-web-assets.py` 只生成优化水印、分享封面和 favicon，不再下载、裁切或输出字体；源摄影、手写口号和原始水印在构建前后进行哈希保护。
- `tools/verify-site.py` 检查系统字体栈、页头水印标记、0 字体运行时引用、缓存版本、品牌资源尺寸、视频封面地址和线上 MIME 类型。
- 当前公共 CSS 与脚本缓存版本为 `20260722-scroll-reveal-1`；后台 CSS 和视频清单继续使用各自现有版本。发布前必须执行：

```powershell
node --check script.js
node --check admin.js
python tools/verify-site.py --root .
git diff --check
```

- GitHub Pages 工作流会在上传前重复语法和静态检查，部署后运行线上冒烟验证。完成后检查 `https://plutonoc.cn/`、`https://plutonoc.cn/admin.html`，并确认浏览器网络面板没有 WOFF/WOFF2 请求。
- CloudBase 环境、`videos` 集合、安全规则、三条视频、封面和静态清单本轮均未改动；继续遵守第 6 节现有约束。

## 16. 2026-07-22 远端整理与浏览性能优化

- 执行本轮前已用 `git pull --ff-only` 接收远端 `main` 的 6 个提交：`6d5f00e`、`22547fa`、`5184aa0`、`7d72bac`、`8538f51`、`a51ab00`。其中保留了前台 11 处、后台 3 处标题字重由 600 调为 500 的最终结果，以及相应缓存和发布检查修正。
- 中间提交曾降低 Canvas 清晰度、缓存并调整节流逻辑，随后因摄影图片加载异常被回退。本轮不得重新采用该方案；Canvas 仍保持手机 DPR 上限 1.2、桌面 DPR 上限 1.75，以及手机 96MB、桌面 240MB 的 ImageBitmap 缓存。
- 摄影 Canvas 改为按需创建：只有距摄影区约 800px、直接进入 `#works`，或主动点击摄影分类/控制按钮时才运行 `ensureArchiveCanvas()`。停留首页时不得请求 Canvas 摄影预览。
- Canvas 图片加载限制为手机同时 4 张、桌面同时 6 张；当前画面中的资源会在待处理队列中优先，避免一次性解码大量图片。摄影计数、筛选、拖动、惯性、灯箱和清晰度保持不变。
- 动态影像时间码改为 100ms 定时更新，只有视频区可见且页面位于前台时运行；离开视频区、切换标签页或启用减少动态效果后立即停止，不再让主 `requestAnimationFrame` 循环常驻 60fps。
- 栏目位置、结尾位置、页头高度、校准组件高度及 SVG 轨迹长度集中缓存，只在加载、窗口尺寸变化、Canvas 创建和视频列表渲染后重算。滚动帧不再重复执行 `getTotalLength()` 和多次 `getBoundingClientRect()`。
- 相同视觉阶段不再重复写入 `data-visual-stage` 与颜色变量；非当前背景层在淡出结束后设为不可见。手机页头使用高不透明背景并关闭实时 `backdrop-filter`，降低大面积模糊合成压力。
- `tools/verify-site.py` 会检查按需 Canvas、4/6 并发、100ms 时间码、布局缓存和新缓存版本。回滚时应整体回滚本节相关脚本、CSS、HTML 缓存参数和验证标记，不能只恢复 Canvas 构造语句。

## 17. 2026-07-22 可逆滚动进出场

- 原有 `.reveal` 一次性淡入改为可逆状态：内容从下方进入时淡入、恢复清晰，越过视口顶部后轻微上移并淡出，向上返回时重新播放。
- 动效由 `IntersectionObserver` 的 `[0, .08, .35]` 阈值触发，不增加滚动事件布局读取或持续 `requestAnimationFrame` 循环；进入、离开方向直接使用 observer 回调提供的边界数据判断。
- 桌面入场位移 22px、离场位移 12px、模糊上限 3px；手机缩至 14px / 8px、模糊上限 1.5px。标题、视频列表、情报行和社交入口使用不超过 240ms 的轻量错峰。
- 摄影 Canvas 外框只改变透明度，不缩放、不模糊；Canvas 按需加载、DPR、96MB / 240MB 缓存和 4/6 图片并发保持不变。结尾照片与“择日成星”仍使用原滚动进度动画。
- `prefers-reduced-motion` 下所有新增位移、模糊、错峰与重复播放均取消，内容直接显示。当前公共 CSS 与脚本缓存版本为 `20260722-scroll-reveal-1`。

## 18. 2026-07-24 真机验收与线上自动巡检

- 新增 `REAL_DEVICE_QA.md`，覆盖 iPhone Safari、iPhone 微信内置浏览器、Android Chrome 与 Android 微信内置浏览器。真机结果由实际设备填写；浏览器模拟不能替代微信内核验收。
- `tools/verify-site.py --url https://plutonoc.cn/` 现在同时检查首页、后台、当前缓存版本、分享与品牌资源、CloudBase SDK，以及当前 `video-data.js` 中全部已发布视频和封面。视频使用 Range 请求且只读取前 1KB，不完整下载；后台发布增删视频后不需要手动改巡检 URL。
- `.github/workflows/monitor-production.yml` 每 6 小时执行一次，也可手动运行。它只读取公开 URL，不执行部署、不修改 CloudBase，也不采集真实访客的设备、IP、错误或行为数据。
- 连续重试仍失败时，工作流创建或更新固定标题 `[monitor] PlutonoC production availability failure` 的 Issue，并指派给 `plutonoc633-lgtm`。同一故障只保留一个开放 Issue；恢复后自动留言并关闭。
- Issue 仅包含公开目标、UTC 时间、失败摘要和 Actions 运行地址。排障时先打开失败的 Actions 运行，再在仓库根目录执行：

```powershell
python tools/verify-site.py --url https://plutonoc.cn/
```

- 临时停用巡检应在 GitHub Actions 中禁用 `Monitor PlutonoC Production` 工作流；不要删除验证脚本，因为 Pages 部署后仍会复用它。
- GitHub 定时工作流可能延迟执行，本方案用于故障提醒，不构成实时 SLA。任何真机兼容修复都必须先写入 `REAL_DEVICE_QA.md` 的问题记录，并保持现有视觉方向、Canvas 清晰度和 CloudBase 数据不变。

## 19. 2026-07-24 管理员登录入口

- 公开网站页头不再显示“管理”；管理员入口改为结尾品牌栏左侧的 `© 2026 PLUTONOC`，链接至 CloudBase Web 应用根地址，外观与普通版权文字一致。
- 入口隐藏只用于减少路人误点，不构成安全措施。后台仍由 CloudBase 身份验证保护；管理员账号与密码只在 CloudBase 用户管理中维护，不得写入代码、Git、命令记录或交接文档。
- 后台登录页已精简为“登录”、账号、密码、状态和按钮；管理界面删除英文眉题与重复说明，但保留上传格式、状态、编辑、发布、删除和退出等必要功能。CloudBase 业务逻辑未修改。
- 结尾底栏不得添加 `.reveal`：它位于文档最末端，观察器的底部负边距会使其在最大滚动位置仍无法进入触发区，从而保持透明。底栏现在固定可见，并由静态检查阻止该类名回归。
- 当前公共 CSS 缓存版本为 `20260724-footer-visible-4`。后台缓存版本已由第 20 节替代；静态检查会同时阻止页头管理入口、底栏隐藏和旧后台注释回归。

## 20. 2026-07-24 GitHub 摄影与视频内容后台

- 正式管理后台不是 Pages 同域的 `/admin.html`，而是 CloudBase Web 应用根地址：`https://plutonoc-studio-activity-book-web-d7djhe7bb1e834.webapps.tcloudbase.com/`。官网结尾版权入口已指向这里；Web 应用域名处于 CloudBase 现有安全域名范围，可正常进行账号密码登录和云函数调用。
- 后台页面源文件变化后，必须额外执行 `powershell -ExecutionPolicy Bypass -File tools/deploy-admin-cloudbase.ps1`。该脚本只生成已忽略的 `work/cloudbase-admin/` 临时目录，不会读取或写入 GitHub 令牌。临时目录包含无第三方依赖的最小 `package.json` 与 `build-static.cjs`，先在本机将 5 个后台静态文件确定性复制到 `dist/`，再用 `tcb hosting deploy` 直接上传。2026-07-30 的 CloudBase Web 应用云构建连续生成失败版本 `004–007` 且不返回失败原因，但同一静态托管根路径可正常更新正式 `webapps.tcloudbase.com` 域名，因此日常后台更新固定使用本脚本，不再等待云端构建。
- `tools/verify-site.py --url https://plutonoc.cn/` 同时检查 Pages 中的后台副本和 CloudBase 正式后台，包括 HTML、CSS、脚本、CloudBase 配置、SDK、图片、视频与封面。正式后台任一关键资源不可访问时，部署检查与六小时巡检都会失败。
- 管理后台仍以 CloudBase 账号密码登录作为第一层身份验证，但不再查询受体验版安全域名限制的 `videos` 数据库集合。体验版拒绝把 `plutonoc.cn` 加入安全域名，旧静态托管域名还会显示腾讯风险提醒，因此正式后台作为 CloudBase Web 应用部署在 `https://plutonoc-studio-activity-book-web-d7djhe7bb1e834.webapps.tcloudbase.com/`；官网结尾版权入口必须指向该地址，不能改回同域 `/admin.html`。
- 后台已升级为纯 CloudBase 账号密码登录。登录后浏览器通过 Web SDK 调用 `plutonoc-content-publisher` 云函数，不再显示 GitHub 令牌输入框，也不在 `sessionStorage`、本地存储或前端代码中保存仓库凭据。
- 云函数使用 CloudBase 调用上下文读取当前用户 UID，并在函数内只允许既有唯一管理员 UID。GitHub 细粒度令牌保存在云函数的 `plutonoc_github_token` 环境变量中，只授权 `plutonoc633-lgtm/plutonoc-astronomy` 且 Repository permissions 仅为 `Contents: Read and write`。真实令牌不得写入仓库、配置文件、URL、日志或交接文档。
- 规范内容位于 `content/gallery.json` 与 `content/videos.json`。`gallery-data.js`、`video-data.js` 是确定性生成的前台运行时文件；本地修改规范数据后必须执行：

```powershell
node tools/build-content.mjs
node tools/build-content.mjs --check
```

- 摄影后台初次迁移 116 张作品；当前加入“云闪”后为 117 张。原分类、顺序、路径与每类唯一精选均保留。支持新增、编辑详情、替换、排序、精选、隐藏、恢复和永久删除；详情字段为 `date / location / equipment / parameters / process / story / notes`。
- 新照片生成最长边 3000px 的高质量 WebP 展示图、最长边 1600px 的 Canvas 预览图和最长边 640px 的目录缩略图，原片不进入 Git。上传路径带 SHA-256 内容哈希；精选变化时同步生成新的 2560px 分类首页封面。
- 永久删除从当前 Git 树移除记录及不再引用的图片；如果旧素材仍被结尾背景、HTML、CSS、脚本或视频清单引用，则保留素材文件但删除摄影记录。Git 历史仍可用于恢复。
- 视频后台改为维护 `content/videos.json`：支持标题、分类、简介、日期、地点、排序、状态、公开 MP4 地址和 1920×1080 WebP 封面。大型视频不进入 Git；先在 CloudBase 静态托管控制台上传，再把公开 MP4 地址填入后台。
- 每次后台发布都会由云函数确认远端 `main` 仍是编辑时读取的提交，再通过 GitHub Git Data API 创建 blob、tree、commit 并以 `force: false` 更新分支。资料、衍生图片、运行时清单和 HTML 缓存版本在同一个提交中生效；远端冲突时拒绝覆盖并保留表单。图片先逐个创建 Git blob，最终树与内容清单仍只在一次原子提交中生效。
- 发布后后台轮询线上 `index.html` 的内容缓存版本，显示“部署中 / 已上线”。Pages 工作流新增 `node tools/build-content.mjs --check`，`tools/verify-site.py` 会验证规范数据与运行时清单数量一致、每类精选唯一、后台 Git 发布标记和不再调用 CloudBase 集合。初次迁移基线为 116 张摄影作品和 3 条视频，后续内容增删不应被固定数量阻断。
- 当前后台 CSS 与脚本缓存版本均为 `20260730-content-publish-fix-1`。云函数源码位于 `cloudfunctions/plutonoc-content-publisher/`，部署配置为 `cloudbaserc.json`；配置只提交 `{{env.PLUTONOC_GITHUB_TOKEN}}` 占位符。前台视觉结构、摄影 Canvas 按需加载、视频播放数据字段和 CloudBase 三个既有视频文件均未改变。

服务器凭据更新命令不得直接把令牌写进命令行。应在当前 PowerShell 进程中私下设置 `PLUTONOC_GITHUB_TOKEN`，然后执行：

```powershell
npx --yes --package @cloudbase/cli@3.6.3 tcb config update fn plutonoc-content-publisher -e activity-book-web-d7djhe7bb1e834
```

选择合并环境变量，完成后立即清除当前进程变量。日常只更新函数代码时优先使用 `tcb fn code update`，避免无意覆盖服务器环境变量。

## 21. 2026-07-30 “云闪”发布故障与修复

- 后台提交 `ba76984d3863755fd31a3fafd3e07d210e852114` 已正确保存“云闪”的资料以及 3000px 展示图、1600px 预览图，但当次 Pages 工作流在 `node tools/build-content.mjs --check` 失败，因此官网仍停留在旧版。照片没有丢失，也没有回退。
- 根因是云函数与本地构建脚本各自维护了一套运行时生成逻辑：云函数生成的 `gallery-data.js` 包含 `sortOrder`，本地检查生成器却遗漏该字段。现在唯一实现位于 `cloudfunctions/plutonoc-content-publisher/content-runtime.js`，云函数与 `tools/build-content.mjs` 共同调用；摄影发布不再无意义重写视频规范数据或视频运行时文件。
- 后台发布状态改为检查 `https://plutonoc.cn/` 的实际内容缓存版本，并匿名读取对应提交的公开 GitHub Pages 检查结果。状态含义：
  - “正在部署到网站”：Pages 检查仍在排队或运行。
  - “Pages 已构建，等待官网缓存刷新”：构建成功，但自定义域名尚未返回新缓存版本。
  - “Pages 已部署，内容已上线”：官网已返回本次摄影或视频缓存版本。
  - “Pages 部署失败，网站尚未更新”：Pages 工作流失败，可通过状态栏详情链接查看公开 Actions 记录。
  - “部署超时，网站尚未确认更新”：180 秒内未确认官网版本，不能视为已上线。
- 六小时巡检现在精确比较仓库 `main` 与官网的摄影/视频缓存版本、已发布数量和全部 ID，并检查后台上传的 WebP 展示图与预览图。以后若 `main` 已有新内容但 Pages 仍是旧版，巡检必须失败并按既有规则创建或更新故障 Issue。
- 当前规范数据与运行时均为 117 张。“云闪”ID 为 `earth-mrz1z0j9-d7321a`，分类“大地”，排序 61，状态 `published`。两张衍生图片继续使用内容哈希路径；本次修复不改摄影视觉、Canvas 清晰度、CloudBase 登录或视频内容。

## 22. 2026-07-30 摄影目录、浏览进度与后台 UTF-8 修复

- 摄影 Canvas 继续作为默认视觉入口，工具栏新增“目录 / 未看 / 继续浏览 / 已看数量”。目录仅在用户打开时生成，使用现有 `previewSrc`、视口观察和手机 4 / 桌面 6 张并发加载，不增加首页摄影请求。
- 目录支持按标题、分类、地点、设备和参数搜索，支持五类摄影筛选及“全部 / 未看 / 已看”。点击结果会把 Canvas 切到可包含该作品的分类、定位真实作品并打开灯箱；“继续浏览”打开排序最靠前的未看作品。
- 作品只有在灯箱实际显示后才记为已看。记录键为 `plutonoc.gallery.seen.v1`，仅保存作品 ID 到当前浏览器 `localStorage`；无效或已删除 ID 会自动丢弃，目录底部可二次确认后清空记录。该记录不上传、不与管理员账号同步。
- Canvas 每次绘制后以画面中心最近的渲染项同步真实作品索引，重复平铺的视觉副本仍映射到同一个作品，不重复计数。灯箱新增“返回目录”。
- 灯箱前后按钮已移入 `.photo-stage`，桌面与手机均以图片区域为定位边界。右侧资料栏不再参与按钮位置估算，也不会被“下一张”遮挡。
- CloudBase 后台乱码根因是 Windows PowerShell 使用默认编码读取 UTF-8 `admin.html` 后再写回 UTF-8，导致中文和结束标签损坏。`tools/deploy-admin-cloudbase.ps1` 现改为逐字节复制 HTML，并在本地构建和上传前校验 UTF-8、中文关键字、乱码特征、裸露结束标签及源文件/暂存文件 SHA-256 一致性。
- 后台删除 `PHOTOGRAPHY / FILMS` 装饰眉题，保留全中文内容管理界面和必要的 JPEG、WebP、MP4、CloudBase 技术说明。公开 CSS / JS 缓存版本为 `20260730-gallery-index-1`，后台 CSS / JS 版本为 `20260730-utf8-admin-1`。
- `tools/verify-site.py` 会阻止摄影目录、已看存储、4/6目录图片并发、灯箱舞台按钮、后台字节复制验证、乱码扫描或新缓存版本缺失。后台页面更新后仍必须额外运行：

```powershell
powershell -ExecutionPolicy Bypass -File tools/deploy-admin-cloudbase.ps1
```

## 23. 2026-07-30 摄影轻量缩略图、永久链接与手机筛选

- `content/gallery.json` 与 `gallery-data.js` 正式增加 `thumbnailSrc`。现有 117 张目录缩略图位于 `assets/gallery/thumbnails/`，最长边 640px、WebP 品质 76，总计约 2.71MB；旧 1600px `previewSrc` 合计约 22.26MB，继续只用于 Canvas，不再作为目录卡片资源。
- 本地批量生成及检查命令为：

```powershell
python tools/build-gallery-thumbnails.py
python tools/build-gallery-thumbnails.py --check
node tools/build-content.mjs
```

- 管理后台新增或替换照片时会原地生成展示图、Canvas 预览图和目录缩略图三档资源。上传缩略图路径为 `assets/gallery/thumbnails/uploads/<分类>/...webp`；替换和永久删除会与另外两档图片一起清理不再引用的 CMS 资源。云函数路径白名单、共享运行时生成器和本地检查必须同时保留 `thumbnailSrc`。
- 目录使用 `thumbnailSrc || previewSrc || src` 回退链，兼容尚未迁移的数据。手机和桌面仍分别限制同时加载 4 / 6 张；首页未打开目录时不会请求缩略图。
- 单张作品地址为 `https://plutonoc.cn/?photo=<作品ID>#works`。带合法 `photo` 参数的直接访问和刷新会初始化摄影 Canvas、定位作品并打开灯箱；普通栏目 hash 刷新回首页规则不变。灯箱切换作品会替换当前 URL，前进/后退可以恢复或关闭灯箱，无效 ID 会清理参数并停留在摄影区。
- 灯箱资料栏新增“复制链接”。优先使用 Clipboard API，失败时回退传统复制，再失败才显示可手动复制的浏览器提示；不得把作品链接写入站点日志或浏览记录以外的持久存储。
- 760px 以下目录使用“分类 / 浏览状态”两个原生下拉框，桌面继续使用按钮。两套控件共享 `galleryDirectoryState`，搜索、已看状态与结果数量保持同步。
- 当前公共 CSS 缓存版本为 `20260730-gallery-links-1`，公共 JS 缓存版本为 `20260730-photo-close-1`，摄影数据版本为 `20260730-thumbnails-1`，后台 CSS / JS 版本为 `20260730-thumbnails-1`。摄影永久链接刷新时不再触发“刷新回首页”；打开灯箱前会保存摄影区的精确滚动位置，关闭后原地恢复。内部打开灯箱前也会将历史基页规范为 `#works`，因此点击关闭、浏览器后退和前进不会把用户意外带回首页。发布函数与后台静态页面都必须在 Pages 推送后同步部署。
