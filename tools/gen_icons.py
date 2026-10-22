# 生成 Tauri 桌面端图标：Win11 渐变圆角方块 + 白色「文A」符号（与浏览器插件同源设计）
# 用法（配合 shell 重定向落盘）：
#   python gen_icons.py png 32  > 32x32.png
#   python gen_icons.py png 128 > 128x128.png
#   python gen_icons.py ico     > icon.ico
import struct, zlib, sys

BG_TOP = (46, 140, 232)
BG_BOT = (0, 103, 192)
FG = (255, 255, 255)

def in_rounded(x, y, size, radius):
    dx = abs(x + 0.5 - size / 2) - (size / 2 - radius)
    dy = abs(y + 0.5 - size / 2) - (size / 2 - radius)
    dx = max(dx, 0); dy = max(dy, 0)
    return dx * dx + dy * dy <= radius * radius

def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

def thick_line(x, y, x1, y1, x2, y2, thick):
    dx, dy = x2 - x1, y2 - y1
    L2 = dx * dx + dy * dy
    if L2 == 0:
        d2 = (x - x1) ** 2 + (y - y1) ** 2
    else:
        t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / L2))
        px, py = x1 + t * dx, y1 + t * dy
        d2 = (x - px) ** 2 + (y - py) ** 2
    return d2 <= (thick / 2) ** 2

def make_pixel(size):
    r = size * 0.22
    s = size
    def glyph(x, y):
        cx, cy = s / 2, s / 2
        u = s / 100.0
        t = max(1.6, 7 * u)
        ax = cx - 20 * u
        if thick_line(x, y, ax - 11 * u, cy + 17 * u, ax, cy - 17 * u, t): return True
        if thick_line(x, y, ax, cy - 17 * u, ax + 11 * u, cy + 17 * u, t): return True
        if thick_line(x, y, ax - 7 * u, cy + 4 * u, ax + 7 * u, cy + 4 * u, t * 0.85): return True
        bx = cx + 20 * u
        if thick_line(x, y, bx - 12 * u, cy - 14 * u, bx + 12 * u, cy - 14 * u, t * 0.85): return True
        if thick_line(x, y, bx, cy - 14 * u, bx - 12 * u, cy + 16 * u, t): return True
        if thick_line(x, y, bx + 2 * u, cy - 6 * u, bx + 12 * u, cy + 16 * u, t): return True
        return False
    def pixel(x, y):
        if not in_rounded(x, y, s, r):
            return (0, 0, 0, 0)
        col = lerp(BG_TOP, BG_BOT, (y + 0.5) / s)
        if y + 0.5 < r * 0.9 and in_rounded(x, y - s * 0.02, s, r - s * 0.015):
            col = lerp(col, FG, 0.32)
        if glyph(x, y):
            return FG + (255,)
        return col + (255,)
    return pixel

def build_png(size):
    rows = bytearray()
    pixel = make_pixel(size)
    for y in range(size):
        rows.append(0)
        for x in range(size):
            rows.extend(pixel(x, y))
    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data
                + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))
    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(rows), 9))
            + chunk(b'IEND', b''))

def build_ico():
    png32 = build_png(32)
    png128 = build_png(128)
    entries = [(32, png32), (128, png128)]
    header = struct.pack('<HHH', 0, 1, len(entries))
    dirdata = b''
    offset = 6 + 16 * len(entries)
    payloads = b''
    for (size, png) in entries:
        dirdata += struct.pack('<BBBBHHII',
            size % 256, size % 256, 0, 0, 1, 32, len(png), offset)
        payloads += png
        offset += len(png)
    return header + dirdata + payloads

mode = sys.argv[1] if len(sys.argv) > 1 else 'ico'
if mode == 'png':
    size = int(sys.argv[2]) if len(sys.argv) > 2 else 128
    sys.stdout.buffer.write(build_png(size))
elif mode == 'ico':
    sys.stdout.buffer.write(build_ico())
else:
    sys.exit('unknown mode: ' + mode)
