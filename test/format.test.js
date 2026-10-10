import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(ROOT, p), 'utf8');

function listFiles(dir, ext) {
  const full = join(ROOT, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full).filter(f => f.endsWith(ext)).map(f => `${dir}/${f}`);
}

const CODE = ['script.js', ...listFiles('js', '.js'), ...listFiles('test', '.js'), 'style.css'];
const DOCS = ['README.md', 'CLAUDE.md', 'AGENTS.md', 'TECHNICAL.md', 'PERMISSIONS_API.md'];

test('JS・CSS・テストの1行は160文字以下（詰め込みを検出する。文言の辞書は1件1行で400文字まで）', () => {
  for (const f of CODE) {
    const limit = f === 'js/messages.js' ? 400 : 160;
    const max = Math.max(...read(f).split('\n').map(l => [...l].length));
    assert.ok(max <= limit, `${f}: 最長 ${max} 文字`);
  }
  // 辞書は1件1行（日英で400行以上）
  const dict = read('js/messages.js').split('\n').filter(l => /^\s+"[\w.-]+": "/.test(l));
  assert.ok(dict.length >= 400, `辞書の行が少ない（${dict.length}）`);
});

test('index.html の1行は250文字以下', () => {
  const max = Math.max(...read('index.html').split('\n').map(l => [...l].length));
  assert.ok(max <= 250, `index.html: 最長 ${max} 文字`);
});

test('改行は LF のみ、BOM なし', () => {
  for (const f of [...CODE, 'index.html', ...DOCS.filter(d => existsSync(join(ROOT, d)))]) {
    const s = read(f);
    assert.ok(!s.includes('\r'), `${f} に CR がある`);
    assert.notEqual(s.charCodeAt(0), 0xfeff, `${f} に BOM がある`);
  }
});

test('主要ファイルの行数の下限（1行に詰め込んでいない）', () => {
  const min = { 'script.js': 150, 'style.css': 200, 'index.html': 100, 'js/perm-core.js': 60, 'js/radar-geom.js': 60 };
  for (const [f, n] of Object.entries(min)) {
    const lines = read(f).split('\n').length;
    assert.ok(lines >= n, `${f}: ${lines} 行（下限 ${n}）`);
  }
});

test('ソースに見えない文字（制御文字・書式文字）がない', () => {
  // 範囲は数値で持つ（エスケープ表記を書くと、ツールによって実文字に変わるため）
  const bad = [[0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], [0x7f, 0x7f], [0x200b, 0x200f], [0x202a, 0x202e],
    [0x2060, 0x2064], [0xfeff, 0xfeff]];
  for (const f of [...CODE, 'index.html']) {
    for (const ch of read(f)) {
      const cp = ch.codePointAt(0);
      assert.ok(!bad.some(([a, b]) => cp >= a && cp <= b), `${f} に U+${cp.toString(16)} がある`);
    }
  }
});
