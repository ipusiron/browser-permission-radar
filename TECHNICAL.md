# Technical Implementation Guide

Browser Permission Radarの実装の詳細を解説します。行番号は書かず、ファイルと関数の名前で示します。

---

## 📋 目次

1. [モジュールの構成](#モジュールの構成)
2. [照会と分類](#照会と分類)
3. [スコア](#スコア)
4. [ライブ更新](#ライブ更新)
5. [レーダーの描画（SVG）](#レーダーの描画svg)
6. [権限テストとBackground Sync](#権限テストとbackground-sync)
7. [ツールチップ・タブ・アコーディオン](#ツールチップタブアコーディオン)
8. [セキュリティ対策の実装](#セキュリティ対策の実装)
9. [テスト](#テスト)

---

## モジュールの構成

| ファイル | 役割 | DOM |
|---|---|---|
| `js/perm-core.js` | 権限の定義（`PERMISSIONS`・`GROUPS`）、状態の分類（`classify`）、スコア（`SCORE_TABLE`・`groupScore`・`summarize`） | 使わない |
| `js/scanner.js` | 照会（`queryOne`・`scanAll`）、機能の有無（`detectFeatures`）、差分（`diffResults`）。ブラウザーのAPIは引数`env`で受け取る | 使わない |
| `js/radar-geom.js` | レーダーの座標（`axisAngles`・`pointsFor`）とラベルの配置（`labelBox`） | 使わない |
| `js/radar-svg.js` | レーダーをSVGで描く（`renderRadar`） | 使う |
| `js/messages.js`・`js/i18n.js` | 文言の辞書と取り出し（`t`） | 使わない |
| `script.js` | 画面の処理（タブ・表・ツールチップ・権限テスト・ライブ更新） | 使う |
| `sw.js` | Background Syncを試すときだけ登録するService Worker | - |

DOMを使わないモジュールは、`node --test`でそのまま検査できます。`script.js`と`js/*.js`はES modulesで、`index.html`から`<script type="module" src="script.js">`で読み込みます。

---

## 照会と分類

`scanAll(env)`は、`PERMISSIONS`の順に`navigator.permissions.query(descriptor)`を呼びます。

```javascript
// js/scanner.js（要約）
for (const p of PERMISSIONS) {
  const q = await queryOne(env, p);            // { queryState, error, status }
  const notification = p.key === 'notifications' ? readNotificationPermission(env) : null;
  const { state, source } = classify({
    queryState: q.queryState,                  // 照会できなければ null
    featurePresent: !!features[p.feature],     // SyncManager・IdleDetector などの有無
    notificationPermission: notification,      // 通知だけ
  });
}
```

`classify`の規則は次のとおりです。

| 照会の結果 | 機能のAPI | 通知のNotification.permission | 表示する状態 | 出所 |
|---|---|---|---|---|
| granted／prompt／denied | 問わない | 問わない | 照会の値 | Permissions API |
| 例外（TypeErrorなど） | 問わない | default／granted／denied | defaultはprompt、ほかはそのまま | Notification.permission |
| 例外（TypeErrorなど） | ある | なし | unknown | 照会できない（例外の名前） |
| 例外（TypeErrorなど） | ない | なし | unsupported | 機能のAPIがない |

- `push`は`{ name: 'push', userVisibleOnly: true }`で照会します（Chromeはこれ以外を拒否します）
- 照会できない権限を`prompt`と推測しません。Firefoxでは`clipboard-read`・`clipboard-write`が`unknown`、`background-sync`・`payment-handler`・`idle-detection`が`unsupported`になります
- 通知は、照会の値とNotification.permissionが（defaultをpromptに直しても）食い違えば`mismatch`として詳細タブに注記します。Chromiumのheadless shellでは、照会が`prompt`、Notification.permissionが`denied`でした

---

## スコア

| 状態 | スコア |
|---|---|
| granted | 1.0 |
| prompt | 0.5 |
| denied | 0.1 |
| unsupported | 0.0 |
| unknown | なし（平均に入れない） |

`groupScore(states)`は、スコアを持つ状態だけの平均を返し、1つもなければ`null`（画面では「—」）にします。画面には「4件中n件で計算」と、平均に使えた件数を出します。表示は`formatScore`（`toFixed(2)`）です。

---

## ライブ更新

照会で得た`PermissionStatus`に`change`のリスナーを付けます。

```javascript
// script.js（要約）
function watch(results) {
  unwatch();                                   // 前回のリスナーを外す
  for (const r of results) {
    if (!r.status) continue;
    const handler = () => rescan({ quiet: true, fromChange: true });
    r.status.addEventListener('change', handler);
    watched.push({ status: r.status, handler });
  }
}
```

- 照会し直すたびに、前回の結果との差分（`diffResults`）をログに出します
- `rescan`は同時に走らせません。走っている間に来た要求は、終わったあとに1回だけ実行します（変更の通知がまとめて届いても、照会は2回で済む）
- Safariは`change`が発火しないため、テストのあとの照会し直しと「Rescan All」で追います

---

## レーダーの描画（SVG）

`viewBox="0 0 400 400"`のSVGに描きます。表示の大きさはCSSで決まり（最大420px）、拡大してもぼやけません。

- 軸: 4軸のときは斜め（右上から時計回りに-45°・45°・135°・225°）に置き、ラベルを四隅に逃がします。それ以外は真上から時計回り
- 点: 半径はスコアと同じ割合です。0の点が中心で重ならないよう、最小で半径の5%の位置に描きます（`displayRadius`）。照会できない点は破線の輪で描き、その軸のラベルも破線にします
- ラベル: 軸の先端から外へ16離した点を基準に、軸の向きで箱の角か辺をそこへ合わせ、viewBoxの中に収めます（`labelBox`）。箱が点（外周のgrantedでも）に重ならないことをテストで確かめています
- 選択: 点は`<g role="button" tabindex="0">`で、クリック・Enter・Spaceで詳細タブのその行へ移ります。画面の座標を測らないので、表示の幅が変わってもずれません。押せる範囲の半径は20（幅320pxの画面で約24px）です
- 色はCSSのクラス（`state-granted`など）で付け、`style`属性は使いません

---

## 権限テストとBackground Sync

`QUICK_TESTS`にボタンのidと処理を並べ、共通の処理で実行します。

- 実行中はボタンを`disabled`にして、連打で二重に要求しません
- 終わったら照会し直します（`change`が届かないブラウザーのため）
- カメラ・マイクは`getUserMedia()`のあとすぐ`stop()`、位置情報の座標とクリップボードの内容はログに出しません

Background Syncは、`navigator.serviceWorker.ready`を待つと、登録がないときに永遠に解決しません。

```javascript
// script.js（要約）
if (!('SyncManager' in window)) return log(t('log.sync.nosync'));   // Firefox・Safari は登録しない
const registration = await waitActive(await navigator.serviceWorker.register('sw.js')); // 5秒で打ち切る
await registration.sync.register('bpr-test-sync');
```

`sw.js`は`install`・`activate`・`sync`だけを受け取り、`fetch`を横取りせず、通信もしません。「Cleanup」は`getRegistrations()`の登録をすべて`unregister()`します。

---

## ツールチップ・タブ・アコーディオン

- 「?」は`<button>`です。マウスを乗せる・フォーカスで開き、押すと固定し、もう一度押すかEscで閉じます。開いている間は`aria-expanded="true"`と`aria-describedby`（`role="tooltip"`の要素）を付けます
- ツールチップは画面の右に出し、収まらなければ左、それでも収まらなければ中央に置きます（`positionTooltip`）
- タブは`role="tablist"`・`tab`・`tabpanel`で、矢印キー・Home・Endで移ります。隠すパネルは`hidden`属性です
- アコーディオンは`aria-expanded`を切り替えます。閉じた中身は`visibility:hidden`（閉じ終わってから）にして、Tabキーで中のリンクに入らないようにします

---

## セキュリティ対策の実装

- CSP（metaタグ）: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; worker-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'`。ツールチップの位置はCSSOM（`element.style.left`）で入れるので、`'unsafe-inline'`は要りません
- 表は`createElement`と`textContent`で組み立て、`innerHTML`を使いません
- 埋め込み: `frame-ancestors`と`X-Frame-Options`はmetaタグでは効かず、GitHub Pagesではヘッダーを設定できません。JavaScriptで親のページを移動させる方法は、Chromium系ではSecurityErrorになり画面全体が止まるため使いません。埋め込まれていれば案内を出します
- 外部リンクは`target="_blank" rel="noopener noreferrer"`、ページ全体は`<meta name="referrer" content="no-referrer">`

---

## テスト

`npm test`（`node --test`、依存なし）で次を検査します。

- `perm-core.test.js`: 分類・通知の正規化・スコアの表と平均・Edgeの実測の再現
- `scanner.test.js`: 偽のブラウザーで照会（Firefoxの実測の再現、descriptorの候補、Permissions APIのないブラウザー）
- `radar-geom.test.js`: 軸の角度・点の座標・ラベルが点と互いに重ならないこと・押せる範囲の大きさ
- `messages.test.js`: `script.js`が引く文言が辞書にあること
- `html.test.js`: CSP・ARIA・ボタンの種類・外部リンク・使うidの有無
- `contrast.test.js`: 文字と下地の組が4.5:1以上（半透明の下地は重ねてから計算）
- `format.test.js`: 行の長さ・改行・見えない文字
- `readme.test.js`: READMEの構成・数値（実測の記録から計算し直す）・表記・ディレクトリー構造

---

## 関連リソース

- [README.md](README.md) - プロジェクト概要
- [PERMISSIONS_API.md](PERMISSIONS_API.md) - Permissions APIの仕様と対応状況
- [CLAUDE.md](CLAUDE.md) - Claude Code向けの説明
