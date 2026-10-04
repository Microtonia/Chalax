# -*- coding: utf-8 -*-
"""Chalax —— 泛音 / 微分音网格应用服务器

- 端口 8080
- 首次启动时预计算所有音符数据到 data/notes.json（只计算一次，后续直接复用）
- 提供 /api/pics 接口，列出 data/pic 目录下的图片文件（用于背景图片下拉框）

音乐理论基础（Shasavistic music theory / LAMPLIGHT）：
  维度 1D–5D 对应素数泛音 2、3、5、7、11。
  每个格子 = 横向维度与纵向维度两个素数的幂的乘积，再做八度约减（octave reduce）
  得到落在 [1, 2) 区间的音高比，即该格子的音符。
"""

import json
import math
import sys
from fractions import Fraction
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
PIC_DIR = DATA_DIR / "pic"
NOTES_JSON = DATA_DIR / "notes.json"
DIMENSIONS_JSON = DATA_DIR / "dimensions.json"

PORT = 8080

# 维度 -> 素数泛音
PRIMES = [2, 3, 5, 7, 11]

# 维度标识颜色：1D 白、2D 红、3D 绿、4D 紫、5D 黄
DIM_COLORS = {1: "#ffffff", 2: "#ff5c5c", 3: "#2ecc71", 4: "#b07ce8", 5: "#f5d34b"}
# 音差颜色：根音(1D) 蓝、2D 红、3D 绿、4D 紫、5D 黄
DIFF_COLORS = {1: "#4dabf7", 2: "#ff5c5c", 3: "#2ecc71", 4: "#b07ce8", 5: "#f5d34b"}

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"}


def octave_reduce(fr: Fraction) -> Fraction:
    """把正有理数约减到 [1, 2) 区间（八度等价）。"""
    n, d = fr.numerator, fr.denominator
    while n < d:
        n *= 2
    while n >= 2 * d:
        d *= 2
    g = math.gcd(n, d)
    return Fraction(n // g, d // g)


def comma_ratio(fr: Fraction) -> Fraction:
    """把正有理数约减到 [1/√2, √2) 区间，得到接近 1 的逗号比（如 81/80、225/224）。"""
    n, d = fr.numerator, fr.denominator
    while n < d:
        n *= 2
    while n >= 2 * d:
        d *= 2
    # 此时 n/d ∈ [1,2)；若 > √2 则折半到 [1/√2, 1)
    if n * n > 2 * d * d:
        d *= 2
    g = math.gcd(n, d)
    return Fraction(n // g, d // g)


def cents_of(fr: Fraction) -> float:
    return 1200.0 * math.log2(fr.numerator / fr.denominator)


def build_dimensions():
    dims = []
    for i, p in enumerate(PRIMES, start=1):
        reduced = octave_reduce(Fraction(p, 1))
        dims.append({
            "dim": i,
            "prime": p,
            "ratio": [reduced.numerator, reduced.denominator],
            "cents": round(cents_of(reduced), 3),
            "color": DIM_COLORS[i],
            "diffColor": DIFF_COLORS[i],
            "name": f"{i}D",
        })
    return dims


def build_notes(rng: int):
    """对 5×5 种维度组合、每个 (x, y) 格子，预计算音符。

    matrix[y + rng][x + rng] 存单个格子的数据：
      n/d    : 八度约减后的音符频率比（相对根音）
      cents  : 该比值的音分
      diffs  : 与各泛音维度(1D–5D)的八度等价音差数组，每项 {dim, n, d, cents}，
               n/d 为逗号比（如 81/80、225/224），cents 为有符号音分。
               前端据此按阈值(0–100音分)与选中的维度进行筛选显示。
    """
    refs = {k: octave_reduce(Fraction(p, 1)) for k, p in enumerate(PRIMES, 1)}
    combos = {}
    for h in range(1, 6):
        for v in range(1, 6):
            key = f"{h}_{v}"
            p_h = PRIMES[h - 1]
            p_v = PRIMES[v - 1]
            matrix = []
            for y in range(-rng, rng + 1):
                row = []
                for x in range(-rng, rng + 1):
                    full = Fraction(p_h) ** x * Fraction(p_v) ** y
                    reduced = octave_reduce(full)
                    diffs = []
                    for k in range(1, 6):
                        q = refs[k]
                        ratio = Fraction(reduced.numerator * q.denominator,
                                         reduced.denominator * q.numerator)
                        comma = comma_ratio(ratio)
                        diffs.append({
                            "dim": k,
                            "n": comma.numerator,
                            "d": comma.denominator,
                            "cents": round(cents_of(comma), 3),
                        })
                    row.append({
                        "n": reduced.numerator,
                        "d": reduced.denominator,
                        "cents": round(cents_of(reduced), 3),
                        "diffs": diffs,
                    })
                matrix.append(row)
            combos[key] = matrix
    return combos


def generate_data(rng=8, force=False):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    PIC_DIR.mkdir(parents=True, exist_ok=True)

    if not force and NOTES_JSON.exists() and DIMENSIONS_JSON.exists():
        print(f"[Chalax] 已存在数据文件，跳过预计算（如需重新计算请用 --regen）")
        return

    dimensions = build_dimensions()
    notes = {"range": rng, "combos": build_notes(rng)}

    DIMENSIONS_JSON.write_text(
        json.dumps(dimensions, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    NOTES_JSON.write_text(
        json.dumps(notes, ensure_ascii=False), encoding="utf-8"
    )
    print(f"[Chalax] 数据已生成 -> {NOTES_JSON} (range={rng})")


class Handler(SimpleHTTPRequestHandler):
    # 补充音源采样文件的 MIME 类型（避免 Windows 下 .ogg/.mp3 被当作 text/plain）
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/pics":
            files = []
            if PIC_DIR.exists():
                for f in sorted(PIC_DIR.iterdir()):
                    if f.is_file() and f.suffix.lower() in IMAGE_EXTS:
                        files.append(f.name)
            body = json.dumps(files, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, fmt, *args):
        sys.stderr.write("[Chalax] %s - %s\n" % (self.address_string(), fmt % args))


def main():
    generate_data(force="--regen" in sys.argv)
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"[Chalax] 服务已启动: http://localhost:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[Chalax] 已停止")


if __name__ == "__main__":
    main()
