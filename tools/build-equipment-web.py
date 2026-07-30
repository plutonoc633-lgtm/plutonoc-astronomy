"""Build the lightweight equipment image used by the public site."""

from __future__ import annotations

import hashlib
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "equipment.jpg"
OUTPUT = ROOT / "assets" / "equipment-web.webp"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    source_hash = sha256(SOURCE)
    with Image.open(SOURCE) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
        image.save(OUTPUT, "WEBP", quality=82, method=6)
    if sha256(SOURCE) != source_hash:
        raise RuntimeError("Equipment source changed while building")
    print(f"{OUTPUT.relative_to(ROOT).as_posix()}\t{OUTPUT.stat().st_size}\t{sha256(OUTPUT)}")


if __name__ == "__main__":
    main()
