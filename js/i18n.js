/**
 * Browser Permission Radar — 文言の取り出し（日英）
 * t(key, params) は現在の言語の辞書から引き、なければ日本語、それもなければキーを返す。
 */
import { MESSAGES } from './messages.js';

let lang = 'ja';

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
