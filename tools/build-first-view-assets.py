"""Build deterministic responsive derivatives and synchronize first-view metadata."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
GALLERY_PATH = ROOT / "content" / "gallery.json"
VIDEOS_PATH = ROOT / "content" / "videos.json"
INDEX_PATH = ROOT / "index.html"
CRITICAL_PATH = ROOT / "critical.css"
SOURCE = ROOT / "assets" / "equipment.jpg"
OUTPUT = ROOT / "assets" / "equipment-web.webp"
MOTTO_SOURCE = ROOT / "assets" / "branding" / "per-aspera-ad-astra-handwritten.png"
MOTTO_OUTPUT = ROOT / "assets" / "branding" / "per-aspera-ad-astra-handwritten-web.webp"
WATERMARK_SOURCE = ROOT / "assets" / "branding" / "plutonoc-watermark-web.png"
WATERMARK_OUTPUT = ROOT / "assets" / "branding" / "plutonoc-watermark-header.webp"
CATEGORIES = ("deepsky", "sunmoon", "planet", "nightscape", "earth")
EQUIPMENT_SOURCES = {
    "equipment": SOURCE,
    "equipment-c925hd": ROOT / "assets" / "equipment" / "previews" / "equipment-c925hd.webp",
    "equipment-field-01": ROOT / "assets" / "equipment" / "previews" / "equipment-field-01.webp",
    "equipment-field-02": ROOT / "assets" / "equipment" / "previews" / "equipment-field-02.webp",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encode_webp(image: Image.Image, *, max_edge: int, quality: int, lossless: bool = False) -> bytes:
    scale = min(1, max_edge / max(image.size))
    if scale < 1:
        image = image.resize(
            (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
            Image.Resampling.LANCZOS,
        )
    output = io.BytesIO()
    image.save(output, "WEBP", quality=quality, lossless=lossless, method=6, exact=lossless)
    return output.getvalue()


def write_or_check(path: Path, content: bytes, check: bool) -> None:
    if check:
        if not path.exists() or path.read_bytes() != content:
            raise RuntimeError(f"Generated asset is stale: {path.relative_to(ROOT)}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def open_image(source: str | Path) -> Image.Image:
    if isinstance(source, Path):
        return Image.open(source)
    if source.startswith(("https://", "http://")):
        request = urllib.request.Request(source, headers={"User-Agent": "PlutonoC asset builder"})
        with urllib.request.urlopen(request, timeout=30) as response:
            return Image.open(io.BytesIO(response.read()))
    return Image.open(ROOT / source)


def synchronize_critical(index: str) -> str:
    critical = CRITICAL_PATH.read_text(encoding="utf-8").strip()
    block = f'<!-- CRITICAL_CSS_START -->\n  <style data-critical-css>\n{critical}\n  </style>\n  <!-- CRITICAL_CSS_END -->'
    pattern = re.compile(r'<!-- CRITICAL_CSS_START -->[\s\S]*?<!-- CRITICAL_CSS_END -->')
    if not pattern.search(index):
        raise RuntimeError("Critical CSS markers are missing from index.html")
    return pattern.sub(block, index, count=1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    check = args.check
    gallery = json.loads(GALLERY_PATH.read_text(encoding="utf-8"))
    videos = json.loads(VIDEOS_PATH.read_text(encoding="utf-8"))
    source_hashes = {path: sha256(path) for path in (SOURCE, MOTTO_SOURCE, WATERMARK_SOURCE, CRITICAL_PATH)}
    with Image.open(SOURCE) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
        write_or_check(OUTPUT, encode_webp(image, max_edge=max(image.size), quality=82), check)
    with Image.open(MOTTO_SOURCE) as source:
        motto = ImageOps.exif_transpose(source).convert("RGBA")
        write_or_check(MOTTO_OUTPUT, encode_webp(motto, max_edge=1024, quality=100, lossless=True), check)
    with Image.open(WATERMARK_SOURCE) as source:
        watermark = ImageOps.exif_transpose(source).convert("RGBA")
        write_or_check(WATERMARK_OUTPUT, encode_webp(watermark, max_edge=256, quality=100, lossless=True), check)

    for name, path in EQUIPMENT_SOURCES.items():
        with Image.open(path) as source:
            image = ImageOps.exif_transpose(source).convert("RGB")
            for edge in (720, 1280):
                output = ROOT / "assets" / "equipment" / "responsive" / f"{name}-{edge}.webp"
                write_or_check(output, encode_webp(image, max_edge=edge, quality=80), check)

    for category in CATEGORIES:
        config = gallery["categoryConfig"][category]
        default_output = ROOT / "assets" / "gallery" / "hero" / f"{category}-mobile.webp"
        default_relative = default_output.relative_to(ROOT).as_posix()
        configured = config.get("homeMobileCover")
        if not configured or configured == default_relative:
            with open_image(config["homeCover"]) as source:
                image = ImageOps.exif_transpose(source).convert("RGB")
                write_or_check(default_output, encode_webp(image, max_edge=1280, quality=80), check)
            config["homeMobileCover"] = default_relative
        else:
            configured_path = ROOT / configured
            if not configured_path.is_file():
                raise RuntimeError(f"Missing configured homeMobileCover: {configured}")
            with Image.open(configured_path) as source:
                if max(source.size) > 1280 or configured_path.stat().st_size > 1_500_000:
                    raise RuntimeError(f"Invalid configured homeMobileCover: {configured}")

    for item in videos["items"]:
        default_output = ROOT / "assets" / "video-posters" / "previews" / f"{item['id']}.webp"
        default_relative = default_output.relative_to(ROOT).as_posix()
        configured = item.get("posterPreviewUrl")
        if configured and configured != default_relative:
            if configured.startswith(("http://", "https://")):
                continue
            configured_path = ROOT / configured
            if not configured_path.is_file():
                raise RuntimeError(f"Missing configured posterPreviewUrl: {configured}")
            with Image.open(configured_path) as source:
                if source.width > 960 or source.height > 540 or configured_path.stat().st_size > 900_000:
                    raise RuntimeError(f"Invalid configured posterPreviewUrl: {configured}")
            continue
        if check and str(item.get("posterUrl", "")).startswith(("http://", "https://")):
            if not default_output.exists():
                raise RuntimeError(f"Missing video preview: {item['id']}")
        else:
            with open_image(item["posterUrl"]) as source:
                image = ImageOps.fit(
                    ImageOps.exif_transpose(source).convert("RGB"),
                    (960, 540),
                    method=Image.Resampling.LANCZOS,
                )
                write_or_check(default_output, encode_webp(image, max_edge=960, quality=80), check)
        item["posterPreviewUrl"] = default_relative

    next_gallery = f"{json.dumps(gallery, ensure_ascii=False, indent=2)}\n"
    next_videos = f"{json.dumps(videos, ensure_ascii=False, indent=2)}\n"
    next_index = synchronize_critical(INDEX_PATH.read_text(encoding="utf-8"))
    if check:
        if GALLERY_PATH.read_text(encoding="utf-8") != next_gallery:
            raise RuntimeError("content/gallery.json responsive metadata is stale")
        if VIDEOS_PATH.read_text(encoding="utf-8") != next_videos:
            raise RuntimeError("content/videos.json responsive metadata is stale")
        if INDEX_PATH.read_text(encoding="utf-8") != next_index:
            raise RuntimeError("index.html critical CSS is stale")
    else:
        GALLERY_PATH.write_text(next_gallery, encoding="utf-8", newline="\n")
        VIDEOS_PATH.write_text(next_videos, encoding="utf-8", newline="\n")
        INDEX_PATH.write_text(next_index, encoding="utf-8", newline="\n")
    for path, source_hash in source_hashes.items():
        if sha256(path) != source_hash:
            raise RuntimeError(f"Source changed while building: {path}")
    print("Responsive first-view assets are current." if check else "Responsive first-view assets generated.")


if __name__ == "__main__":
    main()
