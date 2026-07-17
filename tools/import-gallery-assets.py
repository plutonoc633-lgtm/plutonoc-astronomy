"""Import PlutonoC gallery assets without modifying source files.

Usage:
    python tools/import-gallery-assets.py "C:\\path\\to\\新增"

The script is intentionally idempotent. Originals are copied byte-for-byte,
browser previews are derived separately, and the manifest records only paths
relative to the supplied import root.
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
GALLERY_FILE = ROOT / "gallery-data.js"
MANIFEST_FILE = ROOT / "assets" / "import-manifest.json"
PREVIEW_ROOT = ROOT / "assets" / "gallery" / "previews"
SUPPORTED = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff"}

CATEGORY_CONFIG = {
    "deepsky": {
        "label": "深空",
        "english": "DEEP SPACE",
        "description": "遥远天体与星云",
        "color": "#9ec8ff",
        "order": 1,
        "homeCover": "assets/gallery/deepsky/deepsky-09.jpg",
    },
    "sunmoon": {
        "label": "日月",
        "english": "SUN & MOON",
        "description": "日光 月相与食象",
        "color": "#e5edf4",
        "order": 2,
        "homeCover": "assets/gallery/planetary/planetary-06.jpg",
    },
    "planet": {
        "label": "行星",
        "english": "PLANETS",
        "description": "行星表面与运动",
        "color": "#edf0f2",
        "order": 3,
        "homeCover": "assets/gallery/planetary/planetary-02.jpg",
    },
    "nightscape": {
        "label": "星野",
        "english": "NIGHTSCAPE",
        "description": "银河 流星与地平线",
        "color": "#f4f1e9",
        "order": 4,
        "homeCover": "assets/gallery/nightscape/nightscape-04.jpg",
    },
    "earth": {
        "label": "大地",
        "english": "EARTH",
        "description": "山川 城市与地面光影",
        "color": "#ddb477",
        "order": 5,
        "homeCover": "assets/gallery/earth/earth-007.jpg",
    },
}

ROTATED_SOURCES = {
    "assets/gallery/deepsky/deepsky-10.jpg",
    "assets/gallery/deepsky/deepsky-15.jpg",
    "assets/gallery/deepsky/deepsky-21.jpg",
    "assets/gallery/deepsky/deepsky-28.jpg",
    "assets/gallery/nightscape/nightscape-08.jpg",
    "assets/gallery/nightscape/nightscape-13.jpg",
    "assets/gallery/planetary/planetary-05.jpg",
    "assets/gallery/planetary/planetary-07.jpg",
}

FEATURED_SOURCES = {
    "assets/gallery/deepsky/deepsky-09.jpg",
    "assets/gallery/planetary/planetary-06.jpg",
    "assets/gallery/planetary/planetary-02.jpg",
    "assets/gallery/nightscape/nightscape-04.jpg",
    "assets/gallery/earth/earth-007.jpg",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_gallery() -> list[dict]:
    source = GALLERY_FILE.read_text(encoding="utf-8")
    match = re.search(r"window\.galleryData\s*=\s*(\[.*?\])\s*;", source, re.S)
    if not match:
        raise RuntimeError("gallery-data.js does not contain window.galleryData")
    return json.loads(match.group(1))


def oriented_size(path: Path) -> tuple[int, int]:
    with Image.open(path) as image:
        oriented = ImageOps.exif_transpose(image)
        return oriented.width, oriented.height


def make_preview(source: Path, destination: Path, max_edge: int = 1600, quality: int = 88) -> None:
    if destination.exists() and destination.stat().st_mtime >= source.stat().st_mtime:
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        frame = ImageOps.exif_transpose(image.seek(0) or image).convert("RGB")
        frame.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
        frame.save(destination, "WEBP", quality=quality, method=6)


def copy_original(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and sha256(destination) == sha256(source):
        return
    shutil.copy2(source, destination)
    if sha256(destination) != sha256(source):
        raise RuntimeError(f"Hash mismatch after copying {source.name}")


def normalize_existing(entries: list[dict]) -> list[dict]:
    normalized: list[dict] = []
    counters = {"deepsky": 0, "sunmoon": 0, "planet": 0, "nightscape": 0}
    for entry in entries:
        source = entry.get("src", "")
        if entry.get("category") == "earth" or source.endswith(("planet-saturn.jpg", "sunmoon-gibbous-moon.jpg")):
            continue
        category = "planet" if entry.get("category") == "planetary" else entry.get("category")
        if category not in counters:
            continue
        counters[category] += 1
        source_path = ROOT / source
        width, height = oriented_size(source_path)
        preview = PREVIEW_ROOT / category / f"{Path(source).stem}.webp"
        make_preview(source_path, preview)
        normalized.append({
            "id": f"{category}-{counters[category]:02d}",
            "category": category,
            "title": entry.get("title", ""),
            "src": source,
            "previewSrc": preview.relative_to(ROOT).as_posix(),
            "width": width,
            "height": height,
            "featured": source in FEATURED_SOURCES,
            "previewRotation": 90 if source in ROTATED_SOURCES else 0,
            "details": entry.get("details", {}),
        })
    return normalized


def import_assets(import_root: Path, entries: list[dict]) -> tuple[list[dict], list[dict]]:
    manifest: list[dict] = []

    earth_files = sorted(
        (path for path in (import_root / "大地").iterdir() if path.is_file() and path.suffix.lower() in SUPPORTED),
        key=lambda path: path.name,
    )
    temporary_titles = {
        "（根据画面自行起名1）": "大地 001",
        "（根据画面自行起名2）": "大地 002",
        "（根据画面自行起名3）": "大地 003",
        "（根据画面自行起名4）": "大地 004",
    }
    for index, source in enumerate(earth_files, 1):
        suffix = ".jpg" if source.suffix.lower() in {".jpg", ".jpeg"} else source.suffix.lower()
        filename = f"earth-{index:03d}{suffix}"
        destination = ROOT / "assets" / "gallery" / "earth" / filename
        copy_original(source, destination)
        width, height = oriented_size(source)
        preview = PREVIEW_ROOT / "earth" / f"earth-{index:03d}.webp"
        make_preview(source, preview)
        title = temporary_titles.get(source.stem, source.stem)
        relative_source = source.relative_to(import_root).as_posix()
        digest = sha256(source)
        item = {
            "id": f"earth-{index:03d}",
            "category": "earth",
            "title": title,
            "src": destination.relative_to(ROOT).as_posix(),
            "previewSrc": preview.relative_to(ROOT).as_posix(),
            "width": width,
            "height": height,
            "featured": source.name == "云隐珠峰.jpg",
            "previewRotation": 0,
            "details": {},
        }
        entries.append(item)
        manifest.append({
            "source": relative_source,
            "destination": item["src"],
            "preview": item["previewSrc"],
            "sha256": digest,
            "width": width,
            "height": height,
            "category": "earth",
            "title": title,
        })

    star_specs = [
        ("土星.jpg", "planet", "土星", "planet-saturn.jpg"),
        ("盈凸月.jpg", "sunmoon", "盈凸月", "sunmoon-gibbous-moon.jpg"),
    ]
    next_ids = {
        category: max((int(item["id"].split("-")[-1]) for item in entries if item["category"] == category), default=0) + 1
        for category in ("planet", "sunmoon")
    }
    for source_name, category, title, filename in star_specs:
        source = import_root / "星" / source_name
        destination = ROOT / "assets" / "gallery" / category / filename
        copy_original(source, destination)
        width, height = oriented_size(source)
        preview = PREVIEW_ROOT / category / f"{Path(filename).stem}.webp"
        make_preview(source, preview)
        item = {
            "id": f"{category}-{next_ids[category]:02d}",
            "category": category,
            "title": title,
            "src": destination.relative_to(ROOT).as_posix(),
            "previewSrc": preview.relative_to(ROOT).as_posix(),
            "width": width,
            "height": height,
            "featured": False,
            "previewRotation": 0,
            "details": {},
        }
        next_ids[category] += 1
        entries.append(item)
        manifest.append({
            "source": source.relative_to(import_root).as_posix(),
            "destination": item["src"],
            "preview": item["previewSrc"],
            "sha256": sha256(source),
            "width": width,
            "height": height,
            "category": category,
            "title": title,
        })

    equipment_specs = [
        ("c925hd.jpg", "equipment-c925hd.jpg", "C925HD"),
        ("P2710393.jpg", "equipment-field-01.jpg", "观测现场"),
        ("P2710437.jpg", "equipment-field-02.jpg", "观测现场"),
    ]
    for source_name, filename, title in equipment_specs:
        source = import_root / "设备" / source_name
        destination = ROOT / "assets" / "equipment" / filename
        copy_original(source, destination)
        width, height = oriented_size(source)
        preview = ROOT / "assets" / "equipment" / "previews" / f"{Path(filename).stem}.webp"
        make_preview(source, preview, max_edge=1920, quality=90)
        manifest.append({
            "source": source.relative_to(import_root).as_posix(),
            "destination": destination.relative_to(ROOT).as_posix(),
            "preview": preview.relative_to(ROOT).as_posix(),
            "sha256": sha256(source),
            "width": width,
            "height": height,
            "category": "equipment",
            "title": title,
        })

    return entries, manifest


def write_gallery(entries: list[dict]) -> None:
    entries.sort(key=lambda item: (CATEGORY_CONFIG[item["category"]]["order"], item["id"]))
    content = (
        "window.categoryConfig="
        + json.dumps(CATEGORY_CONFIG, ensure_ascii=False, separators=(",", ":"))
        + ";\nwindow.galleryData="
        + json.dumps(entries, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    GALLERY_FILE.write_text(content, encoding="utf-8", newline="\n")


def make_hero_previews(entries: list[dict]) -> None:
    for category, config in CATEGORY_CONFIG.items():
        featured = next((item for item in entries if item["category"] == category and item["featured"]), None)
        if not featured:
            continue
        destination = ROOT / "assets" / "gallery" / "hero" / f"{category}.webp"
        make_preview(ROOT / featured["src"], destination, max_edge=2560, quality=90)
        config["homeCover"] = destination.relative_to(ROOT).as_posix()


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Pass the 新增 directory as the only argument")
    import_root = Path(sys.argv[1]).resolve()
    expected = [import_root / name for name in ("大地", "星", "设备")]
    if not all(path.is_dir() for path in expected):
        raise SystemExit("Import root must contain 大地, 星 and 设备 directories")

    entries = normalize_existing(read_gallery())
    entries, manifest = import_assets(import_root, entries)
    make_hero_previews(entries)
    write_gallery(entries)
    MANIFEST_FILE.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_FILE.write_text(
        json.dumps({"version": 1, "files": manifest}, ensure_ascii=False, indent=2),
        encoding="utf-8",
        newline="\n",
    )
    counts = {category: sum(item["category"] == category for item in entries) for category in CATEGORY_CONFIG}
    print(json.dumps({"counts": counts, "total": len(entries), "manifest": len(manifest)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
