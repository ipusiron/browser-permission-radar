/**
 * Browser Permission Radar — 権限の定義・状態の分類・スコア（DOM に依存しない純粋なモジュール）
 *
 * 画面（script.js）とテスト（test/*.test.js）の両方から読む。
 * ここではブラウザーの API を直接呼ばない。照会の結果を受け取って分類するだけにする。
 */

/** カテゴリの並び（レーダーの順） */
export const GROUP_ORDER = ['device', 'data', 'comm'];

/**
 * 権限の定義。並び順はカテゴリの中でレーダーの軸を時計回りに置く順（上から）。
 * descriptor は navigator.permissions.query() に渡す値。
 * feature は「その機能の API がブラウザーにあるか」を調べる手がかり（照会できないときの区別に使う）。
 */
export const PERMISSIONS = [
  { key: 'geolocation', group: 'device', descriptor: { name: 'geolocation' }, feature: 'geolocation' },
  { key: 'camera', group: 'device', descriptor: { name: 'camera' }, feature: 'mediaDevices' },
  { key: 'microphone', group: 'device', descriptor: { name: 'microphone' }, feature: 'mediaDevices' },
  { key: 'midi', group: 'device', descriptor: { name: 'midi' }, feature: 'midi' },
  { key: 'clipboard-read', group: 'data', descriptor: { name: 'clipboard-read' }, feature: 'clipboardRead' },
  { key: 'clipboard-write', group: 'data', descriptor: { name: 'clipboard-write' }, feature: 'clipboardWrite' },
  { key: 'persistent-storage', group: 'data', descriptor: { name: 'persistent-storage' }, feature: 'storagePersist' },
  { key: 'background-sync', group: 'data', descriptor: { name: 'background-sync' }, feature: 'syncManager' },
  { key: 'notifications', group: 'comm', descriptor: { name: 'notifications' }, feature: 'notification' },
  { key: 'push', group: 'comm', descriptor: { name: 'push', userVisibleOnly: true }, feature: 'pushManager' },
  { key: 'payment-handler', group: 'comm', descriptor: { name: 'payment-handler' }, feature: 'paymentManager' },
  { key: 'idle-detection', group: 'comm', descriptor: { name: 'idle-detection' }, feature: 'idleDetector' },
];

/** カテゴリ → 権限キーの一覧（PERMISSIONS から作る） */
export const GROUPS = Object.fromEntries(
  GROUP_ORDER.map(g => [g, PERMISSIONS.filter(p => p.group === g).map(p => p.key)])
);

/**
 * 表示する状態。
 * - granted / prompt / denied: Permissions API が返した値（実測）
 * - unknown: 機能の API はあるが、このブラウザーの Permissions API では照会できない（状態は不明）
 * - unsupported: 機能の API そのものがない
 */
export const STATES = ['granted', 'prompt', 'denied', 'unknown', 'unsupported'];

/** スコアの表。unknown は測れていないのでスコアを持たない（平均から外す） */
export const SCORE_TABLE = { granted: 1.0, prompt: 0.5, denied: 0.1, unsupported: 0.0 };

/**
 * Notification.permission の値を Permissions API の語に直す。
 * Notification.permission は未決定を "default" で返す（Permissions API では "prompt"）。
 * @param {unknown} value
 * @returns {'granted'|'prompt'|'denied'|null}
 */
export function normalizeNotificationPermission(value) {
  if (value === 'granted' || value === 'denied') return value;
  if (value === 'default' || value === 'prompt') return 'prompt';
  return null;
}

/**
 * 照会の結果を分類する。
 * @param {object} r
 * @param {string|null} [r.queryState] permissions.query() が返した state（失敗・未実行なら null）
 * @param {boolean} [r.featurePresent] 機能の API がブラウザーにあるか
 * @param {string|null} [r.notificationPermission] notifications のときだけ Notification.permission の生の値
 * @returns {{state: string, source: string}}
 *   source: 'query'（Permissions API）／'notification'（Notification.permission）／'none'
 */
export function classify({ queryState = null, featurePresent = false, notificationPermission = null } = {}) {
  if (queryState === 'granted' || queryState === 'prompt' || queryState === 'denied') {
    return { state: queryState, source: 'query' };
  }
  const notif = normalizeNotificationPermission(notificationPermission);
  if (notif) return { state: notif, source: 'notification' };
  return { state: featurePresent ? 'unknown' : 'unsupported', source: 'none' };
}

/**
 * Permissions API と Notification.permission の食い違いを調べる。
 * @returns {boolean} 両方とも値があり、正規化しても食い違うとき true
 */
export function notificationMismatch(queryState, notificationPermission) {
  const a = (queryState === 'granted' || queryState === 'prompt' || queryState === 'denied') ? queryState : null;
  const b = normalizeNotificationPermission(notificationPermission);
  return a !== null && b !== null && a !== b;
}

/**
 * 状態 → スコア。unknown や未知の値は null（スコアなし）
 * @param {string} state
 * @returns {number|null}
 */
export function stateToScore(state) {
  return Object.prototype.hasOwnProperty.call(SCORE_TABLE, state) ? SCORE_TABLE[state] : null;
}

/**
 * カテゴリのスコア＝測れた権限のスコアの平均。1つも測れなければ null
 * @param {string[]} states
 * @returns {{score: number|null, measured: number, total: number}}
 */
export function groupScore(states) {
  const scores = states.map(stateToScore).filter(v => v !== null);
  const score = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  return { score, measured: scores.length, total: states.length };
}

/**
 * スコアの表示（小数2桁）。null は「—」
 * @param {number|null} score
 */
export function formatScore(score) {
  return score === null ? '—' : score.toFixed(2);
}

/**
 * 状態ごとの件数
 * @param {string[]} states
 */
export function countStates(states) {
  const out = Object.fromEntries(STATES.map(s => [s, 0]));
  for (const s of states) if (s in out) out[s] += 1;
  return out;
}

/**
 * 結果の配列（{key, state}）からカテゴリごとの集計を作る
 * @param {{key: string, state: string}[]} results
 */
export function summarize(results) {
  const byKey = new Map(results.map(r => [r.key, r.state]));
  return Object.fromEntries(GROUP_ORDER.map(g => {
    const states = GROUPS[g].map(k => byKey.get(k) ?? 'unsupported');
    return [g, { ...groupScore(states), counts: countStates(states) }];
  }));
}

/** 権限キー → 定義 */
export function findPermission(key) {
  return PERMISSIONS.find(p => p.key === key) || null;
}
