/**
 * Browser Permission Radar — レーダーを SVG で描く（DOM を使う）
 *
 * 座標は js/radar-geom.js で求め、viewBox（SIZE×SIZE）の中に描く。
 * 表示の大きさは CSS で決まり、拡大してもぼやけない。点は <g role="button"> で、
 * クリック・Enter・Space で選べる（画面の座標を測らないので、幅が変わってもずれない）。
 * 色は CSS のクラス（state-granted など）で付ける。style 属性は使わない。
 */
import {
  SIZE, RADIUS, RINGS, POINT_R, LABEL, axisAngles, pointsFor, labelBox, labelLines, labelSize, polygonPoints, round2,
} from './radar-geom.js';
import { stateToScore } from './perm-core.js';

const NS = 'http://www.w3.org/2000/svg';
/** 点を描く最小の半径の割合（0 の点が中心で重なって押せなくならないように） */
export const MIN_DISPLAY_RADIUS = 0.05;

/** ラベルの幅の見積もり（等幅フォントで 1文字 0.6em） */
export const measureLabel = s => s.length * LABEL.font * 0.6;

function el(name, attrs = {}, parent = null) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

/** 点を描く半径の割合 */
export function displayRadius(state) {
  const s = stateToScore(state);
  return Math.max(MIN_DISPLAY_RADIUS, Math.min(1, s === null ? 0 : s));
}

/**
 * レーダーを描く
 * @param {SVGSVGElement} svg
 * @param {object} opt
 * @param {Array<{key: string, state: string}>} opt.items 軸の順の権限と状態
 * @param {(key: string) => string} opt.pointLabel 点の読み上げ用の文
 * @param {(key: string) => void} opt.onSelect 点を選んだとき
 */
export function renderRadar(svg, { items, pointLabel, onSelect }) {
  svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
  svg.replaceChildren();
  const c = SIZE / 2;
  const angles = axisAngles(items.length);

  const grid = el('g', { class: 'radar-grid', 'aria-hidden': 'true' }, svg);
  for (const m of RINGS) el('circle', { cx: c, cy: c, r: round2(RADIUS * m), class: 'ring' }, grid);
  for (const a of angles) {
    el('line', {
      x1: c, y1: c, x2: round2(c + Math.cos(a) * RADIUS), y2: round2(c + Math.sin(a) * RADIUS), class: 'axis',
    }, grid);
  }

  const pts = pointsFor(items.map(it => displayRadius(it.state)));
  if (pts.length) el('polygon', { points: polygonPoints(pts), class: 'area', 'aria-hidden': 'true' }, svg);

  // ラベル（軸の先端の外側。点にかからない位置は radar-geom.labelBox が決める）
  const labels = el('g', { class: 'radar-labels', 'aria-hidden': 'true' }, svg);
  items.forEach((it, i) => {
    const lines = labelLines(it.key);
    const { w, h } = labelSize(lines, measureLabel);
    const box = labelBox(angles[i], w, h);
    el('line', {
      x1: round2(c + Math.cos(angles[i]) * RADIUS), y1: round2(c + Math.sin(angles[i]) * RADIUS),
      x2: round2(box.x + box.w / 2), y2: round2(box.y + box.h / 2), class: 'label-leader',
    }, labels);
    // 照会できない軸は破線、機能のない軸は薄く描く（中心付近の点だけでは見分けにくいため）
    const lg = el('g', { class: `label state-${it.state}` }, labels);
    el('rect', { x: round2(box.x), y: round2(box.y), width: round2(box.w), height: round2(box.h), rx: 5, class: 'label-box' }, lg);
    const text = el('text', { x: round2(box.x + LABEL.padX), y: round2(box.y + LABEL.padY), class: 'label-text' }, lg);
    lines.forEach((line, j) => {
      const span = el('tspan', { x: round2(box.x + LABEL.padX), dy: j === 0 ? LABEL.font - 2 : LABEL.line }, text);
      span.textContent = line;
    });
  });

  // 点（最後に描いて最前面に置く）
  const pointsG = el('g', { class: 'radar-points' }, svg);
  items.forEach((it, i) => {
    const p = pts[i];
    const g = el('g', {
      class: `pt state-${it.state}`, role: 'button', tabindex: 0, 'data-key': it.key, 'aria-label': pointLabel(it.key),
    }, pointsG);
    el('circle', { cx: round2(p.x), cy: round2(p.y), r: POINT_R + 9, class: 'pt-hit' }, g);
    el('circle', { cx: round2(p.x), cy: round2(p.y), r: POINT_R + 4, class: 'pt-focus' }, g);
    el('circle', { cx: round2(p.x), cy: round2(p.y), r: POINT_R, class: 'pt-dot' }, g);
    const title = el('title', {}, g);
    title.textContent = pointLabel(it.key);
    g.addEventListener('click', () => onSelect(it.key));
    g.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        onSelect(it.key);
      }
    });
  });
}
