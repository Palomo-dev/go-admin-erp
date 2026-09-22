#!/usr/bin/env python3
"""
Genera los recursos de marca del Desktop de GO Admin a partir del manual de
marca v2.0 (sept. 2026). Solo necesita Python 3 + Pillow.

    cd electron
    python build/brand/generate-assets.py            # todo
    python build/brand/generate-assets.py --preview  # además, hoja de contacto

Produce:
  build/icon.png                         isotipo 1024×1024 (RGBA)
  build/icon.ico                         16, 20, 24, 32, 40, 48, 64, 128 (BMP 32 bpp)
                                         + 256 (PNG), mismo formato que el .ico
                                         anterior (build/icon.legacy.ico)
  build/installer-header.bmp             150×57, BMP 24 bits sin alfa (NSIS)
  build/installer-sidebar.bmp            164×314, BMP 24 bits sin alfa (NSIS)
  src/renderer/toolbar/brand-mark.png    isotipo 128×128 para la barra propia,
                                         el splash y la pantalla sin conexión
  build/brand/preview.png                (con --preview) hoja de contacto

Especificación aplicada (manual de marca, isotipo):
  - cuadrado de lado x, radio de esquina 0,29·x, fondo Azul GO #4361EE;
  - «GO» en Inter 700 blanco, centrado ópticamente, ancho del grupo ≈ 0,52·x;
  - variante negativa: cuadrado blanco con «GO» en Azul GO;
  - firma: isotipo + «GO Admin» (GO 700, Admin 500), separación x/3, altura de
    mayúsculas ≈ 0,60·x.
  En los tamaños pequeños del .ico (≤ 32 px) el grupo «GO» se ensancha y se
  engrosa un poco el trazo para que siga legible; el manual lo permite para iconos
  de sistema y está documentado en docs/desktop/MARCA-INSTALADOR.md.
"""
from __future__ import annotations

import argparse
import struct
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover
    sys.exit("Falta Pillow: pip install pillow")

HERE = Path(__file__).resolve().parent          # electron/build/brand
BUILD = HERE.parent                              # electron/build
ELECTRON = BUILD.parent                          # electron
TOOLBAR = ELECTRON / "src" / "renderer" / "toolbar"

# ── Paleta (manual de marca v2.0) ──
AZUL_GO = (0x43, 0x61, 0xEE)
AZUL_ACCION = (0x36, 0x51, 0xD4)
AZUL_PROFUNDO = (0x2A, 0x3E, 0xA8)
TINTE_GO = (0xEE, 0xF1, 0xFE)
TINTA = (0x0F, 0x17, 0x2A)
PIZARRA = (0x47, 0x55, 0x69)
BLANCO = (0xFF, 0xFF, 0xFF)
FONDO_SUAVE = (0xF8, 0xFA, 0xFF)

FONTS = {w: HERE / f"Inter-{w}.ttf" for w in (400, 500, 600, 700)}

ICO_SIZES = (16, 20, 24, 32, 40, 48, 64, 128, 256)
ICO_PNG_FROM = 256  # a partir de aquí la entrada va como PNG (como el .ico anterior)


def font(weight: int, size: float) -> ImageFont.FreeTypeFont:
    path = FONTS[weight]
    if not path.exists():
        sys.exit(f"Falta la fuente {path.name} en {HERE}")
    return ImageFont.truetype(str(path), max(1, int(round(size))))


def ink_mask(text: str, fnt: ImageFont.FreeTypeFont, pad: int = 8, stroke: int = 0) -> tuple[Image.Image, tuple[int, int, int, int]]:
    """Renderiza `text` en una máscara L y devuelve (máscara, bbox de tinta)."""
    l, t, r, b = fnt.getbbox(text, stroke_width=stroke)
    w, h = r - l + 2 * pad, b - t + 2 * pad
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).text((pad - l, pad - t), text, font=fnt, fill=255, stroke_width=stroke, stroke_fill=255)
    bbox = mask.getbbox() or (0, 0, w, h)
    return mask, bbox


