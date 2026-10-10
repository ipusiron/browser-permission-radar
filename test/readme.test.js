import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PERMISSIONS, GROUPS, SCORE_TABLE, classify, summarize, formatScore } from '../js/perm-core.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
const fx = JSON.parse(readFileSync(join(ROOT, 'test/fixtures/measured-20261010.json'), 'utf8'));

/** 実測の記録（照会の生の結果）を、画面と同じ分類・スコアにかける */
const FEATURE_GLOBAL = {
  syncManager: 'SyncManager', paymentManager: 'PaymentManager', idleDetector: 'IdleDetector',
  localFonts: 'queryLocalFonts', windowManagement: 'getScreenDetails', sensors: 'Accelerometer',
};
// 機能の API を調べる手段のない権限（local-network）は、照会できなければ unsupported
const NO_FEATURE_API = new Set(['localNetwork']);
function scoresOf(name) {
  const raw = fx[name];
  const absent = fx.features_absent[name] || [];
  const results = PERMISSIONS.filter(p => p.key in raw).map(p => {
    const q = raw[p.key];
    const { state } = classify({
      queryState: q.startsWith('ERR') ? null : q,
      featurePresent: !NO_FEATURE_API.has(p.feature) && !absent.includes(FEATURE_GLOBAL[p.feature]),
      notificationPermission: p.key === 'notifications' ? raw.__notification : null,
    });
    return { key: p.key, state };
  });
  const s = summarize(results);
  return { results, s, fmt: g => formatScore(s[g].score) };
}

/** README を H2 の節に分ける */
function sections() {
  const out = [];
  let cur = null;
  for (const line of readme.split('\n')) {
    const m = line.match(/^## (.+)$/);
    if (m) { cur = { title: m[1], body: [] }; out.push(cur); } else if (cur) cur.body.push(line);
  }
  return out;
}

/** コードブロックの外の行 */
function proseLines() {
  let fence = false;
  return readme.split('\n').filter(l => {
    if (l.startsWith('```')) { fence = !fence; return false; }
    return !fence;
  });
}

test('YAML メタデータ: キーの並びとブロック形式の一覧、識別の値は変えない', () => {
  const yaml = readme.match(/^<!--\n---\n([\s\S]*?)\n---\n-->/)[1];
  const keys = [...yaml.matchAll(/^([a-z_]+):/gm)].map(m => m[1]);
  assert.deepEqual(keys, ['id', 'slug', 'title', 'subtitle_ja', 'subtitle_en', 'description_ja', 'description_en',
    'category_ja', 'category_en', 'difficulty', 'tags', 'repo_url', 'demo_url', 'hub']);
  assert.ok(yaml.includes('id: day092'));
  assert.ok(yaml.includes('slug: browser-permission-radar'));
  assert.ok(yaml.includes('repo_url: "https://github.com/ipusiron/browser-permission-radar"'));
  assert.ok(yaml.includes('demo_url: "https://ipusiron.github.io/browser-permission-radar/"'));
  assert.ok(yaml.includes('hub: true'));
  for (const k of ['category_ja', 'category_en', 'tags']) {
    const after = yaml.split(`${k}:\n`)[1];
    assert.ok(after && after.startsWith('  - '), `${k} はブロック形式`);
  }
});

test('シリーズ標準の構成（前半と後半の節の順）', () => {
  const titles = sections().map(s => s.title);
  assert.equal(titles[0], '🌐 デモページ');
  assert.equal(titles[1], '📸 スクリーンショット');
  assert.deepEqual(titles.slice(-5), ['🧪 テスト', '📁 ディレクトリー構造', '💻 動作環境', '📄 ライセンス', '🛠️ このツールについて']);
  for (const t of ['✨ 機能', '📖 使い方', '🎯 ユースケース', '🔬 技術的な説明', '🔒 セキュリティとプライバシー', '⚠️ 注意と限界']) {
    assert.ok(titles.includes(t), t);
  }
  assert.ok(readme.includes('# Browser Permission Radar - ブラウザー権限可視化ツール\n'));
  assert.ok(readme.includes('**Day092 - 生成AIで作るセキュリティツール100**'));
  assert.ok(readme.includes('🔗 [https://akademeia.info/?page_id=42163](https://akademeia.info/?page_id=42163)'));
  assert.equal([...readme.matchAll(/img\.shields\.io/g)].length, 5);
  assert.ok(readme.includes('### このツールならではの使い方'));
});

test('見出しと番号つき箇条書きの形', () => {
  for (const l of proseLines()) {
    if (/^#{1,6}[^#\s]/.test(l)) assert.fail(`見出しの記号のあとに空白がない: ${l}`);
    if (/^\d+\.\S/.test(l)) assert.fail(`番号のあとに空白がない: ${l}`);
  }
});

test('スコアの表は perm-core と同じ値', () => {
  for (const [state, score] of Object.entries(SCORE_TABLE)) {
    const row = readme.split('\n').find(l => l.startsWith(`| ${state} |`));
    assert.ok(row, state);
    assert.ok(row.endsWith(`| ${score.toFixed(1)} |`), row);
  }
  assert.ok(readme.includes('| unknown | 機能はあるが、このブラウザーでは照会できない | 平均に入れない |'));
});

test('ユースケースの数値は、実測の記録から計算し直した値と一致する', () => {
  const edge = scoresOf('edge');
  const first12 = r => !GROUPS.extra.includes(r.key);
  assert.deepEqual(edge.results.filter(r => first12(r) && r.state === 'granted').map(r => r.key),
    ['clipboard-write', 'background-sync', 'payment-handler']);
  assert.ok(readme.includes(`データ系のスコアは${edge.fmt('data')}、通信・通知系は${edge.fmt('comm')}でした`));
  const ff = scoresOf('firefox');
  assert.equal(ff.s.data.measured, 2);
  assert.ok(readme.includes(`データ系は4件中${ff.s.data.measured}件で計算して${ff.fmt('data')}でした`));
  assert.deepEqual(ff.results.filter(r => r.state === 'unknown').map(r => r.key), ['clipboard-read', 'clipboard-write']);
  const noAllow = scoresOf('edge_iframe_no_allow');
  const allow = scoresOf('edge_iframe_allow');
  assert.equal(noAllow.s.device.counts.denied, 4);
  assert.ok(readme.includes(`デバイス系が4つとも\`denied\`になり、スコアは${noAllow.fmt('device')}でした`));
  assert.ok(readme.includes(`を付けると${allow.fmt('device')}に戻りました`));
  const headless = fx.chromium_headless_shell;
  assert.equal(headless.notifications, 'prompt');
  assert.equal(headless.__notification, 'denied');
});

test('README の画像はすべて実在し、assets の PNG は README から参照されているものだけ', () => {
  const refs = [...readme.matchAll(/!\[[^\]]*\]\((assets\/[^)]+)\)/g)].map(m => m[1]);
  assert.ok(refs.length >= 3);
  for (const r of refs) assert.ok(existsSync(join(ROOT, r)), r);
  const pngs = readdirSync(join(ROOT, 'assets')).filter(f => f.endsWith('.png')).map(f => `assets/${f}`);
  assert.deepEqual(pngs.sort(), [...new Set(refs)].sort());
});

