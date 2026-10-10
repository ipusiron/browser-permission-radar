import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MESSAGES } from '../js/messages.js';
import { pickInitialLang, t, setLang } from '../js/i18n.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const { ja, en } = MESSAGES;
const placeholders = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
const hasJapanese = s => [...s].some(ch => {
  const cp = ch.codePointAt(0);
  return (cp >= 0x3040 && cp <= 0x30ff) || (cp >= 0x3400 && cp <= 0x9fff) || (cp >= 0xff01 && cp <= 0xff60) || (cp >= 0x3000 && cp <= 0x303f);
});

test('日英のキーが同じで、差し込み（{name}）もそろう', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ja).sort());
  for (const k of Object.keys(ja)) assert.deepEqual(placeholders(en[k]), placeholders(ja[k]), k);
  assert.ok(Object.keys(ja).length >= 250);
});

test('英語の辞書に日本語が残っていない（言語の切り替えボタンの「日本語」だけは除く）', () => {
  const bad = Object.entries(en).filter(([k, v]) => k !== 'ui.lang.button' && hasJapanese(v)).map(([k]) => k);
  assert.deepEqual(bad, []);
  assert.equal(en['ui.lang.button'], '日本語');
  assert.equal(ja['ui.lang.button'], 'English');
});

test('data-i18n-html の値は code と strong だけ（属性なし）', () => {
  const keys = [...html.matchAll(/data-i18n-html="([^"]+)"/g)].map(m => m[1]);
  assert.ok(keys.length >= 40);
  for (const k of keys) {
    for (const lang of [ja, en]) {
      const tags = [...lang[k].matchAll(/<[^>]*>/g)].map(m => m[0]);
      for (const tag of tags) assert.match(tag, /^<\/?(code|strong)>$/, `${k}: ${tag}`);
    }
  }
});

test('index.html の既定の文は、日本語の辞書と同じ', () => {
  const norm = s => s.replace(/\n\s*/g, '').trim();
  const unesc = s => s.replace(/&#10;/g, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
  let n = 0;
  for (const m of html.matchAll(/<(\w+)\b[^>]*?\sdata-i18n="([^"]+)"[^>]*>([^<]*)<\/\1>/g)) {
    assert.equal(unesc(norm(m[3])), ja[m[2]], m[2]);
    n += 1;
  }
  for (const m of html.matchAll(/<(\w+)\b[^>]*?\sdata-i18n-html="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)) {
    assert.equal(unesc(norm(m[3])), ja[m[2]], m[2]);
    n += 1;
  }
  for (const m of html.matchAll(/<[^>]*\sdata-i18n-attr="([^"]+)"[^>]*>/g)) {
    for (const pair of m[1].split(';')) {
      const [attr, key] = pair.split(':');
      const v = m[0].match(new RegExp(`[ \\n]${attr}="([^"]*)"`));
      assert.ok(v, `${key} の ${attr}`);
      assert.equal(unesc(v[1]), ja[key], key);
      n += 1;
    }
  }
  assert.ok(n >= 130, `照らし合わせた数が少ない（${n}）`);
});

test('最初の言語: ?lang= → 保存した選択 → ブラウザーの言語（日本語以外は英語）', () => {
  assert.equal(pickInitialLang({ search: '?lang=en', stored: 'ja', languages: ['ja-JP'] }), 'en');
  assert.equal(pickInitialLang({ search: '?lang=xx', stored: 'ja', languages: ['en-US'] }), 'ja');
  assert.equal(pickInitialLang({ stored: 'en', languages: ['ja'] }), 'en');
  assert.equal(pickInitialLang({ languages: ['ja-JP', 'en'] }), 'ja');
  assert.equal(pickInitialLang({ languages: ['fr-FR'] }), 'en');
  assert.equal(pickInitialLang({}), 'en');
});

test('t() は英語に切り替えると英語を引き、ない言語は日本語', () => {
  setLang('en');
  assert.equal(t('score.measured', { total: 4, measured: 2 }), 'Calculated from 2 of 4');
  setLang('ja');
  assert.equal(t('score.measured', { total: 4, measured: 2 }), '4件中2件で計算');
});
