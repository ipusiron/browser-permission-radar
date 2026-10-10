import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PERMISSIONS, GROUPS, GROUP_ORDER, STATES, SCORE_TABLE,
  normalizeNotificationPermission, classify, notificationMismatch,
  stateToScore, groupScore, formatScore, countStates, summarize, findPermission,
} from '../js/perm-core.js';

test('18権限が4カテゴリ（4・4・4・6）に、重複なく入っている', () => {
  assert.equal(PERMISSIONS.length, 18);
  assert.deepEqual(GROUP_ORDER, ['device', 'data', 'comm', 'extra']);
  for (const g of ['device', 'data', 'comm']) assert.equal(GROUPS[g].length, 4);
  assert.deepEqual(GROUPS.extra, ['local-network', 'storage-access', 'screen-wake-lock', 'window-management', 'local-fonts',
    'accelerometer']);
  const keys = PERMISSIONS.map(p => p.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(GROUPS.device, ['geolocation', 'camera', 'microphone', 'midi']);
  assert.deepEqual(GROUPS.data, ['clipboard-read', 'clipboard-write', 'persistent-storage', 'background-sync']);
  assert.deepEqual(GROUPS.comm, ['notifications', 'push', 'payment-handler', 'idle-detection']);
});

test('push の照会には userVisibleOnly: true を付ける。local-network は旧名でも照会する', () => {
  assert.deepEqual(findPermission('push').descriptor, { name: 'push', userVisibleOnly: true });
  assert.deepEqual(findPermission('local-network').descriptors.map(d => d.name), ['local-network', 'local-network-access']);
  for (const p of PERMISSIONS) assert.equal(p.descriptor.name, p.key);
  assert.equal(findPermission('nope'), null);
});

test('Notification.permission の "default" は "prompt" に直す', () => {
  assert.equal(normalizeNotificationPermission('default'), 'prompt');
  assert.equal(normalizeNotificationPermission('granted'), 'granted');
  assert.equal(normalizeNotificationPermission('denied'), 'denied');
  assert.equal(normalizeNotificationPermission('prompt'), 'prompt');
  assert.equal(normalizeNotificationPermission(undefined), null);
  assert.equal(normalizeNotificationPermission('whatever'), null);
});

test('classify: 照会できた値はそのまま、出所は query', () => {
  for (const s of ['granted', 'prompt', 'denied']) {
    assert.deepEqual(classify({ queryState: s, featurePresent: true }), { state: s, source: 'query' });
    // 機能の有無の手がかりより、照会の結果を優先する
    assert.deepEqual(classify({ queryState: s, featurePresent: false }), { state: s, source: 'query' });
  }
});

test('classify: 照会できず機能があれば unknown（prompt と推測しない）', () => {
  assert.deepEqual(classify({ queryState: null, featurePresent: true }), { state: 'unknown', source: 'none' });
  assert.deepEqual(classify({ queryState: null, featurePresent: false }), { state: 'unsupported', source: 'none' });
  assert.deepEqual(classify({ queryState: 'bogus', featurePresent: true }), { state: 'unknown', source: 'none' });
  assert.deepEqual(classify(), { state: 'unsupported', source: 'none' });
});

test('classify: 照会できない通知は Notification.permission で補う（default → prompt）', () => {
  assert.deepEqual(classify({ queryState: null, featurePresent: true, notificationPermission: 'default' }),
    { state: 'prompt', source: 'notification' });
  assert.deepEqual(classify({ queryState: null, featurePresent: true, notificationPermission: 'denied' }),
    { state: 'denied', source: 'notification' });
  // 照会できたときは照会の値を使う
  assert.deepEqual(classify({ queryState: 'prompt', featurePresent: true, notificationPermission: 'denied' }),
    { state: 'prompt', source: 'query' });
});

test('notificationMismatch: 正規化しても食い違うときだけ true', () => {
  assert.equal(notificationMismatch('prompt', 'default'), false);
  assert.equal(notificationMismatch('granted', 'granted'), false);
  assert.equal(notificationMismatch('prompt', 'denied'), true);
  assert.equal(notificationMismatch(null, 'denied'), false);
  assert.equal(notificationMismatch('denied', null), false);
});

test('スコアの表（README の表と同じ値）', () => {
  assert.deepEqual(SCORE_TABLE, { granted: 1.0, prompt: 0.5, denied: 0.1, unsupported: 0.0 });
  assert.equal(stateToScore('granted'), 1);
  assert.equal(stateToScore('prompt'), 0.5);
  assert.equal(stateToScore('denied'), 0.1);
  assert.equal(stateToScore('unsupported'), 0);
  assert.equal(stateToScore('unknown'), null);
  assert.equal(stateToScore('toString'), null);
  assert.deepEqual(STATES, ['granted', 'prompt', 'denied', 'unknown', 'unsupported']);
});

test('groupScore: unknown は平均から外す。全部 unknown なら null', () => {
  assert.deepEqual(groupScore(['prompt', 'prompt', 'prompt', 'prompt']), { score: 0.5, measured: 4, total: 4 });
  assert.deepEqual(groupScore(['granted', 'unknown', 'unknown', 'prompt']), { score: 0.75, measured: 2, total: 4 });
  assert.deepEqual(groupScore(['unknown', 'unknown']), { score: null, measured: 0, total: 2 });
  assert.deepEqual(groupScore([]), { score: null, measured: 0, total: 0 });
  const g = groupScore(['granted', 'denied', 'unsupported', 'prompt']);
  assert.ok(Math.abs(g.score - 0.4) < 1e-12);
});

test('formatScore と countStates', () => {
  assert.equal(formatScore(null), '—');
  assert.equal(formatScore(0.5), '0.50');
  assert.equal(formatScore(0.4 + 1e-15), '0.40');
  assert.deepEqual(countStates(['granted', 'granted', 'unknown', 'x']),
    { granted: 2, prompt: 0, denied: 0, unknown: 1, unsupported: 0 });
});

test('summarize: 実測した Edge の既定（2026-10-10）を再現する', () => {
  // msedge（Playwright の既定のプロファイル）で公開ページを開いた直後の照会結果
  const edge = {
    geolocation: 'prompt', camera: 'prompt', microphone: 'prompt', midi: 'prompt',
    'clipboard-read': 'prompt', 'clipboard-write': 'granted', 'persistent-storage': 'prompt', 'background-sync': 'granted',
    notifications: 'prompt', push: 'prompt', 'payment-handler': 'granted', 'idle-detection': 'prompt',
  };
  const s = summarize(Object.entries(edge).map(([key, state]) => ({ key, state })));
  assert.equal(formatScore(s.device.score), '0.50');
  assert.equal(formatScore(s.data.score), '0.75');
  assert.equal(formatScore(s.comm.score), '0.63');
  assert.equal(s.data.counts.granted, 2);
});

test('summarize: 結果に無い権限は unsupported として数える', () => {
  const s = summarize([{ key: 'camera', state: 'granted' }]);
  assert.equal(s.device.measured, 4);
  assert.equal(s.device.counts.unsupported, 3);
  assert.equal(formatScore(s.device.score), '0.25');
});
