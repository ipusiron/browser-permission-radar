import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIZE, RADIUS, POINT_R, LABEL, axisAngles, pointsFor, radiusForScore, labelBox, labelLines, labelSize,
  rectsOverlap, circleRectOverlap, polygonPoints, round2,
} from '../js/radar-geom.js';
import { GROUPS, GROUP_ORDER } from '../js/perm-core.js';

// ラベルは等幅（Courier New）で描く。1文字の幅は 0.6em とみなす
const measure = s => s.length * LABEL.font * 0.6;

test('4軸は斜めに置く（右上から時計回り）', () => {
  const a = axisAngles(4).map(v => Math.round((v * 180) / Math.PI));
  assert.deepEqual(a, [-45, 45, 135, 225]);
  assert.deepEqual(axisAngles(0), []);
  const a6 = axisAngles(6).map(v => Math.round((v * 180) / Math.PI));
  assert.deepEqual(a6, [-90, -30, 30, 90, 150, 210]);
});

test('点の座標は viewBox の中で、半径の割合に比例する', () => {
  const pts = pointsFor([1, 0.5, 0.1, 0]);
  const c = SIZE / 2;
  assert.ok(Math.abs(Math.hypot(pts[0].x - c, pts[0].y - c) - RADIUS) < 1e-9);
  assert.ok(Math.abs(Math.hypot(pts[1].x - c, pts[1].y - c) - RADIUS * 0.5) < 1e-9);
  assert.ok(Math.abs(Math.hypot(pts[2].x - c, pts[2].y - c) - RADIUS * 0.1) < 1e-9);
  assert.equal(round2(pts[3].x), c);
  assert.ok(pts[0].x > c && pts[0].y < c, '1本目は右上');
});

test('radiusForScore: null は中心、範囲外は丸める', () => {
  assert.equal(radiusForScore(null), 0);
  assert.equal(radiusForScore(0.5), 0.5);
  assert.equal(radiusForScore(1.5), 1);
  assert.equal(radiusForScore(-1), 0);
});

test('labelLines: ハイフンで行を分けて大文字にする', () => {
  assert.deepEqual(labelLines('clipboard-read'), ['CLIPBOARD', 'READ']);
  assert.deepEqual(labelLines('midi'), ['MIDI']);
  assert.deepEqual(labelLines('-'), ['-']);
});

for (const g of GROUP_ORDER) {
  test(`${g}: ラベルは viewBox の中に収まり、点にも互いにも重ならない`, () => {
    const keys = GROUPS[g];
    const angles = axisAngles(keys.length);
    const boxes = keys.map((k, i) => {
      const { w, h } = labelSize(labelLines(k), measure);
      return labelBox(angles[i], w, h);
    });
    for (const b of boxes) {
      assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= SIZE && b.y + b.h <= SIZE, JSON.stringify(b));
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) assert.equal(rectsOverlap(boxes[i], boxes[j]), false);
    }
    // 点は外周（granted）でも、縁取りの分（+3）を含めてラベルにかからない
    for (const r of [1, 0.5, 0.1]) {
      const pts = pointsFor(keys.map(() => r));
      for (const p of pts) for (const b of boxes) assert.equal(circleRectOverlap(p.x, p.y, POINT_R + 3, b), false);
    }
  });
}

test('polygonPoints は小数2桁の "x,y" を空白でつなぐ', () => {
  assert.equal(polygonPoints([{ x: 1.234, y: 5 }, { x: 0, y: 2.005 }]), '1.23,5 0,2.01');
});

test('circleRectOverlap と rectsOverlap の境界', () => {
  const r = { x: 10, y: 10, w: 10, h: 10 };
  assert.equal(circleRectOverlap(5, 15, 5, r), false); // 接するだけ
  assert.equal(circleRectOverlap(6, 15, 5, r), true);
  assert.equal(rectsOverlap(r, { x: 20, y: 10, w: 5, h: 5 }), false);
  assert.equal(rectsOverlap(r, { x: 19, y: 19, w: 5, h: 5 }), true);
});

test('radar-svg: 点を描く半径は最小 0.05（中心で重ならない）、照会できない点も同じ', async () => {
  const { displayRadius, MIN_DISPLAY_RADIUS, measureLabel } = await import('../js/radar-svg.js');
  assert.equal(MIN_DISPLAY_RADIUS, 0.05);
  assert.equal(displayRadius('granted'), 1);
  assert.equal(displayRadius('prompt'), 0.5);
  assert.equal(displayRadius('denied'), 0.1);
  assert.equal(displayRadius('unsupported'), 0.05);
  assert.equal(displayRadius('unknown'), 0.05);
  assert.equal(measureLabel('MIDI'), 4 * LABEL.font * 0.6);
});
