"""Verify PlutonoC static assets locally or after a Pages deployment."""

from __future__ import annotations

import argparse
import re
import struct
import sys
import time
from pathlib import Path
from urllib.parse import urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen


CACHE_VERSION = "20260720-typography-covers-3"
REQUIRED_ASSETS = {
    "assets/fonts/plutonoc-display.woff2": 120_000,
    "assets/fonts/plutonoc-text-regular.woff2": 200_000,
    "assets/fonts/plutonoc-text-medium.woff2": 200_000,
    "assets/fonts/plutonoc-meta.woff2": 200_000,
    "assets/fonts/SMILEY-SANS-OFL.txt": 10_000,
    "assets/fonts/GLOW-SANS-OFL.txt": 10_000,
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
    "assets/branding/plutonoc-share.jpg": "image/jpeg",
    "assets/branding/favicon-32.png": "image/png",
    "assets/branding/avatar-bilibili.webp": "image/webp",
    "assets/branding/avatar-douyin.webp": "image/webp",
    "assets/branding/avatar-xiaohongshu.webp": "image/webp",
    "assets/fonts/plutonoc-display.woff2": "font/woff2",
    "assets/fonts/plutonoc-text-regular.woff2": "font/woff2",
    "assets/fonts/plutonoc-text-medium.woff2": "font/woff2",
    "assets/fonts/plutonoc-meta.woff2": "font/woff2",
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
    video_data = (root / "video-data.js").read_text(encoding="utf-8")

    required_html = (
        '<link rel="canonical" href="https://plutonoc.cn/">',
        'property="og:image" content="https://plutonoc.cn/assets/branding/plutonoc-share.jpg"',
        'name="twitter:card" content="summary_large_image"',
        'href="assets/branding/favicon-32.png"',
        f'style.css?v={CACHE_VERSION}',
        f'video-data.js?v={CACHE_VERSION}',
        f'script.js?v={CACHE_VERSION}',
        'href="assets/gallery/previews/earth/earth-007.webp" as="image" type="image/webp" media="(max-width: 767px)"',
        'href="assets/gallery/hero/earth.webp" as="image" type="image/webp" media="(min-width: 768px)"',
        '<source media="(max-width: 767px)" srcset="assets/gallery/previews/earth/earth-007.webp" type="image/webp">',
        'src="assets/branding/plutonoc-watermark-web.png"',
        'preload="none" data-home-motion',
        'class="arrival-hero"',
        'class="arrival-outro"',
        'class="arrival-footer"',
        'src="assets/branding/avatar-bilibili.webp" width="256" height="256"',
        'src="assets/branding/avatar-douyin.webp" width="256" height="256"',
        'src="assets/branding/avatar-xiaohongshu.webp" width="256" height="256"',
        'href="https://www.xiaohongshu.com/user/profile/60e62ebb0000000001007f48"',
    )
    for token in required_html:
        require(token in index, f"Missing index marker: {token}")
    for token in ("官方账号", "FOLLOW PLUTONOC", "social-index", "account-heading"):
        require(token not in index, f"Obsolete account decoration remains: {token}")
    require("assets/gallery/earth/earth-007.jpg" not in index, "Homepage still references the 12 MB Everest original")
    require(f'admin.css?v={CACHE_VERSION}' in admin, "Admin page has an old cache version")
    runtime_sources = index + style + admin + admin_style
    for obsolete in (
        "source-han-serif-cn-vf.woff2",
        "source-han-serif-cn-site.woff2",
        "source-han-sans-cn-medium.woff2",
        "ibm-plex-sans-regular.woff2",
        "ibm-plex-sans-medium.woff2",
    ):
        require(obsolete not in runtime_sources, f"Obsolete runtime font is still referenced: {obsolete}")
    for font_name in (
        "plutonoc-display.woff2",
        "plutonoc-text-regular.woff2",
        "plutonoc-text-medium.woff2",
        "plutonoc-meta.woff2",
    ):
        require(font_name in style, f"Public CSS does not reference {font_name}")
        require(font_name in admin_style, f"Admin CSS does not reference {font_name}")
    require("font-synthesis: none" in style + admin_style, "Synthetic font styling has not been disabled")
    require("star-dream-27s-v2.jpg" in video_data, "Star Dream poster manifest is stale")
    require("tianjian-promo-title-v2.jpg" in video_data, "Tianjian poster manifest is stale")

    for relative, maximum in REQUIRED_ASSETS.items():
        path = root / relative
        require(path.is_file(), f"Missing required asset: {relative}")
        require(path.stat().st_size <= maximum, f"Asset exceeds size limit: {relative} ({path.stat().st_size} > {maximum})")

    require(jpeg_size(root / "assets/branding/plutonoc-share.jpg") == (1200, 630), "Share card must be 1200x630")
    require(png_size(root / "assets/branding/favicon-32.png") == (32, 32), "PNG favicon must be 32x32")
    require(png_size(root / "assets/branding/apple-touch-icon.png") == (180, 180), "Apple icon must be 180x180")

    font_total = sum((root / relative).stat().st_size for relative in (
        "assets/fonts/plutonoc-display.woff2",
        "assets/fonts/plutonoc-text-regular.woff2",
        "assets/fonts/plutonoc-text-medium.woff2",
        "assets/fonts/plutonoc-meta.woff2",
    ))
    require(font_total <= 650_000, f"Runtime font budget exceeded: {font_total} bytes")

    initial_owned = sum((root / relative).stat().st_size for relative in (
        "assets/gallery/hero/earth.webp",
        "assets/fonts/plutonoc-display.woff2",
        "assets/fonts/plutonoc-text-regular.woff2",
        "assets/fonts/plutonoc-text-medium.woff2",
        "assets/fonts/plutonoc-meta.woff2",
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

    print(f"Local site verification passed; fonts: {font_total} bytes; owned first-view budget: {initial_owned} bytes")


def cache_bust(url: str) -> str:
    parts = urlsplit(url)
    query = urlencode({"verify": int(time.time())})
    return urlunsplit((parts.scheme, parts.netloc, parts.path, query, parts.fragment))


def fetch(url: str) -> tuple[bytes, str]:
    request = Request(cache_bust(url), headers={"Cache-Control": "no-cache", "User-Agent": "PlutonoC deploy verifier"})
    with urlopen(request, timeout=20) as response:
        return response.read(), response.headers.get_content_type()


def verify_remote(base_url: str) -> None:
    base = base_url.rstrip("/") + "/"
    last_error: Exception | None = None
    for attempt in range(12):
        try:
            index_bytes, content_type = fetch(base)
            index = index_bytes.decode("utf-8")
            require(content_type == "text/html", f"Unexpected homepage type: {content_type}")
            require(f"style.css?v={CACHE_VERSION}" in index, "Deployed homepage has an old cache version")
            require(f"video-data.js?v={CACHE_VERSION}" in index, "Deployed video manifest has an old cache version")
            require("https://plutonoc.cn/assets/branding/plutonoc-share.jpg" in index, "Deployed sharing metadata is missing")
            for relative, expected_type in REMOTE_TYPES.items():
                body, actual_type = fetch(urljoin(base, relative))
                require(body, f"Empty remote asset: {relative}")
                require(actual_type == expected_type, f"Unexpected type for {relative}: {actual_type}")
            for poster_url in (
                "https://activity-book-web-d7djhe7bb1e834-1343388380.tcloudbaseapp.com/plutonoc/video-posters/star-dream-27s-v2.jpg",
                "https://activity-book-web-d7djhe7bb1e834-1343388380.tcloudbaseapp.com/plutonoc/video-posters/tianjian-promo-title-v2.jpg",
            ):
                body, actual_type = fetch(poster_url)
                require(body, f"Empty remote poster: {poster_url}")
                require(actual_type == "image/jpeg", f"Unexpected poster type: {actual_type}")
            print(f"Remote site verification passed: {base}")
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