def group_go(size_px: int, ss: int, ratio: float, kern: float, stroke_ratio: float) -> Image.Image:
    """
    Máscara del grupo «GO» cuyo ancho de tinta ≈ ratio·x, con x = size_px·ss.
    `kern` multiplica la separación natural entre G y O (1 = la de la fuente).
    `stroke_ratio` engrosa el trazo (fracción del tamaño final, para ≤ 24 px).
    """
    x = size_px * ss
    target = ratio * x
    stroke = int(round(stroke_ratio * ss))
    # Primera estimación y ajuste proporcional (una iteración basta: es lineal).
    fsize = x * 0.36
    for _ in range(2):
        f = font(700, fsize)
        mg, bg = ink_mask("G", f, stroke=stroke)
        mo, bo = ink_mask("O", f, stroke=stroke)
        wg, wo = bg[2] - bg[0], bo[2] - bo[0]
        gap_nat = f.getlength("GO") - f.getlength("G") - f.getlength("O")  # kerning del par
        # Separación natural = avance de G − tinta de G + LSB de O (+ kerning del par).
        gap = (f.getlength("G") - wg + gap_nat) * kern
        total = wg + gap + wo
        fsize *= target / total
    f = font(700, fsize)
    mg, bg = ink_mask("G", f, stroke=stroke)
    mo, bo = ink_mask("O", f, stroke=stroke)
    wg, wo = bg[2] - bg[0], bo[2] - bo[0]
    gap_nat = f.getlength("GO") - f.getlength("G") - f.getlength("O")
    gap = max(0.0, (f.getlength("G") - wg + gap_nat) * kern)
    # Alinear por línea base: ambas máscaras se pintaron con el mismo origen
    # vertical (pad - top del bbox del texto), así que comparten la línea base
    # si se pegan con el mismo desplazamiento vertical.
    top = min(bg[1], bo[1])
    bottom = max(bg[3], bo[3])
    group = Image.new("L", (int(round(wg + gap + wo)), bottom - top), 0)
    group.paste(mg.crop((bg[0], top, bg[2], bottom)), (0, 0))
    group.paste(mo.crop((bo[0], top, bo[2], bottom)), (int(round(wg + gap)), 0))
    return group


def isotype(size_px: int, bg=AZUL_GO, fg=BLANCO, ss: int = 8, margin: float = 0.0,
            ratio: float | None = None, kern: float | None = None, stroke_ratio: float | None = None) -> Image.Image:
    """
    Isotipo plano de lado `size_px` (RGBA). Radio 0,29·x. «GO» centrado
    ópticamente. Con `margin` (fracción de x) deja aire transparente alrededor.
    """
    # Parámetros por tamaño: el manual fija 0,52·x; en icono de sistema pequeño
    # se abre el grupo y se engrosa el trazo para que «GO» siga leyéndose.
    # Valores elegidos a ojo sobre una hoja de contacto a 10 aumentos
    # (tamaño: ancho del grupo, kerning, engrosado del trazo en px finales).
    small = {16: (0.72, 1.0, 0.12), 20: (0.66, 1.0, 0.10), 24: (0.62, 1.0, 0.06), 32: (0.58, 1.0, 0.0)}
    r0, k0, s0 = small.get(size_px, (0.52, 1.0, 0.0))
    if ratio is None:
        ratio = r0
    if kern is None:
        kern = k0
    if stroke_ratio is None:
        stroke_ratio = s0

    S = size_px * ss
    m = int(round(margin * S))
    side = S - 2 * m
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((m, m, m + side - 1, m + side - 1), radius=int(round(0.29 * side)), fill=bg + (255,))

    group = group_go(size_px, ss, ratio * (side / S), kern, stroke_ratio)
    gw, gh = group.size
    # Centrado óptico: la tinta de «GO» se centra en el cuadrado; las curvas de
    # la O sobresalen igual arriba y abajo, así que el centro geométrico de la
    # tinta ya es el óptico. Se baja un 1 % de x porque el ojo percibe las
    # mayúsculas ligeramente altas cuando están centradas al milímetro.
    ox = m + (side - gw) // 2
    oy = m + (side - gh) // 2 + int(round(0.01 * side))
    layer = Image.new("RGBA", (S, S), fg + (0,))
    layer.putalpha(Image.new("L", (S, S), 0))
    layer.paste(Image.new("RGBA", (gw, gh), fg + (255,)), (ox, oy), group)
    img.alpha_composite(layer)
    return img.resize((size_px, size_px), Image.LANCZOS) if ss > 1 else img


