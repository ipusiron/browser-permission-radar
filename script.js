/**
 * Browser Permission Radar — Day092
 *
 * ブラウザーの権限をカテゴリ別のレーダーで可視化する教育ツール（画面の処理）
 * - 照会と分類は js/scanner.js・js/perm-core.js（DOM に依存しない）
 * - 文言は js/messages.js（t() で引く）
 * - 安全な権限テスト（カメラ・マイクはすぐ止める、座標・クリップボードの内容は表示しない）
 *
 * @author ipusiron
 * @license MIT
 */
import { GROUPS, GROUP_ORDER, summarize, formatScore } from './js/perm-core.js';
import { scanAll, diffResults } from './js/scanner.js';
import { renderRadar } from './js/radar-svg.js';
import {
  POLICY_FEATURES, LANG_MESSAGE_TYPE, buildAllow, parseProbeMessage, compareResults, summarizeComparison,
} from './js/policy-core.js';
import {
  BASELINES, MAX_IMPORT_BYTES, signature, exposure, guessBaseline, buildExport, cleanLabel, fileStamp, parseImport,
  compareColumns, changedFromBaseline,
} from './js/compare-core.js';
import { t, setLang, getLang, applyI18n, pickInitialLang, readStoredLang, storeLang } from './js/i18n.js';

