"""Build deterministic PlutonoC branding and web-font assets.

The source photography, watermark, and handwriting are never modified. Font
archives come from pinned official releases, are cached outside the repository,
and are hash-verified before site-specific WOFF2 subsets are generated.
"""

from __future__ import annotations

import hashlib
import shutil
import tempfile
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

from fontTools.subset import Options, Subsetter, load_font, save_font
from PIL import Image, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
BRANDING = ROOT / "assets" / "branding"
FONTS = ROOT / "assets" / "fonts"
FONT_CACHE = Path(tempfile.gettempdir()) / "plutonoc-font-sources"

TEXT_SOURCES = (
    ROOT / "index.html",
    ROOT / "script.js",
    ROOT / "gallery-data.js",
    ROOT / "video-data.js",
    ROOT / "admin.html",
    ROOT / "admin.js",
)

FONT_ARCHIVES = {
    "smiley": {
        "url": "https://github.com/atelier-anchor/smiley-sans/releases/download/v2.0.1/smiley-sans-v2.0.1.zip",
        "sha256": "299c0be6c960ae37361762eca76f7d0cd516615435bb96c0d4b98a1e70178a07",
    },
    "glow-normal": {
        "url": "https://github.com/welai/glow-sans/releases/download/v0.93/GlowSansSC-Normal-v0.93.zip",
        "sha256": "aa2e1fdb20337113a1d2670b695bfee83910eefa2e48f51c704e5f4a9f8ec9f1",
    },
    "glow-compressed": {
        "url": "https://github.com/welai/glow-sans/releases/download/v0.93/GlowSansSC-Compressed-v0.93.zip",
        "sha256": "fe0fa382c8f5be8c1632cbc5837f7da3730b18b4dba12d351812d07d6d6bb56f",
    },
}

FONT_LICENSES = {
    FONTS / "SMILEY-SANS-OFL.txt": {
        "url": "https://raw.githubusercontent.com/atelier-anchor/smiley-sans/v2.0.1/LICENSE",
        "sha256": "9401f4050f1b66c26b6ccdc8b0e14a3c1cc37aac122eda84386f25854a9bec72",
    },
    FONTS / "GLOW-SANS-OFL.txt": {
        "url": "https://raw.githubusercontent.com/welai/glow-sans/v0.93/OFL.txt",
        "sha256": "294348a0b170240633883e62548c2d3bc76306a5571a5235b2e407e0ace3b232",
    },
}

FONT_SUBSETS = (
    ("smiley", "SmileySans-Oblique.ttf", FONTS / "plutonoc-display.woff2", "PlutonoC Display", 400),
    ("glow-normal", "GlowSansSC-Normal-Regular.otf", FONTS / "plutonoc-text-regular.woff2", "PlutonoC Text", 400),
    ("glow-normal", "GlowSansSC-Normal-Medium.otf", FONTS / "plutonoc-text-medium.woff2", "PlutonoC Text", 500),
    ("glow-compressed", "GlowSansSC-Compressed-Regular.otf", FONTS / "plutonoc-meta.woff2", "PlutonoC Meta", 400),
)

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


def download_verified(url: str, expected_hash: str, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.is_file() and sha256(destination) == expected_hash:
        return destination
    temporary = destination.with_suffix(destination.suffix + ".part")
    request = urllib.request.Request(url, headers={"User-Agent": "PlutonoC asset builder"})
    with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as handle:
        shutil.copyfileobj(response, handle)
    if sha256(temporary) != expected_hash:
        temporary.unlink(missing_ok=True)
        raise RuntimeError(f"Downloaded file failed SHA-256 verification: {url}")
    temporary.replace(destination)
    return destination


def extract_font(archive: Path, member_name: str) -> Path:
    destination = FONT_CACHE / archive.stem / member_name
    if destination.is_file():
        return destination
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as source:
        matches = [name for name in source.namelist() if Path(name).name == member_name]
        if len(matches) != 1:
            raise RuntimeError(f"Expected one {member_name} in {archive}, found {len(matches)}")
        with source.open(matches[0]) as input_handle, destination.open("wb") as output_handle:
            shutil.copyfileobj(input_handle, output_handle)
    return destination


def set_font_names(font, family: str, weight: int) -> None:
    style = "Medium" if weight == 500 else "Regular"
    postscript = family.replace(" ", "") + "-" + style
    for platform_id, encoding_id, language_id in ((3, 1, 0x409), (1, 0, 0)):
        font["name"].setName(family, 1, platform_id, encoding_id, language_id)
        font["name"].setName(style, 2, platform_id, encoding_id, language_id)
        font["name"].setName(f"{family} {style}", 4, platform_id, encoding_id, language_id)
        font["name"].setName(postscript, 6, platform_id, encoding_id, language_id)
    if "OS/2" in font:
        font["OS/2"].usWeightClass = weight


def build_font_subset(source: Path, output: Path, family: str, weight: int, text: str) -> None:
    options = Options()
    options.flavor = "woff2"
    options.layout_features = ["kern", "liga", "clig", "calt", "ccmp", "locl", "pnum", "tnum"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_glyph = True
    options.notdef_outline = True
    options.recalc_timestamp = False

    font = load_font(str(source), options)
    font.recalcTimestamp = False
    subsetter = Subsetter(options=options)
    subsetter.populate(text=text)
    subsetter.subset(font)
    set_font_names(font, family, weight)
    font.recalcTimestamp = False
    if "head" in font:
        font["head"].modified = font["head"].created
    save_font(font, str(output), options)


def build_site_fonts() -> tuple[Path, ...]:
    text = "".join(path.read_text(encoding="utf-8") for path in TEXT_SOURCES)
    text += " ©↗↖↘↙↑↓←→—…“”‘’·／｜×"
    archives: dict[str, Path] = {}
    for key, metadata in FONT_ARCHIVES.items():
        filename = Path(urllib.parse.urlsplit(metadata["url"]).path).name
        archives[key] = download_verified(metadata["url"], metadata["sha256"], FONT_CACHE / filename)

    outputs = []
    for archive_key, member, output, family, weight in FONT_SUBSETS:
        source = extract_font(archives[archive_key], member)
        build_font_subset(source, output, family, weight, text)
        outputs.append(output)
    for output, metadata in FONT_LICENSES.items():
        cached = download_verified(metadata["url"], metadata["sha256"], FONT_CACHE / output.name)
        normalized = "\n".join(line.rstrip() for line in cached.read_text(encoding="utf-8").splitlines()) + "\n"
        output.write_text(normalized, encoding="utf-8", newline="\n")
        outputs.append(output)
    return tuple(outputs)


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
    font_outputs = build_site_fonts()
    web_watermark = build_web_watermark()
    build_share_card(web_watermark)
    build_favicons()

    for path, expected in source_hashes.items():
        if sha256(path) != expected:
            raise RuntimeError(f"Source changed while building: {path}")

    outputs = (*font_outputs, WATERMARK_OUTPUT, SHARE_OUTPUT, FAVICON_OUTPUT, FAVICON_PNG_OUTPUT, APPLE_ICON_OUTPUT)
    for path in outputs:
        print(f"{path.relative_to(ROOT).as_posix()}\t{path.stat().st_size}\t{sha256(path)}")


if __name__ == "__main__":
    main()
