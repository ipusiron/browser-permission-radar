import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  POLICY_FEATURES, PROBE_MESSAGE_TYPE, buildAllow, parseProbeMessage, compareResults, summarizeComparison,
} from '../js/policy-core.js';
import { PERMISSIONS } from '../js/perm-core.js';

test('Policy の対象は権限の一部（通知・push・永続ストレージ・Background Sync は対象外）', () => {
  const keys = PERMISSIONS.map(p => p.key);
  for (const k of Object.keys(POLICY_FEATURES)) assert.ok(keys.includes(k), k);
  for (const k of ['notifications', 'push', 'persistent-storage', 'background-sync']) assert.equal(POLICY_FEATURES[k], undefined);
  assert.equal(POLICY_FEATURES['payment-handler'], 'payment');
  assert.equal(POLICY_FEATURES['local-network'], 'local-network');
});

test('buildAllow: 許す機能は名前だけ、止める機能は none', () => {
  assert.equal(buildAllow(Object.keys(POLICY_FEATURES)), Object.values(POLICY_FEATURES).join('; '));
  const none = buildAllow([]);
  assert.ok(none.startsWith("geolocation 'none'; camera 'none'"));
  assert.equal(none.split('; ').length, Object.keys(POLICY_FEATURES).length);
  const one = buildAllow(['camera', 'not-a-key']);
  assert.ok(one.includes("geolocation 'none'; camera; microphone 'none'"));
});

test('parseProbeMessage: 形が正しいものだけ受け取る', () => {
  const ok = { type: PROBE_MESSAGE_TYPE, results: [{ key: 'camera', state: 'denied' }, { key: 'midi', state: 'prompt' }] };
  assert.deepEqual(parseProbeMessage(ok), [{ key: 'camera', state: 'denied' }, { key: 'midi', state: 'prompt' }]);
  // 余分なプロパティは捨てる
  assert.deepEqual(parseProbeMessage({ type: PROBE_MESSAGE_TYPE, results: [{ key: 'camera', state: 'granted', x: '<img>' }] }),
    [{ key: 'camera', state: 'granted' }]);
  const bad = [
    null, 'x', { type: 'other', results: [] }, { type: PROBE_MESSAGE_TYPE },
    { type: PROBE_MESSAGE_TYPE, results: [{ key: '<img src=x>', state: 'denied' }] },
    { type: PROBE_MESSAGE_TYPE, results: [{ key: 'camera', state: 'owned' }] },
    { type: PROBE_MESSAGE_TYPE, results: [{ key: 'camera', state: 'denied' }, { key: 'camera', state: 'prompt' }] },
    { type: PROBE_MESSAGE_TYPE, results: new Array(PERMISSIONS.length + 1).fill({ key: 'camera', state: 'denied' }) },
    { type: PROBE_MESSAGE_TYPE, results: [null] },
  ];
  for (const b of bad) assert.equal(parseProbeMessage(b), null, JSON.stringify(b));
});

test('compareResults と summarizeComparison', () => {
  const top = PERMISSIONS.map(p => ({ key: p.key, state: 'prompt' }));
  const framed = PERMISSIONS.map(p => ({ key: p.key, state: ['camera', 'midi'].includes(p.key) ? 'denied' : 'prompt' }));
  const allowed = Object.keys(POLICY_FEATURES).filter(k => !['camera', 'midi', 'local-fonts'].includes(k));
  const rows = compareResults(top, framed, allowed);
  assert.equal(rows.length, PERMISSIONS.length);
  const cam = rows.find(r => r.key === 'camera');
  assert.deepEqual([cam.allowed, cam.top, cam.frame, cam.changed], [false, 'prompt', 'denied', true]);
  assert.equal(rows.find(r => r.key === 'notifications').allowed, null);
  assert.deepEqual(summarizeComparison(rows), { changed: 2, blocked: 3, blockedMeasured: 3, blockedDenied: 2 });
  // 照会できない権限は「照会できた件数」に入れない（Firefox の clipboard-read など）
  const ff = compareResults([{ key: 'clipboard-read', state: 'unknown' }], [{ key: 'clipboard-read', state: 'unknown' }], []);
  assert.equal(summarizeComparison(ff).blockedMeasured, 0);
});
