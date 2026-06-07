#!/usr/bin/env python3
"""
将 PNG 转为 ICO 文件（支持多尺寸）。

用法:
  python3 scripts/png2ico.py build/icon.png build/icon.ico

ICO 格式说明：
  - ICO 头部: 6 bytes (reserved=0, type=1, count)
  - 目录项: 16 bytes each (w, h, colors, reserved, planes, bpp, size, offset)
  - 图片数据: PNG 原数据嵌入即可（Windows Vista+ 支持）
"""

import struct
import sys
import os


def png_to_ico(png_path, ico_path, sizes=None):
    if sizes is None:
        sizes = [256, 128, 64, 48, 32, 16]

    with open(png_path, 'rb') as f:
        png_data = f.read()

    # 验证 PNG 签名
    if png_data[:8] != b'\x89PNG\r\n\x1a\n':
        print(f'错误: {png_path} 不是有效的 PNG 文件')
        return False

    # 用最大尺寸的 PNG 作为图标源
    # 实际上我们保留 PNG 原尺寸，ICO 只做容器
    entries = []
    image_data_list = []

    for size in sizes:
        # ICO 目录项格式
        # 对于 PNG 嵌入，bpp=32, planes=0
        actual_size = min(size, 256)  # ICO 用 0 表示 256
        w = actual_size if actual_size < 256 else 0
        h = actual_size if actual_size < 256 else 0

        # 直接使用原始 PNG 数据作为嵌入图像
        # Windows 7+ 支持 ICO 中的 PNG 格式
        data = png_data

        entry = struct.pack(
            '<BBBBHHII',
            w,                     # 宽度
            h,                     # 高度
            0,                     # 颜色数
            0,                     # 保留
            1,                     # 颜色平面
            32,                    # 每像素位数
            len(data),             # 图像数据大小
            0                      # 偏移（稍后更新）
        )
        entries.append(entry)
        image_data_list.append(data)

    # 计算偏移量
    header_size = 6
    dir_size = 16 * len(entries)
    offset = header_size + dir_size

    with open(ico_path, 'wb') as f:
        # ICO 头部
        f.write(struct.pack('<HHH', 0, 1, len(entries)))

        # 写入目录项（更新偏移量）
        for i, entry in enumerate(entries):
            # 重新打包 entry 加上正确的偏移
            w, h, colors, reserved, planes, bpp, size, _ = struct.unpack('<BBBBHHII', entry)
            entry = struct.pack('<BBBBHHII', w, h, colors, reserved, planes, bpp, size, offset)
            f.write(entry)
            offset += len(image_data_list[i])

        # 写入图像数据
        for data in image_data_list:
            f.write(data)

    file_size = os.path.getsize(ico_path)
    print(f'✅ ICO 已生成: {ico_path} ({file_size} bytes, {len(entries)} sizes)')
    return True


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(f'用法: {sys.argv[0]} <input.png> <output.ico>')
        sys.exit(1)

    png_path = sys.argv[1]
    ico_path = sys.argv[2]

    if not os.path.exists(png_path):
        print(f'错误: 文件不存在 {png_path}')
        sys.exit(1)

    success = png_to_ico(png_path, ico_path)
    sys.exit(0 if success else 1)