test('ディレクトリー構造: 全ファイルが載っていて、全行に説明がある', () => {
  const tree = readme.split('## 📁 ディレクトリー構造')[1].split('```')[1];
  const lines = tree.split('\n').filter(l => l.trim() && !l.startsWith('browser-permission-radar/'));
  for (const l of lines) assert.match(l, /# \S/, `説明がない: ${l}`);
  const names = new Set(lines.map(l => l.replace(/^[│├└─\s]+/, '').split(/\s+#/)[0].trim().replace(/\/$/, '')));
  const skip = new Set(['.git', 'node_modules', '.claude']);
  const walk = dir => readdirSync(dir).flatMap(f => {
    if (skip.has(f)) return [];
    const p = join(dir, f);
    return statSync(p).isDirectory() ? [f, ...walk(p)] : [f];
  });
  const missing = walk(ROOT).filter(f => !names.has(f) && !f.endsWith('.tmp.mjs'));
  assert.deepEqual(missing, []);
  assert.ok(relative(ROOT, ROOT) === '');
});

test('表記: 禁止語と、日本語と英数字の間の空白', () => {
  const prose = proseLines().join('\n').replace(/`[^`]*`/g, '');
  const banned = ['既に', '全て', '分かる', '分から', '無い', 'インターフェース', 'もっとも'];
  for (const w of banned) assert.ok(!prose.includes(w), w);
  for (const re of [/ブラウザ(?!ー)/, /サーバ(?!ー)/, /ユーザ(?!ー)/, /リポジトリ(?!ー)/, /ディレクトリ(?!ー)/, /パラメータ(?!ー)/,
    /フォルダ(?!ー)/, /ライブラリ(?!ー)/]) {
    assert.ok(!re.test(prose), String(re));
  }
  const JA = '[\\u3040-\\u30ff\\u3400-\\u9fff]';
  const bad = proseLines().filter(l => !l.startsWith('MIT License')).filter(l => {
    const t = l.replace(/`[^`]*`/g, 'X').replace(/\]\([^)]*\)/g, ']');
    return new RegExp(`${JA} [A-Za-z0-9]|[A-Za-z0-9] ${JA}`).test(t);
  });
  assert.deepEqual(bad, []);
});

test('強調（**）は H2 の節ごとに2か所まで、箇条書きの項目名は太字にしない', () => {
  for (const s of sections()) {
    const n = [...s.body.join('\n').matchAll(/\*\*[^*]+\*\*/g)].length;
    assert.ok(n <= 2, `${s.title}: ${n}か所`);
  }
  assert.ok(!/^\s*- \*\*/m.test(readme));
});
