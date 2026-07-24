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


STYLE_CACHE_VERSION = "20260724-footer-visible-4"
ADMIN_STYLE_CACHE_VERSION = "20260724-content-studio-1"
ADMIN_SCRIPT_CACHE_VERSION = "20260724-content-studio-1"
SCRIPT_CACHE_VERSION = "20260722-scroll-reveal-1"
CLOUDBASE_CACHE_VERSION = "20260720-cloudbase-1"
CLOUDBASE_SDK_URL = "https://static.cloudbase.net/cloudbase-js-sdk/2.24.0/cloudbase.full.js"
REQUIRED_ASSETS = {
    "assets/branding/plutonoc-watermark-web.png": 100_000,
    "assets/branding/plutonoc-share.jpg": 400_000,
    "assets/branding/favicon-32.png": 20_000,
    "assets/branding/apple-touch-icon.png": 100_000,
    "assets/branding/avatar-bilibili.webp": 100_000,
    "assets/branding/avatar-douyin.webp": 100_000,
    "assets/branding/avatar-xiaohongshu.webp": 100_000,
    "favicon.ico": 100_000,
    "assets/gallery/previews/earth/earth-007.webp": 400_000,
    "assets/gallery/hero/earth.webp": 700_000,
}
REMOTE_TYPES = {
    "assets/branding/plutonoc-watermark-web.png": "image/png",
    "assets/branding/plutonoc-share.jpg": "image/jpeg",
    "assets/branding/favicon-32.png": "image/png",
    "assets/branding/apple-touch-icon.png": "image/png",
    "assets/branding/avatar-bilibili.webp": "image/webp",
    "assets/branding/avatar-douyin.webp": "image/webp",
    "assets/branding/avatar-xiaohongshu.webp": "image/webp",
    "assets/gallery/previews/earth/earth-007.webp": "image/webp",
    "assets/gallery/hero/earth.webp": "image/webp",
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
    video_data = (root / "video-data.js").read_text(encoding="utf-8")
    gallery_data = (root / "gallery-data.js").read_text(encoding="utf-8")
    gallery_content = json.loads((root / "content/gallery.json").read_text(encoding="utf-8"))
    video_content = json.loads((root / "content/videos.json").read_text(encoding="utf-8"))
    script = (root / "script.js").read_text(encoding="utf-8")
    monitor_workflow = (root / ".github/workflows/monitor-production.yml").read_text(encoding="utf-8")
    device_qa = (root / "REAL_DEVICE_QA.md").read_text(encoding="utf-8")

    required_html = (
        '<link rel="canonical" href="https://plutonoc.cn/">',
        'property="og:image" content="https://plutonoc.cn/assets/branding/plutonoc-share.jpg"',
        'name="twitter:card" content="summary_large_image"',
        'href="assets/branding/favicon-32.png"',
        f'style.css?v={STYLE_CACHE_VERSION}',
        f'script.js?v={SCRIPT_CACHE_VERSION}',
        'href="assets/gallery/previews/earth/earth-007.webp" as="image" type="image/webp" media="(max-width: 767px)"',
        'href="assets/gallery/hero/earth.webp" as="image" type="image/webp" media="(min-width: 768px)"',
        '<source media="(max-width: 767px)" srcset="assets/gallery/previews/earth/earth-007.webp" type="image/webp">',
        'src="assets/branding/plutonoc-watermark-web.png"',
        'class="brand" href="#home" data-transition-link aria-label="PlutonoC，返回首页"><img src="assets/branding/plutonoc-watermark-web.png" width="640" height="175"',
        'preload="none" data-home-motion',
        'class="arrival-hero"',
        'class="arrival-outro"',
        'class="arrival-footer"',
        '<a class="footer-admin-entry" href="admin.html">© 2026 PLUTONOC</a>',
        'src="assets/branding/avatar-bilibili.webp" width="256" height="256"',
        'src="assets/branding/avatar-douyin.webp" width="256" height="256"',
        'src="assets/branding/avatar-xiaohongshu.webp" width="256" height="256"',
        'href="https://www.xiaohongshu.com/user/profile/60e62ebb0000000001007f48"',
    )
    for token in required_html:
        require(token in index, f"Missing index marker: {token}")
    for token in ("官方账号", "FOLLOW PLUTONOC", "social-index", "account-heading"):
        require(token not in index, f"Obsolete account decoration remains: {token}")
    for token in ('class="header-actions"', 'class="admin-entry"', '>管理</a>'):
        require(token not in index, f"Visible admin entry remains: {token}")
    require('class="arrival-footer reveal"' not in index, "Footer must not be hidden by the reveal observer")
    require("assets/gallery/earth/earth-007.jpg" not in index, "Homepage still references the 12 MB Everest original")
    require(f'admin.css?v={ADMIN_STYLE_CACHE_VERSION}' in admin, "Admin page has an old cache version")
    for token in ("PRIVATE FILM STUDIO", "CONFIGURATION REQUIRED", "OWNER ACCESS", "私人影像管理", "VIDEO PUBLISHER"):
        require(token not in admin, f"Obsolete admin annotation remains: {token}")
    for token in (
        '<section class="login-panel" data-login hidden>',
        "<h1>登录</h1>",
        'name="username"',
        'name="password"',
        'data-dashboard hidden',
        'data-studio-tab="photos"',
        'data-studio-tab="videos"',
        'data-photo-form',
        'data-video-form',
        'data-github-form',
        '只保留在当前标签页',
    ):
        require(token in admin, f"Missing essential admin marker: {token}")
    require(f'admin.js?v={ADMIN_SCRIPT_CACHE_VERSION}' in admin, "Admin script has an old cache version")
    require("sessionStorage.setItem(tokenKey" in admin_script, "GitHub token is not stored per-tab")
    require("sessionStorage.removeItem(tokenKey)" in admin_script, "GitHub token is not cleared on disconnect")
    require("repo.permissions?.push" in admin_script, "GitHub token write permission is not verified")
    require(".collection(" not in admin_script, "Admin still queries the blocked CloudBase database")
    require("/git/trees" in admin_script and "force: false" in admin_script, "Admin atomic Git publishing is missing")
    require("3000" in admin_script and "1600" in admin_script, "Admin photo derivatives are not configured")
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
    require(gallery_data.startswith("window.categoryConfig="), "Generated gallery runtime is invalid")
    require(video_data.startswith("window.localVideoData="), "Generated video runtime is invalid")
    gallery_runtime_match = re.search(r"window\.galleryData=(\[.*\]);\s*$", gallery_data, re.S)
    video_runtime_match = re.search(r"window\.localVideoData=(\[.*\]);\s*$", video_data, re.S)
    require(gallery_runtime_match is not None, "Generated gallery runtime payload is missing")
    require(video_runtime_match is not None, "Generated video runtime payload is missing")
    gallery_runtime_items = json.loads(gallery_runtime_match.group(1))
    video_runtime_items = json.loads(video_runtime_match.group(1))
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
    for marker in (
        "function ensureArchiveCanvas()",
        "rootMargin: '800px 0px'",
        "new BitmapCache((isMobile ? 96 : 240) * 1024 * 1024, isMobile ? 4 : 6)",
        "window.setInterval(updateTimecode, 100)",
        "layoutMetrics.calibrationRouteLength",
        "threshold: [0, .08, .35]",
        "is-reveal-before",
        "is-reveal-after",
    ):
        require(marker in script, f"Missing performance marker: {marker}")
    for marker in (
        ".reveal.is-reveal-before",
        ".film-list.reveal.is-visible .film-card",
        ".archive-list.reveal.is-visible .archive-row",
        ".equipment-media.reveal.is-visible",
        ".footer-admin-entry",
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

    initial_owned = sum((root / relative).stat().st_size for relative in (
        "assets/gallery/hero/earth.webp",
        "assets/branding/per-aspera-ad-astra-handwritten.png",
        "assets/branding/plutonoc-watermark-web.png",
    ))
    require(initial_owned <= 3_000_000, f"Owned first-view budget exceeded: {initial_owned} bytes")

    referenced = set(re.findall(r'(?:src|href|poster|data-preview)="([^"#]+)"', index))
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


def verify_remote(base_url: str) -> None:
    base = base_url.rstrip("/") + "/"
    require(urlsplit(base).scheme == "https", f"Remote verification requires HTTPS: {base}")
    last_error: Exception | None = None
    for attempt in range(12):
        try:
            index_bytes, content_type = fetch(base)
            index = index_bytes.decode("utf-8")
            require(content_type == "text/html", f"Unexpected homepage type: {content_type}")
            require(f"style.css?v={STYLE_CACHE_VERSION}" in index, "Deployed homepage has an old cache version")
            require(re.search(r'gallery-data\.js\?v=[A-Za-z0-9._-]+', index), "Deployed gallery cache version is missing")
            require(re.search(r'video-data\.js\?v=[A-Za-z0-9._-]+', index), "Deployed video cache version is missing")
            require(f"script.js?v={SCRIPT_CACHE_VERSION}" in index, "Deployed script has an old cache version")
            require("https://plutonoc.cn/assets/branding/plutonoc-share.jpg" in index, "Deployed sharing metadata is missing")
            require('<a class="footer-admin-entry" href="admin.html">© 2026 PLUTONOC</a>' in index, "Deployed hidden admin entry is missing")
            require('class="admin-entry"' not in index and ">管理</a>" not in index, "Deployed header still exposes the admin entry")
            require('class="arrival-footer reveal"' not in index, "Deployed footer is still controlled by the reveal observer")
            require(CLOUDBASE_SDK_URL in index, "Homepage CloudBase SDK reference is missing")
            for relative, expected_type in REMOTE_TYPES.items():
                body, actual_type = fetch(urljoin(base, relative))
                require(body, f"Empty remote asset: {relative}")
                require(actual_type == expected_type, f"Unexpected type for {relative}: {actual_type}")

            admin_bytes, admin_type = fetch(urljoin(base, "admin.html"))
            admin = admin_bytes.decode("utf-8")
            require(admin_type == "text/html", f"Unexpected admin page type: {admin_type}")
            require(f"admin.css?v={ADMIN_STYLE_CACHE_VERSION}" in admin, "Deployed admin page has an old CSS version")
            require(f"cloudbase-config.js?v={CLOUDBASE_CACHE_VERSION}" in admin, "Deployed admin page has an old CloudBase config version")
            require(f"admin.js?v={ADMIN_SCRIPT_CACHE_VERSION}" in admin, "Deployed admin page has an old script version")
            require(CLOUDBASE_SDK_URL in admin, "Admin CloudBase SDK reference is missing")
            require("OWNER ACCESS" not in admin and "VIDEO PUBLISHER" not in admin, "Deployed admin page still contains obsolete annotations")
            require('data-photo-form' in admin and 'data-github-form' in admin, "Deployed photo studio is missing")

            video_reference = re.search(r'video-data\.js\?v=[A-Za-z0-9._-]+', index)
            require(video_reference is not None, "Deployed video runtime reference is missing")
            deployed_video_bytes, deployed_video_type = fetch(urljoin(base, video_reference.group(0)))
            require(
                deployed_video_type in {"application/javascript", "text/javascript"},
                f"Unexpected video runtime type: {deployed_video_type}",
            )
            deployed_video_text = deployed_video_bytes.decode("utf-8")
            deployed_video_match = re.search(r"window\.localVideoData=(\[.*\]);\s*$", deployed_video_text, re.S)
            require(deployed_video_match is not None, "Deployed video runtime payload is invalid")
            deployed_videos = json.loads(deployed_video_match.group(1))
            require(deployed_videos, "Deployed video runtime is empty")

            sdk_prefix, sdk_type, sdk_status = fetch_prefix(CLOUDBASE_SDK_URL)
            require(sdk_status in {200, 206}, f"Unexpected CloudBase SDK status: {sdk_status}")
            require(sdk_prefix, "CloudBase SDK returned an empty response")
            require(sdk_type in {"application/javascript", "text/javascript"}, f"Unexpected CloudBase SDK type: {sdk_type}")

            for video in deployed_videos:
                label = video.get("title") or video.get("id") or "Video"
                target = urljoin(base, video["posterUrl"])
                prefix, actual_type, status = fetch_prefix(target)
                require(status in {200, 206}, f"{label} poster returned status {status}")
                require(prefix, f"{label} poster returned an empty response")
                require(actual_type in {"image/jpeg", "image/png", "image/webp"}, f"{label} poster has unexpected type: {actual_type}")

                target = urljoin(base, video["videoUrl"])
                prefix, actual_type, status = fetch_prefix(target)
                require(status in {200, 206}, f"{label} video returned status {status}")
                require(prefix, f"{label} video returned an empty response")
                require(actual_type == "video/mp4", f"{label} video has unexpected type: {actual_type}")

            print(
                f"Remote site verification passed: {base}; "
                f"admin, CloudBase SDK and {len(deployed_videos)} current videos/posters are reachable"
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
