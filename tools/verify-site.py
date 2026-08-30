"""Verify PlutonoC static assets locally or after a Pages deployment."""

from __future__ import annotations

import argparse
import json
import re
import struct
import sys
import time
from pathlib import Path
from urllib.parse import urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen


STYLE_CACHE_VERSION = "20260830-weak-network-1"
ADMIN_STYLE_CACHE_VERSION = "20260830-responsive-1"
ADMIN_SCRIPT_CACHE_VERSION = "20260830-responsive-1"
SCRIPT_CACHE_VERSION = "20260830-weak-network-1"
CLOUDBASE_CACHE_VERSION = "20260720-cloudbase-1"
CLOUDBASE_SDK_URL = "https://static.cloudbase.net/cloudbase-js-sdk/2.24.0/cloudbase.full.js"
CLOUDBASE_ADMIN_URL = "https://plutonoc-studio-activity-book-web-d7djhe7bb1e834.webapps.tcloudbase.com/"
PROJECT_ROOT = Path(__file__).resolve().parents[1]
REQUIRED_ASSETS = {
    "assets/branding/plutonoc-watermark-web.png": 100_000,
    "assets/branding/plutonoc-watermark-header.webp": 20_000,
    "assets/branding/per-aspera-ad-astra-handwritten-web.webp": 40_000,
    "assets/branding/plutonoc-share.jpg": 400_000,
    "assets/branding/favicon-32.png": 20_000,
    "assets/branding/apple-touch-icon.png": 100_000,
    "assets/branding/avatar-bilibili.webp": 100_000,
    "assets/branding/avatar-douyin.webp": 100_000,
    "assets/branding/avatar-xiaohongshu.webp": 100_000,
    "favicon.ico": 100_000,
    "assets/gallery/previews/earth/earth-007.webp": 400_000,
    "assets/gallery/hero/earth.webp": 700_000,
    "assets/gallery/hero/earth-mobile.webp": 160_000,
    "assets/gallery/hero/deepsky-mobile.webp": 160_000,
    "assets/gallery/hero/sunmoon-mobile.webp": 160_000,
    "assets/gallery/hero/planet-mobile.webp": 160_000,
    "assets/gallery/hero/nightscape-mobile.webp": 160_000,
    "assets/equipment-web.webp": 150_000,
    "assets/equipment/responsive/equipment-720.webp": 80_000,
    "assets/equipment/responsive/equipment-1280.webp": 140_000,
}
REMOTE_TYPES = {
    "assets/branding/plutonoc-watermark-web.png": "image/png",
    "assets/branding/plutonoc-watermark-header.webp": "image/webp",
    "assets/branding/per-aspera-ad-astra-handwritten-web.webp": "image/webp",
    "assets/branding/plutonoc-share.jpg": "image/jpeg",
    "assets/branding/favicon-32.png": "image/png",
    "assets/branding/apple-touch-icon.png": "image/png",
    "assets/branding/avatar-bilibili.webp": "image/webp",
    "assets/branding/avatar-douyin.webp": "image/webp",
    "assets/branding/avatar-xiaohongshu.webp": "image/webp",
    "assets/gallery/previews/earth/earth-007.webp": "image/webp",
    "assets/gallery/hero/earth.webp": "image/webp",
    "assets/gallery/hero/earth-mobile.webp": "image/webp",
    "assets/gallery/hero/deepsky-mobile.webp": "image/webp",
    "assets/gallery/hero/sunmoon-mobile.webp": "image/webp",
    "assets/gallery/hero/planet-mobile.webp": "image/webp",
    "assets/gallery/hero/nightscape-mobile.webp": "image/webp",
    "assets/equipment-web.webp": "image/webp",
    "assets/equipment/responsive/equipment-720.webp": "image/webp",
    "assets/equipment/responsive/equipment-1280.webp": "image/webp",
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()[:24]
    require(data[:8] == b"\x89PNG\r\n\x1a\n", f"Not a PNG: {path}")
    return struct.unpack(">II", data[16:24])


def jpeg_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    require(data[:2] == b"\xff\xd8", f"Not a JPEG: {path}")
    offset = 2
    sof = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
    while offset + 9 < len(data):
        if data[offset] != 0xFF:
            offset += 1
            continue
        marker = data[offset + 1]
        offset += 2
        if marker in {0xD8, 0xD9}:
            continue
        length = struct.unpack(">H", data[offset:offset + 2])[0]
        if marker in sof:
            height, width = struct.unpack(">HH", data[offset + 3:offset + 7])
            return width, height
        offset += length
    raise AssertionError(f"JPEG dimensions not found: {path}")


def verify_local(root: Path) -> None:
    index = (root / "index.html").read_text(encoding="utf-8")
    style = (root / "style.css").read_text(encoding="utf-8")
    admin = (root / "admin.html").read_text(encoding="utf-8")
    admin_style = (root / "admin.css").read_text(encoding="utf-8")
    admin_script = (root / "admin.js").read_text(encoding="utf-8")
    publisher_script = (root / "cloudfunctions/plutonoc-content-publisher/index.js").read_text(encoding="utf-8")
    runtime_generator = (root / "cloudfunctions/plutonoc-content-publisher/content-runtime.js").read_text(encoding="utf-8")
    build_script = (root / "tools/build-content.mjs").read_text(encoding="utf-8")
    cloudbase_rc = json.loads((root / "cloudbaserc.json").read_text(encoding="utf-8"))
    admin_deploy_script = (root / "tools/deploy-admin-cloudbase.ps1").read_text(encoding="utf-8")
    video_data = (root / "video-data.js").read_text(encoding="utf-8")
    gallery_data = (root / "gallery-data.js").read_text(encoding="utf-8")
    gallery_content = json.loads((root / "content/gallery.json").read_text(encoding="utf-8"))
    video_content = json.loads((root / "content/videos.json").read_text(encoding="utf-8"))
    script = (root / "script.js").read_text(encoding="utf-8")
    critical = (root / "critical.css").read_text(encoding="utf-8").strip()
    monitor_workflow = (root / ".github/workflows/monitor-production.yml").read_text(encoding="utf-8")
    device_qa = (root / "REAL_DEVICE_QA.md").read_text(encoding="utf-8")

    required_html = (
        '<link rel="canonical" href="https://plutonoc.cn/">',
        'property="og:image" content="https://plutonoc.cn/assets/branding/plutonoc-share.jpg"',
        'name="twitter:card" content="summary_large_image"',
        'href="assets/branding/favicon-32.png"',
        f'style.css?v={STYLE_CACHE_VERSION}',
        f'script.js?v={SCRIPT_CACHE_VERSION}',
        'href="assets/gallery/hero/earth-mobile.webp" as="image" type="image/webp" media="(max-width: 767px)"',
        'href="assets/gallery/hero/earth.webp" as="image" type="image/webp" media="(min-width: 768px)"',
        'href="assets/branding/per-aspera-ad-astra-handwritten-web.webp" as="image" type="image/webp" fetchpriority="high"',
        '<picture data-home-picture="profile-earth">',
        '<source data-home-mobile media="(max-width: 767px)" srcset="assets/gallery/hero/earth-mobile.webp" type="image/webp">',
        '<img data-home-desktop src="assets/gallery/hero/earth.webp"',
        '<picture data-home-picture="card-deepsky">',
        '<picture data-home-picture="card-sunmoon">',
        '<picture data-home-picture="card-planet">',
        '<picture data-home-picture="card-nightscape">',
        '<picture data-home-picture="card-earth">',
        'data-deferred-src="assets/equipment/responsive/equipment-1280.webp"',
        'class="brand" href="#home" data-transition-link aria-label="PlutonoC，返回首页"><img src="assets/branding/plutonoc-watermark-header.webp" width="256" height="70"',
        'data-deferred-poster="assets/video-posters/previews/local-jupiter-observation.webp"',
        'class="arrival-hero"',
        'class="arrival-outro"',
        'class="arrival-footer"',
        f'<a class="footer-admin-entry" href="{CLOUDBASE_ADMIN_URL}">© 2026 PLUTONOC</a>',
        'data-deferred-src="assets/branding/avatar-bilibili.webp" width="256" height="256"',
        'data-deferred-src="assets/branding/avatar-douyin.webp" width="256" height="256"',
        'data-deferred-src="assets/branding/avatar-xiaohongshu.webp" width="256" height="256"',
        'href="https://www.xiaohongshu.com/user/profile/60e62ebb0000000001007f48"',
        'class="gallery-directory" data-gallery-directory',
        'data-gallery-unseen',
        'data-gallery-continue',
        'data-gallery-seen-count',
        'data-gallery-directory-return',
        'data-directory-category-select',
        'data-directory-status-select',
        'data-photo-copy-link',
    )
    for token in required_html:
        require(token in index, f"Missing index marker: {token}")
    critical_match = re.search(r'<style data-critical-css>\s*([\s\S]*?)\s*</style>', index)
    require(critical_match is not None and critical_match.group(1).strip() == critical, "Inline critical CSS is stale")
    require(
        f'<link rel="preload" href="style.css?v={STYLE_CACHE_VERSION}" as="style">' in index
        and f'<link rel="stylesheet" href="style.css?v={STYLE_CACHE_VERSION}" media="print" onload="this.media=\'all\'">' in index,
        "Full stylesheet is not loaded asynchronously",
    )
    for token in ("官方账号", "FOLLOW PLUTONOC", "social-index", "account-heading"):
        require(token not in index, f"Obsolete account decoration remains: {token}")
    for token in ('class="header-actions"', 'class="admin-entry"', '>管理</a>'):
        require(token not in index, f"Visible admin entry remains: {token}")
    require('class="arrival-footer reveal"' not in index, "Footer must not be hidden by the reveal observer")
    require("assets/gallery/earth/earth-007.jpg" not in index, "Homepage still references the 12 MB Everest original")
    require("assets/equipment.jpg" not in index, "Public page still references the large equipment JPEG")
    require(CLOUDBASE_SDK_URL not in index, "Static-manifest homepage still loads the CloudBase SDK")
    require(f'admin.css?v={ADMIN_STYLE_CACHE_VERSION}' in admin, "Admin page has an old cache version")
    for token in (
        "PRIVATE FILM STUDIO",
        "CONFIGURATION REQUIRED",
        "OWNER ACCESS",
        "私人影像管理",
        "VIDEO PUBLISHER",
        "PHOTOGRAPHY",
        "FILMS",
    ):
        require(token not in admin, f"Obsolete admin annotation remains: {token}")
    for token in ("锟斤拷", "鎽勫奖", "鍔ㄦ", "姝ｅ湪", "鏂板", "绔欏"):
        require(token not in admin, f"Admin mojibake remains: {token}")
    require(not re.search(r"(?<!<)/(button|small|figcaption)>", admin), "Admin contains closing-tag text leakage")
    for token in (
        '<section class="login-panel" data-login hidden>',
        "<h1>登录</h1>",
        'name="username"',
        'name="password"',
        'data-dashboard hidden',
        'data-studio-tab="photos"',
        'data-studio-tab="videos"',
        'data-photo-form',
        'name="existingThumbnailSrc"',
        'name="existingPosterPreviewUrl"',
        'data-video-form',
        'data-publisher',
        'data-photo-draft-notice',
        'data-video-draft-notice',
    ):
        require(token in admin, f"Missing essential admin marker: {token}")
    require(f'admin.js?v={ADMIN_SCRIPT_CACHE_VERSION}' in admin, "Admin script has an old cache version")
    require("data-github-form" not in admin, "Admin still asks the user for a GitHub token")
    require("sessionStorage" not in admin_script, "Admin still stores a GitHub credential in the browser")
    require("https://plutonoc.cn/" in admin_script, "Admin deployment polling does not target the public site")
    require("api.github.com/repos/${githubRepository}/commits/" in admin_script, "Admin Pages status lookup is missing")
    require("check-runs" in admin_script and "check.name === 'deploy'" in admin_script, "Admin does not inspect the Pages check")
    require("Authorization" not in admin_script and "github_pat_" not in admin_script, "Admin must not send a GitHub credential")
    for marker in (
        "plutonoc.studio.draft.v1.photo",
        "plutonoc.studio.draft.v1.video",
        "localStorage",
        "baseHeadSha",
        "beforeunload",
        "恢复草稿",
        "草稿中的图片需重新选择",
        "草稿中的封面需重新选择",
    ):
        require(marker in admin + admin_script, f"Admin draft protection is missing: {marker}")
    require("sessionStorage" not in admin_script, "Admin draft protection must not use session credential storage")
    require("Pages 部署失败，网站尚未更新" in admin_script, "Admin does not report failed Pages deployments")
    require("部署超时，网站尚未确认更新" in admin_script, "Admin deployment timeout is misleading")
    require("app.callFunction" in admin_script and "plutonoc-content-publisher" in admin_script, "Admin server publisher bridge is missing")
    require(".collection(" not in admin_script, "Admin still queries the blocked CloudBase database")
    require("/git/trees" in publisher_script and "force: false" in publisher_script, "Server atomic Git publishing is missing")
    require("app.auth.getUserInfo()" in publisher_script and "administratorUid" in publisher_script, "Publisher administrator check is missing")
    require("process.env.plutonoc_github_token" in publisher_script, "Publisher secret environment variable is missing")
    require("require('./content-runtime')" in publisher_script, "Publisher does not use the shared content generator")
    require(
        "content-runtime.js" in build_script and "galleryRuntime" in build_script and "videoRuntime" in build_script,
        "Local checks do not use the shared content generator",
    )
    require("sortOrder: Number(item.sortOrder) || 0" in runtime_generator, "Shared gallery runtime omits sortOrder")
    require("posterPreviewUrl: item.posterPreviewUrl || item.posterUrl" in runtime_generator, "Shared video runtime omits posterPreviewUrl")
    require("config?.homeMobileCover || featured?.previewSrc" in runtime_generator, "Homepage mobile cover fallback is missing")
    require("applyHomepageImages" in runtime_generator, "Shared homepage image generator is missing")
    require(
        "applyHomepageImages(nextIndex, gallery)" in publisher_script,
        "Publisher does not synchronize featured homepage images",
    )
    require(
        "applyHomepageImages(index, gallery) !== index" in build_script,
        "Local checks do not validate featured homepage images",
    )
    require(
        "['content/gallery.json'" in publisher_script and "['content/videos.json'" in publisher_script,
        "Publisher does not scope content files by content type",
    )
    publisher_config = next(
        item for item in cloudbase_rc.get("functions", []) if item.get("name") == "plutonoc-content-publisher"
    )
    require(
        publisher_config.get("envVariables", {}).get("plutonoc_github_token") == "{{env.PLUTONOC_GITHUB_TOKEN}}",
        "Publisher token must remain an environment placeholder",
    )
    require(
        '"name": "plutonoc-studio-static"' in admin_deploy_script
        and '"build": "node build-static.cjs"' in admin_deploy_script
        and "node build-static.cjs" in admin_deploy_script
        and "Copy-Item -LiteralPath $adminSource" in admin_deploy_script
        and "Assert-SameFile" in admin_deploy_script
        and "Test-AdminHtml" in admin_deploy_script
        and "Get-Content -LiteralPath (Join-Path $projectRoot \"admin.html\")" not in admin_deploy_script
        and "tcb hosting deploy" in admin_deploy_script
        and "--retry-count 5" in admin_deploy_script,
        "CloudBase static admin deployment must preserve UTF-8 bytes, verify dist and upload directly",
    )
    require(
        all(marker in admin_script for marker in ("3000", "1600", "1280", "960", "640", "thumbnailBlob", "thumbnailSrc", "posterPreviewUrl", "homeMobileCover")),
        "Admin photo derivatives are not configured",
    )
    runtime_sources = index + style + admin + admin_style
    for obsolete in (
        "source-han-serif-cn-vf.woff2",
        "source-han-serif-cn-site.woff2",
        "source-han-sans-cn-medium.woff2",
        "ibm-plex-sans-regular.woff2",
        "ibm-plex-sans-medium.woff2",
        "plutonoc-display.woff2",
        "plutonoc-text-regular.woff2",
        "plutonoc-text-medium.woff2",
        "plutonoc-meta.woff2",
        "@font-face",
    ):
        require(obsolete not in runtime_sources, f"Obsolete runtime font is still referenced: {obsolete}")
    system_stack = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif'
    require(system_stack in style, "Public CSS does not use the approved system-font stack")
    require(system_stack in admin_style, "Admin CSS does not use the approved system-font stack")
    require("font-synthesis: none" in style + admin_style, "Synthetic font styling has not been disabled")
    require(gallery_content.get("items"), "Canonical gallery must contain at least one photo")
    require(video_content.get("items"), "Canonical video archive must contain at least one video")
    featured = [item for item in gallery_content["items"] if item.get("featured") and item.get("status") == "published"]
    require(len(featured) == len(gallery_content.get("categoryConfig", {})), "Canonical gallery must retain one featured photo per category")
    for category, config in gallery_content["categoryConfig"].items():
        mobile_cover = config.get("homeMobileCover")
        require(mobile_cover, f"Category is missing homeMobileCover: {category}")
        mobile_path = root / mobile_cover
        require(mobile_path.is_file(), f"Category mobile cover is missing: {mobile_cover}")
        require(mobile_path.stat().st_size <= 160_000, f"Category mobile cover is too large: {mobile_cover}")
    for item in video_content["items"]:
        preview = item.get("posterPreviewUrl")
        require(preview, f"Video is missing posterPreviewUrl: {item.get('id')}")
        if not preview.startswith(("http://", "https://")):
            preview_path = root / preview
            require(preview_path.is_file(), f"Video preview poster is missing: {preview}")
            require(preview_path.stat().st_size <= 180_000, f"Video preview poster is too large: {preview}")
    thumbnail_total = 0
    for item in gallery_content["items"]:
        thumbnail = item.get("thumbnailSrc")
        require(thumbnail, f"Gallery item is missing thumbnailSrc: {item.get('id')}")
        thumbnail_path = root / thumbnail
        require(thumbnail_path.is_file(), f"Gallery thumbnail is missing: {thumbnail}")
        require(thumbnail_path.read_bytes()[:4] == b"RIFF", f"Gallery thumbnail is not WebP: {thumbnail}")
        require(thumbnail_path.stat().st_size <= 150_000, f"Gallery thumbnail is too large: {thumbnail}")
        thumbnail_total += thumbnail_path.stat().st_size
    require(thumbnail_total <= 8_000_000, "Gallery thumbnails exceed the total size budget")
    require(gallery_data.startswith("window.categoryConfig="), "Generated gallery runtime is invalid")
    require(video_data.startswith("window.localVideoData="), "Generated video runtime is invalid")
    gallery_runtime_match = re.search(r"window\.galleryData=(\[.*\]);\s*$", gallery_data, re.S)
    video_runtime_match = re.search(r"window\.localVideoData=(\[.*\]);\s*$", video_data, re.S)
    require(gallery_runtime_match is not None, "Generated gallery runtime payload is missing")
    require(video_runtime_match is not None, "Generated video runtime payload is missing")
    gallery_runtime_items = json.loads(gallery_runtime_match.group(1))
    video_runtime_items = json.loads(video_runtime_match.group(1))
    require(
        all(isinstance(item.get("sortOrder"), (int, float)) for item in gallery_runtime_items),
        "Gallery runtime is missing numeric sortOrder values",
    )
    require(
        all(item.get("thumbnailSrc") for item in gallery_runtime_items),
        "Gallery runtime is missing thumbnailSrc values",
    )
    require(
        len(gallery_runtime_items) == sum(item.get("status") == "published" for item in gallery_content["items"]),
        "Gallery runtime does not match published canonical records",
    )
    require(
        len(video_runtime_items) == sum(item.get("status") == "published" for item in video_content["items"]),
        "Video runtime does not match published canonical records",
    )
    require(re.search(r'gallery-data\.js\?v=[A-Za-z0-9._-]+', index), "Gallery cache version is missing")
    require(re.search(r'video-data\.js\?v=[A-Za-z0-9._-]+', index), "Video cache version is missing")
    require(
        "searchParams.has('photo')" in index,
        "Photo permalink reloads must bypass the reload-to-home rule",
    )
    for marker in (
        "function ensureArchiveCanvas()",
        "rootMargin: '800px 0px'",
        "new BitmapCache((isMobile ? 96 : 240) * 1024 * 1024, isMobile ? 4 : 6)",
        "window.setInterval(updateTimecode, 100)",
        "layoutMetrics.calibrationRouteLength",
        "threshold: [0, .08, .35]",
        "is-reveal-before",
        "is-reveal-after",
        "plutonoc.gallery.seen.v1",
        "function openGalleryDirectory",
        "function renderGalleryDirectory",
        "syncFocusedFromCenter",
        "directoryImageConcurrency = isMobile ? 4 : 6",
        "work.thumbnailSrc || work.previewSrc || work.src",
        "photoParamName = 'photo'",
        "function openPhotoFromLocation()",
        "photoReturnScrollY",
        "photoUrl('', '#works')",
        "data-photo-copy-link",
        "function ensureCloudBaseSdk()",
        "if (config.staticManifest) return []",
        "rootMargin: '600px 0px'",
        "function hydrateDeferredMedia(element)",
        "function hydrateEquipmentAround()",
        "film.posterPreviewUrl || film.posterUrl",
    ):
        require(marker in script, f"Missing performance marker: {marker}")
    for marker in (
        ".reveal.is-reveal-before",
        ".film-list.reveal.is-visible .film-card",
        ".archive-list.reveal.is-visible .archive-row",
        ".equipment-media.reveal.is-visible",
        ".footer-admin-entry",
        ".gallery-directory-grid",
        ".gallery-directory-card",
        ".photo-information-nav",
        ".gallery-directory-mobile-filters",
        ".timecode { display: none; }",
    ):
        require(marker in style, f"Missing scroll reveal marker: {marker}")
    require("if (canvasElement) archiveCanvas = new InfiniteArchiveCanvas" not in script, "Archive Canvas still initializes on the homepage")
    for marker in (
        'cron: "17 */6 * * *"',
        "workflow_dispatch:",
        "issues: write",
        "python tools/verify-site.py --url https://plutonoc.cn/",
        "[monitor] PlutonoC production availability failure",
        "gh issue edit",
        "gh issue close",
    ):
        require(marker in monitor_workflow, f"Missing production monitor marker: {marker}")
    for environment in ("iPhone Safari", "iPhone 微信内置浏览器", "Android Chrome", "Android 微信内置浏览器"):
        require(environment in device_qa, f"Missing real-device QA environment: {environment}")
    require("Sentry" not in index + script + monitor_workflow, "Visitor error collection must remain disabled")

    for relative, maximum in REQUIRED_ASSETS.items():
        path = root / relative
        require(path.is_file(), f"Missing required asset: {relative}")
        require(path.stat().st_size <= maximum, f"Asset exceeds size limit: {relative} ({path.stat().st_size} > {maximum})")

    require(jpeg_size(root / "assets/branding/plutonoc-share.jpg") == (1200, 630), "Share card must be 1200x630")
    require(png_size(root / "assets/branding/favicon-32.png") == (32, 32), "PNG favicon must be 32x32")
    require(png_size(root / "assets/branding/apple-touch-icon.png") == (180, 180), "Apple icon must be 180x180")

    mobile_initial_files = (
        "index.html",
        "style.css",
        "script.js",
        "gallery-data.js",
        "video-data.js",
        "assets/gallery/hero/earth-mobile.webp",
        "assets/gallery/hero/deepsky-mobile.webp",
        "assets/gallery/hero/sunmoon-mobile.webp",
        "assets/gallery/hero/planet-mobile.webp",
        "assets/gallery/hero/nightscape-mobile.webp",
        "assets/branding/per-aspera-ad-astra-handwritten-web.webp",
        "assets/branding/plutonoc-watermark-header.webp",
    )
    initial_owned = sum((root / relative).stat().st_size for relative in mobile_initial_files)
    require(initial_owned <= 900_000, f"Mobile first-view transfer source budget exceeded: {initial_owned} bytes")

    referenced = set(re.findall(r'(?:src|href|poster|data-preview|data-deferred-src|data-deferred-poster|data-deferred-srcset)="([^"#]+)"', index))
    for reference in sorted(referenced):
        if reference.startswith(("http://", "https://", "mailto:", "javascript:")):
            continue
        clean = reference.split("?", 1)[0]
        require((root / clean).is_file(), f"Referenced local file is missing: {clean}")

    print(f"Local site verification passed; runtime web fonts: 0 bytes; owned first-view budget: {initial_owned} bytes")


def cache_bust(url: str) -> str:
    parts = urlsplit(url)
    query = urlencode({"verify": int(time.time())})
    return urlunsplit((parts.scheme, parts.netloc, parts.path, query, parts.fragment))


def fetch(url: str) -> tuple[bytes, str]:
    request = Request(cache_bust(url), headers={"Cache-Control": "no-cache", "User-Agent": "PlutonoC deploy verifier"})
    with urlopen(request, timeout=20) as response:
        return response.read(), response.headers.get_content_type()


def fetch_prefix(url: str, byte_count: int = 1024) -> tuple[bytes, str, int]:
    request = Request(
        cache_bust(url),
        headers={
            "Cache-Control": "no-cache",
            "Range": f"bytes=0-{byte_count - 1}",
            "User-Agent": "PlutonoC availability monitor",
        },
    )
    with urlopen(request, timeout=20) as response:
        return response.read(byte_count), response.headers.get_content_type(), response.status


def verify_remote_admin(url: str, label: str) -> None:
    admin_bytes, admin_type = fetch(url)
    admin = admin_bytes.decode("utf-8")
    require(admin_type == "text/html", f"Unexpected {label} type: {admin_type}")
    require(f"admin.css?v={ADMIN_STYLE_CACHE_VERSION}" in admin, f"{label} has an old CSS version")
    require(
        f"cloudbase-config.js?v={CLOUDBASE_CACHE_VERSION}" in admin,
        f"{label} has an old CloudBase config version",
    )
    require(f"admin.js?v={ADMIN_SCRIPT_CACHE_VERSION}" in admin, f"{label} has an old script version")
    require(CLOUDBASE_SDK_URL in admin, f"{label} CloudBase SDK reference is missing")
    require(
        all(token not in admin for token in ("OWNER ACCESS", "VIDEO PUBLISHER", "PHOTOGRAPHY", "FILMS")),
        f"{label} contains obsolete annotations",
    )
    require(
        all(token not in admin for token in ("锟斤拷", "鎽勫奖", "鍔ㄦ", "姝ｅ湪", "鏂板", "绔欏")),
        f"{label} contains mojibake",
    )
    require(not re.search(r"(?<!<)/(button|small|figcaption)>", admin), f"{label} contains closing-tag text leakage")
    require(all(token in admin for token in ("摄影作品", "动态影像", "新增作品", "保存并发布")), f"{label} Chinese UI is incomplete")
    require('data-photo-form' in admin and 'data-publisher' in admin, f"{label} photo studio is missing")
    require('data-github-form' not in admin, f"{label} still asks for a GitHub token")

    for asset in ("admin.css", "admin.js", "cloudbase-config.js"):
        body, actual_type = fetch(urljoin(url, asset))
        require(body, f"Empty {label} asset: {asset}")
        if asset.endswith(".css"):
            require(actual_type == "text/css", f"Unexpected {label} asset type for {asset}: {actual_type}")
        else:
            require(
                actual_type in {"application/javascript", "text/javascript"},
                f"Unexpected {label} asset type for {asset}: {actual_type}",
            )


def verify_remote(base_url: str) -> None:
    base = base_url.rstrip("/") + "/"
    require(urlsplit(base).scheme == "https", f"Remote verification requires HTTPS: {base}")
    local_index = (PROJECT_ROOT / "index.html").read_text(encoding="utf-8")
    local_gallery = json.loads((PROJECT_ROOT / "content/gallery.json").read_text(encoding="utf-8"))
    local_videos = json.loads((PROJECT_ROOT / "content/videos.json").read_text(encoding="utf-8"))
    expected_gallery_reference_match = re.search(r'gallery-data\.js\?v=[A-Za-z0-9._-]+', local_index)
    expected_video_reference_match = re.search(r'video-data\.js\?v=[A-Za-z0-9._-]+', local_index)
    require(expected_gallery_reference_match is not None, "Repository gallery cache version is missing")
    require(expected_video_reference_match is not None, "Repository video cache version is missing")
    expected_gallery_reference = expected_gallery_reference_match.group(0)
    expected_video_reference = expected_video_reference_match.group(0)
    expected_gallery_items = [item for item in local_gallery["items"] if item.get("status") == "published"]
    expected_video_items = [item for item in local_videos["items"] if item.get("status") == "published"]
    expected_gallery_ids = {item["id"] for item in expected_gallery_items}
    expected_video_ids = {item["id"] for item in expected_video_items}
    last_error: Exception | None = None
    for attempt in range(12):
        try:
            index_bytes, content_type = fetch(base)
            index = index_bytes.decode("utf-8")
            require(content_type == "text/html", f"Unexpected homepage type: {content_type}")
            require(f"style.css?v={STYLE_CACHE_VERSION}" in index, "Deployed homepage has an old cache version")
            require(expected_gallery_reference in index, "Deployed gallery cache version differs from main")
            require(expected_video_reference in index, "Deployed video cache version differs from main")
            require(f"script.js?v={SCRIPT_CACHE_VERSION}" in index, "Deployed script has an old cache version")
            require("https://plutonoc.cn/assets/branding/plutonoc-share.jpg" in index, "Deployed sharing metadata is missing")
            require(f'<a class="footer-admin-entry" href="{CLOUDBASE_ADMIN_URL}">© 2026 PLUTONOC</a>' in index, "Deployed hidden admin entry is missing")
            require('class="admin-entry"' not in index and ">管理</a>" not in index, "Deployed header still exposes the admin entry")
            require('class="arrival-footer reveal"' not in index, "Deployed footer is still controlled by the reveal observer")
            require(CLOUDBASE_SDK_URL not in index, "Homepage still loads the unused CloudBase SDK")
            for relative, expected_type in REMOTE_TYPES.items():
                body, actual_type = fetch(urljoin(base, relative))
                require(body, f"Empty remote asset: {relative}")
                require(actual_type == expected_type, f"Unexpected type for {relative}: {actual_type}")

            verify_remote_admin(urljoin(base, "admin.html"), "Pages admin page")
            verify_remote_admin(CLOUDBASE_ADMIN_URL, "CloudBase admin page")

            deployed_gallery_bytes, deployed_gallery_type = fetch(urljoin(base, expected_gallery_reference))
            require(
                deployed_gallery_type in {"application/javascript", "text/javascript"},
                f"Unexpected gallery runtime type: {deployed_gallery_type}",
            )
            deployed_gallery_text = deployed_gallery_bytes.decode("utf-8")
            deployed_gallery_match = re.search(r"window\.galleryData=(\[.*\]);\s*$", deployed_gallery_text, re.S)
            require(deployed_gallery_match is not None, "Deployed gallery runtime payload is invalid")
            deployed_gallery = json.loads(deployed_gallery_match.group(1))
            require({item.get("id") for item in deployed_gallery} == expected_gallery_ids, "Deployed gallery IDs differ from main")
            require(len(deployed_gallery) == len(expected_gallery_items), "Deployed gallery count differs from main")
            require(
                all(isinstance(item.get("sortOrder"), (int, float)) for item in deployed_gallery),
                "Deployed gallery runtime is missing sortOrder",
            )

            deployed_video_bytes, deployed_video_type = fetch(urljoin(base, expected_video_reference))
            require(
                deployed_video_type in {"application/javascript", "text/javascript"},
                f"Unexpected video runtime type: {deployed_video_type}",
            )
            deployed_video_text = deployed_video_bytes.decode("utf-8")
            deployed_video_match = re.search(r"window\.localVideoData=(\[.*\]);\s*$", deployed_video_text, re.S)
            require(deployed_video_match is not None, "Deployed video runtime payload is invalid")
            deployed_videos = json.loads(deployed_video_match.group(1))
            require({item.get("id") for item in deployed_videos} == expected_video_ids, "Deployed video IDs differ from main")
            require(len(deployed_videos) == len(expected_video_items), "Deployed video count differs from main")

            uploaded_gallery_assets = {
                item[key]
                for item in expected_gallery_items
                for key in ("src", "previewSrc", "thumbnailSrc")
                if item.get(key, "").startswith((
                    "assets/gallery/uploads/",
                    "assets/gallery/previews/uploads/",
                    "assets/gallery/thumbnails/uploads/",
                ))
            }
            for relative in sorted(uploaded_gallery_assets):
                prefix, actual_type, status = fetch_prefix(urljoin(base, relative))
                require(status in {200, 206}, f"Uploaded gallery asset returned status {status}: {relative}")
                require(prefix, f"Uploaded gallery asset returned an empty response: {relative}")
                require(actual_type == "image/webp", f"Uploaded gallery asset has unexpected type: {relative} ({actual_type})")

            category_thumbnails = {}
            for item in expected_gallery_items:
                category_thumbnails.setdefault(item["category"], item["thumbnailSrc"])
            for relative in sorted(category_thumbnails.values()):
                prefix, actual_type, status = fetch_prefix(urljoin(base, relative))
                require(status in {200, 206}, f"Gallery thumbnail returned status {status}: {relative}")
                require(prefix, f"Gallery thumbnail returned an empty response: {relative}")
                require(actual_type == "image/webp", f"Gallery thumbnail has unexpected type: {relative} ({actual_type})")

            for category, config in local_gallery["categoryConfig"].items():
                for key in ("homeCover", "homeMobileCover"):
                    relative = config[key]
                    prefix, actual_type, status = fetch_prefix(urljoin(base, relative))
                    require(status in {200, 206}, f"{category} {key} returned status {status}: {relative}")
                    require(prefix, f"{category} {key} returned an empty response: {relative}")
                    require(actual_type == "image/webp", f"{category} {key} has unexpected type: {actual_type}")

            sdk_prefix, sdk_type, sdk_status = fetch_prefix(CLOUDBASE_SDK_URL)
            require(sdk_status in {200, 206}, f"Unexpected CloudBase SDK status: {sdk_status}")
            require(sdk_prefix, "CloudBase SDK returned an empty response")
            require(sdk_type in {"application/javascript", "text/javascript"}, f"Unexpected CloudBase SDK type: {sdk_type}")

            for video in deployed_videos:
                label = video.get("title") or video.get("id") or "Video"
                for key in ("posterUrl", "posterPreviewUrl"):
                    target = urljoin(base, video[key])
                    prefix, actual_type, status = fetch_prefix(target)
                    require(status in {200, 206}, f"{label} {key} returned status {status}")
                    require(prefix, f"{label} {key} returned an empty response")
                    require(actual_type in {"image/jpeg", "image/png", "image/webp"}, f"{label} {key} has unexpected type: {actual_type}")

                target = urljoin(base, video["videoUrl"])
                prefix, actual_type, status = fetch_prefix(target)
                require(status in {200, 206}, f"{label} video returned status {status}")
                require(prefix, f"{label} video returned an empty response")
                require(actual_type == "video/mp4", f"{label} video has unexpected type: {actual_type}")

            print(
                f"Remote site verification passed: {base}; "
                f"{len(deployed_gallery)} photos, Pages/CloudBase admin, CloudBase SDK and "
                f"{len(deployed_videos)} current videos/posters are reachable"
            )
            return
        except Exception as error:  # Pages and CDN publication can lag briefly.
            last_error = error
            if attempt < 11:
                time.sleep(5)
    raise AssertionError(f"Remote verification failed after retries: {last_error}")


def main() -> None:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--root", type=Path)
    group.add_argument("--url")
    args = parser.parse_args()
    if args.root:
        verify_local(args.root.resolve())
    else:
        verify_remote(args.url)


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, OSError, UnicodeError) as error:
        print(f"Verification failed: {error}", file=sys.stderr)
        raise SystemExit(1)
