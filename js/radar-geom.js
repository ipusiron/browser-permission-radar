/**
 * Browser Permission Radar — レーダーの幾何（DOM に依存しない純粋なモジュール）
 *
 * 画面は SVG で描く。座標はすべて viewBox（SIZE×SIZE）の中の値で、表示の大きさには依存しない。
 * そのため、画面の幅が変わっても点の位置とクリックの対象がずれない。
 */

/** viewBox の一辺 */
export const SIZE = 400;
/** 外周の円の半径 */
export const RADIUS = 132;
/** 同心円の倍率 */
export const RINGS = [0.25, 0.5, 0.75, 1.0];
/** 点の半径 */
export const POINT_R = 7;
/** ラベルの文字の大きさ・行の高さ・余白 */
export const LABEL = { font: 15, line: 18, padX: 8, padY: 5, gap: 16, margin: 4 };

/**
 * 軸の角度（ラジアン）。n=4 のときは斜め（右上から時計回り）に置き、ラベルを四隅に逃がす。
 * それ以外は真上から時計回り。
 * @param {number} n 軸の数
 * @returns {number[]}
 */
export function axisAngles(n) {
  if (n <= 0) return [];
  const start = n === 4 ? -Math.PI / 4 : -Math.PI / 2;
  return Array.from({ length: n }, (_, i) => start + (i * 2 * Math.PI) / n);
}

/**
 * 点の座標
 * @param {number[]} radii 0〜1 の半径の割合（軸ごと）
 * @param {number} [size]
 * @param {number} [radius]
 * @returns {{x: number, y: number, angle: number}[]}
 */
export function pointsFor(radii, size = SIZE, radius = RADIUS) {
  const c = size / 2;
  const angles = axisAngles(radii.length);
  return radii.map((r, i) => ({
    x: c + Math.cos(angles[i]) * radius * r,
    y: c + Math.sin(angles[i]) * radius * r,
    angle: angles[i],
  }));
}

/**
 * 状態 → 点を置く半径の割合。スコアと同じ値を使うが、照会できない（unknown）点は中心に置く。
 * @param {number|null} score
 */
export function radiusForScore(score) {
  return score === null ? 0 : Math.max(0, Math.min(1, score));
}

/**
 * ラベルの箱の位置。軸の先端から外へ gap だけ離した点を基準にし、
 * 軸の向きに応じて箱の角か辺をその点に合わせる（箱が点や軸の内側にかぶらない）。
 * 最後に viewBox の中へ収める。
 * @param {number} angle 軸の角度
 * @param {number} w 箱の幅
 * @param {number} h 箱の高さ
 * @param {number} [size]
 * @param {number} [radius]
 * @returns {{x: number, y: number, w: number, h: number}}
 */
export function labelBox(angle, w, h, size = SIZE, radius = RADIUS) {
  const c = size / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const ax = c + cos * (radius + LABEL.gap);
  const ay = c + sin * (radius + LABEL.gap);
  let x = cos > 0.25 ? ax : cos < -0.25 ? ax - w : ax - w / 2;
  let y = sin > 0.25 ? ay : sin < -0.25 ? ay - h : ay - h / 2;
  const m = LABEL.margin;
  x = Math.min(Math.max(x, m), size - m - w);
  y = Math.min(Math.max(y, m), size - m - h);
  return { x, y, w, h };
}

/**
 * ラベルの行（権限キーをハイフンで分けて大文字にする）
 * @param {string} key
 * @returns {string[]}
 */
export function labelLines(key) {
  const parts = String(key).split('-').map(s => s.trim()).filter(Boolean);
  return (parts.length ? parts : [String(key)]).map(s => s.toUpperCase());
}

/**
 * 箱の大きさ（行の幅は measure で測る）
 * @param {string[]} lines
 * @param {(s: string) => number} measure
 */
export function labelSize(lines, measure) {
  const w = Math.max(0, ...lines.map(measure)) + LABEL.padX * 2;
  const h = lines.length * LABEL.line + LABEL.padY * 2;
  return { w, h };
}

/**
 * 2つの長方形が重なるか
 */
export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * 点（円）と長方形が重なるか
 */
export function circleRectOverlap(cx, cy, r, rect) {
  const nx = Math.min(Math.max(cx, rect.x), rect.x + rect.w);
  const ny = Math.min(Math.max(cy, rect.y), rect.y + rect.h);
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

/**
 * 多角形の頂点列（SVG の points 属性の値）
 * @param {{x: number, y: number}[]} pts
 */
export function polygonPoints(pts) {
  return pts.map(p => `${round2(p.x)},${round2(p.y)}`).join(' ');
}

/** 小数2桁に丸める（SVG の属性用） */
export function round2(v) {
  return Math.round(v * 100) / 100;
}
