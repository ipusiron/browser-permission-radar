import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(ROOT, 'style.css'), 'utf8');

test('ボタンの hover の円は薄い水色（文字が読める濃さ）', () => {
  assert.ok(/button::before\{[^}]*background:rgba\(0,240,255,0\.12\)/.test(css));
});

/** :root の変数（基本）と、prefers-color-scheme: dark の上書きを読む */
function readVars() {
  const base = {};
  const rootBlock = css.match(/:root\{([\s\S]*?)\}/)[1];
  for (const m of rootBlock.matchAll(/(--[\w-]+):\s*([^;]+);/g)) base[m[1]] = m[2].trim();
  const darkBlock = css.match(/@media \(prefers-color-scheme: dark\) \{\s*:root\{([\s\S]*?)\}/)[1];
  const dark = { ...base };
  for (const m of darkBlock.matchAll(/(--[\w-]+):\s*([^;]+);/g)) dark[m[1]] = m[2].trim();
  return { base, dark };
}

function parse(c) {
  c = c.trim();
  let m = c.match(/^#([0-9a-f]{6})$/i);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), 1];
  m = c.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(',').map(v => parseFloat(v));
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  throw new Error(`色を読めない: ${c}`);
}

/** 半透明の色を下地に重ねる */
function over(top, bottom) {
  const [r, g, b, a] = parse(top);
  const [R, G, B] = Array.isArray(bottom) ? bottom : parse(bottom);
  return [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)];
}

function lum([r, g, b]) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(fg, bg) {
  const a = lum(fg), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const rgb = c => parse(c).slice(0, 3);

for (const [mode, v] of Object.entries(readVars())) {
  test(`文字と下地のコントラストが 4.5:1 以上（${mode}）`, () => {
    const card = rgb(v['--card']);
    const bg = rgb(v['--bg']);
    const pairs = [
      ['本文 on 背景', rgb(v['--text']), bg],
      ['本文 on カード', rgb(v['--text']), card],
      ['補足 on カード', rgb(v['--muted']), card],
      ['補足 on 背景', rgb(v['--muted']), bg],
      ['アクセント on カード', rgb(v['--accent']), card],
      ['アクセント on 背景', rgb(v['--accent']), bg],
      ['ログ on ログの下地', rgb('#7ee787'), over('rgba(0,0,0,0.5)', card)],
      ['選択中のチップ', rgb('#000000'), rgb(v['--accent'])],
      ['スコアのボタン', rgb(v['--neon-cyan']), over('rgba(0,240,255,0.15)', card)],
      ['スコアのボタン（hover の数字）', rgb('#000000'), rgb(v['--accent'])],
      ['ラベル on ラベルの箱', rgb(v['--accent']), over('rgba(6,14,28,0.98)', card)],
      ['unknown のラベル', rgb(v['--unknown']), over('rgba(6,14,28,0.98)', card)],
      ['機能なしのラベル（不透明度 0.55）', over(`rgba(0,240,255,0.55)`, over('rgba(6,14,28,0.98)', card)),
        over('rgba(6,14,28,0.98)', card)],
      ['granted のバッジ', rgb(v['--granted']), over('rgba(0,255,136,0.15)', card)],
      ['prompt のバッジ', rgb(v['--prompt']), over('rgba(255,215,0,0.15)', card)],
      ['denied のバッジ', rgb(v['--denied']), over('rgba(255,51,102,0.15)', card)],
      ['unknown のバッジ', rgb(v['--unknown']), over('rgba(180,140,255,0.12)', card)],
      ['unsupported のバッジ', rgb(v['--unsupported']), over('rgba(107,114,128,0.15)', card)],
      ['食い違いの注記', rgb(v['--prompt']), card],
      ['案内 on 案内の下地', rgb(v['--text']), over('rgba(255,215,0,0.08)', bg)],
      ['ボタンの hover（水色の文字 on 広がる円）', rgb(v['--neon-cyan']), over('rgba(0,240,255,0.12)', card)],
      ['開いたアコーディオンの見出しの hover', rgb(v['--accent']), over('rgba(0,240,255,0.12)', over('rgba(0,240,255,0.15)', card))],
    ];
    const bad = pairs.map(([name, fg, b]) => [name, ratio(fg, b)]).filter(([, r]) => r < 4.5);
    assert.deepEqual(bad.map(([n, r]) => `${n}: ${r.toFixed(2)}`), []);
  });
}

test('計算の確認: 白と黒は 21:1', () => {
  assert.equal(Math.round(ratio([255, 255, 255], [0, 0, 0])), 21);
});
