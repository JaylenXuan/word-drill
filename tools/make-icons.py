# -*- coding: utf-8 -*-
"""
从 assets/whale/icon-preview.png 派生主屏图标（原图不动、不重绘、不改色）。

做的事只有两件：
  1. 等比缩放
  2. 垫上一层奶油底（iOS 会把透明区域渲染成黑色，垫底能避免）

用法：python tools/make-icons.py
输出：assets/whale/icons/*.png
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/whale/icon-preview.png"
OUT = ROOT / "assets/whale/icons"
CREAM = (251, 249, 245, 255)  # 与 styles.css 的 --bg 一致

# 尺寸与留白比例（maskable 需要更大的安全边距，免得被系统裁掉边）
TARGETS = [
    ("apple-touch-icon-180.png", 180, 0.06),
    ("icon-192.png", 192, 0.06),
    ("icon-512.png", 512, 0.06),
    ("maskable-512.png", 512, 0.18),
]


def build(src: Image.Image, size: int, pad_ratio: float) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), CREAM)
    inner = int(size * (1 - pad_ratio * 2))
    # 用 LANCZOS 缩小时清晰；放大时用 BICUBIC 更柔和
    resample = Image.LANCZOS if inner <= src.width else Image.BICUBIC
    art = src.resize((inner, inner), resample)
    offset = ((size - inner) // 2, (size - inner) // 2)
    canvas.alpha_composite(art, offset)
    return canvas.convert("RGB")  # 图标不需要透明通道，省体积


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    src = Image.open(SRC).convert("RGBA")
    print(f"source {SRC.name} {src.size[0]}x{src.size[1]}")
    for name, size, pad in TARGETS:
        img = build(src, size, pad)
        path = OUT / name
        img.save(path, "PNG", optimize=True)
        print(f"  [ok] {name}  {size}x{size}  {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()

