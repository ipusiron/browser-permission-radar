/**
 * Browser Permission Radar — 埋め込み（iframe）の実験の計算部（DOM に依存しない）
 *
 * iframe の allow 属性（Permissions Policy）を組み立て、埋め込んだ照会用のページ（probe.html）から
 * 届いたメッセージを検証し、このページの結果と並べる。
 */
import { PERMISSIONS, STATES } from './perm-core.js';

/** 権限キー → Permissions Policy の機能名（allow 属性に書く名前）。表にない権限は Policy の対象外 */
export const POLICY_FEATURES = {
  geolocation: 'geolocation',
  camera: 'camera',
  microphone: 'microphone',
  midi: 'midi',
  'clipboard-read': 'clipboard-read',
  'clipboard-write': 'clipboard-write',
  'payment-handler': 'payment',
  'idle-detection': 'idle-detection',
  'local-network': 'local-network',
  'storage-access': 'storage-access',
  'screen-wake-lock': 'screen-wake-lock',
  'window-management': 'window-management',
  'local-fonts': 'local-fonts',
  accelerometer: 'accelerometer',
};

/** メッセージの種類（照会用のページ → このページ） */
export const PROBE_MESSAGE_TYPE = 'bpr-probe-result';

/**
 * allow 属性の値を組み立てる。許す機能は名前だけ（＝埋め込み元と同じオリジンに許す）、止める機能は 'none'
 * @param {Iterable<string>} allowedKeys 許す権限キー
 * @returns {string}
 */
export function buildAllow(allowedKeys) {
  const allowed = new Set(allowedKeys);
  return Object.entries(POLICY_FEATURES)
    .map(([key, feature]) => (allowed.has(key) ? feature : `${feature} 'none'`))
    .join('; ');
}

const KEYS = new Set(PERMISSIONS.map(p => p.key));
const STATE_SET = new Set(STATES);

/**
 * 照会用のページから届いたメッセージを検証する。形が違えば null（画面に出さない）
 * @param {unknown} data
 * @returns {Array<{key: string, state: string}>|null}
 */
export function parseProbeMessage(data) {
  if (!data || typeof data !== 'object' || data.type !== PROBE_MESSAGE_TYPE) return null;
  if (!Array.isArray(data.results) || data.results.length > PERMISSIONS.length) return null;
  const out = [];
  const seen = new Set();
  for (const r of data.results) {
    if (!r || typeof r !== 'object') return null;
    if (typeof r.key !== 'string' || !KEYS.has(r.key) || seen.has(r.key)) return null;
    if (typeof r.state !== 'string' || !STATE_SET.has(r.state)) return null;
    seen.add(r.key);
    out.push({ key: r.key, state: r.state });
  }
  return out;
}

/**
 * このページと iframe の中の結果を並べる
 * @param {Array<{key: string, state: string}>} top
 * @param {Array<{key: string, state: string}>} framed
 * @param {Iterable<string>} allowedKeys allow で許した権限キー
 * @returns {Array<{key: string, feature: string|null, allowed: boolean|null, top: string, frame: string, changed: boolean}>}
 */
export function compareResults(top, framed, allowedKeys) {
  const allowed = new Set(allowedKeys);
  const t = new Map(top.map(r => [r.key, r.state]));
  const f = new Map(framed.map(r => [r.key, r.state]));
  return PERMISSIONS.map(p => {
    const feature = POLICY_FEATURES[p.key] || null;
    const a = t.get(p.key) || 'unsupported';
    const b = f.get(p.key) || 'unsupported';
    return { key: p.key, feature, allowed: feature ? allowed.has(p.key) : null, top: a, frame: b, changed: a !== b };
  });
}

/**
 * 結果の数え上げ（止めた機能のうち denied になった数など）
 */
export function summarizeComparison(rows) {
  const blocked = rows.filter(r => r.allowed === false);
  // 照会できなかった（unknown・unsupported）権限は、止めても denied になりようがないので分けて数える
  const measured = blocked.filter(r => !UNMEASURED.has(r.top) && !UNMEASURED.has(r.frame));
  return {
    changed: rows.filter(r => r.changed).length,
    blocked: blocked.length,
    blockedMeasured: measured.length,
    blockedDenied: measured.filter(r => r.frame === 'denied').length,
  };
}

const UNMEASURED = new Set(['unknown', 'unsupported']);
