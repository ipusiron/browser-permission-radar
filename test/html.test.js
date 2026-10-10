import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const script = readFileSync(join(ROOT, 'script.js'), 'utf8');

test('CSP: unsafe-inline を使わず、外部へ接続しない（meta で効かない frame-ancestors は書かない）', () => {
  const m = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
  assert.ok(m, 'CSP の meta がない');
  const csp = m[1];
  for (const d of ["default-src 'self'", "script-src 'self'", "style-src 'self'", "connect-src 'none'", "worker-src 'self'",
    "frame-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'none'"]) {
    assert.ok(csp.includes(d), d);
  }
  assert.ok(!csp.includes('unsafe-inline'));
  assert.ok(!csp.includes('unsafe-eval'));
  assert.ok(!csp.includes('frame-ancestors'));
});

test('meta: 効かない X-Content-Type-Options を置かない。referrer・favicon・配色', () => {
  assert.ok(!/X-Content-Type-Options/i.test(html));
  assert.ok(html.includes('<meta name="referrer" content="no-referrer">'));
  assert.ok(html.includes('<link rel="icon" href="data:,">'));
  assert.ok(html.includes('<meta name="color-scheme" content="dark">'));
  assert.ok(html.includes('<meta name="viewport" content="width=device-width,initial-scale=1" />'));
});

test('スクリプトは module の外部ファイルだけ。インラインのハンドラー・style 属性がない', () => {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length >= 1);
  for (const [, attrs, body] of scripts) {
    assert.ok(/\bsrc="/.test(attrs), 'インラインの script がある');
    assert.equal(body.trim(), '');
  }
  assert.ok(html.includes('<script type="module" src="script.js"></script>'));
  assert.ok(!/\son[a-z]+\s*=/i.test(html), 'インラインのイベントハンドラーがある');
  assert.ok(!/\sstyle\s*=/i.test(html), 'style 属性がある');
});

test('frame-busting で親のページを移動させない（埋め込まれたら案内を出す）', () => {
  assert.ok(!script.includes('window.top.location'));
  assert.ok(html.includes('id="frameNotice"'));
  assert.ok(/id="frameNotice"[^>]*\bhidden\b/.test(html));
});

test('タブ: tablist・tab・tabpanel が対応している', () => {
  assert.ok(html.includes('role="tablist"'));
  const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map(m => m[0]);
  assert.ok(tabs.length >= 3);
  for (const tab of tabs) {
    const id = tab.match(/id="([^"]+)"/)[1];
    const controls = tab.match(/aria-controls="([^"]+)"/)[1];
    const panel = new RegExp(`<section id="${controls}" class="panel" role="tabpanel" aria-labelledby="${id}"`);
    assert.ok(panel.test(html), `${controls} のパネル`);
  }
  assert.equal([...html.matchAll(/aria-selected="true"/g)].length, 1);
});

test('ボタンはすべて type="button"。「?」は span でなくボタン', () => {
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map(m => m[0]);
  assert.ok(buttons.length >= 20);
  for (const b of buttons) assert.ok(b.includes('type="button"'), b);
  assert.ok(!/<span[^>]*class="help-icon/.test(html));
});

test('アコーディオン: aria-expanded と aria-controls の先がある', () => {
  const heads = [...html.matchAll(/<button[^>]*class="accordion-header"[^>]*>/g)].map(m => m[0]);
  assert.ok(heads.length >= 7);
  for (const h of heads) {
    assert.ok(h.includes('aria-expanded="false"'), h);
    const id = h.match(/aria-controls="([^"]+)"/)[1];
    assert.ok(html.includes(`id="${id}"`), id);
  }
});

test('外部リンクは新しいタブで開き、opener と referrer を渡さない。.md への相対リンクがない', () => {
  const links = [...html.matchAll(/<a\b[^>]*href="(https?:[^"]+)"[^>]*>/g)];
  assert.ok(links.length >= 5);
  for (const [tag] of links) {
    assert.ok(tag.includes('target="_blank"'), tag);
    assert.ok(tag.includes('rel="noopener noreferrer"'), tag);
  }
  assert.ok(!/href="[^"h#][^"]*\.md"/.test(html));
});

test('画面が使う id がそろっている', () => {
  const ids = ['radarDevice', 'radarData', 'radarComm', 'score-device', 'score-data', 'score-comm', 'measured-device',
    'measured-data', 'measured-comm', 'scoreLink-device', 'scoreLink-data', 'scoreLink-comm', 'permTableWrap', 'log',
    'rescanBtn', 'askNotif', 'getGeo', 'getCamera', 'getMic', 'readClip', 'writeClip', 'getMIDI', 'askPersist',
    'askIdle', 'askWakeLock', 'askFonts', 'askScreens', 'testBgSync', 'cleanupSW', 'radar-status-device', 'radar-status-data',
    'radar-status-comm', 'radarExtra', 'score-extra', 'measured-extra', 'scoreLink-extra', 'radar-status-extra'];
  for (const id of ids) assert.equal([...html.matchAll(new RegExp(`id="${id}"`, 'g'))].length, 1, id);
});

test('表記: 「ブラウザ」「リポジトリ」は長音つき、カテゴリ名は「通信・通知系」', () => {
  assert.ok(!html.includes('通知・通信系'));
  assert.ok(!/ブラウザ(?!ー)/.test(html));
  assert.ok(!/リポジトリ(?!ー)/.test(html));
});

test('絞り込みのボタンは data-filter で選ぶ（埋め込みタブの .chip を巻き込まない）', () => {
  assert.ok(script.includes("document.querySelectorAll('.chip[data-filter]')"));
  assert.ok(!script.includes("document.querySelectorAll('.chip')"));
});
