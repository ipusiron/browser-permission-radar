# Permissions API 技術仕様書

本ドキュメントは、**Browser Permission Radar**で使用している**Permissions API**の技術仕様と実装詳細をまとめたものです。

---

## 📋 目次

1. [Permissions APIとは](#permissions-apiとは)
2. [基本仕様](#基本仕様)
3. [本ツールでの実装](#本ツールでの実装)
4. [対応権限一覧](#対応権限一覧)
5. [ブラウザー互換性とフォールバック](#ブラウザー互換性とフォールバック)
6. [参考資料](#参考資料)

---

## Permissions APIとは

**Permissions API**は、Web APIの権限状態をプログラム的に照会するための標準化されたインターフェイスです。

### 特徴

- **統一的な権限照会**: 様々なWeb APIの権限状態を一貫した方法で取得
- **リアルタイム監視**: 権限状態の変更をイベントで検知
- **非同期処理**: Promiseベースの設計
- **Web Worker対応**: メインスレッドとWorkerの両方で使用可能

---

## 基本仕様

### コアインターフェイス

#### 1. `Permissions` インターフェイス

```javascript
// アクセス方法
navigator.permissions
```

**主要メソッド:**

- `query(descriptor)` - 権限状態を照会（Promiseを返す）

#### 2. `PermissionStatus` インターフェイス

権限照会の結果として返されるオブジェクト。

**プロパティ:**

- `state` (string) - 権限の状態
  - `"granted"` - 許可済み
  - `"denied"` - 拒否済み
  - `"prompt"` - 未決定（プロンプト表示）

**イベント:**

- `change` - 権限状態が変更された時に発火

### 基本的な使用方法

```javascript
// 権限状態を照会
navigator.permissions.query({ name: 'geolocation' })
  .then(permissionStatus => {
    console.log(permissionStatus.state); // "granted", "denied", "prompt"

    // 権限状態の変更を監視
    permissionStatus.onchange = () => {
      console.log("Permission changed to", permissionStatus.state);
    };
  });
```

---

## 本ツールでの実装

### 権限照会関数 (`script.js:73-94`)

```javascript
async function queryPermission(name) {
  try {
    const result = await navigator.permissions.query({ name });
    return result.state; // "granted", "denied", "prompt"
  } catch {
    return featureFallback(name); // フォールバック処理
  }
}
```

**処理フロー:**

1. `navigator.permissions.query()` で権限状態を照会
2. 成功時は `state` プロパティを返す
3. 失敗時（未対応権限）は `featureFallback()` で代替チェック

### フォールバック処理 (`script.js:82-94`)

Permissions APIが対応していない権限や機能について、直接APIの存在をチェック:

```javascript
function featureFallback(name) {
  if (name === 'geolocation') {
    return navigator.geolocation ? 'prompt' : 'unsupported';
  }
  if (name === 'notifications') {
    return 'Notification' in window ? 'prompt' : 'unsupported';
  }
  // ... 他の権限も同様にチェック
  return 'unsupported';
}
```

### 全権限スキャン (`script.js:96-104`)

```javascript
async function scanAllPermissions() {
  const results = {};
  for (const p of PERMS) {
    results[p.name] = await queryPermission(p.name);
  }
  return results;
}
```

---

## 対応権限一覧

本ツールで監視している権限をカテゴリ別に整理。

### 🟢 デバイスアクセス系 (Device)

| 権限名 | Permissions API対応 | 説明 | リスク |
|--------|-------------------|------|--------|
| `camera` | ✅ | カメラへのアクセス | 盗撮、プライバシー侵害 |
| `microphone` | ✅ | マイクへのアクセス | 盗聴、会話の記録 |
| `geolocation` | ✅ | 位置情報の取得 | 行動追跡、居場所特定 |
| `midi` | ⚠️ (フォールバック) | MIDI機器へのアクセス | デバイス指紋、周辺機器の識別 |

### 🔵 データアクセス系 (Data)

| 権限名 | Permissions API対応 | 説明 | リスク |
|--------|-------------------|------|--------|
| `clipboard-read` | ✅ | クリップボードの読み取り | パスワード窃取、機密情報漏洩 |
| `clipboard-write` | ✅ | クリップボードへの書き込み | 意図しないデータの上書き |
| `persistent-storage` | ✅ | 永続ストレージの確保 | トラッキング、容量圧迫 |
| `background-sync` | ✅ | バックグラウンド同期 | 通信量増加、バッテリー消費 |

### 🟣 通信・通知系 (Communication)

| 権限名 | Permissions API対応 | 説明 | リスク |
|--------|-------------------|------|--------|
| `notifications` | ✅ | プッシュ通知の表示 | スパム、フィッシング誘導 |

---

## ブラウザー互換性とフォールバック

### Permissions API対応状況

- **Chrome/Edge**: ほぼ全権限に対応
- **Firefox**: 一部権限に対応（`geolocation`, `notifications`など）
- **Safari**: 対応が限定的（iOS 16+で一部対応）

### フォールバック戦略

本ツールでは、Permissions APIが未対応の場合でも権限状態を推測するため、以下の手法を使用:

```javascript
// 例: 通知権限のフォールバック
if ('Notification' in window) {
  // APIが存在 → 状態は "prompt" または "granted/denied"
  return Notification.permission || 'prompt';
} else {
  // APIが存在しない → 完全に未対応
  return 'unsupported';
}
```

**フォールバック対象の権限:**

- `midi` → `navigator.requestMIDIAccess` の存在確認
- `persistent-storage` → `navigator.storage` の存在確認
- `clipboard-*` → `navigator.clipboard` の存在確認

---

## スコアリングアルゴリズム

権限状態を数値化してレーダーチャートに反映 (`script.js:107-113`):

```javascript
function scoreState(state) {
  if (state === 'granted') return 1.0;    // 完全許可
  if (state === 'prompt') return 0.5;     // 未決定
  if (state === 'denied') return 0.1;     // 拒否済み
  return 0.0;                             // 未対応
}
```

**教育的意図:**

- `granted`（緑）が広がるほど「露出面積が大きい」
- カテゴリごとの平均スコアで「どの分野でオープンか」を可視化

---

## 権限テスト機能

各権限の実際の動作を安全に体験するための最小リクエスト実装 (`script.js:292-358`):

### 通知権限テスト

```javascript
async function testNotifications() {
  const result = await Notification.requestPermission();
  console.log('Notification permission:', result);
}
```

### 位置情報権限テスト

```javascript
function testGeolocation() {
  navigator.geolocation.getCurrentPosition(
    pos => console.log('位置取得成功:', pos.coords),
    err => console.error('位置取得失敗:', err)
  );
}
```

### カメラ/マイク権限テスト

```javascript
async function testCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  console.log('カメラアクセス成功');
  stream.getTracks().forEach(track => track.stop()); // 即座に停止
}
```

**安全設計のポイント:**

- リソースは即座に解放（`track.stop()`）
- 最小限の権限のみリクエスト
- ユーザー操作を必須とする（クリップボードなど）

---

## 参考資料

### 公式ドキュメント

- [MDN - Permissions API](https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API)
- [W3C Permissions Specification](https://w3c.github.io/permissions/)

### 関連API

- [Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)
- [Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API)
- [MediaDevices API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices)
- [Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)

### ブラウザー互換性

- [Can I use: Permissions API](https://caniuse.com/permissions-api)

---

## まとめ

Permissions APIは、ブラウザー権限の透明性を高める重要な標準APIです。本ツールでは:

1. **統一的な照会**: 様々な権限を一貫した方法でチェック
2. **フォールバック戦略**: 未対応ブラウザーでも動作
3. **教育的可視化**: スコアリングとレーダーチャートで直感的に理解
4. **安全なテスト**: 最小権限の原則に基づいた実装

これにより、ユーザーは「ブラウザーが何を要求できるか」を体験的に学ぶことができます。
