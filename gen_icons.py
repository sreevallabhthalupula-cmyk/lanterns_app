from PIL import Image, ImageDraw

def make_icon(size, path, maskable=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    bg = (16, 90, 130, 255)
    if maskable:
        d.rectangle([0, 0, size, size], fill=bg)
    else:
        pad = int(size * 0.06)
        d.rounded_rectangle([pad, pad, size - pad, size - pad], radius=int(size * 0.18), fill=bg)

    cx, cy = size // 2, size // 2
    eye_w = size * 0.62
    eye_h = size * 0.34
    d.ellipse([cx - eye_w / 2, cy - eye_h / 2, cx + eye_w / 2, cy + eye_h / 2], fill=(255, 255, 255, 255))
    iris_r = size * 0.15
    d.ellipse([cx - iris_r, cy - iris_r, cx + iris_r, cy + iris_r], fill=(20, 60, 90, 255))
    pupil_r = size * 0.06
    d.ellipse([cx - pupil_r, cy - pupil_r, cx + pupil_r, cy + pupil_r], fill=(255, 255, 255, 255))
    img.save(path)

make_icon(192, "icons/icon-192.png", maskable=False)
make_icon(512, "icons/icon-512.png", maskable=False)
make_icon(192, "icons/icon-maskable-192.png", maskable=True)
make_icon(512, "icons/icon-maskable-512.png", maskable=True)
print("done")
