#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
GALLERY_PATH = ROOT / "content" / "gallery.json"
MAX_EDGE = 640
QUALITY = 76


def thumbnail_path(preview_src: str) -> str:
    marker = "assets/gallery/previews/"
    if not preview_src.startswith(marker):
        raise ValueError(f"无法为预览图生成缩略图路径：{preview_src}")
    return f"assets/gallery/thumbnails/{preview_src[len(marker):]}"


def render_thumbnail(source: Path, destination: Path) -> None:
    with Image.open(source) as opened:
        frame = ImageOps.exif_transpose(opened)
        if getattr(frame, "is_animated", False):
            frame.seek(0)
        image = frame.convert("RGBA" if "A" in frame.getbands() else "RGB")
        image.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
        destination.parent.mkdir(parents=True, exist_ok=True)
        image.save(
            destination,
            format="WEBP",
            quality=QUALITY,
            method=6,
            exact=True,
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="生成 PlutonoC 摄影目录缩略图")
    parser.add_argument("--check", action="store_true", help="只检查数据和缩略图，不写文件")
    args = parser.parse_args()

    gallery = json.loads(GALLERY_PATH.read_text(encoding="utf-8"))
    changed = False
    missing: list[str] = []
    invalid: list[str] = []

    for item in gallery["items"]:
        expected = thumbnail_path(item["previewSrc"])
        if item.get("thumbnailSrc") != expected:
            if args.check:
                invalid.append(item["id"])
            else:
                item["thumbnailSrc"] = expected
                changed = True

        source = ROOT / item["previewSrc"]
        destination = ROOT / expected
        if not source.is_file():
            raise FileNotFoundError(f"缺少摄影预览图：{item['previewSrc']}")
        if not destination.is_file():
            if args.check:
                missing.append(expected)
            else:
                render_thumbnail(source, destination)
        elif args.check:
            with Image.open(destination) as image:
                if max(image.size) > MAX_EDGE or image.format != "WEBP":
                    invalid.append(expected)

    if args.check and (missing or invalid):
        messages = []
        if missing:
            messages.append(f"缺少 {len(missing)} 张缩略图")
        if invalid:
            messages.append(f"存在 {len(invalid)} 条无效数据或图片")
        raise SystemExit("；".join(messages))

    if changed:
        GALLERY_PATH.write_text(
            f"{json.dumps(gallery, ensure_ascii=False, indent=2)}\n",
            encoding="utf-8",
        )

    total = sum((ROOT / item["thumbnailSrc"]).stat().st_size for item in gallery["items"])
    action = "检查完成" if args.check else "生成完成"
    print(f"{action}：{len(gallery['items'])} 张，{total / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
