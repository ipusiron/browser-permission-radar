import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFeatures, queryOne, readNotificationPermission, scanAll, diffResults } from '../js/scanner.js';

// 偽のブラウザー。answers に name → state か、例外の名前（'TypeError' など）を書く
function fakeEnv({ answers = {}, notif = undefined, features = 'all' } = {}) {
  const calls = [];
  const permissions = {
    async query(d) {
      calls.push(d);
      const a = answers[d.name];
      if (a === undefined || a === 'TypeError' || a === 'NotSupportedError') {
        const e = new Error('x');
        e.name = a === 'NotSupportedError' ? 'NotSupportedError' : 'TypeError';
        throw e;
      }
      return { state: a, name: d.name };
    },
  };
  const all = features === 'all';
  const fn = () => {};
  const navigator = {
    permissions,
    geolocation: all ? {} : undefined,
    mediaDevices: all ? { getUserMedia: fn } : undefined,
    requestMIDIAccess: all ? fn : undefined,
    clipboard: all ? { readText: fn, writeText: fn } : undefined,
    storage: all ? { persist: fn } : undefined,
  };
  const window = all ? { SyncManager: fn, PushManager: fn, PaymentManager: fn, IdleDetector: fn } : {};
  if (notif !== undefined) window.Notification = { permission: notif };
  return { env: { navigator, window }, calls };
}

// 2026-10-10 に公開ページで実測した Firefox 146 の照会結果
const FIREFOX = {
  geolocation: 'prompt', camera: 'prompt', microphone: 'prompt', midi: 'prompt',
  'clipboard-read': 'TypeError', 'clipboard-write': 'TypeError', 'persistent-storage': 'prompt',
  'background-sync': 'TypeError', notifications: 'prompt', push: 'prompt',
  'payment-handler': 'TypeError', 'idle-detection': 'TypeError',
};

test('detectFeatures: API があれば true、なければ false', () => {
  const { env } = fakeEnv();
  const f = detectFeatures(env);
  assert.equal(f.mediaDevices, true);
  assert.equal(f.syncManager, true);
  assert.equal(f.notification, false);
  const none = detectFeatures({ navigator: {}, window: {} });
  assert.ok(Object.values(none).every(v => v === false));
  assert.equal(detectFeatures({}).geolocation, false);
});

test('queryOne: 照会できれば state、できなければ例外の名前', async () => {
  const { env } = fakeEnv({ answers: { camera: 'granted', midi: 'NotSupportedError' } });
  assert.deepEqual((await queryOne(env, { descriptor: { name: 'camera' } })).queryState, 'granted');
  const r = await queryOne(env, { descriptor: { name: 'midi' } });
  assert.equal(r.queryState, null);
  assert.equal(r.error, 'NotSupportedError');
  const none = await queryOne({ navigator: {} }, { descriptor: { name: 'camera' } });
  assert.equal(none.error, 'NoPermissionsAPI');
});

test('queryOne: descriptor の候補を順に試す', async () => {
  const { env, calls } = fakeEnv({ answers: { 'old-name': 'prompt' } });
  const r = await queryOne(env, { descriptor: { name: 'new-name' }, descriptors: [{ name: 'new-name' }, { name: 'old-name' }] });
  assert.equal(r.queryState, 'prompt');
  assert.equal(r.usedName, 'old-name');
  assert.deepEqual(calls.map(c => c.name), ['new-name', 'old-name']);
});

test('readNotificationPermission', () => {
  assert.equal(readNotificationPermission(fakeEnv({ notif: 'default' }).env), 'default');
  assert.equal(readNotificationPermission(fakeEnv().env), null);
  assert.equal(readNotificationPermission({}), null);
});

test('scanAll: Firefox の実測を再現すると、照会できない権限は unknown になる（prompt と推測しない）', async () => {
  const { env, calls } = fakeEnv({ answers: FIREFOX, notif: 'default' });
  // Firefox には SyncManager・PaymentManager・IdleDetector がない
  delete env.window.SyncManager;
  delete env.window.PaymentManager;
  delete env.window.IdleDetector;
  const res = await scanAll(env);
  const st = Object.fromEntries(res.map(r => [r.key, r.state]));
  assert.equal(st['clipboard-read'], 'unknown');
  assert.equal(st['clipboard-write'], 'unknown');
  assert.equal(st['background-sync'], 'unsupported');
  assert.equal(st['payment-handler'], 'unsupported');
  assert.equal(st['idle-detection'], 'unsupported');
  assert.equal(st.notifications, 'prompt');
  assert.equal(res.find(r => r.key === 'notifications').mismatch, false);
  assert.equal(res.find(r => r.key === 'clipboard-read').error, 'TypeError');
  // push は userVisibleOnly: true を付けて照会している
  assert.deepEqual(calls.find(c => c.name === 'push'), { name: 'push', userVisibleOnly: true });
});

test('scanAll: 通知の照会と Notification.permission が食い違えば mismatch', async () => {
  // Chromium の headless shell で実測した組み合わせ（照会は prompt、Notification.permission は denied）
  const { env } = fakeEnv({ answers: { notifications: 'prompt' }, notif: 'denied' });
  const n = (await scanAll(env)).find(r => r.key === 'notifications');
  assert.equal(n.state, 'prompt');
  assert.equal(n.source, 'query');
  assert.equal(n.mismatch, true);
});

test('scanAll: Permissions API がないブラウザーでも通知は Notification.permission で分かる', async () => {
  const { env } = fakeEnv({ notif: 'default' });
  delete env.navigator.permissions;
  const res = await scanAll(env);
  const n = res.find(r => r.key === 'notifications');
  assert.deepEqual([n.state, n.source], ['prompt', 'notification']);
  assert.equal(res.find(r => r.key === 'camera').state, 'unknown');
});

test('diffResults: 変わった権限だけを返す', () => {
  const a = [{ key: 'camera', state: 'prompt' }, { key: 'midi', state: 'prompt' }];
  const b = [{ key: 'camera', state: 'granted' }, { key: 'midi', state: 'prompt' }, { key: 'push', state: 'denied' }];
  assert.deepEqual(diffResults(a, b), [{ key: 'camera', from: 'prompt', to: 'granted' }]);
  assert.deepEqual(diffResults([], b), []);
});
