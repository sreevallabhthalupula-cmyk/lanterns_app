from PIL import Image, ImageDraw
import random

random.seed(42)

img = Image.new("RGB", (500, 500), (0, 0, 0))
d = ImageDraw.Draw(img)
cx, cy, r = 250, 250, 235
# fundus-like reddish-orange disc with a brighter optic-disc-like spot
d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(150, 60, 25))
d.ellipse([cx - 60, cy - 40, cx + 20, cy + 40], fill=(210, 130, 70))  # optic disc area
for _ in range(600):
    x = random.randint(cx - r, cx + r)
    y = random.randint(cy - r, cy + r)
    if (x - cx) ** 2 + (y - cy) ** 2 < r * r:
        c = random.choice([(180, 90, 40), (120, 45, 15), (200, 110, 60)])
        d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=c)

img.save("sample_fundus_synthetic.png")
print("saved", img.size)
