/**
 * Browser Permission Radar — 埋め込みの実験用の照会ページ（probe.html）の処理
 *
 * 埋め込まれていれば、全権限を照会して、結果（キーと状態だけ）を同じオリジンの親へ送る。
 * 単独で開かれたら、何もせず案内だけを出す。
 */
import { scanAll } from './scanner.js';
import { PROBE_MESSAGE_TYPE } from './policy-core.js';

let framed = false;
try { framed = window.parent !== window; } catch { framed = true; }

if (framed) {
  scanAll({ navigator, window }).then(results => {
    const payload = { type: PROBE_MESSAGE_TYPE, results: results.map(r => ({ key: r.key, state: r.state })) };
    // 送り先は同じオリジンに限る（ほかのサイトに埋め込まれても結果を渡さない）
    window.parent.postMessage(payload, window.location.origin);
    document.getElementById('probeStatus').textContent = `${results.length}`;
  });
} else {
  document.getElementById('probeAlone').hidden = false;
}