(() => {
  'use strict';

  // ========================================
  // 埋め込み（iframe）の中で開かれたとき
  // ========================================
  // 親のページを移動させず（Chromium 系では SecurityError になり、以前はここで全体が止まっていた）、
  // 埋め込み元の Permissions Policy に従うことを案内する
  let framed = false;
  try { framed = window.top !== window.self; } catch { framed = true; }
  if (framed) document.getElementById('frameNotice').hidden = false;

  // ========================================
  // 言語（?lang= → 保存した選択 → ブラウザーの言語）
  // ========================================
  setLang(pickInitialLang({
    search: window.location.search, stored: readStoredLang(), languages: navigator.languages || [navigator.language],
  }));
  applyI18n();

  // ========================================
  // Tab Management
  // ========================================
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');

  /**
   * タブを切り替える（aria-selected・tabindex・パネルの hidden をそろえる）
   * @param {string} id - タブのID ('radar', 'details', 'learn')
   * @param {boolean} [focus] - 切り替えたタブにフォーカスを移すか
   */
  function selectTab(id, focus = false){
    tabs.forEach(b => {
      const on = b.dataset.tab === id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    panels.forEach(p => { p.hidden = p.id !== id; });
    hideTooltip();
  }

  tabs.forEach(btn => btn.addEventListener('click', () => selectTab(btn.dataset.tab)));

  // 矢印キー・Home・End でタブを移る（WAI-ARIA のタブのパターン）
  tabs.forEach((btn, i) => btn.addEventListener('keydown', ev => {
    const keys = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
    if (!(ev.key in keys)) return;
    ev.preventDefault();
    const next = tabs[(keys[ev.key] + tabs.length) % tabs.length];
    selectTab(next.dataset.tab, true);
  }));

  // ========================================
  // DOM Elements
  // ========================================

  // カテゴリ → 要素（id は radar{Group}・score-{group}・scoreLink-{group}・measured-{group}）
  const byGroup = prefix => Object.fromEntries(GROUP_ORDER.map(g => [g, document.getElementById(prefix(g))]));
  const cap = g => g[0].toUpperCase() + g.slice(1);

  // レーダーの SVG 要素
  const radarSvgs = byGroup(g => `radar${cap(g)}`);

  // スコア表示要素
  const scoreEls = byGroup(g => `score-${g}`);

  // スコアリンクボタン（クリックで詳細タブをそのカテゴリに絞る）
  const scoreLinks = byGroup(g => `scoreLink-${g}`);

  // スコアの計算に使えた件数（照会できない権限は数えない）
  const measuredEls = byGroup(g => `measured-${g}`);

  // 詳細テーブルとログ
  const permTableWrap = document.getElementById('permTableWrap');
  const logEl = document.getElementById('log');

  // 照会し直すボタン（権限テストのボタンは下の QUICK_TESTS で id から引く）
  const rescanBtn = document.getElementById('rescanBtn');

  // カテゴリフィルターチップ
  const chips = document.querySelectorAll('.chip[data-filter]');  // 絞り込みのボタンだけ（埋め込みタブの .chip は含めない）

  // ========================================
  // Tooltip System
  // ========================================
  // ツールチップ要素を動的に作成
  const tooltipEl = document.createElement('div');
  tooltipEl.className = 'tooltip-bubble';
  tooltipEl.id = 'tooltipBubble';
  tooltipEl.setAttribute('role', 'tooltip');
  document.body.appendChild(tooltipEl);

  let activeTooltipTarget = null;
  let tooltipPinned = false;  // 押して開いた（マウスが離れても閉じない）
  const TOOLTIP_PADDING = 12;

  /**
   * ツールチップの位置を計算して配置
   * 画面端で自動的に位置調整を行う
   * @param {HTMLElement} target - ツールチップのターゲット要素
   */
  function positionTooltip(target){
    if (!target || !activeTooltipTarget) return;
    const rect = target.getBoundingClientRect();
    const tipRect = tooltipEl.getBoundingClientRect();

    let left = rect.right + TOOLTIP_PADDING;
    if (left + tipRect.width + TOOLTIP_PADDING > window.innerWidth) {
      left = rect.left - tipRect.width - TOOLTIP_PADDING;
    }
    if (left < TOOLTIP_PADDING) {
      left = Math.max(TOOLTIP_PADDING, rect.left + (rect.width / 2) - (tipRect.width / 2));
    }

    let top = rect.top + (rect.height / 2) - (tipRect.height / 2);
    const maxTop = window.innerHeight - TOOLTIP_PADDING - tipRect.height;
    if (top < TOOLTIP_PADDING) top = TOOLTIP_PADDING;
    if (top > maxTop) top = maxTop;

    tooltipEl.style.left = `${Math.round(left)}px`;
    tooltipEl.style.top = `${Math.round(top)}px`;
  }

  function showTooltip(event){
    const target = event.currentTarget;
    const text = target.getAttribute('data-tooltip');
    if (!text) return;

    if (activeTooltipTarget === target && tooltipEl.classList.contains('visible')) return;
    if (activeTooltipTarget && activeTooltipTarget !== target) hideTooltip();
    activeTooltipTarget = target;
    target.setAttribute('aria-expanded', 'true');
    target.setAttribute('aria-describedby', tooltipEl.id);
    tooltipEl.textContent = text;
    tooltipEl.classList.add('visible');
    tooltipEl.style.visibility = 'hidden';
    tooltipEl.style.left = '0px';
    tooltipEl.style.top = '0px';

    requestAnimationFrame(() => {
      if (activeTooltipTarget !== target) return;
      // Force layout to get correct size before positioning
      tooltipEl.getBoundingClientRect();
      positionTooltip(target);
      tooltipEl.style.visibility = 'visible';
    });
  }

  function hideTooltip(){
    if (activeTooltipTarget) {
      activeTooltipTarget.setAttribute('aria-expanded', 'false');
      activeTooltipTarget.removeAttribute('aria-describedby');
    }
    activeTooltipTarget = null;
    tooltipPinned = false;
    tooltipEl.classList.remove('visible');
    tooltipEl.style.visibility = '';
  }

  function isTooltipOpenFor(el) {
    return activeTooltipTarget === el && tooltipEl.classList.contains('visible');
  }

  /** 「?」のボタン: マウスを乗せる・フォーカスする・押す（タッチ）で開き、もう一度押すか Esc で閉じる */
  function attachTooltipHandlers(root = document){
    root.querySelectorAll('.help-icon, .help-icon-small').forEach(icon => {
      if (icon.dataset.tooltipBound) return;
      icon.dataset.tooltipBound = '1';
      icon.setAttribute('aria-expanded', 'false');
      icon.addEventListener('mouseenter', showTooltip);
      icon.addEventListener('focus', showTooltip);
      icon.addEventListener('mouseleave', ev => {
        if (!tooltipPinned && document.activeElement !== ev.currentTarget) hideTooltip();
      });
      icon.addEventListener('blur', hideTooltip);
      // 押すと「固定」する。マウスを乗せる・フォーカスで開いた状態から押しても閉じない
      // （押す動作の途中で先に開くため、開いていたら閉じる、にすると1回目の押下で閉じてしまう）
      // 固定した状態でもう一度押すと閉じる
      icon.addEventListener('click', ev => {
        const el = ev.currentTarget;
        if (isTooltipOpenFor(el) && tooltipPinned) {
          hideTooltip();
          return;
        }
        if (!isTooltipOpenFor(el)) showTooltip(ev);
        tooltipPinned = true;
      });
    });
  }

  attachTooltipHandlers();

  window.addEventListener('scroll', () => {
    if (!activeTooltipTarget) return;
    tooltipEl.style.visibility = 'hidden';
    requestAnimationFrame(() => {
      if (!activeTooltipTarget) return;
      positionTooltip(activeTooltipTarget);
      tooltipEl.style.visibility = 'visible';
    });
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (!activeTooltipTarget) return;
    tooltipEl.style.visibility = 'hidden';
    requestAnimationFrame(() => {
      if (!activeTooltipTarget) return;
      positionTooltip(activeTooltipTarget);
      tooltipEl.style.visibility = 'visible';
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideTooltip();
    }
  });

  // ========================================
  // Details table (with filter)
  // ========================================
  // 表は DOM で組み立て、文字は textContent で入れる（innerHTML を使わない）

  let lastResults = [];  // 直近の照会結果（フィルター・ジャンプ・差分に使う）
  let currentFilter = 'all';

  /** 状態のバッジ */
  function badgeEl(state) {
    const span = document.createElement('span');
    span.className = `status-badge status-${state}`;
    span.textContent = `● ${state}`;
    span.title = t(`state.${state}`);
    return span;
  }

  /** 出所の説明（Permissions API／Notification.permission／照会できない理由） */
  function sourceText(r) {
    if (r.source === 'query') return t('source.query');
    if (r.source === 'notification') return t('source.notification');
    return r.state === 'unknown' ? t('source.unknown', { error: r.error || '-' }) : t('source.unsupported');
  }

  /** 権限の説明（ツールチップ用） */
  function permTooltip(key) {
    return t('perm.tooltip', { desc: t(`perm.${key}.desc`), risk: t(`perm.${key}.risk`) });
  }

  function renderTable(results){
    hideTooltip();
    const table = document.createElement('table');
    const thead = table.createTHead();
    const hr = thead.insertRow();
    for (const k of ['table.permission', 'table.state', 'table.source', 'table.group']) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = t(k);
      hr.appendChild(th);
    }
    const tbody = table.createTBody();
    const labels = ['table.permission', 'table.state', 'table.source', 'table.group'].map(k => t(k));
    for (const r of results) {
      const tr = tbody.insertRow();
      tr.id = `perm-row-${r.key}`;
      tr.dataset.group = r.group;

      const c1 = tr.insertCell();
      const name = document.createElement('span');  // 縦積みのとき、リンクと「?」を1つのまとまりにする
      name.className = 'perm-name';
      c1.appendChild(name);
      const a = document.createElement('a');
      a.href = `#perm-row-${r.key}`;
      a.dataset.rowlink = r.key;
      const code = document.createElement('code');
      code.textContent = r.key;
      a.appendChild(code);
      name.appendChild(a);
      const help = document.createElement('button');
      help.type = 'button';
      help.className = 'help-icon help-icon-small';
      help.setAttribute('aria-label', t('help.perm', { key: r.key }));
      help.dataset.tooltip = permTooltip(r.key);
      help.textContent = '?';
      name.appendChild(help);

      tr.insertCell().appendChild(badgeEl(r.state));

      const c3 = tr.insertCell();
      c3.className = 'muted';
      c3.textContent = sourceText(r);
      if (r.mismatch) {
        const note = document.createElement('div');
        note.className = 'mismatch-note';
        note.textContent = t('source.mismatch', { raw: r.notification });
        c3.appendChild(note);
      }

      const c4 = tr.insertCell();
      c4.className = 'muted';
      c4.textContent = r.group;
      // 狭い画面の縦積みで、各セルの左に列の見出しを出す
      [...tr.cells].forEach((cell, i) => { cell.dataset.label = labels[i]; });
    }
    permTableWrap.replaceChildren(table);

    attachTooltipHandlers(permTableWrap);

    // 権限名のリンク → 行を軽くハイライト
    permTableWrap.querySelectorAll('a[data-rowlink]').forEach(link => {
      link.addEventListener('click', () => {
        const tr = document.getElementById(`perm-row-${link.dataset.rowlink}`);
        if (tr){ tr.classList.remove('highlight'); void tr.offsetWidth; tr.classList.add('highlight'); }
      });
    });

    applyFilter(currentFilter);
  }

  function applyFilter(groupKey){
    currentFilter = groupKey;
    chips.forEach(ch => ch.classList.toggle('active', ch.dataset.filter===groupKey));
    permTableWrap.querySelectorAll('tbody tr').forEach(tr => {
      tr.hidden = !(groupKey === 'all' || tr.dataset.group === groupKey);
    });
  }

  chips.forEach(ch=>{
    ch.addEventListener('click', ()=>applyFilter(ch.dataset.filter));
  });

  // ========================================
  // Radar (SVG)
  // ========================================

  /** 詳細タブへ移り、その行へスクロールして軽くハイライトする */
  function jumpToRow(groupKey, key) {
    selectTab('details');
    requestAnimationFrame(() => {
      applyFilter(groupKey);
      const row = key ? document.getElementById(`perm-row-${key}`)
        : permTableWrap.querySelector(`tbody tr[data-group="${groupKey}"]`);
      if (row) {
        row.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
        row.classList.remove('highlight'); void row.offsetWidth; row.classList.add('highlight');
      }
    });
  }

  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * カテゴリごとのレーダーとスコアを描く
   * @param {string} groupKey - カテゴリキー ('device', 'data', 'comm')
   * @param {Array} results - 照会結果
   */
  function drawRadarGroup(groupKey, results){
    const list = GROUPS[groupKey];
    const byKey = new Map(results.map(r => [r.key, r]));
    const items = list.map(key => ({ key, state: (byKey.get(key) || {}).state || 'unsupported' }));

    // スコア（照会できない権限は平均から外す）
    const sum = summarize(results)[groupKey];
    scoreEls[groupKey].textContent = formatScore(sum.score);
    const measuredText = sum.measured ? t('score.measured', { total: sum.total, measured: sum.measured }) : t('score.none');
    if (measuredEls[groupKey]) measuredEls[groupKey].textContent = measuredText;

    // 読み上げ用の要約
    const statusEl = document.getElementById(`radar-status-${groupKey}`);
    if (statusEl) {
      const summary = items.map(r => `${r.key}: ${t(`state.${r.state}`)}`).join(', ');
      statusEl.textContent = t('radar.status', {
        group: t(`group.${groupKey}`), score: formatScore(sum.score), measured: measuredText, states: summary,
      });
    }

    renderRadar(radarSvgs[groupKey], {
      items,
      pointLabel: key => t('radar.point', { key, state: t(`state.${(byKey.get(key) || {}).state || 'unsupported'}`) }),
      onSelect: key => jumpToRow(groupKey, key),
    });
  }

  // スコアのボタン → 詳細タブをそのカテゴリに絞る
  Object.entries(scoreLinks).forEach(([groupKey, btn])=>{
    btn.addEventListener('click', () => jumpToRow(groupKey, null));
  });

  // ----- Logging -----
  const LOG_MAX = 30;
  let logEntries = [];  // {time, key, params}（新しい順）。言語を切り替えたら描き直す

  /** 文言のキーを、ログや状態の文の引数に入れる形にする（描くときに現在の言語で引く） */
  const K = (k, p = {}) => ({ k, p });
  const resolveParams = params => Object.fromEntries(Object.entries(params || {})
    .map(([name, v]) => [name, v && typeof v === 'object' && 'k' in v ? t(v.k, resolveParams(v.p)) : v]));
  const tr = (key, params) => t(key, resolveParams(params));

  function renderLog() {
    // textContent なので、どんな文字列でも HTML にならない
    logEl.textContent = logEntries.map(e => `[${e.time}] ${tr(e.key, e.params)}`).join('\n');
  }

  /** ログの先頭に1件足す */
  const log = (key, params = {}) => {
    const d = new Date();
    const time = [d.getHours(), d.getMinutes(), d.getSeconds()].map(v => String(v).padStart(2, '0')).join(':');
    logEntries = [{ time, key, params }, ...logEntries].slice(0, LOG_MAX);
    renderLog();
  };

  // ========================================
  // Safe Permission Tests
  // ========================================
  // - すべて利用者がボタンを押したときだけ動く
  // - カメラ・マイクはすぐに止める。位置情報の座標・クリップボードの内容は表示しない
  // - 実行中はボタンを無効にして、連打で二重に要求しない
  const errName = e => (e && (e.name || e.message)) || 'Error';
  const SYNC_TAG = 'bpr-test-sync';
  const SW_TIMEOUT_MS = 5000;

  /** Service Worker が有効になるのを待つ（ready は登録がないと永遠に待つので、時間を区切る） */
  function waitActive(registration) {
    if (registration.active) return Promise.resolve(registration);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), SW_TIMEOUT_MS);
      const worker = registration.installing || registration.waiting;
      if (!worker) { clearTimeout(timer); reject(Object.assign(new Error('no worker'), { name: 'InvalidStateError' })); return; }
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') { clearTimeout(timer); resolve(registration); }
        if (worker.state === 'redundant') {
          clearTimeout(timer);
          reject(Object.assign(new Error('redundant'), { name: 'InvalidStateError' }));
        }
      });
    });
  }

  async function mediaTest(constraints, nameKey) {
    const name = K(nameKey);
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return log('log.unsupported', { name });
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getTracks().forEach(tr => tr.stop());
      log('log.media.ok', { name });
    } catch (e) {
      log('log.media.err', { name, error: errName(e) });
    }
  }

  /** ボタンの id → 実行する処理 */
  const QUICK_TESTS = {
    askNotif: async () => {
      if (!('Notification' in window)) return log('log.unsupported', { name: K('test.notifications') });
      const res = await Notification.requestPermission();
      log('log.notif.result', { state: res });
    },
    getGeo: () => new Promise(resolve => {
      if (!('geolocation' in navigator)) { log('log.unsupported', { name: K('test.geolocation') }); resolve(); return; }
      navigator.geolocation.getCurrentPosition(
        () => { log('log.geo.ok'); resolve(); },
        err => { log('log.geo.err', { reason: K(`geo.code.${err.code}`) }); resolve(); },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 0 }
      );
    }),
    getCamera: () => mediaTest({ video: true }, 'test.camera'),
    getMic: () => mediaTest({ audio: true }, 'test.microphone'),
    readClip: async () => {
      if (!(navigator.clipboard && navigator.clipboard.readText)) return log('log.unsupported', { name: K('test.clipread') });
      await navigator.clipboard.readText();  // 中身は変数にも残さない
      log('log.clipread.ok');
    },
    writeClip: async () => {
      if (!(navigator.clipboard && navigator.clipboard.writeText)) return log('log.unsupported', { name: K('test.clipwrite') });
      await navigator.clipboard.writeText('test');
      log('log.clipwrite.ok');
    },
    getMIDI: async () => {
      if (!navigator.requestMIDIAccess) return log('log.unsupported', { name: K('test.midi') });
      const access = await navigator.requestMIDIAccess({ sysex: false });
      log('log.midi.ok', { inputs: access.inputs.size, outputs: access.outputs.size });
    },
    askPersist: async () => {
      if (!(navigator.storage && navigator.storage.persist)) return log('log.unsupported', { name: K('test.persist') });
      const granted = await navigator.storage.persist();
      log('log.persist.ok', { result: K(`bool.${granted}`) });
    },
    askIdle: async () => {
      if (!('IdleDetector' in window)) return log('log.unsupported', { name: K('test.idle') });
      const state = await window.IdleDetector.requestPermission();
      log('log.idle.ok', { state });
    },
    askWakeLock: async () => {
      if (!(navigator.wakeLock && navigator.wakeLock.request)) return log('log.unsupported', { name: K('test.wakelock') });
      const sentinel = await navigator.wakeLock.request('screen');
      await sentinel.release();
      log('log.wakelock.ok');
    },
    askFonts: async () => {
      if (typeof window.queryLocalFonts !== 'function') return log('log.unsupported', { name: K('test.fonts') });
      const fonts = await window.queryLocalFonts();
      log('log.fonts.ok', { n: fonts.length });  // 名前は表示しない
    },
    askScreens: async () => {
      if (typeof window.getScreenDetails !== 'function') return log('log.unsupported', { name: K('test.screens') });
      const details = await window.getScreenDetails();
      log('log.screens.ok', { n: details.screens.length });  // 解像度・配置は表示しない
    },
    testBgSync: async () => {
      if (!('serviceWorker' in navigator)) return log('log.unsupported', { name: K('test.sync') });
      if (!('SyncManager' in window)) return log('log.sync.nosync');
      log('log.sync.registering');
      try {
        const registration = await waitActive(await navigator.serviceWorker.register('sw.js'));
        await registration.sync.register(SYNC_TAG);
        const tags = await registration.sync.getTags();
        log('log.sync.ok', { tag: SYNC_TAG, count: tags.length });
      } catch (e) {
        if (e && e.name === 'TimeoutError') log('log.sync.timeout', { sec: SW_TIMEOUT_MS / 1000 });
        else log('log.sync.err', { error: errName(e) });
      }
    },
    cleanupSW: async () => {
      if (!('serviceWorker' in navigator)) return log('log.cleanup.none');
      const regs = await navigator.serviceWorker.getRegistrations();
      let n = 0;
      for (const r of regs) { if (await r.unregister()) n += 1; }
      log(n ? 'log.cleanup.ok' : 'log.cleanup.none', { n });
    },
  };

  /** テストのボタンの表示名（ログ用） */
  const TEST_NAMES = {
    askNotif: 'test.notifications', getGeo: 'test.geolocation', getCamera: 'test.camera', getMic: 'test.microphone',
    readClip: 'test.clipread', writeClip: 'test.clipwrite', getMIDI: 'test.midi', askPersist: 'test.persist',
    askIdle: 'test.idle', askWakeLock: 'test.wakelock', askFonts: 'test.fonts', askScreens: 'test.screens',
    testBgSync: 'test.sync', cleanupSW: 'test.cleanup',
  };

  for (const [id, run] of Object.entries(QUICK_TESTS)) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      try {
        await run();
      } catch (e) {
        log('log.error', { name: K(TEST_NAMES[id]), error: errName(e) });
      } finally {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        await rescan({ quiet: true });
      }
    });
  }

  rescanBtn.addEventListener('click', () => rescan());

  // ========================================
  // Rescan / live updates
  // ========================================
  // 照会した PermissionStatus の change を聞き、ブラウザー側で設定が変わったら照会し直す
  // （Safari は change が発火しないので、そのときはテストのあとの照会し直しと「Rescan All」で追う）
  let watched = [];
  let scanning = null;

  function unwatch() {
    for (const { status, handler } of watched) status.removeEventListener('change', handler);
    watched = [];
  }

  function watch(results) {
    unwatch();
    for (const r of results) {
      const status = r.status;
      if (!status || typeof status.addEventListener !== 'function') continue;
      const handler = () => rescan({ quiet: true, fromChange: true });
      status.addEventListener('change', handler);
      watched.push({ status, handler });
    }
  }

  async function doScan({ quiet = false, fromChange = false } = {}) {
    const results = await scanAll({ navigator, window });
    const changes = lastResults.length ? diffResults(lastResults, results) : [];
    for (const c of changes) log(fromChange ? 'log.change' : 'log.diff', c);
    if (!quiet) log('log.rescan', { n: results.length });
    lastResults = results.slice();
    for (const g of GROUP_ORDER) drawRadarGroup(g, results);
    renderTable(results);
    updateCompare();
    if (policyLast) showPolicyResult();
    watch(results);
    return results;
  }

  /** 照会し直す（同時に走らせない。走っている間に呼ばれたら、終わったあとにもう一度だけ走らせる） */
  async function rescan(opts = {}) {
    if (scanning) {
      scanning.again = opts;
      return scanning.promise;
    }
    const run = { again: null, promise: null };
    scanning = run;
    run.promise = (async () => {
      let res = await doScan(opts);
      while (run.again) {
        const next = run.again;
        run.again = null;
        res = await doScan(next);
      }
      scanning = null;
      return res;
    })();
    return run.promise;
  }


  // ========================================
  // 尋ねずに読める情報と比較（比較タブ）
  // ========================================
  const exposureText = document.getElementById('exposureText');
  const sigHashEl = document.getElementById('sigHash');
  const sigTextEl = document.getElementById('sigText');
  const baselineSelect = document.getElementById('baselineSelect');
  const baselineChanges = document.getElementById('baselineChanges');
  const exportLabel = document.getElementById('exportLabel');
  const importFile = document.getElementById('importFile');
  const importStatus = document.getElementById('importStatus');
  const compareTableWrap = document.getElementById('compareTableWrap');
  const MAX_IMPORTS = 4;
  let imported = [];  // {label, states}
  let importMessages = [];  // {k, p}（言語を切り替えたら描き直す）

  function setImportStatus(list) {
    importMessages = list;
    importStatus.textContent = importMessages.map(m => tr(m.k, m.p)).join(t('msg.sep'));
  }

  async function sha256Hex(text) {
    if (!(window.crypto && window.crypto.subtle)) return null;
    const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function renderCompareTable() {
    const base = baselineSelect.value ? BASELINES[baselineSelect.value] : null;
    const others = [...(base ? [{ label: t(`baseline.${baselineSelect.value}`), states: base.states }] : []), ...imported];
    const rows = compareColumns(lastResults, others);
    const table = document.createElement('table');
    const hr = table.createTHead().insertRow();
    const heads = [t('table.permission'), t('compare.now'), ...others.map(o => o.label)];
    for (const h of heads) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = h;
      hr.appendChild(th);
    }
    const tbody = table.createTBody();
    for (const r of rows) {
      const tr = tbody.insertRow();
      if (r.differs) tr.className = 'changed';
      const code = document.createElement('code');
      code.textContent = r.key;
      tr.insertCell().appendChild(code);
      tr.insertCell().appendChild(badgeEl(r.current));
      for (const v of r.others) {
        const cell = tr.insertCell();
        if (v === '—') cell.textContent = v;
        else cell.appendChild(badgeEl(v));
      }
      [...tr.cells].forEach((cell, i) => { cell.dataset.label = heads[i]; });
    }
    compareTableWrap.replaceChildren(table);
  }

  async function updateCompare() {
    const e = exposure(lastResults);
    exposureText.textContent = t('compare.exposure', e);
    const sig = signature(lastResults);
    sigTextEl.textContent = sig.split(';').join('\n');
    const hex = await sha256Hex(sig);
    sigHashEl.textContent = hex ? hex.slice(0, 16) : t('compare.hashUnavailable');

    const base = baselineSelect.value ? BASELINES[baselineSelect.value] : null;
    if (!base) {
      baselineChanges.textContent = t('compare.noBaseline');
    } else {
      const ch = changedFromBaseline(lastResults, base.states);
      baselineChanges.textContent = ch.length
        ? t('compare.changes', { list: ch.map(c => t('compare.change', c)).join(t('list.sep')) })
        : t('compare.noChanges');
    }
    renderCompareTable();
  }

  baselineSelect.value = guessBaseline(navigator.userAgent) || '';
  baselineSelect.addEventListener('change', () => updateCompare());

  document.getElementById('exportBtn').addEventListener('click', () => {
    const now = new Date();
    const data = buildExport({ results: lastResults, label: exportLabel.value, takenAt: now.toISOString() });
    const file = `browser-permission-radar-${fileStamp(now)}.json`;
    // application/json にする（text/plain だと Chromium 系が .txt を足すことがある）
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = file;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setImportStatus([K('compare.exported', { file })]);
  });

  importFile.addEventListener('change', async () => {
    const files = [...importFile.files];
    const messages = [];  // {k, p}
    let added = 0;
    for (const f of files) {
      const name = cleanLabel(f.name);
      if (imported.length >= MAX_IMPORTS) { messages.push(K('compare.limit')); break; }
      if (f.size > MAX_IMPORT_BYTES) { messages.push(K('compare.error', { name, reason: K('compare.error.size') })); continue; }
      const res = parseImport(await f.text());
      if (!res.ok) { messages.push(K('compare.error', { name, reason: K(`compare.error.${res.error}`) })); continue; }
      imported.push({ label: res.data.label || name, states: res.data.states });
      added += 1;
    }
    importFile.value = '';
    setImportStatus([K('compare.loaded', { n: added }), ...messages]);
    updateCompare();
  });

  document.getElementById('importClear').addEventListener('click', () => {
    imported = [];
    setImportStatus([K('compare.cleared')]);
    updateCompare();
  });

  // ========================================
  // Permissions Policy の実験（埋め込みタブ）
  // ========================================
  // 照会用のページ（probe.html）を同じオリジンの iframe に入れ、allow 属性で機能を止めて照会させる。
  // 届いた結果は、送り元（この iframe）・オリジン・形を確かめてから表にする
  const policyChecks = document.getElementById('policyChecks');
  const policyAllowEl = document.getElementById('policyAllow');
  const policyFrameWrap = document.getElementById('policyFrameWrap');
  const policySummary = document.getElementById('policySummary');
  const policyTableWrap = document.getElementById('policyTableWrap');
  const POLICY_TIMEOUT_MS = 8000;
  let policyFrame = null;
  let policyTimer = null;
  let policyLast = null;  // 直近の結果（言語の切り替えで描き直す）
  let policyMsg = null;  // 実行中・時間切れの文 {k, p}

  for (const [key, feature] of Object.entries(POLICY_FEATURES)) {
    const label = document.createElement('label');
    label.className = 'policy-check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = key;
    box.checked = true;
    const text = document.createElement('span');
    text.dataset.key = key;
    text.dataset.feature = feature;
    label.append(box, text);
    policyChecks.appendChild(label);
  }

  /** チェックボックスの名前（権限名と Policy の機能名が違うときは、かっこで添える。かっこは言語ごと） */
  function renderPolicyLabels() {
    policyChecks.querySelectorAll('span[data-key]').forEach(sp => {
      const { key, feature } = sp.dataset;
      sp.textContent = key === feature ? key : t('policy.featureLabel', { key, feature });
    });
  }
  renderPolicyLabels();

  function allowedKeys() {
    return [...policyChecks.querySelectorAll('input[type=checkbox]')].filter(b => b.checked).map(b => b.value);
  }

  function updateAllowText() {
    policyAllowEl.textContent = buildAllow(allowedKeys());
  }

  policyChecks.addEventListener('change', updateAllowText);
  document.getElementById('policyAll').addEventListener('click', () => {
    policyChecks.querySelectorAll('input').forEach(b => { b.checked = true; });
    updateAllowText();
  });
  document.getElementById('policyNone').addEventListener('click', () => {
    policyChecks.querySelectorAll('input').forEach(b => { b.checked = false; });
    updateAllowText();
  });
  updateAllowText();

  function renderPolicyTable(rows) {
    const table = document.createElement('table');
    const hr = table.createTHead().insertRow();
    const heads = ['table.permission', 'table.allow', 'table.top', 'table.frame'].map(k => t(k));
    for (const h of heads) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = h;
      hr.appendChild(th);
    }
    const tbody = table.createTBody();
    for (const r of rows) {
      const tr = tbody.insertRow();
      if (r.changed) tr.className = 'changed';
      const c1 = tr.insertCell();
      const code = document.createElement('code');
      code.textContent = r.key;
      c1.appendChild(code);
      const c2 = tr.insertCell();
      c2.className = 'muted';
      c2.textContent = r.allowed === null ? t('policy.notPolicy') : r.allowed ? t('policy.allowed') : t('policy.blocked');
      tr.insertCell().appendChild(badgeEl(r.top));
      tr.insertCell().appendChild(badgeEl(r.frame));
      [...tr.cells].forEach((cell, i) => { cell.dataset.label = heads[i]; });
    }
    policyTableWrap.replaceChildren(table);
  }

  function showPolicyResult() {
    if (!policyLast) return;
    const rows = compareResults(lastResults, policyLast.framed, policyLast.allowed);
    const sum = summarizeComparison(rows);
    policySummary.textContent = sum.blocked
      ? t('policy.summary', { changed: sum.changed, blocked: sum.blocked, measured: sum.blockedMeasured, denied: sum.blockedDenied })
      : t('policy.summaryNoBlock', { changed: sum.changed });
    renderPolicyTable(rows);
  }

  window.addEventListener('message', ev => {
    if (!policyFrame || ev.source !== policyFrame.contentWindow || ev.origin !== window.location.origin) return;
    const framed = parseProbeMessage(ev.data);
    if (!framed) return;
    clearTimeout(policyTimer);
    policyLast = { framed, allowed: allowedKeys() };
    policyMsg = null;
    showPolicyResult();
  });

  document.getElementById('policyRun').addEventListener('click', () => {
    clearTimeout(policyTimer);
    policyLast = null;
    policyTableWrap.replaceChildren();
    policyMsg = K('policy.running');
    policySummary.textContent = tr(policyMsg.k, policyMsg.p);
    if (policyFrame) policyFrame.remove();
    policyFrame = document.createElement('iframe');
    policyFrame.className = 'probe-frame';
    policyFrame.title = t('policy.frameTitle');
    policyFrame.setAttribute('allow', buildAllow(allowedKeys()));
    policyFrame.src = `probe.html?lang=${getLang()}`;
    policyFrameWrap.replaceChildren(policyFrame);
    policyTimer = setTimeout(() => {
      policyMsg = K('policy.timeout', { sec: POLICY_TIMEOUT_MS / 1000 });
      policySummary.textContent = tr(policyMsg.k, policyMsg.p);
    }, POLICY_TIMEOUT_MS);
  });

  // ========================================
  // 言語の切り替え（描き直すだけで、照会し直さない）
  // ========================================
  function rerenderForLang() {
    renderTable(lastResults);
    for (const g of GROUP_ORDER) drawRadarGroup(g, lastResults);
    renderLog();
    updateCompare();
    setImportStatus(importMessages);
    if (policyLast) showPolicyResult();
    else if (policyMsg) policySummary.textContent = tr(policyMsg.k, policyMsg.p);
    if (policyFrame) {
      policyFrame.title = t('policy.frameTitle');
      policyFrame.contentWindow.postMessage({ type: LANG_MESSAGE_TYPE, lang: getLang() }, window.location.origin);
    }
    renderPolicyLabels();
  }

  document.getElementById('langToggle').addEventListener('click', () => {
    const next = getLang() === 'ja' ? 'en' : 'ja';
    setLang(next);
    storeLang(next);
    const url = new URL(window.location.href);
    if (url.searchParams.has('lang')) {
      url.searchParams.set('lang', next);
      history.replaceState(null, '', url);
    }
    applyI18n();
    rerenderForLang();
  });

  // ========================================
  // Accordion Functionality (Learn Tab)
  // ========================================
  /**
   * 座学タブのアコーディオン機能
   * 各見出しをクリックで展開・折りたたみ
   */
  const accordionHeaders = document.querySelectorAll('.accordion-header');
  accordionHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const targetId = header.getAttribute('data-accordion');
      const content = document.querySelector(`[data-accordion-content="${targetId}"]`);

      // 開閉をトグルし、aria-expanded をそろえる（閉じた中身は CSS の visibility で読み上げ・Tab 移動から外す）
      const open = !header.classList.contains('active');
      header.classList.toggle('active', open);
      content.classList.toggle('active', open);
      header.setAttribute('aria-expanded', String(open));
    });
  });

  // ========================================
  // Initialization
  // ========================================
  // 初期スキャンを実行（開いた直後はログに「照会し直しました」を出さない）
  rescan({ quiet: true });
})();
