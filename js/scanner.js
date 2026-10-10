/**
 * Browser Permission Radar — 権限の照会（ブラウザーの API は env 経由で受け取る）
 *
 * env = { navigator, window } を渡す。画面では { navigator, window } をそのまま、
 * テストでは偽物を渡す。照会の結果は perm-core の classify で分類する。
 */
import { PERMISSIONS, classify, notificationMismatch } from './perm-core.js';

/**
 * 機能の API がブラウザーにあるか（照会できないときに unknown と unsupported を分ける手がかり）
 * @param {{navigator?: any, window?: any}} env
 * @returns {Record<string, boolean>}
 */
export function detectFeatures(env) {
  const nav = env.navigator || {};
  const win = env.window || {};
  const has = name => typeof win[name] !== 'undefined';
  const fn = v => typeof v === 'function';
  return {
    geolocation: !!nav.geolocation,
    mediaDevices: !!(nav.mediaDevices && fn(nav.mediaDevices.getUserMedia)),
    midi: fn(nav.requestMIDIAccess),
    clipboardRead: !!(nav.clipboard && fn(nav.clipboard.readText)),
    clipboardWrite: !!(nav.clipboard && fn(nav.clipboard.writeText)),
    storagePersist: !!(nav.storage && fn(nav.storage.persist)),
    syncManager: has('SyncManager'),
    notification: has('Notification'),
    pushManager: has('PushManager'),
    paymentManager: has('PaymentManager'),
    idleDetector: has('IdleDetector'),
    storageAccess: fn(win.document && win.document.requestStorageAccess),
    wakeLock: !!(nav.wakeLock && fn(nav.wakeLock.request)),
    localFonts: fn(win.queryLocalFonts),
    windowManagement: fn(win.getScreenDetails),
    sensors: has('Accelerometer'),
    localNetwork: false,
  };
}

/**
 * 1つの権限を照会する。descriptor の候補を順に試し、最初に受け付けられたものを使う
 * @param {{navigator?: any}} env
 * @param {{descriptor: object, descriptors?: object[]}} perm
 * @returns {Promise<{queryState: string|null, error: string|null, status: any, usedName: string|null}>}
 */
export async function queryOne(env, perm) {
  const permissions = env.navigator && env.navigator.permissions;
  if (!permissions || typeof permissions.query !== 'function') {
    return { queryState: null, error: 'NoPermissionsAPI', status: null, usedName: null };
  }
  const candidates = perm.descriptors || [perm.descriptor];
  let error = null;
  for (const d of candidates) {
    try {
      const status = await permissions.query(d);
      const state = status && typeof status.state === 'string' ? status.state : null;
      return { queryState: state, error: null, status, usedName: d.name };
    } catch (e) {
      error = (e && e.name) || 'Error';
    }
  }
  return { queryState: null, error, status: null, usedName: null };
}

/**
 * Notification.permission の生の値（なければ null）
 * @param {{window?: any}} env
 */
export function readNotificationPermission(env) {
  const N = env.window && env.window.Notification;
  return N && typeof N.permission === 'string' ? N.permission : null;
}

/**
 * 全権限を照会して分類する
 * @param {{navigator?: any, window?: any}} env
 * @param {Array} [perms]
 * @returns {Promise<Array<{key: string, group: string, state: string, source: string, queryState: string|null,
 *   error: string|null, usedName: string|null, notification: string|null, mismatch: boolean, status: any}>>}
 */
export async function scanAll(env, perms = PERMISSIONS) {
  const features = detectFeatures(env);
  const out = [];
  for (const p of perms) {
    const q = await queryOne(env, p);
    const isNotif = p.key === 'notifications';
    const notification = isNotif ? readNotificationPermission(env) : null;
    const { state, source } = classify({
      queryState: q.queryState,
      featurePresent: !!features[p.feature],
      notificationPermission: notification,
    });
    out.push({
      key: p.key,
      group: p.group,
      state,
      source,
      queryState: q.queryState,
      error: q.error,
      usedName: q.usedName,
      notification,
      mismatch: isNotif ? notificationMismatch(q.queryState, notification) : false,
      status: q.status,
    });
  }
  return out;
}

/**
 * 2回の照会結果の差分（キーごとに前と今の状態）
 * @param {Array<{key: string, state: string}>} before
 * @param {Array<{key: string, state: string}>} after
 * @returns {Array<{key: string, from: string, to: string}>}
 */
export function diffResults(before, after) {
  const prev = new Map(before.map(r => [r.key, r.state]));
  return after
    .filter(r => prev.has(r.key) && prev.get(r.key) !== r.state)
    .map(r => ({ key: r.key, from: prev.get(r.key), to: r.state }));
}
