"""Build deterministic PlutonoC branding assets.

The source photography, watermark, and handwriting are never modified. The
site uses a local system-font stack, so this builder never downloads fonts.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
BRANDING = ROOT / "assets" / "branding"

WATERMARK_SOURCE = BRANDING / "plutonoc-watermark.png"
WATERMARK_OUTPUT = BRANDING / "plutonoc-watermark-web.png"
MOTTO_SOURCE = BRANDING / "per-aspera-ad-astra-handwritten.png"
HERO_SOURCE = ROOT / "assets" / "gallery" / "earth" / "earth-007.jpg"
SHARE_OUTPUT = BRANDING / "plutonoc-share.jpg"
FAVICON_OUTPUT = ROOT / "favicon.ico"
FAVICON_PNG_OUTPUT = BRANDING / "favicon-32.png"
APPLE_ICON_OUTPUT = BRANDING / "apple-touch-icon.png"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def resized(image: Image.Image, width: int) -> Image.Image:
    height = round(image.height * width / image.width)
    return image.resize((width, height), Image.Resampling.LANCZOS)


def build_web_watermark() -> Image.Image:
    with Image.open(WATERMARK_SOURCE) as source:
        watermark = resized(source.convert("RGBA"), 640)
    watermark.save(WATERMARK_OUTPUT, "PNG", optimize=True)
    return watermark


def add_shadow(canvas: Image.Image, layer: Image.Image, position: tuple[int, int], blur: int) -> None:
    alpha = layer.getchannel("A")
    shadow = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    shadow.putalpha(alpha.filter(ImageFilter.GaussianBlur(blur)))
    canvas.alpha_composite(shadow, (position[0], position[1] + 4))
    canvas.alpha_composite(layer, position)


def build_share_card(web_watermark: Image.Image) -> None:
    with Image.open(HERO_SOURCE) as source:
        hero = ImageOps.exif_transpose(source).convert("RGB")
        hero = ImageOps.fit(hero, (1200, 630), method=Image.Resampling.LANCZOS, centering=(0.5, 0.48)).convert("RGBA")
    hero.alpha_composite(Image.new("RGBA", hero.size, (0, 0, 0, 71)))

    with Image.open(MOTTO_SOURCE) as source:
        motto = resized(source.convert("RGBA"), 660)
    add_shadow(hero, motto, ((hero.width - motto.width) // 2, 270), 12)

    signature = resized(web_watermark, 150)
    add_shadow(hero, signature, ((hero.width - signature.width) // 2, 390), 8)
    hero.convert("RGB").save(SHARE_OUTPUT, "JPEG", quality=88, optimize=True, progressive=True, subsampling=2)


def build_favicons() -> None:
    with Image.open(WATERMARK_SOURCE) as source:
        watermark = source.convert("RGBA")
        planet = watermark.crop((2325, 96, watermark.width, watermark.height))
    alpha_box = planet.getchannel("A").getbbox()
    if not alpha_box:
        raise RuntimeError("Watermark planet crop has no visible pixels")
    planet = planet.crop(alpha_box)

    mark = resized(planet, 390)
    if mark.height > 390:
        mark = planet.resize((round(planet.width * 390 / planet.height), 390), Image.Resampling.LANCZOS)
    icon = Image.new("RGBA", (512, 512), (5, 6, 9, 255))
    icon.alpha_composite(mark, ((512 - mark.width) // 2, (512 - mark.height) // 2))
    icon.resize((32, 32), Image.Resampling.LANCZOS).save(FAVICON_PNG_OUTPUT, "PNG", optimize=True)
    icon.resize((180, 180), Image.Resampling.LANCZOS).save(APPLE_ICON_OUTPUT, "PNG", optimize=True)
    icon.save(FAVICON_OUTPUT, "ICO", sizes=[(16, 16), (32, 32), (48, 48)])


def main() -> None:
    source_hashes = {path: sha256(path) for path in (WATERMARK_SOURCE, MOTTO_SOURCE, HERO_SOURCE)}
    web_watermark = build_web_watermark()
    build_share_card(web_watermark)
    build_favicons()

    for path, expected in source_hashes.items():
        if sha256(path) != expected:
            raise RuntimeError(f"Source changed while building: {path}")

    outputs = (WATERMARK_OUTPUT, SHARE_OUTPUT, FAVICON_OUTPUT, FAVICON_PNG_OUTPUT, APPLE_ICON_OUTPUT)
    for path in outputs:
        print(f"{path.relative_to(ROOT).as_posix()}\t{path.stat().st_size}\t{sha256(path)}")


if __name__ == "__main__":
    main()
