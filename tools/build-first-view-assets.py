"""Build lightweight first-view derivatives without modifying source assets."""

from __future__ import annotations

import hashlib
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "equipment.jpg"
OUTPUT = ROOT / "assets" / "equipment-web.webp"
MOTTO_SOURCE = ROOT / "assets" / "branding" / "per-aspera-ad-astra-handwritten.png"
MOTTO_OUTPUT = ROOT / "assets" / "branding" / "per-aspera-ad-astra-handwritten-web.webp"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    source_hashes = {path: sha256(path) for path in (SOURCE, MOTTO_SOURCE)}
    with Image.open(SOURCE) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
        image.save(OUTPUT, "WEBP", quality=82, method=6)
    with Image.open(MOTTO_SOURCE) as source:
        motto = ImageOps.exif_transpose(source).convert("RGBA")
        motto = motto.resize(
            (1024, round(motto.height * 1024 / motto.width)),
            Image.Resampling.LANCZOS,
        )
        motto.save(MOTTO_OUTPUT, "WEBP", lossless=True, method=6, exact=True)
    for path, source_hash in source_hashes.items():
        if sha256(path) != source_hash:
            raise RuntimeError(f"Source changed while building: {path}")
    for path in (OUTPUT, MOTTO_OUTPUT):
        print(f"{path.relative_to(ROOT).as_posix()}\t{path.stat().st_size}\t{sha256(path)}")


if __name__ == "__main__":
    main()
