# Technical Implementation Guide

Browser Permission Radarの技術的実装の詳細を解説します。

---

## 📋 目次

1. [レーダーチャート描画アルゴリズム](#レーダーチャート描画アルゴリズム)
2. [クリック判定システム](#クリック判定システム)
3. [ツールチップの動的配置アルゴリズム](#ツールチップの動的配置アルゴリズム)
4. [権限スキャンとフォールバック機構](#権限スキャンとフォールバック機構)
5. [セキュリティ対策の実装](#セキュリティ対策の実装)
6. [アコーディオンアニメーション](#アコーディオンアニメーション)

---

## レーダーチャート描画アルゴリズム

### 概要

3つのカテゴリ（デバイス、データ、通信）ごとに独立したレーダーチャートをHTML5 Canvasで描画しています。

### 描画順序の最適化

点がラベルに隠れないよう、描画順序を以下のように最適化しています：

```javascript
// script.js:396-558
function drawRadarGroup(groupKey, results, canvas, ctx){
  // 1. グリッド（同心円と軸）
  // 2. ポリゴン（塗りつぶし＋ストローク）
  // 3. ラベル（背景→テキスト）
  // 4. 点（グロー→ポイント）← 最後に描画で最前面
}
```

**ポイント**:
- 点を最後に描画することで、MAX値（granted = 1.0）の場合でもラベルに隠れない
- 以前は「ラベル → ポリゴン → 点」の順序だったが、「ポリゴン → ラベル → 点」に変更

### 座標計算

極座標系を使用してN角形のレーダーチャートを描画：

```javascript
// script.js:501-506
const pts = subset.map((r,i)=>{
  const a = (-Math.PI/2) + (i*(2*Math.PI/N));  // 角度（上から時計回り）
  const rad = R*stateToScore(r.state);         // 半径（スコアに応じて変化）
  return { x: cx+Math.cos(a)*rad, y: cy+Math.sin(a)*rad, key:r.key, state:r.state };
});
```

**計算式**:
- 開始角度: `-Math.PI/2` (上方向)
- 角度増分: `2*Math.PI/N` (N等分)
- 座標変換: 極座標 → デカルト座標

### ラベル配置の自動調整

ラベルが画面端で切れないよう、境界チェックを実装：

```javascript
// script.js:456-476
let boxX = cx + Math.cos(a) * (R + 28) - boxWidth / 2;
let boxY = cy + Math.sin(a) * (R + 28) - boxHeight / 2;

// 画面端調整
if (boxX < labelMargin) boxX = labelMargin;
if (boxX + boxWidth > W - labelMargin) boxX = W - labelMargin - boxWidth;
if (boxY < labelMargin) boxY = labelMargin;
if (boxY + boxHeight > H - labelMargin) boxY = H - labelMargin - boxHeight;
```

---

## クリック判定システム

### ヒットテストアルゴリズム

レーダーチャート上の点をクリック可能にするため、カスタムヒットテストを実装：

```javascript
// script.js:548-561
canvas.addEventListener('click', (ev)=>{
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;  // Canvas内の相対座標
  const y = ev.clientY - rect.top;

  const hits = clickMaps[groupKey] || [];
  let target = null, dmin = Infinity;

  hits.forEach(p=>{
    const d = Math.hypot(p.x - x, p.y - y);  // ユークリッド距離
    if (d < p.r && d < dmin){
      dmin = d;
      target = p;  // もっとも近い点を選択
    }
  });
});
```

**アルゴリズム**:
1. クリック座標をCanvas相対座標に変換
2. すべての点との距離を計算（`Math.hypot`使用）
3. 閾値（30px）内でもっとも近い点を選択
4. 該当点が見つかれば詳細タブへジャンプ

### クリックマップの構造

各カテゴリごとに点の座標を保存：

```javascript
// script.js:387
const clickMaps = {
  device: [{x: 180, y: 50, key: 'camera', r: 30}, ...],
  data: [...],
  comm: [...]
};
```

**データ構造**:
- `x, y`: Canvas上の座標
- `key`: 権限のキー（例: 'camera'）
- `r`: クリック判定の半径（30px）

### タブ切り替えの同期処理

点クリック時のタブ切り替えとスクロールを同期：

```javascript
// script.js:562-574
if (target){
  selectTab('details');  // タブ切り替え

  // DOM更新を待つ
  requestAnimationFrame(() => {
    applyFilter(groupKey);  // フィルター適用
    const row = document.getElementById(`perm-row-${target.key}`);
    if (row){
      row.scrollIntoView({behavior:'smooth', block:'center'});
      row.classList.remove('highlight');
      void row.offsetWidth;  // リフロー強制
      row.classList.add('highlight');
    }
  });
}
```

**ポイント**:
- `requestAnimationFrame`でDOM更新を待つ
- `void row.offsetWidth`でリフローを強制し、CSSアニメーションを確実に動作させる

---

## ツールチップの動的配置アルゴリズム

### スマート配置ロジック

ツールチップが画面端で切れないよう、動的に配置を調整：

```javascript
// script.js:109-128
function positionTooltip(target){
  const rect = target.getBoundingClientRect();
  const tipRect = tooltipEl.getBoundingClientRect();

  // 基本位置: 右側
  let left = rect.right + TOOLTIP_PADDING;

  // 右側に収まらない場合 → 左側
  if (left + tipRect.width + TOOLTIP_PADDING > window.innerWidth) {
    left = rect.left - tipRect.width - TOOLTIP_PADDING;
  }

  // 左側にも収まらない場合 → 中央
  if (left < TOOLTIP_PADDING) {
    left = Math.max(TOOLTIP_PADDING, rect.left + (rect.width / 2) - (tipRect.width / 2));
  }

  // 垂直方向も同様に調整
  let top = rect.top + (rect.height / 2) - (tipRect.height / 2);
  const maxTop = window.innerHeight - TOOLTIP_PADDING - tipRect.height;
  if (top < TOOLTIP_PADDING) top = TOOLTIP_PADDING;
  if (top > maxTop) top = maxTop;
}
```

**配置優先順位**:
1. 右側 (デフォルト)
2. 左側 (右側に収まらない場合)
3. 中央 (両側に収まらない場合)

### レイアウトの再計算タイミング

```javascript
// script.js:131-147
requestAnimationFrame(() => {
  if (activeTooltipTarget !== target) return;
  tooltipEl.getBoundingClientRect();  // レイアウト強制
  positionTooltip(target);
  tooltipEl.style.visibility = 'visible';
});
```

**ポイント**:
- `visibility: hidden`で一旦非表示にし、サイズ計算
- `requestAnimationFrame`で次のフレームで位置を確定
- ちらつき防止

---

## 権限スキャンとフォールバック機構

### Permissions API の互換性処理

ブラウザーごとに対応状況が異なるため、複数段階のフォールバック機構を実装：

```javascript
// script.js:259-289
async function scanAllPermissions() {
  const results = [];
  for (const p of PERMS) {
    // 1. Permissions API を試行
    let res = await queryPermission(p.descriptor);

    // 2. notifications は Notification.permission を優先
    if (p.key === 'notifications' && 'Notification' in window) {
      res = { state: Notification.permission };
    }
    // 3. unsupported ならフォールバック
    else if (res.state === 'unsupported') {
      res = await featureFallback(p.key);
    }

    results.push({ key: p.key, state: res.state });
  }
  return results;
}
```

### フォールバック検出ロジック

API未対応時の代替検出方法：

```javascript
// script.js:242-257
async function featureFallback(key) {
  switch (key) {
    case 'notifications':
      // Notification オブジェクトの存在チェック
      if (!('Notification' in window)) return { state: 'unsupported' };
      return { state: Notification.permission };

    case 'geolocation':
      // navigator.geolocation の存在チェック
      return ('geolocation' in navigator)
        ? { state: 'prompt' }
        : { state: 'unsupported' };

    case 'camera':
    case 'microphone':
      // getUserMedia の存在チェック
      return (navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
        ? { state: 'prompt' }
        : { state: 'unsupported' };
  }
}
```

**フォールバック戦略**:
1. Permissions API（標準）
2. 個別API（Notification.permission等）
3. オブジェクト存在チェック
4. unsupported判定

---

## セキュリティ対策の実装

### XSS対策: HTMLエスケープ

すべての動的コンテンツをエスケープ：

```javascript
// script.js:205-215
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}
```

**適用箇所**:
- テーブルレンダリング（script.js:327-345）
- data-tooltip属性（script.js:338）

### クリックジャッキング対策: Frame-busting

meta X-Frame-Optionsが機能しないため、JavaScriptで実装：

```javascript
// script.js:21-23
if (window.top !== window.self) {
  window.top.location = window.self.location;
}
```

**動作**:
- iframeに埋め込まれた場合、親フレームのURLを変更
- クリックジャッキング攻撃を防止

### Content Security Policy

metaタグで設定（機能する範囲のみ）：

```html
<!-- index.html:9 -->
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self';
               script-src 'self';
               style-src 'self' 'unsafe-inline';
               img-src 'self' data:;
               font-src 'self';
               connect-src 'none';
               base-uri 'self';
               form-action 'none';">
```

**制限内容**:
- 外部スクリプト・スタイル禁止
- データ送信禁止（`connect-src 'none'`）
- フォーム送信禁止

### プライバシー保護: 機密情報の非表示

位置情報やクリップボード内容を非表示：

```javascript
// script.js:631
log(`Geolocation OK: Permission granted (coordinates hidden for privacy)`);

// script.js:663
log(`Clipboard read OK: Permission granted (content hidden for privacy)`);
```

---

## アコーディオンアニメーション

### スムーズな開閉アニメーション

CSS transitionとmax-heightを使用：

```css
/* style.css:515-526 */
.accordion-content{
  max-height:0;
  overflow:hidden;
  transition:max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1),
             padding 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  padding:0 20px;
}

.accordion-content.active{
  max-height:2000px;  /* 十分大きな値 */
  padding:20px;
  transition:max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1),
             padding 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}
```

**工夫点**:
- 開く時: 0.5秒（ゆっくり）
- 閉じる時: 0.4秒（やや速く）
- イージング関数: Material Designの標準`cubic-bezier(0.4, 0, 0.2, 1)`
- パディングも同期してアニメーション

### max-heightの選定理由

`max-height`を使用する理由：

1. **height: auto は transition 不可**
   - `height: 0` → `height: auto`はアニメーションできない

2. **max-height で代替**
   - `max-height: 0` → `max-height: 2000px`ならアニメーション可能
   - 2000pxは実際のコンテンツ高さより大きい値

3. **デメリットと対策**
   - コンテンツが短い場合、アニメーション時間が不自然になる
   - → 実際のコンテンツ高さに近い値（2000px）を設定して軽減

---

## パフォーマンス最適化

### レンダリング最適化

```javascript
// script.js:562-574
requestAnimationFrame(() => {
  applyFilter(groupKey);
  const row = document.getElementById(`perm-row-${target.key}`);
  if (row){
    row.scrollIntoView({behavior:'smooth', block:'center'});
    row.classList.remove('highlight');
    void row.offsetWidth;  // リフローを1回に集約
    row.classList.add('highlight');
  }
});
```

**最適化ポイント**:
- DOM操作を`requestAnimationFrame`内にまとめる
- リフローを最小限に抑える

### イベント委譲

ツールチップは動的に追加されるため、イベント委譲を使用：

```javascript
// script.js:143-156
function attachTooltipHandlers(root = document){
  root.querySelectorAll('.help-icon, .help-icon-small').forEach(icon => {
    if (icon.dataset.tooltipBound) return;  // 重複防止
    icon.dataset.tooltipBound = '1';
    icon.addEventListener('mouseenter', showTooltip);
    icon.addEventListener('focus', showTooltip);
    icon.addEventListener('mouseleave', hideTooltip);
    icon.addEventListener('blur', hideTooltip);
  });
}
```

---

## まとめ

本ツールの技術的特徴：

1. **Canvas描画の最適化**: 描画順序による視認性向上
2. **高精度クリック判定**: ユークリッド距離とヒットテスト
3. **スマートツールチップ**: 画面端での自動配置調整
4. **多段階フォールバック**: ブラウザー互換性の確保
5. **多層セキュリティ**: XSS、クリックジャッキング、CSP
6. **Material Design準拠**: アニメーションイージング

これらの実装により、教育目的のツールとして高い品質と安全性を両立しています。

---

## 関連リソース

- [README.md](README.md) - プロジェクト概要
- [PERMISSIONS_API.md](PERMISSIONS_API.md) - Permissions API技術仕様
- [CLAUDE.md](CLAUDE.md) - Claude Code向けプロジェクト情報
