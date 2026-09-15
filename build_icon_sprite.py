import re
import os

ICONS_DIR = "icons-ui"
OUT_FILE = "icons-ui/sprite.html"

symbols = []
for fname in sorted(os.listdir(ICONS_DIR)):
    if not fname.endswith(".svg"):
        continue
    name = fname[:-4]
    content = open(os.path.join(ICONS_DIR, fname), encoding="utf-8").read()
    inner = re.search(r"<svg[^>]*>(.*)</svg>", content, re.S).group(1).strip()
    symbols.append(f'<symbol id="icon-{name}" viewBox="0 0 24 24">{inner}</symbol>')

sprite = (
    '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">\n  '
    + "\n  ".join(symbols)
    + "\n</svg>"
)
open(OUT_FILE, "w", encoding="utf-8").write(sprite)
print("wrote", OUT_FILE, len(symbols), "symbols")
