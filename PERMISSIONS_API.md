# Permissions API 技術仕様書

本ドキュメントは、Browser Permission Radarで使っているPermissions APIの仕様と、ブラウザーごとの対応状況、本ツールでの扱いをまとめたものです。

---

## 📋 目次

1. [Permissions APIとは](#permissions-apiとは)
2. [基本仕様](#基本仕様)
3. [照会できる範囲](#照会できる範囲)
4. [本ツールでの実装](#本ツールでの実装)
5. [対応権限一覧](#対応権限一覧)
6. [ブラウザーごとの違い](#ブラウザーごとの違い)
7. [スコアリング](#スコアリング)
8. [権限テスト](#権限テスト)
9. [参考資料](#参考資料)

---

## Permissions APIとは

Permissions APIは、Webページがブラウザーの機能（位置情報・カメラ・通知など）を使ってよいかの状態を、共通の方法で問い合わせるための仕組みです。

- 状態の照会: `navigator.permissions.query(descriptor)`がPromiseで`PermissionStatus`を返す
- 変化の通知: `PermissionStatus`の`change`イベントで、状態の変化を受け取れる
- Web Workerからも使える

---

## 基本仕様

### PermissionStatus

- `state`: `"granted"`（許可済み）・`"prompt"`（使う前に尋ねられる）・`"denied"`（拒否済み）のいずれか
- `name`: 照会した権限の名前
- `change`イベント: 状態が変わると発火する

### 基本的な使い方

```javascript
const status = await navigator.permissions.query({ name: 'geolocation' });
console.log(status.state);                    // "granted" / "prompt" / "denied"
status.addEventListener('change', () => {
  console.log('changed to', status.state);
});
```

### 知らない名前

仕様では、ブラウザーが対応していない`name`を渡すと、`TypeError`でrejectされます。WebKitは、名前を知っていても状態を取れないものを`NotSupportedError`でrejectすることがあります。

### 通知の古いAPI

`Notification.permission`は`"default"`・`"granted"`・`"denied"`を返します。WHATWGのNotifications APIの仕様では、権限の状態が`"prompt"`のとき`"default"`を返すと定めています。

---

## 照会できる範囲

- 照会で見えるのは、照会したページのトップレベルのオリジンに対する記録だけです（W3C Permissionsの仕様で、権限の記録のキーは既定でオリジン）。ほかのサイトに与えた許可は見えません
- iframeの中の文書は、Permissions Policyで許されていない機能について、尋ねられずに`"denied"`を返します
- 照会に利用者の操作は要りません。どのサイトも、開いた瞬間に同じ照会ができます

---

## 本ツールでの実装

### 照会（js/scanner.js）

```javascript
export async function queryOne(env, perm) {
  const permissions = env.navigator && env.navigator.permissions;
  if (!permissions || typeof permissions.query !== 'function') {
    return { queryState: null, error: 'NoPermissionsAPI', status: null, usedName: null };
  }
  let error = null;
  for (const d of perm.descriptors || [perm.descriptor]) {
    try {
      const status = await permissions.query(d);
      return { queryState: status.state, error: null, status, usedName: d.name };   // 実物は state の型も確かめる
    } catch (e) {
      error = e.name;                         // 次の候補を試す
    }
  }
  return { queryState: null, error, status: null, usedName: null };
}
```

### 分類（js/perm-core.js）

```javascript
export function classify({ queryState = null, featurePresent = false, notificationPermission = null } = {}) {
  if (queryState === 'granted' || queryState === 'prompt' || queryState === 'denied') {
    return { state: queryState, source: 'query' };
  }
  const notif = normalizeNotificationPermission(notificationPermission);   // "default" → "prompt"
  if (notif) return { state: notif, source: 'notification' };
  return { state: featurePresent ? 'unknown' : 'unsupported', source: 'none' };
}
```

- 照会できたら、その値をそのまま使います
- 照会できず、機能のAPI（`SyncManager`・`IdleDetector`・`navigator.clipboard`など）があれば`unknown`（照会できない）、なければ`unsupported`（機能なし）にします。照会できない権限を`prompt`と推測しません
- 通知は`Notification.permission`でも読み、照会の値と食い違えば詳細タブに注記します

---

## 対応権限一覧

本ツールが照会する12の権限です。版はMDNのbrowser-compat-data（2026-10-09のコミット時点）による、Permissions APIの`name`として照会できるようになった版です。

### 🟢 デバイスアクセス系

| 権限名 | Chrome・Edge | Firefox | Safari | 説明 | リスク |
|---|---|---|---|---|---|
| `geolocation` | 43 | 46 | 16 | 現在地の取得 | 行動の追跡、居場所の特定 |
| `camera` | 64 | 132 | 16 | カメラへのアクセス | 盗撮 |
| `microphone` | 64 | 132 | 16 | マイクへのアクセス | 盗聴、会話の記録 |
| `midi` | 43 | 110 | なし | MIDI機器へのアクセス | 機器の構成が指紋の材料になる |

### 🔵 データアクセス系

| 権限名 | Chrome・Edge | Firefox | Safari | 説明 | リスク |
|---|---|---|---|---|---|
| `clipboard-read` | 64 | なし | なし | クリップボードの読み取り | パスワードや機密情報の窃取 |
| `clipboard-write` | 64 | なし | なし | クリップボードへの書き込み | ClickFix（悪性のコマンドを貼らせて実行させる） |
| `persistent-storage` | 71 | 53 | なし | 消されにくい保存領域 | 長く残る識別子、容量の圧迫 |
| `background-sync` | 62 | なし | なし | 閉じたあとの同期 | 閉じたあとの通信 |

### 🟣 通信・通知系

| 権限名 | Chrome・Edge | Firefox | Safari | 説明 | リスク |
|---|---|---|---|---|---|
| `notifications` | 43 | 46 | 16.4 | 通知の表示 | 偽の警告でフィッシングへ誘導 |
| `push` | 43 | 46 | 17 | プッシュメッセージの受信 | 閉じていても届く通信 |
| `payment-handler` | 66 | なし | なし | Webの決済アプリ | 偽の決済画面 |
| `idle-detection` | 項目なし（ChromiumのIDLにはある） | なし | なし | 操作していない・画面のロックの検知 | 在席・離席の監視 |

- Firefoxでは`notifications`と`push`は同じ値を返す別名で、`userVisibleOnly`に対応していません
- Chromeは`push`を`userVisibleOnly: true`以外で照会するとrejectします

---

## ブラウザーごとの違い

- Chromium系（Chrome・Edge）は照会できる権限が多く、`background-sync`・`clipboard-write`・センサー（加速度計など）は既定で許可されています（開いた直後から`granted`）
- Firefoxは`clipboard-read`・`clipboard-write`を照会できません（本ツールでは`unknown`）。`background-sync`・`payment-handler`・`idle-detection`は機能そのものがありません（`unsupported`）
- Safariは、拒否していても、カメラや位置情報を実際に要求するまで`prompt`を返すことがあります。また`change`イベントが発火しません（WebKit bug 259432）
- 一時的な許可: Chrome（116以降のデスクトップ版）の「今回のみ許可」は、ページを閉じる・別のページへ移る・5分以上裏に置く・16時間たつ、のいずれかで失効し、`granted`から`prompt`に戻ります。Firefoxはカメラ・マイクで「この決定を記憶する」を付けなければ一時的な許可（1時間かタブを閉じるまで）になります
- `persistent-storage`は、Chromium系とSafariは利用状況で自動で決め、Firefoxはポップアップで尋ねます

---

## スコアリング

```javascript
// js/perm-core.js
export const SCORE_TABLE = { granted: 1.0, prompt: 0.5, denied: 0.1, unsupported: 0.0 };
// unknown（照会できない）はスコアを持たず、カテゴリの平均に入れない
```

- カテゴリのスコアは、照会できた権限のスコアの平均です。画面に「4件中n件で計算」と出します
- スコアが高いほど、そのカテゴリでこのサイトに許していることが多い、という目安です

---

## 権限テスト

各権限を安全に体験するための、ボタンを押したときだけ動く最小の要求です。

```javascript
// 位置情報（座標は表示しない）
navigator.geolocation.getCurrentPosition(
  () => log(t('log.geo.ok')),
  err => log(t('log.geo.err', { reason: t(`geo.code.${err.code}`) })),
  { enableHighAccuracy: false, timeout: 5000, maximumAge: 0 }
);

// カメラ（取得してすぐ止める）
const stream = await navigator.mediaDevices.getUserMedia({ video: true });
stream.getTracks().forEach(tr => tr.stop());
```

- 通知: `Notification.requestPermission()`
- クリップボード: `readText()`（内容は表示しない）／`writeText('test')`
- MIDI: `requestMIDIAccess({ sysex: false })`（機器の数だけ表示）
- 永続ストレージ: `navigator.storage.persist()`
- アイドル検出: `IdleDetector.requestPermission()`
- Background Sync: 通信しない`sw.js`を登録し、`registration.sync.register()`。「Cleanup」で登録を解除する
- `push`と`payment-handler`は、外部のサービスとの通信や決済アプリの登録が要るため、テストを置いていません

---

## 参考資料

### 仕様・公式ドキュメント

- [W3C Permissions](https://w3c.github.io/permissions/)
- [MDN - Permissions API](https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API)
- [MDN - Permissions.query()](https://developer.mozilla.org/en-US/docs/Web/API/Permissions/query)
- [MDN - Permissions Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Permissions_Policy)
- [WHATWG Notifications API](https://notifications.spec.whatwg.org/)
- [MDN browser-compat-data: Permissions](https://github.com/mdn/browser-compat-data/blob/main/api/Permissions.json)
- [Chrome for Developers: One-time permissions](https://developer.chrome.com/blog/one-time-permissions)

### 関連API

- [Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)
- [Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API)
- [MediaDevices](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices)
- [Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)
- [SyncManager](https://developer.mozilla.org/en-US/docs/Web/API/SyncManager)

### 事例

- [Microsoft Security Blog: Think before you Click(Fix)](https://www.microsoft.com/en-us/security/blog/2025/08/21/think-before-you-clickfix-analyzing-the-clickfix-social-engineering-technique/)（2025-08-21）
