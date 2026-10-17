"""Contact sheets of review captures: first screen of each page, six per sheet.

    python scripts/design-review/sheet.py <folder> <width> <out-prefix> [crop-height]

Reads <folder>/*-<width>.png in name order and writes <out-prefix>-1.png, -2.png, ...
Each cell is the top of the page scaled to half width, labelled with its file name.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

folder, width, prefix = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
crop = int(sys.argv[4]) if len(sys.argv) > 4 else 1000
files = sorted(folder.glob(f"*-{width}.png"))
cell_w = 720 if int(width) >= 1000 else 360
cell_h = int(crop * cell_w / int(width)) if int(width) >= 1000 else int(crop * cell_w / int(width))
per_row, rows = (2, 3) if int(width) >= 1000 else (4, 2)
per_sheet = per_row * rows
for index in range(0, len(files), per_sheet):
    batch = files[index : index + per_sheet]
    sheet = Image.new("RGB", (per_row * cell_w, rows * (cell_h + 20)), "white")
    draw = ImageDraw.Draw(sheet)
    for slot, file in enumerate(batch):
        image = Image.open(file).convert("RGB")
        image = image.crop((0, 0, image.width, min(image.height, crop)))
        image = image.resize((cell_w, int(image.height * cell_w / image.width)))
        x, y = (slot % per_row) * cell_w, (slot // per_row) * (cell_h + 20)
        draw.text((x + 6, y + 4), file.stem, fill="black")
        sheet.paste(image, (x, y + 20))
    out = Path(f"{prefix}-{index // per_sheet + 1}.png")
    sheet.save(out)
    print(out)
