# 搜索摘要修正（2026-10-22）

用户截图中，必应将“键盘方向键切换作品，回车键打开大图。”显示为官网摘要。该文字确实来自首页 `gallery-drag-hint` 中的读屏说明；源码只有简短的站点描述，没有排除操作说明进入搜索摘要。

本次修改仅涉及首页 HTML：

- 给画布操作提示及动态状态所在的 `div` 加上 `data-nosnippet`，避免搜索摘要引用操作提示、错误恢复提示、坐标和浏览状态。
- 将搜索、Open Graph、Twitter 的描述统一为“PlutonoC 的个人摄影网站，收录深空、日月、行星、星野与大地摄影，以及动态影像作品。”品牌标题保持 `PlutonoC`。
- 保留屏幕阅读器说明、`aria-describedby`、键盘操作和现有布局。浏览器可访问性树检查确认说明仍可读取。

内容一致性、关键样式及本地静态检查通过。网站端发布与搜索端更新分开记录：添加标记不能直接改写必应已经展示的旧摘要，也不能保证必应逐字采用 meta description。需要必应重新抓取后再核对搜索结果；本次未登录站长平台、未提交移除请求或新建索引提交服务。

依据：[必应 data-nosnippet 说明](https://blogs.bing.com/webmaster/2025/10/Bing-Introduces-Support-for-the-data-nosnippet-HTML-Attribute/)。

发布核对：提交 `67a1a215129f28ae61b82d32f16a2039f41087fa` 的 [Pages 检查、部署及线上校验](https://github.com/plutonoc633-lgtm/plutonoc-astronomy/actions/runs/39774841721)成功。官网首页逐字节匹配该提交；官网浏览器检查确认三份描述一致、两处摘要排除标记存在、可访问性树仍包含完整键盘说明。必应搜索结果是否已替换旧摘要尚未确认，不将网站端发布等同于搜索端更新。