def text_image(text: str, weight: int, size_px: float, color, ss: int = 4) -> Image.Image:
    """Texto Inter renderizado a `ss` aumentos y reducido: bordes limpios en BMP."""
    f = font(weight, size_px * ss)
    mask, bbox = ink_mask(text, f)
    mask = mask.crop(bbox)
    out = Image.new("RGBA", mask.size, color + (0,))
    out.putalpha(mask)
    return out.resize((max(1, mask.width // ss), max(1, mask.height // ss)), Image.LANCZOS)


def cap_height(weight: int, size_px: float) -> float:
    f = font(weight, size_px)
    l, t, r, b = f.getbbox("H")
    return b - t


def signature(x: int, mark_bg, mark_fg, text_color, ss: int = 4) -> Image.Image:
    """
    Firma: isotipo de lado x + «GO Admin» (GO 700, Admin 500), separación x/3,
    altura de mayúsculas ≈ 0,60·x. Devuelve RGBA con fondo transparente.
    """
    mark = isotype(x, bg=mark_bg, fg=mark_fg, ss=8)
    # Tamaño de fuente que da una altura de mayúsculas de 0,60·x.
    probe = 100.0
    fsize = 0.60 * x * probe / cap_height(700, probe)
    go = text_image("GO", 700, fsize, text_color, ss)
    admin = text_image("Admin", 500, fsize, text_color, ss)
    space = int(round(fsize * 0.26))
    gap = int(round(x / 3))
    w = x + gap + go.width + space + admin.width
    h = x
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.alpha_composite(mark, (0, 0))
    # Alinear la línea base del texto: ambas palabras comparten altura de
    # mayúsculas (sin descendentes), así que se centran verticalmente igual.
    ty = (h - go.height) // 2
    out.alpha_composite(go, (x + gap, ty))
    out.alpha_composite(admin, (x + gap + go.width + space, ty + (go.height - admin.height)))
    return out


# ── .ico ──

def bmp_entry(img: Image.Image) -> bytes:
    """Entrada BMP de 32 bpp (BGRA, filas de abajo arriba) + máscara AND de 1 bpp."""
    w, h = img.size
    img = img.convert("RGBA")
    header = struct.pack("<IiiHHIIiiII", 40, w, h * 2, 1, 32, 0, 0, 0, 0, 0, 0)
    px = img.load()
    rows = []
    for y in range(h - 1, -1, -1):
        row = bytearray()
        for xx in range(w):
            r, g, b, a = px[xx, y]
            row += bytes((b, g, r, a))
        rows.append(bytes(row))
    stride = ((w + 31) // 32) * 4
    mask_rows = []
    for y in range(h - 1, -1, -1):
        bits = bytearray(stride)
        for xx in range(w):
            if px[xx, y][3] == 0:
                bits[xx // 8] |= 0x80 >> (xx % 8)
        mask_rows.append(bytes(bits))
    return header + b"".join(rows) + b"".join(mask_rows)


def png_entry(img: Image.Image) -> bytes:
    import io
    buf = io.BytesIO()
    img.convert("RGBA").save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def write_ico(path: Path, images: list[Image.Image]) -> None:
    entries = []
    for im in images:
        data = png_entry(im) if im.width >= ICO_PNG_FROM else bmp_entry(im)
        entries.append((im, data))
    out = bytearray(struct.pack("<HHH", 0, 1, len(entries)))
    offset = 6 + 16 * len(entries)
    blobs = []
    for im, data in entries:
        w = 0 if im.width >= 256 else im.width
        h = 0 if im.height >= 256 else im.height
        out += struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(data), offset)
        blobs.append(data)
        offset += len(data)
    for b in blobs:
        out += b
    path.write_bytes(bytes(out))


def inspect_ico(path: Path) -> list[tuple[int, int, str]]:
    d = path.read_bytes()
    _, _, n = struct.unpack("<HHH", d[:6])
    rows = []
    for i in range(n):
        w, h, _, _, _, bpp, size, off = struct.unpack("<BBBBHHII", d[6 + 16 * i: 22 + 16 * i])
        kind = "PNG" if d[off: off + 8] == b"\x89PNG\r\n\x1a\n" else "BMP"
        rows.append((w or 256, bpp, kind))
    return rows


# ── BMP de NSIS ──

def save_bmp24(img: Image.Image, path: Path) -> None:
    """BMP de 24 bits, BI_RGB, sin canal alfa: es lo único que acepta NSIS."""
    img.convert("RGB").save(str(path), format="BMP")
    d = path.read_bytes()
    bpp = struct.unpack("<H", d[28:30])[0]
    comp = struct.unpack("<I", d[30:34])[0]
    assert bpp == 24 and comp == 0, f"{path.name}: BMP inesperado (bpp={bpp}, compresión={comp})"


def header_bmp() -> Image.Image:
    """
    150×57. Fondo suave (igual que MUI_BGCOLOR: el bitmap se funde con la
    cabecera) con la firma en Tinta a la derecha. El texto de página de NSIS
    va a la izquierda de la cabecera, fuera del bitmap.
    """
    W, H = 150, 57
    img = Image.new("RGBA", (W, H), FONDO_SUAVE + (255,))
    sig = signature(24, AZUL_GO, BLANCO, TINTA)
    img.alpha_composite(sig, ((W - sig.width) // 2, (H - sig.height) // 2))
    return img


def sidebar_bmp() -> Image.Image:
    """
    164×314. Azul GO con la variante negativa del isotipo, «GO Admin» y el
    mensaje del manual («Tu negocio, en un solo lugar»). Un solo mensaje,
    mucho aire, sin degradados.
    """
    W, H = 164, 314
    img = Image.new("RGBA", (W, H), AZUL_GO + (255,))
    mark = isotype(64, bg=BLANCO, fg=AZUL_GO, ss=8)
    img.alpha_composite(mark, ((W - 64) // 2, 62))
    fsize = 0.60 * 32 * 100 / cap_height(700, 100)  # mayúsculas ≈ 19 px
    go = text_image("GO", 700, fsize, BLANCO)
    admin = text_image("Admin", 500, fsize, BLANCO)
    space = int(round(fsize * 0.26))
    tw = go.width + space + admin.width
    ty = 62 + 64 + 22
    img.alpha_composite(go, ((W - tw) // 2, ty))
    img.alpha_composite(admin, ((W - tw) // 2 + go.width + space, ty + (go.height - admin.height)))
    line1 = text_image("Tu negocio,", 400, 12.5, BLANCO)
    line2 = text_image("en un solo lugar.", 400, 12.5, BLANCO)
    ly = ty + go.height + 18
    img.alpha_composite(line1, ((W - line1.width) // 2, ly))
    img.alpha_composite(line2, ((W - line2.width) // 2, ly + 19))
    return img


# ── Hoja de contacto ──

def preview(images: dict[str, Image.Image]) -> Image.Image:
    pad = 24
    tiles = []
    for name, im in images.items():
        label = text_image(name, 500, 12, PIZARRA)
        w = max(im.width, label.width) + pad * 2
        h = im.height + label.height + pad * 2 + 8
        tile = Image.new("RGBA", (w, h), FONDO_SUAVE + (255,))
        # Cuadrícula sutil para ver el alfa de los iconos.
        ImageDraw.Draw(tile).rectangle((pad - 1, pad - 1, pad + im.width, pad + im.height), outline=TINTE_GO)
        tile.alpha_composite(im.convert("RGBA"), (pad, pad))
        tile.alpha_composite(label, (pad, pad + im.height + 8))
        tiles.append(tile)
    W = sum(t.width for t in tiles) + pad
    H = max(t.height for t in tiles) + pad
    sheet = Image.new("RGBA", (W, H), FONDO_SUAVE + (255,))
    x = pad // 2
    for t in tiles:
        sheet.alpha_composite(t, (x, pad // 2))
        x += t.width
    return sheet


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--preview", action="store_true", help="genera build/brand/preview.png")
    args = ap.parse_args()

    # 1. Icono
    big = isotype(1024, ss=4)
    big.save(BUILD / "icon.png", format="PNG", optimize=True)
    ico_images = [isotype(s, ss=16 if s <= 32 else 8) for s in ICO_SIZES]
    write_ico(BUILD / "icon.ico", ico_images)
    print("icon.ico:", inspect_ico(BUILD / "icon.ico"))

    # 2. Isotipo para la barra propia, el splash y la pantalla sin conexión.
    TOOLBAR.mkdir(parents=True, exist_ok=True)
    isotype(128, ss=8).save(TOOLBAR / "brand-mark.png", format="PNG", optimize=True)

    # 3. Imágenes NSIS
    hdr, sb = header_bmp(), sidebar_bmp()
    save_bmp24(hdr, BUILD / "installer-header.bmp")
    save_bmp24(sb, BUILD / "installer-sidebar.bmp")
    for name in ("installer-header.bmp", "installer-sidebar.bmp"):
        im = Image.open(BUILD / name)
        print(f"{name}: {im.size} {im.mode}")

    if args.preview:
        sheet = preview({
            "icon 16": ico_images[0], "icon 20": ico_images[1], "icon 24": ico_images[2],
            "icon 32": ico_images[3], "icon 48": ico_images[5], "icon 128": ico_images[7],
            "brand-mark 128": Image.open(TOOLBAR / "brand-mark.png"),
            "header 150×57": hdr, "sidebar 164×314": sb,
        })
        sheet.convert("RGB").save(HERE / "preview.png", format="PNG", optimize=True)
        print("preview:", HERE / "preview.png")


if __name__ == "__main__":
    main()
