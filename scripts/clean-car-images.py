"""Tidy the pictures saved by fetch-car-images.mjs: clear stray marks (watermarks), drop the dealer's baked-in
shadow so the app's own ground shadow is the only one, trim to the car and cap the width at 1200 px.
Dev-time only (needs Pillow). Safe to run again. Usage: python3 scripts/clean-car-images.py [file.png ...]"""
import glob
import os
import sys

from PIL import Image

MAX_WIDTH = 1200
SOLID = 235  # alpha at or above this is the car; anything lighter is shadow or edge softening


def clean(path):
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()
    solid = im.getchannel("A").point(lambda v: 255 if v >= SOLID else 0)
    sp = solid.load()

    # Keep only the rows and columns that hold the car body; isolated marks sit outside them.
    rows = [sum(1 for x in range(w) if sp[x, y]) for y in range(h)]
    ys = [y for y, v in enumerate(rows) if v > 0.12 * w]
    if not ys:
        return None
    y0, y1 = min(ys), max(ys) + 1
    cols = [sum(1 for y in range(y0, y1) if sp[x, y]) for x in range(w)]
    cmax = max(cols)
    xs = [x for x, v in enumerate(cols) if v > 0.04 * cmax]
    x0, x1 = min(xs), max(xs) + 1
    for y in range(h):
        for x in range(w):
            if not (y0 <= y < y1 and x0 <= x < x1):
                px[x, y] = (0, 0, 0, 0)

    # Below the body line only tires remain, so lighter pixels there are the dealer's shadow.
    cut = y0 + int((y1 - y0) * 0.78)
    for y in range(cut, h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < SOLID:
                px[x, y] = (r, g, b, 0)

    box = im.getchannel("A").point(lambda v: 255 if v >= SOLID else 0).getbbox()
    pad = 4
    out = im.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(w, box[2] + pad), min(h, box[3] + pad)))
    if out.width > MAX_WIDTH:
        out = out.resize((MAX_WIDTH, round(out.height * MAX_WIDTH / out.width)), Image.LANCZOS)
    before = os.path.getsize(path)
    out.save(path, optimize=True)
    return before, os.path.getsize(path), out.size


for f in sys.argv[1:] or sorted(glob.glob("public/cars/*.png")):
    r = clean(f)
    print(os.path.basename(f), "skipped (no car found)" if r is None else f"{r[2]} {r[0] // 1024} KB -> {r[1] // 1024} KB")
