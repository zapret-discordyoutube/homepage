#!/usr/bin/env python3
"""Веса костей для WebGL-рига персонажа (public/assets/zapret-moe/rig.js).

Персонаж рисуется одной картинкой-основой, натянутой на сетку. Кость сдвигает,
поворачивает и масштабирует вершины сетки со своим весом 0…1, поэтому картинка
тянется, а не рвётся: нет ни дыр, ни копии руки под слоем.

Маски костей берутся из уже вырезанных слоёв (кисти, пряди) и размываются,
чтобы вес плавно затухал. Результат — rig/<имя>.json с сеткой и весами
(uint8, base64). Запуск из корня репозитория:

    tools/rig-weights.py rkn
"""
import base64
import json
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

CH = 'public/assets/zapret-moe/chars/'
W, H = 1600, 900
COLS, ROWS = 101, 57          # вершин по ширине и высоте: ячейка 16 px

# Координаты — в системе кадра 1600×900, как у слоёв в home.tmpl.
RIGS = {
    'rkn': {
        'base': 'rkn-base.webp',
        'rim': ['rkn-rim.webp', 0, 0, 1509, 895],
        'layers': {
            'handL': ['rkn-hand-l.webp', 0, 173],
            'handR': ['rkn-hand-r.webp', 1043, 4],
            'hairL': ['rkn-hair-l.webp', 0, 125],
            'hairR': ['rkn-hair-r.webp', 981, 101],
            'hairT': ['rkn-hair-t.webp', 413, 0],
        },
        # лицо и грудь не должны тянуться за руками
        'protect': [(826, 420, 185, 245), (830, 700, 150, 200)],
        'hands': {
            # запястье, центр ладони; руки тянутся к зрителю
            # body — откуда рука «выходит» к зрителю: от этой точки она растёт наружу
            'L': {'wrist': (314, 729), 'palm': (262, 452), 'body': (640, 700)},
            'R': {'wrist': (1187, 499), 'palm': (1372, 330), 'body': (1060, 560)},
        },
        'hair_pivots': {'hairL': (560, 250), 'hairR': (1040, 230), 'hairT': (800, 190)},
    },
}


def layer_alpha(path, x, y):
    im = Image.open(CH + path)
    a = np.zeros((H, W), np.float32)
    al = np.asarray(im.getchannel('A'), np.float32) / 255
    h, w = al.shape
    a[y:y + h, x:x + w] = al[:H - y, :W - x]
    return a


def smooth(a, px):
    return ndimage.gaussian_filter(a, px)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def build(name):
    cfg = RIGS[name]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

    prot = np.zeros((H, W), np.float32)
    for cx, cy, rx, ry in cfg['protect']:
        prot = np.maximum(prot, ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1)
    prot = np.clip(smooth(prot, 30) * 1.4, 0, 1)

    L = {k: layer_alpha(*v) for k, v in cfg['layers'].items()}
    bones, maps = [], []

    for side in ('L', 'R'):
        h = cfg['hands'][side]
        hand = L['hand' + side]
        wx, wy = h['wrist']
        px, py = h['palm']
        # пальцы: всё, что далеко и от центра ладони, и от запястья (манжета — нет)
        d = np.hypot(xx - px, yy - py)
        dw = np.hypot(xx - wx, yy - wy)
        # веса мягкие: при резком крае треугольники на границе пальца растягиваются и край «мажется»
        fing = np.clip(smooth(hand, 18) * 1.2, 0, 1) * smoothstep(80, 210, d) * smoothstep(150, 260, dw)
        # кисть целиком, с мягким краем
        handw = np.clip(smooth(hand, 16) * 1.2, 0, 1)
        # рука: кисть и всё вокруг неё, затухает к телу
        arm = ndimage.grey_dilation(hand, size=(41, 41))
        arm = np.clip(smooth(arm, 55) * 1.35, 0, 1) * (1 - prot)
        bones += [
            {'id': 'fing' + side, 'pivot': [px, py]},
            {'id': 'hand' + side, 'pivot': [wx, wy]},
            {'id': 'arm' + side, 'pivot': list(h['body'])},
        ]
        maps += [fing, handw * (1 - prot * 0.7), arm]

    handsAll = np.clip(smooth(ndimage.grey_dilation(np.maximum(L['handL'], L['handR']), size=(21, 21)), 10) * 1.3, 0, 1)
    for k in ('hairL', 'hairR', 'hairT'):
        bones.append({'id': k, 'pivot': list(cfg['hair_pivots'][k])})
        # слои прядей — прямоугольные куски: широкое размытие, чтобы у края веса не было шва
        maps.append(np.clip(smooth(L[k], 30) * 1.1, 0, 1) * (1 - handsAll))

    # арт обрезан краями кадра: у самой границы вес уходит в ноль, чтобы край
    # картинки никогда не заезжал внутрь и не открывал ровный срез руки
    edge = np.minimum(np.minimum(xx, W - 1 - xx), np.minimum(yy, H - 1 - yy))
    pin = smoothstep(0, 40, edge)
    maps = [m * pin for m in maps]

    # сетка: вес в каждой вершине
    gx = np.linspace(0, W - 1, COLS).round().astype(int)
    gy = np.linspace(0, H - 1, ROWS).round().astype(int)
    out = []
    for m in maps:
        v = m[np.ix_(gy, gx)]
        out.append(np.clip(v * 255 + 0.5, 0, 255).astype(np.uint8))
    while len(out) % 4:                          # по 4 веса на атрибут vec4
        out.append(np.zeros_like(out[0]))
    inter = np.stack(out, -1).reshape(-1)       # вершина за вершиной, веса подряд
    data = {
        'w': W, 'h': H, 'cols': COLS, 'rows': ROWS,
        'base': cfg['base'], 'rim': cfg['rim'],
        'bones': bones,
        'stride': len(out),
        'weights': base64.b64encode(inter.tobytes()).decode(),
    }
    with open(f'public/assets/zapret-moe/rig/{name}.json', 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    return maps


if __name__ == '__main__':
    import os
    os.makedirs('public/assets/zapret-moe/rig', exist_ok=True)
    for n in sys.argv[1:] or RIGS:
        maps = build(n)
        if os.environ.get('DEBUG'):
            base = Image.open(CH + RIGS[n]['base']).convert('RGBA')
            for i, m in enumerate(maps):
                ov = Image.new('RGBA', (W, H), (0, 0, 0, 255))
                ov.alpha_composite(base)
                red = Image.fromarray((np.stack([m * 255, m * 0, m * 0, m * 170], -1)).astype(np.uint8), 'RGBA')
                ov.alpha_composite(red)
                ov.convert('RGB').resize((800, 450)).save(os.environ['DEBUG'] + f'/{n}-w{i}.png')
        print(n, 'ok')
