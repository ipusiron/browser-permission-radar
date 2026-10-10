/**
 * Browser Permission Radar — 埋め込みの実験用の照会ページ（probe.html）の処理
 *
 * 埋め込まれていれば、全権限を照会して、結果（キーと状態だけ）を同じオリジンの親へ送る。
 * 単独で開かれたら、何もせず案内だけを出す。言語は ?lang=（親が付ける）で決め、親からの知らせで切り替える。
 */
import { scanAll } from './scanner.js';
import { PROBE_MESSAGE_TYPE, LANG_MESSAGE_TYPE } from './policy-core.js';
import { t, setLang, applyI18n, pickInitialLang, readStoredLang } from './i18n.js';

let framed = false;
try { framed = window.parent !== window; } catch { framed = true; }
let count = null;

function render() {
  applyI18n();
  document.getElementById('probeText').textContent = count === null ? t('probe.waiting') : t('probe.text', { n: count });
}

setLang(pickInitialLang({ search: window.location.search, stored: readStoredLang(), languages: navigator.languages || [] }));
render();

if (framed) {
  // 親（同じオリジンのページ）からの言語の切り替えだけを受け取る
  window.addEventListener('message', ev => {
    if (ev.source !== window.parent || ev.origin !== window.location.origin) return;
    if (ev.data && ev.data.type === LANG_MESSAGE_TYPE && (ev.data.lang === 'ja' || ev.data.lang === 'en')) {
      setLang(ev.data.lang);
      render();
    }
  });
  scanAll({ navigator, window }).then(results => {
    const payload = { type: PROBE_MESSAGE_TYPE, results: results.map(r => ({ key: r.key, state: r.state })) };
    // 送り先は同じオリジンに限る（ほかのサイトに埋め込まれても結果を渡さない）
    window.parent.postMessage(payload, window.location.origin);
    count = results.length;
    render();
  });
} else {
  document.getElementById('probeAlone').hidden = false;
}
