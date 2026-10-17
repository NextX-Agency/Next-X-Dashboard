"""Builds side-by-side comparison sheets of the three concepts from the rendered captures.

    python scripts/design-review/compare.py

Reads docs/design-review/concepts/preview-<a|b|c>[-product|-dashboard]-fold-<width>.png and writes
compare-<page>-<width>.png next to them: three columns, labelled, same scale.
"""
import os

from PIL import Image, ImageDraw

SRC = os.path.join('docs', 'design-review', 'concepts')
NAMES = {'a': 'A · Het Magazine', 'b': 'B · Spec', 'c': 'C · Rustig'}
PAGES = {'home': '', 'product': '-product', 'dashboard': '-dashboard'}

for width in (390, 768, 1440):
    for page, suffix in PAGES.items():
        files = [os.path.join(SRC, f'preview-{c}{suffix}-fold-{width}.png') for c in 'abc']
        if not all(os.path.exists(f) for f in files):
            continue
        images = [Image.open(f).convert('RGB') for f in files]
        scale = 1.0 if width >= 1440 else 1.0
        gap, head = 24, 44
        w = sum(i.size[0] for i in images) + gap * 4
        h = max(i.size[1] for i in images) + head + gap * 2
        sheet = Image.new('RGB', (w, h), (36, 36, 34))
        d = ImageDraw.Draw(sheet)
        x = gap
        for letter, image in zip('abc', images):
            d.text((x, 14), f'{NAMES[letter]}  ·  {page}  ·  {width}px', fill=(240, 238, 232))
            sheet.paste(image, (x, head))
            x += image.size[0] + gap
        if width >= 1440:
            sheet = sheet.resize((sheet.size[0] // 2, sheet.size[1] // 2), Image.LANCZOS)
        out = os.path.join(SRC, f'compare-{page}-{width}.png')
        sheet.save(out, optimize=True)
        print('wrote', out, sheet.size)


# Desktop is easier to judge stacked: three rows at a readable width.
for page, suffix in PAGES.items():
    files = [os.path.join(SRC, f'preview-{c}{suffix}-fold-1440.png') for c in 'abc']
    if not all(os.path.exists(f) for f in files):
        continue
    images = [Image.open(f).convert('RGB') for f in files]
    target_w = 1100
    scaled = [i.resize((target_w, int(i.size[1] * target_w / i.size[0])), Image.LANCZOS) for i in images]
    gap, head = 18, 34
    h = sum(i.size[1] for i in scaled) + (head + gap) * 3
    sheet = Image.new('RGB', (target_w + 2 * gap, h), (36, 36, 34))
    d = ImageDraw.Draw(sheet)
    y = gap
    for letter, image in zip('abc', scaled):
        d.text((gap, y), f'{NAMES[letter]}  ·  {page}  ·  1440px', fill=(240, 238, 232))
        sheet.paste(image, (gap, y + head))
        y += head + image.size[1] + gap
    out = os.path.join(SRC, f'compare-{page}-desktop-stacked.png')
    sheet.save(out, optimize=True)
    print('wrote', out, sheet.size)
