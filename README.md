<!--
---
title: Browser Permission Radar
category: browser-security
difficulty: 2
description: Category-wise radar charts to visualize browser permission states with safe, on-page permission tests and score-linked details.
tags: [security, privacy, permissions, browser, education, javascript]
demo: https://ipusiron.github.io/browser-permission-radar/
---
-->

# Browser Permission Radar - ブラウザー権限可視化ツール

![GitHub Repo stars](https://img.shields.io/github/stars/ipusiron/browser-permission-radar?style=social)
![GitHub forks](https://img.shields.io/github/forks/ipusiron/browser-permission-radar?style=social)
![GitHub last commit](https://img.shields.io/github/last-commit/ipusiron/browser-permission-radar)
![GitHub license](https://img.shields.io/github/license/ipusiron/browser-permission-radar)
[![GitHub Pages](https://img.shields.io/badge/demo-GitHub%20Pages-blue?logo=github)](https://ipusiron.github.io/browser-permission-radar/)

**Day087 - 生成AIで作るセキュリティツール100**

**Browser Permission Radar** は、ブラウザーの主要権限（位置情報・カメラ・マイク・通知・クリップボードなど）を **カテゴリ別レーダーチャート＋スコア表示**でわかりやすく可視化するツールです。

安全な範囲で各種の **権限リクエストを体験** でき、ブラウザがどのようにユーザー情報へアクセスするかを理解できます。

クライアントサイドのみで動作し、**データ送信は一切ありません**。

---

## 🌐 デモページ

👉 **[https://ipusiron.github.io/browser-permission-radar/](https://ipusiron.github.io/browser-permission-radar/)**

ブラウザーで直接お試しいただけます。

---

## 📸 スクリーンショット

>![ブラウザーに許可された権限を可視化する](assets/screenshot.png)
>*ブラウザーに許可された権限を可視化する*

---

## 🧭 概要

- 各権限のステータス（`granted / denied / prompt / unsupported`）を即時スキャン
- **カテゴリ別レーダーチャート（3分割）**で構造的に表示
- 各カテゴリの平均スコアを表示し、**クリックで詳細テーブルにジャンプ**
- 各点（権限）をクリックすると、**該当行をハイライト**
- 各権限の安全な「テスト」ボタンを搭載  
  - 通知: `Notification.requestPermission()`  
  - 位置情報: `navigator.geolocation.getCurrentPosition()`  
  - カメラ／マイク: `getUserMedia()` 即停止  
  - クリップボード: `readText()` / `writeText('test')`（ユーザー操作必須）  
  - MIDIアクセス: `navigator.requestMIDIAccess()`  
  - 永続ストレージ: `navigator.storage.persist()`  

---

## 🎯 対象ユーザー

- セキュリティ教育に携わる講師・研修担当者
- CTF運営チームや問題作成者
- レッドチーム／ペネトレーションテスター
- ブラウザ権限設定を管理する企業のセキュリティ担当者

---

## 🧩 カテゴリ別レーダーチャート構成

本ツールでは、権限の性質に応じて3つのカテゴリに分け、それぞれに独立したレーダーチャートを表示します。  
これにより、「どの分野でどの程度ブラウザに許可を与えているか」を一目で理解できます。

| カテゴリ | 権限 | 学習テーマ |
|-----------|--------|-------------|
| 🟢 **デバイスアクセス系** | `camera`, `microphone`, `geolocation`, `midi` | 物理的センサーや周辺機器へのアクセス（盗聴・盗撮・位置特定） |
| 🔵 **データアクセス系** | `clipboard-read`, `clipboard-write`, `persistent-storage`, `background-sync` | データ保存・転送・ローカル書き込みに関する権限 |
| 🟣 **通信・通知系** | `notifications` | 外部通信や心理的誘導リスクのある通知系統 |

各カテゴリには平均スコア（0〜1）が算出され、クリックすると「Details」タブでそのカテゴリのみをフィルター表示します。  
レーダー上の各点もクリックでき、該当権限行へ自動スクロール＆ハイライトします。

---

## 🎛 スコアリングルール

| 状態 | スコア |
|------|---------|
| granted | 1.0 |
| prompt | 0.5 |
| denied | 0.1 |
| unsupported | 0.0 |

スコアが高いほど、そのカテゴリで許可されている権限が多いことを意味します。  
教育目的では「緑が広がるほどリスクが高まる」として視覚的に説明できます。

---

## 🔬 使い方

### ⚠️ 重要な前提条件

**このツールは必ず以下のいずれかの環境で実行してください：**

- **ローカルサーバー（推奨）**: `http://localhost` または `http://127.0.0.1`
- **HTTPS環境**: `https://` で始まるURL
- **GitHub Pages等の公開サーバー**

❌ **`file://` プロトコル（HTMLファイルを直接開く）では正しく動作しません**
→ 通知・位置情報などの権限が永続化されず、レーダーチャートの変化を観察できません。

#### ローカルサーバーの起動方法

```bash
# Python 3の場合
python -m http.server 8000

# Python 2の場合
python -m SimpleHTTPServer 8000
```

起動後、ブラウザで `http://localhost:8000` にアクセスしてください。

---

### 基本的な使い方

1. ページを開くと自動で権限をスキャン。
2. 各レーダーチャートでステータスとスコアを確認。
3. **点をクリック** → 「Details」タブへジャンプし該当権限をハイライト。
4. **Scoreボタンをクリック** → カテゴリ単位で絞り込み表示。
5. 「Quick Tests」エリアで安全な最小リクエストを実行。
6. 結果を確認したら「Rescan」で再スキャン。

---

## 🛡 活用シナリオ

1. **CTF競技での権限分析課題**  
   ブラウザ権限の濫用をテーマにしたCTF問題で、参加者が意図的に許可した権限がどのように悪用され得るかをデモする補助ツールとして活用できます。競技者に事前に Radar で現在の権限設定を可視化させ、問題文で提示された攻撃シナリオ（たとえば通知 API を足掛かりにしたフィッシング誘導）との関連付けを促すことで、権限状態の読み解きとリスク評価のスキルを伸ばせます。
2. **レッドチーム演習／ペネトレーションテストの事前調査**  
   実環境への侵入テスト前に、標的組織のブラウザ設定ガイドラインやセキュリティポリシーの順守状況をヒアリングするフェーズで、クライアント担当者に Radar を操作してもらい、通知・位置情報・クリップボードなど敏感な権限の既定値を確認します。演習中は、許可済みの権限を基に成立する攻撃チェーン（例：クリップボード書き換えからの資格情報漏えい）をレポートに反映し、是正提案の優先順位付けに役立てられます。

---

## 🧱 技術構成

- フロントエンドのみで完結（HTML + CSS + JavaScript）
- 外部ライブラリ不使用
- `navigator.permissions.query()` による権限状態取得
- 対応していないブラウザでは自動的に `unsupported` フォールバック
- Canvasを用いた独自レーダーチャート描画
- LocalStorageやサーバ通信は行わない安全設計

📖 **[Permissions API 技術仕様書](PERMISSIONS_API.md)** - 実装の詳細と技術解説

---

## 🧑‍💻 プライバシーと安全性

- データはすべてローカルブラウザ内で処理。送信・保存なし。  
- クリップボード・カメラ等は**ユーザー操作がない限りアクセス不可**。  
- カメラ／マイク取得時は即座に `stop()` で停止。  
- ログ表示は教育目的のみに利用。

---

## ⚙️ スコアリンク＆ハイライト機能

- **スコアリンク**：カテゴリの平均スコアをクリックすると、「Details」タブでそのカテゴリのみを表示。
- **点クリック**：レーダー上の点をクリックすると、その権限の詳細行にスクロール＆ハイライト。
- **カテゴリフィルター**：Detailsタブ上部のチップ（All / Device / Data / Comm）で切り替え可能。

この構成により、単なる可視化ではなく、**“探索的学習”** ができる設計になっています。  
「どの権限を与えているか」だけでなく、「どの分野に偏っているか」も見えるようになります。

---

## 🧠 Browser Fingerprint Mirrorとの学習効果

本ツールのBrowser Permission Radarは、**ブラウザが「何を要求できるか」**（＝権限の範囲）を可視化します。
対になる、Day077で作成した[Browser Fingerprint Mirror](https://github.com/ipusiron/browser-fingerprint-mirror)は、**ブラウザが「何を自動的に晒しているか」**（＝環境指紋）を映し出します。

この2つを対比させることで、ブラウザ識別の**二層構造**を学べます。

| 観点 | Permission Radar（Day092） | Fingerprint Mirror（Day077） |
|------|------------------------------|-------------------------------|
| 情報の発生源 | **ユーザーの許可行動**（能動的） | **ブラウザ環境そのもの**（受動的） |
| 情報の性質 | 明示的に許可された動的データ | 自動的に送信される静的メタ情報 |
| コントロールの主体 | ユーザーが許可・拒否を選べる | ユーザーが意識せず漏らす |
| 教育的テーマ | 「許可の重み」 | 「無意識の露出」 |

### 🧭 対比の本質

- **Browser Fingerprint Mirror** は「受動的な露出（passive exposure）」の世界。  
  許可を与えなくても、環境変数や描画特性から識別されうる。  
- **Browser Permission Radar** は「能動的な許可（active consent）」の世界。  
  明示的な許可によって、ブラウザはより深い情報へアクセスできる。

両者を組み合わせると、  
> **受動的情報（Fingerprint）＋能動的許可（Permissions）＝ブラウザ識別の全体像**  

という構造が浮かび上がります。  
前者が「露出の基礎層」、後者が「アクセス権の拡張層」。  
この二層を体験的に学ぶことで、プライバシーリスクの理解が格段に深まります。

### 🧩 組み合わせ学習シナリオ例

1. **Step 1：Fingerprintsの観察**  
   → OS、解像度、言語、Canvas指紋など「許可なしで見える情報」を確認。  
2. **Step 2：Permissionsの体験**  
   → 通知・カメラ・位置情報を許可し、動作を観察。  
3. **Step 3：結果を比較**  
   → 無許可情報と許可情報の違いを整理し、「露出と許可の層構造」を可視化。  

この2ツールをペアで使うと、**ブラウザがどのように“あなた”を特定しているのか**を立体的に学ぶことができます。

---

## 🧮 教育利用のヒント

- 授業やワークショップでは「Permission Radar → Fingerprint Mirror」の順で実演すると効果的。  
- 参加者ごとにPermission状態を比べて、「誰のブラウザが一番“オープン”か」を視覚的に比較できる。  
- セキュリティ教育だけでなく、プライバシーUX設計やユーザビリティ研究にも応用可。

---

## 📁 ディレクトリー構成

```
```

---

## 📄 ライセンス

MIT License – 詳細は [LICENSE](LICENSE) を参照してください。

---

## 🛠 このツールについて

本ツールは、「生成AIで作るセキュリティツール100」プロジェクトの一環として開発されました。
このプロジェクトでは、AIの支援を活用しながら、セキュリティに関連するさまざまなツールを100日間にわたり制作・公開していく取り組みを行っています。

プロジェクトの詳細や他のツールについては、以下のページをご覧ください。

🔗 [https://akademeia.info/?page_id=42163](https://akademeia.info/?page_id=42163)
