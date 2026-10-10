import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BASELINES, EXPORT_TOOL, MAX_LABEL, signature, exposure, guessBaseline, buildExport, cleanLabel, fileStamp, parseImport,
  compareColumns, changedFromBaseline,
} from '../js/compare-core.js';
import { PERMISSIONS, classify } from '../js/perm-core.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fx = JSON.parse(readFileSync(join(ROOT, 'test/fixtures/measured-20261010.json'), 'utf8'));
const FEATURE_GLOBAL = {
  syncManager: 'SyncManager', paymentManager: 'PaymentManager', idleDetector: 'IdleDetector',
  localFonts: 'queryLocalFonts', windowManagement: 'getScreenDetails', sensors: 'Accelerometer',
};

test('BASELINES は実測の記録を画面と同じ分類にかけた値と一致する', () => {
  for (const name of ['edge', 'firefox']) {
    const raw = fx[name];
    const absent = fx.features_absent[name] || [];
    const want = Object.fromEntries(PERMISSIONS.map(p => {
      const q = raw[p.key];
      const { state } = classify({
        queryState: q.startsWith('ERR') ? null : q,
        featurePresent: p.feature !== 'localNetwork' && !absent.includes(FEATURE_GLOBAL[p.feature]),
        notificationPermission: p.key === 'notifications' ? raw.__notification : null,
      });
      return [p.key, state];
    }));
    assert.deepEqual(BASELINES[name].states, want, name);
  }
});

const edgeResults = Object.entries(BASELINES.edge.states).map(([key, state]) => ({ key, state }));

test('signature: 定義の順に「キー=状態」をつなぐ（並び順が変わっても同じ）', () => {
  const s = signature(edgeResults);
  assert.ok(s.startsWith('geolocation=prompt;camera=prompt;'));
  assert.equal(s.split(';').length, PERMISSIONS.length);
  assert.equal(signature([...edgeResults].reverse()), s);
  assert.ok(signature([]).endsWith('accelerometer=unsupported'));
});

test('exposure: 尋ねずに読めた答えの数（Edge 18件すべて、Firefox 9件）', () => {
  assert.deepEqual(exposure(edgeResults), { queried: 18, answered: 18, granted: 6, denied: 0 });
  const ff = Object.entries(BASELINES.firefox.states).map(([key, state]) => ({ key, state }));
  assert.deepEqual(exposure(ff), { queried: 18, answered: 9, granted: 1, denied: 0 });
});

test('guessBaseline', () => {
  assert.equal(guessBaseline('Mozilla/5.0 ... Chrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0'), 'edge');
  assert.equal(guessBaseline('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:146.0) Gecko/20100101 Firefox/146.0'), 'firefox');
  assert.equal(guessBaseline('Mozilla/5.0 ... Chrome/145.0.0.0 Safari/537.36'), null);
  assert.equal(guessBaseline(undefined), null);
});

test('buildExport → parseImport で元に戻る', () => {
  const exp = buildExport({ results: edgeResults, label: '  会社のPC（Edge）  ', takenAt: '2026-10-10T14:00:00.000Z' });
  assert.equal(exp.tool, EXPORT_TOOL);
  assert.equal(exp.label, '会社のPC（Edge）');
  assert.equal(exp.results.length, PERMISSIONS.length);
  const back = parseImport(JSON.stringify(exp));
  assert.equal(back.ok, true);
  assert.deepEqual(back.data.states, BASELINES.edge.states);
  assert.equal(back.data.takenAt, '2026-10-10T14:00:00.000Z');
});

test('parseImport: 形の違う JSON・大きすぎる・知らないキーや状態は拒否する', () => {
  const good = buildExport({ results: edgeResults, takenAt: '2026-10-10T14:00:00.000Z' });
  const cases = [
    ['{', 'json'], ['[]', 'shape'], ['null', 'shape'],
    [JSON.stringify({ ...good, tool: 'other' }), 'tool'],
    [JSON.stringify({ ...good, version: 2 }), 'tool'],
    [JSON.stringify({ ...good, results: [{ key: '<img src=x onerror=alert(1)>', state: 'granted' }] }), 'results'],
    [JSON.stringify({ ...good, results: [{ key: 'camera', state: 'owned' }] }), 'results'],
    [JSON.stringify({ ...good, results: [{ key: 'camera', state: 'granted' }, { key: 'camera', state: 'denied' }] }), 'results'],
    [JSON.stringify({ ...good, results: [{ key: '__proto__', state: 'granted' }] }), 'results'],
    ['x'.repeat(64 * 1024 + 1), 'size'],
  ];
  for (const [text, err] of cases) assert.deepEqual(parseImport(text), { ok: false, error: err }, text.slice(0, 60));
  assert.deepEqual(parseImport(42), { ok: false, error: 'type' });
  // 日時の形が違えば空にする。名前の制御文字・向きを変える文字は除く
  const odd = parseImport(JSON.stringify({ ...good, takenAt: 'yesterday', label: `a${String.fromCodePoint(0x202e)}b${'c'.repeat(80)}` }));
  assert.equal(odd.data.takenAt, '');
  assert.equal(odd.data.label.length, MAX_LABEL);
  assert.ok(odd.data.label.startsWith('abc'));
});

test('cleanLabel と fileStamp', () => {
  assert.equal(cleanLabel(null), '');
  assert.equal(cleanLabel(`x${String.fromCodePoint(0)}y${String.fromCodePoint(0x200b)}z`), 'xyz');
  assert.equal([...cleanLabel('😀'.repeat(50))].length, MAX_LABEL);
  assert.equal(fileStamp(new Date(2026, 9, 10, 23, 5, 9)), '20261010-230509');
});

test('compareColumns と changedFromBaseline', () => {
  const current = edgeResults.map(r => (r.key === 'camera' ? { key: 'camera', state: 'granted' } : r));
  const rows = compareColumns(current, [BASELINES.edge, BASELINES.firefox]);
  assert.equal(rows.length, PERMISSIONS.length);
  const cam = rows.find(r => r.key === 'camera');
  assert.deepEqual([cam.current, ...cam.others, cam.differs], ['granted', 'prompt', 'prompt', true]);
  assert.equal(rows.find(r => r.key === 'geolocation').differs, false);
  assert.deepEqual(changedFromBaseline(current, BASELINES.edge.states), [{ key: 'camera', from: 'prompt', to: 'granted' }]);
  assert.deepEqual(compareColumns(current, [{ states: {} }])[0].others, ['—']);
});
