/**
 * Browser Permission Radar — 文言の取り出しと、画面の日英の切り替え
 * t(key, params) は現在の言語の辞書から引き、なければ日本語、それもなければキーを返す。
 */
import { MESSAGES } from './messages.js';

let lang = 'ja';
const STORAGE_KEY = 'bpr-lang';

/** 現在の言語 */
export function getLang() {
  return lang;
}

/**
 * 言語を設定する（辞書にない言語は ja）
 * @param {string} next
 */
export function setLang(next) {
  lang = Object.prototype.hasOwnProperty.call(MESSAGES, next) ? next : 'ja';
  return lang;
}

/**
 * 文言を引いて {name} を差し込む
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 */
export function t(key, params = {}) {
  const dict = MESSAGES[lang] || MESSAGES.ja;
  const raw = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key]
    : Object.prototype.hasOwnProperty.call(MESSAGES.ja, key) ? MESSAGES.ja[key] : key;
  return raw.replace(/\{(\w+)\}/g, (m, name) => (Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m));
}

/**
 * 最初の言語を決める: ?lang= → 保存した選択 → ブラウザーの言語（日本語以外は英語）
 * @param {{search?: string, stored?: string|null, languages?: string[]}} src
 * @returns {'ja'|'en'}
 */
export function pickInitialLang({ search = '', stored = null, languages = [] } = {}) {
  const q = new URLSearchParams(search).get('lang');
  if (q === 'ja' || q === 'en') return q;
  if (stored === 'ja' || stored === 'en') return stored;
  const first = (languages[0] || '').toLowerCase();
  return first.startsWith('ja') ? 'ja' : 'en';
}

/** 保存した選択を読む（localStorage が使えなくても動く） */
export function readStoredLang() {
  try { return window.localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

/** 選択を保存する（失敗しても続ける） */
export function storeLang(value) {
  try { window.localStorage.setItem(STORAGE_KEY, value); } catch { /* 保存できなくても表示は切り替える */ }
}

/**
 * data-i18n（文字）・data-i18n-html（辞書の文を innerHTML に入れる）・data-i18n-attr（属性）を現在の言語にする
 * @param {ParentNode} root
 */
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  // 辞書（js/messages.js）の固定の文だけを入れる。利用者の文字列はここを通らない
  root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-attr]').forEach(el => {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':');
      el.setAttribute(attr, t(key));
    }
  });
  document.documentElement.lang = lang;
  document.title = t('ui.title');
}
