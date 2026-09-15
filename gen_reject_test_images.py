"""
Generates synthetic negative-control test images (hand, nose close-up) and
an improved positive-control fundus image (with vignette + optic disc +
branching vessels) for testing the new fundus-plausibility check.
"""
import math
import random
from PIL import Image, ImageDraw, ImageFilter

random.seed(7)


def gen_hand(path, size=600):
    img = Image.new("RGB", (size, size), (235, 228, 215))  # neutral background, no vignette
    d = ImageDraw.Draw(img)
    skin = (206, 155, 121)
    skin_shadow = (176, 122, 92)

    cx, cy = size * 0.5, size * 0.62
    # palm
    d.ellipse([cx - 130, cy - 110, cx + 130, cy + 150], fill=skin)
    # fingers: elongated rounded rectangles radiating from palm top
    finger_specs = [(-100, -260, 40), (-45, -300, 38), (10, -305, 38), (65, -280, 36), (120, -230, 50)]
    for dx, dy, w in finger_specs:
        x0, y0 = cx + dx - w / 2, cy + dy
        x1, y1 = cx + dx + w / 2, cy - 40
        d.rounded_rectangle([x0, y0, x1, y1], radius=w / 2, fill=skin)
    # soft shading (no hard edges, no black ring)
    shade = Image.new("L", (size, size), 0)
    sd = ImageDraw.Draw(shade)
    sd.ellipse([cx - 220, cy - 320, cx + 220, cy + 220], fill=60)
    shade = shade.filter(ImageFilter.GaussianBlur(60))
    shadow_layer = Image.new("RGB", (size, size), skin_shadow)
    img = Image.composite(shadow_layer, img, shade.point(lambda p: 255 - p))
    img = img.filter(ImageFilter.GaussianBlur(1.2))
    # mild sensor noise so it's not perfectly flat
    px = img.load()
    for _ in range(9000):
        x, y = random.randint(0, size - 1), random.randint(0, size - 1)
        n = random.randint(-8, 8)
        r, g, b = px[x, y]
        px[x, y] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))
    img.save(path)


def gen_nose_closeup(path, size=600):
    img = Image.new("RGB", (size, size), (220, 190, 165))
    d = ImageDraw.Draw(img)
    cx, cy = size / 2, size / 2
    # soft radial gradient (bright center, gently darker toward edges -- NOT black, NOT sharp)
    grad = Image.new("L", (size, size), 0)
    gpx = grad.load()
    maxr = math.hypot(cx, cy)
    for y in range(size):
        for x in range(size):
            r = math.hypot(x - cx, y - cy) / maxr
            gpx[x, y] = int(255 * max(0.0, 1 - r * 0.55))  # gentle falloff, edges still ~45% bright
    skin_light = (232, 200, 178)
    skin_dark = (196, 150, 120)
    light_layer = Image.new("RGB", (size, size), skin_light)
    dark_layer = Image.new("RGB", (size, size), skin_dark)
    img = Image.composite(light_layer, dark_layer, grad)
    # nostril shadows (soft dark blobs, not bright disc)
    d = ImageDraw.Draw(img)
    d.ellipse([cx - 60, cy + 40, cx - 20, cy + 90], fill=(120, 80, 60))
    d.ellipse([cx + 20, cy + 40, cx + 60, cy + 90], fill=(120, 80, 60))
    img = img.filter(ImageFilter.GaussianBlur(4))
    px = img.load()
    for _ in range(9000):
        x, y = random.randint(0, size - 1), random.randint(0, size - 1)
        n = random.randint(-6, 6)
        r, g, b = px[x, y]
        px[x, y] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))
    img.save(path)


def gen_fundus_with_vessels(path, size=600):
    img = Image.new("RGB", (size, size), (0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = size / 2, size / 2
    r = size * 0.46

    # hard-edged circular vignette: draw the fundus disc directly, no gradient
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(140, 55, 35))

    # texture noise across the disc
    px = img.load()
    for y in range(size):
        for x in range(size):
            if (x - cx) ** 2 + (y - cy) ** 2 < r * r:
                cur = px[x, y]
                n = random.randint(-18, 18)
                px[x, y] = (
                    max(0, min(255, cur[0] + n)),
                    max(0, min(255, cur[1] + int(n * 0.6))),
                    max(0, min(255, cur[2] + int(n * 0.3))),
                )

    # optic disc: bright near-white/yellow small circular region, offset from center
    disc_cx, disc_cy, disc_r = cx - r * 0.28, cy - r * 0.05, r * 0.17
    d = ImageDraw.Draw(img)
    d.ellipse([disc_cx - disc_r, disc_cy - disc_r, disc_cx + disc_r, disc_cy + disc_r], fill=(238, 220, 170))

    # branching vessels radiating from near the optic disc
    def draw_branch(x, y, angle, length, width, depth):
        if depth <= 0 or length < 8:
            return
        steps = int(length)
        cx2, cy2 = x, y
        for i in range(steps):
            angle += random.uniform(-0.06, 0.06)
            nx = cx2 + math.cos(angle)
            ny = cy2 + math.sin(angle)
            if (nx - cx) ** 2 + (ny - cy) ** 2 >= (r * 0.97) ** 2:
                break
            d.line([cx2, cy2, nx, ny], fill=(90, 25, 20), width=max(1, int(width)))
            cx2, cy2 = nx, ny
            if random.random() < 0.02 and depth > 1:
                draw_branch(cx2, cy2, angle + random.uniform(0.4, 0.9), length * 0.6, width * 0.7, depth - 1)
                angle -= random.uniform(0.3, 0.7)
        draw_branch(cx2, cy2, angle, length * 0.55, width * 0.75, depth - 1)

    for base_angle in [0.3, 1.4, 2.6, 3.9, 5.0, 5.9]:
        draw_branch(disc_cx, disc_cy, base_angle, r * 0.85, 3.2, 4)

    img = img.filter(ImageFilter.GaussianBlur(0.6))

    # re-stamp a hard black ring to guarantee a sharp vignette edge survives the blur
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    md.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    black = Image.new("RGB", (size, size), (0, 0, 0))
    img = Image.composite(img, black, mask)

    img.save(path)


if __name__ == "__main__":
    gen_hand("test_hand.png")
    gen_nose_closeup("test_nose.png")
    gen_fundus_with_vessels("test_fundus_positive.png")
    print("done")
