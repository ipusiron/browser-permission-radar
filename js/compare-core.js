/**
 * Browser Permission Radar — 「尋ねずに読める情報」と比較の計算部（DOM に依存しない）
 *
 * - 照会の結果を、決まった順の文字列（署名）にする。ハッシュは画面で crypto.subtle を使う
 * - 結果を JSON で書き出す形を作り、読み込んだ JSON を検証する
 * - 新しいプロファイルで開いた直後の状態（実測の既定）と比べる
 */
import { PERMISSIONS, STATES } from './perm-core.js';

export const EXPORT_TOOL = 'browser-permission-radar';
export const EXPORT_VERSION = 1;
/** 読み込む JSON の大きさの上限（バイト） */
export const MAX_IMPORT_BYTES = 64 * 1024;
/** 名前（ラベル）の長さの上限 */
export const MAX_LABEL = 40;

/**
 * 新しいプロファイルで公開ページを開いた直後の状態（2026-10-10 に Windows で実測し、画面と同じ分類にかけたもの）。
 * test/compare-core.test.js が test/fixtures/measured-20261010.json から計算し直して一致を確かめる
 */
export const BASELINES = {
  edge: {
    label: 'Edge 155（新しいプロファイル・2026-10-10）',
    states: {
      geolocation: 'prompt', camera: 'prompt', microphone: 'prompt', midi: 'prompt',
      'clipboard-read': 'prompt', 'clipboard-write': 'granted', 'persistent-storage': 'prompt', 'background-sync': 'granted',
      notifications: 'prompt', push: 'prompt', 'payment-handler': 'granted', 'idle-detection': 'prompt',
      'local-network': 'prompt', 'storage-access': 'granted', 'screen-wake-lock': 'granted', 'window-management': 'prompt',
      'local-fonts': 'prompt', accelerometer: 'granted',
    },
  },
  firefox: {
    label: 'Firefox 146（新しいプロファイル・2026-10-10）',
    states: {
      geolocation: 'prompt', camera: 'prompt', microphone: 'prompt', midi: 'prompt',
      'clipboard-read': 'unknown', 'clipboard-write': 'unknown', 'persistent-storage': 'prompt', 'background-sync': 'unsupported',
      notifications: 'prompt', push: 'prompt', 'payment-handler': 'unsupported', 'idle-detection': 'unsupported',
      'local-network': 'unsupported', 'storage-access': 'prompt', 'screen-wake-lock': 'granted', 'window-management': 'unsupported',
      'local-fonts': 'unsupported', accelerometer: 'unsupported',
    },
  },
};

const KEYS = PERMISSIONS.map(p => p.key);
const KEY_SET = new Set(KEYS);
const STATE_SET = new Set(STATES);
/** 照会で答えが得られた状態（尋ねずに読めた答え） */
const ANSWERED = new Set(['granted', 'prompt', 'denied']);

/**
 * 署名: 権限の定義の順に「キー=状態」を ; でつないだ文字列
 * @param {Array<{key: string, state: string}>} results
 */
export function signature(results) {
  const m = new Map(results.map(r => [r.key, r.state]));
  return KEYS.map(k => `${k}=${m.get(k) || 'unsupported'}`).join(';');
}

/**
 * 尋ねずに読めた答えの数え上げ
 * @param {Array<{key: string, state: string}>} results
 */
export function exposure(results) {
  const answered = results.filter(r => ANSWERED.has(r.state));
  return {
    queried: results.length,
    answered: answered.length,
    granted: answered.filter(r => r.state === 'granted').length,
    denied: answered.filter(r => r.state === 'denied').length,
  };
}

/**
 * User-Agent から、比べる既定を選ぶ（推測なので、画面で選び直せる）
 * @param {string} ua
 * @returns {'edge'|'firefox'|null}
 */
