#!/usr/bin/env python3
"""
DMG 安装背景生成器
使用 Pillow 生成带软件亮点文字的安装背景 PNG
"""

import os
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 660, 400
OUTPUT = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'build', 'dmg-bg.png')


def find_font():
    """找一个好看的中英文字体"""
    candidates = [
        '/System/Library/Fonts/PingFang.ttc',
        '/System/Library/Fonts/STHeiti Light.ttc',
        '/System/Library/Fonts/Helvetica.ttc',
        '/System/Library/Fonts/SFNSDisplay.ttf',
        '/System/Library/Fonts/SFNSText.ttf',
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return None


def main():
    img = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    font_path = find_font()

    def font(size):
        try:
            return ImageFont.truetype(font_path, size) if font_path else ImageFont.load_default()
        except:
            return ImageFont.load_default()

    # 颜色
    BG_TOP = (12, 15, 20)
    BG_BOT = (22, 28, 36)
    BLUE = (29, 155, 240)
    GREEN = (0, 186, 124)
    ORANGE = (245, 166, 35)
    WHITE = (231, 233, 234)
    TEXT_SEC = (113, 118, 123)
    TEXT_MUTED = (83, 100, 113)
    CARD_BG = (30, 38, 48, 210)
    BORDER = (47, 51, 54)

    # 渐变背景
    for y in range(HEIGHT):
        t = y / HEIGHT
        r = int(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t)
        g = int(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t)
        b = int(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t)
        draw.line([(0, y), (WIDTH, y)], fill=(r, g, b))

    # 顶部彩色装饰条
    colors = [BLUE, GREEN, ORANGE]
    seg_w = WIDTH // 3
    for i, col in enumerate(colors):
        x0 = i * seg_w
        x1 = (i + 1) * seg_w if i < 2 else WIDTH
        draw.rectangle([x0, 0, x1, 2], fill=col)
        draw.rectangle([x0, 2, x1, 3], fill=tuple(int(c * 0.5) for c in col))

    # 应用图标区域
    draw.rounded_rectangle([40, 44, 104, 108], radius=14, fill=BLUE)
    draw.rounded_rectangle([50, 54, 94, 86], radius=6, fill=(255, 255, 255, 220))
    # 三角
    draw.polygon([(62, 86), (62, 94), (76, 86)], fill=(255, 255, 255, 220))

    # 标题
    f24 = font(20)
    f16 = font(14)
    f14 = font(12)
    f12 = font(11)

    tx, ty = 124, 50
    draw.text((tx, ty), '外语口语', fill=WHITE, font=f24)
    draw.text((tx + 120, ty), '学习助手', fill=BLUE, font=f24)

    # 版本
    draw.text((tx + 4, ty + 36), 'v1.4.2', fill=TEXT_SEC, font=f16)

    # 功能卡片
    cx, cy, cw, ch = 40, 150, WIDTH - 80, 210
    draw.rounded_rectangle([cx, cy, cx + cw, cy + ch], radius=14, fill=CARD_BG)
    # 边框
    draw.rectangle([cx, cy, cx + cw, cy + 1], fill=BORDER)
    draw.rectangle([cx, cy + ch - 1, cx + cw, cy + ch], fill=BORDER)
    draw.rectangle([cx, cy, cx + 1, cy + ch], fill=BORDER)
    draw.rectangle([cx + cw - 1, cy, cx + cw, cy + ch], fill=BORDER)

    # 卡片标题
    draw.text((cx + 20, cy + 14), '功能亮点', fill=BLUE, font=f16)
    # 分隔
    draw.line([(cx + 20, cy + 38), (cx + cw - 20, cy + 38)], fill=BORDER)

    # 功能列表
    features = [
        ('口语练习', GREEN, 'AI 实时对话 · 多语种语音识别 · TTS 朗读'),
        ('AI 对话', BLUE, '语音/文字输入 · 多会话管理 · 一键翻译'),
        ('词汇期刊', ORANGE, 'AI 智能评估 · 定制化词汇训练 · 划词翻译'),
        ('主题切换', BLUE, '深色模式 · 浅色模式 · 跟随系统'),
    ]

    fy_start = cy + 54
    fgap = 34

    for i, (label, dot_color, desc) in enumerate(features):
        fy = fy_start + i * fgap

        # 彩色圆点
        draw.ellipse([cx + 26, fy + 1, cx + 36, fy + 11], fill=dot_color)
        # 内圈白色
        draw.ellipse([cx + 28, fy + 3, cx + 34, fy + 9], fill=(255, 255, 255, 180))

        # 标题
        draw.text((cx + 46, fy - 2), label, fill=WHITE, font=f14)

        # 描述
        draw.text((cx + 46, fy + 16), desc, fill=TEXT_SEC, font=f12)

        # 右箭头
        draw.ellipse([cx + cw - 36, fy + 2, cx + cw - 28, fy + 10], fill=TEXT_MUTED)

    # 底部小字
    bottom_text = '拖拽应用到 Applications 文件夹即可安装'
    tw = f12.getlength(bottom_text) if font_path else 200
    draw.text(((WIDTH - tw) // 2, HEIGHT - 26), bottom_text, fill=TEXT_MUTED, font=f12)

    # 右侧装饰
    dots = [('F', 0), ('L', 1), ('S', 2), ('A', 3)]
    dot_colors = [BLUE, GREEN, ORANGE, BLUE]
    for (letter, idx), col in zip(dots, dot_colors):
        dx = WIDTH - 40 - (3 - idx) * 32
        dy = HEIGHT - 36
        draw.ellipse([dx - 4, dy - 4, dx + 4, dy + 4], fill=col)

    # 保存
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    img.save(OUTPUT, 'PNG')
    print(f'✅ DMG 安装背景已生成: {OUTPUT} ({WIDTH}x{HEIGHT})')


if __name__ == '__main__':
    main()
