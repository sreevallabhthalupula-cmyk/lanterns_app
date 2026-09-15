from PIL import Image, ImageDraw

def make_icon(size, path, maskable=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    bg = (34, 96, 255, 255)  # --color-primary #2260ff
    if maskable:
        d.rectangle([0, 0, size, size], fill=bg)
    else:
        pad = int(size * 0.06)
        d.rounded_rectangle([pad, pad, size - pad, size - pad], radius=int(size * 0.18), fill=bg)

    cx, cy = size // 2, size // 2
    white = (255, 255, 255, 255)
    stroke_w = max(2, int(size * 0.035))

    # ring handle
    ring_r = size * 0.045
    ring_cy = cy - size * 0.30
    d.ellipse([cx - ring_r, ring_cy - ring_r, cx + ring_r, ring_cy + ring_r], outline=white, width=stroke_w)
    d.line([cx, ring_cy + ring_r, cx, cy - size * 0.22], fill=white, width=stroke_w)

    # lantern body (capsule: rounded top/bottom, straight sides)
    body_half_w = size * 0.22
    body_top = cy - size * 0.22
    body_bot = cy + size * 0.20
    d.rounded_rectangle(
        [cx - body_half_w, body_top, cx + body_half_w, body_bot],
        radius=int(body_half_w),
        outline=white,
        width=stroke_w,
    )

    # middle band
    band_y = cy - size * 0.01
    d.line([cx - body_half_w, band_y, cx + body_half_w, band_y], fill=white, width=stroke_w)

    # base stem + foot
    d.line([cx, body_bot, cx, body_bot + size * 0.10], fill=white, width=stroke_w)
    foot_half_w = size * 0.06
    foot_y = body_bot + size * 0.10
    d.line([cx - foot_half_w, foot_y, cx + foot_half_w, foot_y], fill=white, width=stroke_w)

    img.save(path)

make_icon(192, "icons/icon-192.png", maskable=False)
make_icon(512, "icons/icon-512.png", maskable=False)
make_icon(192, "icons/icon-maskable-192.png", maskable=True)
make_icon(512, "icons/icon-maskable-512.png", maskable=True)
print("done")
