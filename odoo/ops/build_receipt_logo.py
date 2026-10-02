"""Derive the thermal-safe NextX receipt mark from the real NextX logo and embed it in the receipt template.

    python odoo/ops/build_receipt_logo.py

Thermal printers are 1-bit: colour fills smear and hairlines vanish. The mark keeps the black "Next" wordmark and the
outlined X (thick strokes), and drops the frame and the circuit traces (thin strokes), by colour separation plus a
stroke-width filter. Output: odoo/addons/nextx_branding/static/src/img/nextx-receipt-logo.png (1-bit) and the same
bytes embedded in views/pos_receipt.xml as a data URI. Idempotent.
"""
import base64
import re
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "public" / "nextx-logo-light.png"
OUT = ROOT / "odoo" / "addons" / "nextx_branding" / "static" / "src" / "img" / "nextx-receipt-logo.png"
XML = ROOT / "odoo" / "addons" / "nextx_branding" / "views" / "pos_receipt.xml"
WIDTH = 360          # dots; an 80 mm head is 576 dots wide, 58 mm is 384
MIN_COMPONENT = 1500  # px at source scale: removes stray circuit nodes

im = Image.open(SRC).convert("RGBA")
bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
bg.alpha_composite(im)
a = np.array(bg.convert("RGB")).astype(int)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
black = (r < 90) & (g < 90) & (b < 90)
orange = (r > 180) & (g > 60) & (g < 170) & (b < 90)
H, W = black.shape
inside = np.zeros((H, W), bool)
inside[70:322, 85:868] = True  # inside the frame

ink = Image.fromarray((((black | orange) & inside) * 255).astype("uint8"))
ink = ink.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))  # drop hairlines
arr = np.array(ink) > 0
seen = np.zeros_like(arr)
keep = np.zeros_like(arr)
for y in range(H):
    for x in range(W):
        if arr[y, x] and not seen[y, x]:
            q, pts = deque([(y, x)]), []
            seen[y, x] = True
            while q:
                cy, cx = q.popleft()
                pts.append((cy, cx))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < H and 0 <= nx < W and arr[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            if len(pts) >= MIN_COMPONENT:
                for p in pts:
                    keep[p] = True

mark = Image.fromarray((keep * 255).astype("uint8"))
mark = ImageChops.invert(mark.crop(mark.getbbox()))
h = round(mark.height * WIDTH / mark.width)
out = mark.resize((WIDTH, h), Image.LANCZOS).point(lambda v: 255 if v > 150 else 0).convert("1")
out.save(OUT, optimize=True)

b64 = base64.b64encode(OUT.read_bytes()).decode()
xml = XML.read_text(encoding="utf8")
xml = re.sub(r"data:image/png;base64,[A-Za-z0-9+/=_]+", f"data:image/png;base64,{b64}", xml, count=1)
XML.write_text(xml, encoding="utf8")
print(f"receipt logo {out.size} embedded ({len(b64)} base64 chars)")
