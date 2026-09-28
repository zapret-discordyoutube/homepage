#!/usr/bin/env python3
"""Веса костей для WebGL-рига персонажа (public/assets/zapret-moe/rig.js).

Персонаж собран из частей: основа без рук и отдельные руки. Каждая часть — своя
сетка поверх текстуры. Кость поворачивает и масштабирует вершины со своим весом
0…1, поэтому картинка тянется, а не рвётся. Руку целиком от плеча двигает
«корень» части (как CSS-анимация рук), а кости внутри гнут кисть и когти.

Маски костей строятся из альфы и цвета самих слоёв и размываются, чтобы вес
плавно затухал. Результат — rig/<имя>.json. Запуск из корня репозитория:

    tools/rig-weights.py rkn
"""
import base64
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

CH = 'public/assets/zapret-moe/chars/'
W, H = 1600, 900
CELL = 16                     # шаг сетки в пикселях кадра

# Координаты — в системе кадра 1600×900, как у слоёв в home.tmpl.
RIGS = {
    'rkn': {
        'rim': ['rkn2-rim.webp', 0, 0, 1600, 900],
        'base': {
            'tex': 'rkn2-base.webp', 'rect': [0, 0, 1600, 900],
            # лицо и туловище не качаются вместе с волосами
            'protect': [(812, 345, 150, 175), (820, 660, 270, 330)],
            'hair': {'hairL': (620, 150), 'hairR': (1000, 120)},
            'split': 810,
        },
        'arms': {
            # корень — где рукав уходит в плечо; кисть — запястье и центр ладони
            'armL': {'tex': 'rkn2-arm-l.webp', 'rect': [0, 169, 670, 714], 'root': (650, 400),
                     'wrist': (250, 660), 'palm': (240, 448)},
            'armR': {'tex': 'rkn2-arm-r.webp', 'rect': [974, 0, 626, 728], 'root': (990, 330),
                     'wrist': (1305, 560), 'palm': (1312, 304)},
        },
    },
}


def smooth(a, px):
    return ndimage.gaussian_filter(a, px)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def load(tex, rect):
    """RGBA части и сетки координат кадра под неё."""
    im = np.asarray(Image.open(CH + tex).convert('RGBA'), np.float32)
    x0, y0, w, h = rect
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    return im, xx + x0, yy + y0


def pin(xx, yy):
    # арт обрезан краями кадра: у самой границы вес уходит в ноль,
    # чтобы край картинки не заезжал внутрь и не открывал ровный срез
    edge = np.minimum(np.minimum(xx, W - 1 - xx), np.minimum(yy, H - 1 - yy))
    return smoothstep(0, 40, edge)


def grid(rect, maps):
    x0, y0, w, h = rect
    cols, rows = max(2, round(w / CELL) + 1), max(2, round(h / CELL) + 1)
    gx = np.linspace(0, w - 1, cols).round().astype(int)
    gy = np.linspace(0, h - 1, rows).round().astype(int)
    out = [np.clip(m[np.ix_(gy, gx)] * 255 + 0.5, 0, 255).astype(np.uint8) for m in maps]
    if not out:
        out = [np.zeros((rows, cols), np.uint8)]
    while len(out) % 4:
        out.append(np.zeros_like(out[0]))
    return cols, rows, len(out), base64.b64encode(np.stack(out, -1).reshape(-1).tobytes()).decode()


def base_part(cfg):
    im, xx, yy = load(cfg['tex'], cfg['rect'])
    a = im[..., 3] / 255
    body = np.zeros_like(a)
    for cx, cy, rx, ry in cfg['protect']:
        body = np.maximum(body, (((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1).astype(np.float32))
    body = np.clip(smooth(body, 35) * 1.3, 0, 1)
    hair = np.clip(smooth(a, 20) * 1.2, 0, 1) * (1 - body) * pin(xx, yy)
    side = smoothstep(cfg['split'] - 60, cfg['split'] + 60, xx)
    bones, maps = [], []
    for bid, (px, py) in cfg['hair'].items():
        far = smoothstep(60, 520, np.hypot(xx - px, yy - py))     # кончики качаются сильнее корней
        maps.append(hair * far * (1 - side if bid.endswith('L') else side))
        bones.append({'id': bid, 'pivot': [px, py]})
    return bones, maps


def arm_part(cfg):
    im, xx, yy = load(cfg['tex'], cfg['rect'])
    r, g, b, a = im[..., 0], im[..., 1], im[..., 2], im[..., 3] / 255
    # кисть — кожа и чёрные когти рядом с ней; рукав и манжета двигаются только корнем
    skin = (r > 140) & (r > b + 25) & (g > 90) & (a > 0.5)
    skin = ndimage.binary_opening(skin, iterations=2)
    near = ndimage.binary_dilation(skin, iterations=45)
    claw = (np.maximum(np.maximum(r, g), b) < 90) & (a > 0.5) & near
    hand = (skin | claw).astype(np.float32)
    handw = np.clip(smooth(hand, 14) * 1.25, 0, 1) * pin(xx, yy)
    px, py = cfg['palm']
    wx, wy = cfg['wrist']
    fing = np.clip(smooth(hand, 18) * 1.2, 0, 1) * smoothstep(80, 200, np.hypot(xx - px, yy - py)) \
        * smoothstep(140, 240, np.hypot(xx - wx, yy - wy)) * pin(xx, yy)
    bones = [{'id': 'fing', 'pivot': [px, py]}, {'id': 'hand', 'pivot': [wx, wy]}]
    return bones, [fing, handw]


def build(name):
    cfg = RIGS[name]
    parts = []
    bones, maps = base_part(cfg['base'])
    cols, rows, stride, wts = grid(cfg['base']['rect'], maps)
    parts.append({'id': 'base', 'tex': cfg['base']['tex'], 'rect': cfg['base']['rect'], 'cols': cols, 'rows': rows,
                  'stride': stride, 'bones': bones, 'weights': wts})
    for pid, a in cfg['arms'].items():
        bones, maps = arm_part(a)
        cols, rows, stride, wts = grid(a['rect'], maps)
        # id костей внутри руки делаем уникальными: fingL, handL…
        for bn in bones:
            bn['id'] += pid[-1]
        parts.append({'id': pid, 'tex': a['tex'], 'rect': a['rect'], 'root': list(a['root']), 'cols': cols,
                      'rows': rows, 'stride': stride, 'bones': bones, 'weights': wts})
    data = {'w': W, 'h': H, 'rim': cfg['rim'], 'parts': parts}
    os.makedirs('public/assets/zapret-moe/rig', exist_ok=True)
    with open(f'public/assets/zapret-moe/rig/{name}.json', 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    return {p['id']: p for p in parts}


if __name__ == '__main__':
    for n in sys.argv[1:] or RIGS:
        build(n)
        print(n, 'ok')
