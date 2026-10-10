import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MESSAGES } from '../js/messages.js';
import { PERMISSIONS, STATES, GROUP_ORDER } from '../js/perm-core.js';
import { t, setLang, getLang } from '../js/i18n.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ja = MESSAGES.ja;

test('script.js が t() で引く固定のキーは、すべて辞書にある', () => {
  const src = readFileSync(join(ROOT, 'script.js'), 'utf8');
  const keys = [...src.matchAll(/\bt\('([\w.-]+)'/g)].map(m => m[1]);
  assert.ok(keys.length >= 30, `取り出したキーが少ない（${keys.length}）`);
  const missing = keys.filter(k => !(k in ja));
  assert.deepEqual(missing, []);
});

test('権限ごとの説明・リスク、状態、カテゴリの文言がそろっている', () => {
  for (const p of PERMISSIONS) {
    assert.ok(ja[`perm.${p.key}.desc`], `perm.${p.key}.desc`);
    assert.ok(ja[`perm.${p.key}.risk`], `perm.${p.key}.risk`);
  }
  for (const s of STATES) assert.ok(ja[`state.${s}`], `state.${s}`);
  for (const g of GROUP_ORDER) assert.ok(ja[`group.${g}`], `group.${g}`);
});

test('t(): 差し込みと、辞書にないキー・言語の扱い', () => {
  assert.equal(t('score.measured', { total: 4, measured: 2 }), '4件中2件で計算');
  assert.equal(t('no.such.key'), 'no.such.key');
  assert.equal(t('log.diff', { key: 'camera' }), 'camera: {from} → {to}');
  assert.equal(setLang('xx'), 'ja');
  assert.equal(getLang(), 'ja');
});

test('辞書の値は空でない文字列', () => {
  for (const [k, v] of Object.entries(ja)) assert.ok(typeof v === 'string' && v.length > 0, k);
});