export function guessBaseline(ua) {
  const s = String(ua || '');
  if (/\bEdg\//.test(s)) return 'edge';
  if (/\bFirefox\//.test(s)) return 'firefox';
  return null;
}

/**
 * 書き出す JSON のオブジェクト
 * @param {object} o
 * @param {Array<{key: string, state: string, source?: string}>} o.results
 * @param {string} [o.label]
 * @param {string} o.takenAt ISO 8601 の日時
 */
export function buildExport({ results, label = '', takenAt }) {
  return {
    tool: EXPORT_TOOL,
    version: EXPORT_VERSION,
    takenAt,
    label: cleanLabel(label),
    results: KEYS.map(key => {
      const r = results.find(x => x.key === key);
      return { key, state: r && STATE_SET.has(r.state) ? r.state : 'unsupported' };
    }),
  };
}

/**
 * 名前（ラベル）を整える: 制御文字・書式文字を除き、前後の空白を落とし、長さを切る
 * @param {unknown} v
 */
export function cleanLabel(v) {
  if (typeof v !== 'string') return '';
  let out = '';
  for (const ch of v) {
    const cp = ch.codePointAt(0);
    const bad = cp < 0x20 || cp === 0x7f || (cp >= 0x80 && cp < 0xa0) || (cp >= 0x200b && cp <= 0x200f)
      || (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2060 && cp <= 0x2069) || cp === 0xfeff;
    if (!bad) out += ch;
  }
  return [...out.trim()].slice(0, MAX_LABEL).join('');
}

/** ファイル名に使う日時（YYYYMMDD-HHmmss、利用者の時計の現地時刻） */
export function fileStamp(date) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

/**
 * 読み込んだ JSON の文字列を検証する
 * @param {string} text
 * @returns {{ok: true, data: {label: string, takenAt: string, states: Record<string, string>}} | {ok: false, error: string}}
 */
export function parseImport(text) {
  if (typeof text !== 'string') return { ok: false, error: 'type' };
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) return { ok: false, error: 'size' };
  let obj;
  try { obj = JSON.parse(text); } catch { return { ok: false, error: 'json' }; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: 'shape' };
  if (obj.tool !== EXPORT_TOOL || obj.version !== EXPORT_VERSION) return { ok: false, error: 'tool' };
  if (!Array.isArray(obj.results) || obj.results.length > KEYS.length) return { ok: false, error: 'results' };
  const states = {};
  for (const r of obj.results) {
    if (!r || typeof r !== 'object' || typeof r.key !== 'string' || typeof r.state !== 'string') return { ok: false, error: 'results' };
    if (!KEY_SET.has(r.key) || !STATE_SET.has(r.state) || r.key in states) return { ok: false, error: 'results' };
    states[r.key] = r.state;
  }
  const takenAt = typeof obj.takenAt === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(obj.takenAt) ? obj.takenAt : '';
  return { ok: true, data: { label: cleanLabel(obj.label), takenAt, states } };
}

/**
 * いまの結果と、いくつかの比べる先（既定・読み込んだ結果）を権限ごとに並べる
 * @param {Array<{key: string, state: string}>} current
 * @param {Array<{states: Record<string, string>}>} others
 * @returns {Array<{key: string, current: string, others: string[], differs: boolean}>}
 */
export function compareColumns(current, others) {
  const cur = new Map(current.map(r => [r.key, r.state]));
  return KEYS.map(key => {
    const c = cur.get(key) || 'unsupported';
    const o = others.map(x => (x.states && x.states[key]) || '—');
    return { key, current: c, others: o, differs: o.some(v => v !== '—' && v !== c) };
  });
}

/**
 * 既定から変わった権限（既定の表にある権限だけ）
 * @param {Array<{key: string, state: string}>} current
 * @param {Record<string, string>} baseStates
 */
export function changedFromBaseline(current, baseStates) {
  return current
    .filter(r => r.key in baseStates && baseStates[r.key] !== r.state)
    .map(r => ({ key: r.key, from: baseStates[r.key], to: r.state }));
}
