#!/usr/bin/env python3
"""Render TARDIS Home tile artwork into outputs/TARDIS-Home/icons/*.webp.

Vector tiles come from tiles.html (rendered with headless Chrome at 2x and
downsampled). Disney+ and SkyShowtime reuse the TV's own icons, cropped to the
5:3 tile shape around their logo. Usage: build_tiles.py [tv_icon_dir]
Without tv_icon_dir the existing disney.webp and skyshowtime.webp are kept.
"""
import os
import subprocess
import sys
import tempfile

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'outputs', 'TARDIS-Home', 'icons'))
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
TILE = (400, 240)
VECTOR = ['netflix', 'youtube', 'prime', 'appletv', 'hbomax', 'spotify', 'store']  # order in tiles.html
RASTER = {'disney': 'MCmYXNxgcu.png', 'skyshowtime': 'skysh0WTIM.png'}


def save(img, name):
    img.convert('RGB').save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=90, method=6)


def render_vector():
    with tempfile.TemporaryDirectory() as tmp:
        shot = os.path.join(tmp, 'tiles.png')
        subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                        '--force-device-scale-factor=2', '--virtual-time-budget=3000',
                        '--window-size=%d,%d' % (TILE[0], TILE[1] * len(VECTOR)),
                        '--screenshot=' + shot, 'file://' + os.path.join(HERE, 'tiles.html')],
                       check=True, capture_output=True)
        sheet = Image.open(shot)
        w, h = TILE[0] * 2, TILE[1] * 2
        for i, name in enumerate(VECTOR):
            tile = sheet.crop((0, i * h, w, (i + 1) * h)).resize(TILE, Image.LANCZOS)
            save(tile, name)


def crop_to_logo(path):
    """Crop a square icon to 5:3, centred vertically on its (white) logo."""
    icon = Image.open(path).convert('RGBA')
    flat = Image.new('RGB', icon.size, (0, 0, 0))
    flat.paste(icon, mask=icon.split()[3])
    white = flat.convert('L').point(lambda v: 255 if v > 200 else 0)
    box = white.getbbox() or (0, 0, icon.width, icon.height)
    cy = (box[1] + box[3]) / 2
    ch = round(icon.width * TILE[1] / TILE[0])
    top = int(min(max(cy - ch / 2, 0), icon.height - ch))
    return flat.crop((0, top, icon.width, top + ch)).resize(TILE, Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    render_vector()
    if len(sys.argv) > 1:
        for name, file in RASTER.items():
            save(crop_to_logo(os.path.join(sys.argv[1], file)), name)
    for f in sorted(os.listdir(OUT)):
        print(f, os.path.getsize(os.path.join(OUT, f)), 'bytes')


if __name__ == '__main__':
    main()
