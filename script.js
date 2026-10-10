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
import { GROUPS, summarize, formatScore, stateToScore } from './js/perm-core.js';
import { scanAll, diffResults } from './js/scanner.js';
import { t } from './js/i18n.js';

(() => {
  'use strict';

  // ========================================
  // Security: Frame-busting
  // ========================================
  // クリックジャッキング対策（meta X-Frame-Optionsはmetaタグで機能しないため）
  if (window.top !== window.self) {
    window.top.location = window.self.location;
  }

  // ========================================
  // Tab Management
  // ========================================
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');

  /**
   * タブを切り替える
   * @param {string} id - タブのID ('radar', 'details', 'learn')
   */
  function selectTab(id){
    tabs.forEach(b => b.classList.toggle('active', b.dataset.tab===id));
    panels.forEach(p => p.classList.toggle('visible', p.id===id));
  }

  tabs.forEach(btn => btn.addEventListener('click', () => selectTab(btn.dataset.tab)));

  // ========================================
  // DOM Elements
  // ========================================

  // レーダーチャート用キャンバス要素
  const canvases = {
    device: /** @type {HTMLCanvasElement} */ (document.getElementById('radarDevice')),
    data:   /** @type {HTMLCanvasElement} */ (document.getElementById('radarData')),
    comm:   /** @type {HTMLCanvasElement} */ (document.getElementById('radarComm')),
  };

  // 2Dコンテキスト
  const ctxs = {
    device: canvases.device.getContext('2d'),
    data: canvases.data.getContext('2d'),
    comm: canvases.comm.getContext('2d'),
  };

  // スコア表示要素
  const scoreEls = {
    device: document.getElementById('score-device'),
    data:   document.getElementById('score-data'),
    comm:   document.getElementById('score-comm'),
  };

  // スコアリンクボタン（クリックでDetailsタブへフィルタリング）
  const scoreLinks = {
    device: document.getElementById('scoreLink-device'),
    data:   document.getElementById('scoreLink-data'),
    comm:   document.getElementById('scoreLink-comm'),
  };

  // スコアの計算に使えた件数（照会できない権限は数えない）
  const measuredEls = {
    device: document.getElementById('measured-device'),
    data:   document.getElementById('measured-data'),
    comm:   document.getElementById('measured-comm'),
  };

  // 詳細テーブルとログ
  const permTableWrap = document.getElementById('permTableWrap');
  const logEl = document.getElementById('log');

  // 照会し直すボタン（権限テストのボタンは下の QUICK_TESTS で id から引く）
  const rescanBtn = document.getElementById('rescanBtn');

  // カテゴリフィルターチップ
  const chips = document.querySelectorAll('.chip');

  // ========================================
  // Tooltip System
  // ========================================
  // ツールチップ要素を動的に作成
  const tooltipEl = document.createElement('div');
  tooltipEl.className = 'tooltip-bubble';
  document.body.appendChild(tooltipEl);

  let activeTooltipTarget = null;
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

    activeTooltipTarget = target;
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
    activeTooltipTarget = null;
    tooltipEl.classList.remove('visible');
    tooltipEl.style.visibility = '';
  }

  function attachTooltipHandlers(root = document){
    root.querySelectorAll('.help-icon, .help-icon-small').forEach(icon => {
      if (icon.dataset.tooltipBound) return;
      icon.dataset.tooltipBound = '1';
      icon.addEventListener('mouseenter', showTooltip);
      icon.addEventListener('focus', showTooltip);
      icon.addEventListener('mouseleave', hideTooltip);
      icon.addEventListener('blur', hideTooltip);
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
    for (const r of results) {
      const tr = tbody.insertRow();
      tr.id = `perm-row-${r.key}`;
      tr.dataset.group = r.group;

      const c1 = tr.insertCell();
      const a = document.createElement('a');
      a.href = `#perm-row-${r.key}`;
      a.dataset.rowlink = r.key;
      const code = document.createElement('code');
      code.textContent = r.key;
      a.appendChild(code);
      c1.appendChild(a);
      const help = document.createElement('span');
      help.className = 'help-icon help-icon-small';
      help.dataset.tooltip = permTooltip(r.key);
      help.textContent = '?';
      c1.appendChild(help);

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
  // Radar Chart Rendering with Clickable Points
  // ========================================

  /**
   * クリック可能な点の座標を保存
   * @type {Object.<string, Array<{x: number, y: number, key: string, r: number}>>}
   */
  const clickMaps = { device:[], data:[], comm:[] };

  /**
   * カテゴリごとのレーダーチャートを描画
   * @param {string} groupKey - カテゴリキー ('device', 'data', 'comm')
   * @param {Array} results - 権限スキャン結果
   * @param {HTMLCanvasElement} canvas - キャンバス要素
   * @param {CanvasRenderingContext2D} ctx - 2Dコンテキスト
   */
  function drawRadarGroup(groupKey, results, canvas, ctx){
    const list = GROUPS[groupKey];
    const subset = results.filter(r => list.includes(r.key));
    // スコア（照会できない権限は平均から外す）
    const sum = summarize(results)[groupKey];
    scoreEls[groupKey].textContent = formatScore(sum.score);
    const measuredText = sum.measured ? t('score.measured', { total: sum.total, measured: sum.measured }) : t('score.none');
    if (measuredEls[groupKey]) measuredEls[groupKey].textContent = measuredText;

    // 読み上げ用の要約
    const statusEl = document.getElementById(`radar-status-${groupKey}`);
    if (statusEl) {
      const summary = subset.map(r => `${r.key}: ${t(`state.${r.state}`)}`).join(', ');
      statusEl.textContent = t('radar.status', {
        group: t(`group.${groupKey}`), score: formatScore(sum.score), measured: measuredText, states: summary,
      });
    }

    // draw
    const W = canvas.width, H = canvas.height;
    const cx = W/2, cy = H/2;
    const R = Math.min(W,H)*0.38;
    const N = subset.length || 1;

    ctx.clearRect(0,0,W,H);
    // Draw grid circles with cyberpunk style
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--accent') || '#00f0ff';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    [0.25,0.5,0.75,1.0].forEach(mult=>{
      ctx.beginPath(); ctx.arc(cx,cy,R*mult,0,Math.PI*2); ctx.stroke();
    });
    ctx.globalAlpha = 1;

    // axes
    ctx.globalAlpha = 0.4;
    for(let i=0;i<N;i++){
      const a = (-Math.PI/2) + (i*(2*Math.PI/N));
      const x = cx + Math.cos(a)*R;
      const y = cy + Math.sin(a)*R;
      ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--accent') || '#00f0ff';
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(x,y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // polygon (draw before labels so labels appear on top)
    const pts = subset.map((r,i)=>{
      const a = (-Math.PI/2) + (i*(2*Math.PI/N));
      const rad = R*(stateToScore(r.state) ?? 0);
      return { x: cx+Math.cos(a)*rad, y: cy+Math.sin(a)*rad, key:r.key, state:r.state };
    });

    if (pts.length){
      ctx.beginPath();
      pts.forEach((p,i)=>{ if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); });
      ctx.closePath();
      // Cyberpunk gradient fill
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      gradient.addColorStop(0, 'rgba(0,240,255,0.3)');
      gradient.addColorStop(1, 'rgba(255,0,255,0.1)');
      ctx.fillStyle = gradient;
      ctx.fill();
      // Neon stroke
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(0,240,255,0.8)';
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Draw labels using floating callouts to avoid clipping (drawn after polygon but before points)
    const axisColor = getComputedStyle(document.body).getPropertyValue('--accent') || '#00f0ff';
    const labelBg = 'rgba(6, 14, 28, 0.98)';  // Increased opacity from 0.92 to 0.98
    const labelBorder = 'rgba(0, 240, 255, 0.6)';  // Increased opacity from 0.45 to 0.6
    const labelTextColor = '#00f0ff';
    const labelShadowColor = 'rgba(0, 0, 0, 0.9)';  // Increased opacity from 0.7 to 0.9
    const labelMargin = 12;
    const padX = 10;
    const padY = 6;
    const lineHeight = 16;
    ctx.font = '600 13px "Segoe UI", "Hiragino Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    for(let i=0;i<N;i++){
      const a = (-Math.PI/2) + (i*(2*Math.PI/N));
      const key = subset[i]?.key;
      if (!key) continue;

      const segments = key.split('-').map(part => part.trim()).filter(Boolean);
      const lines = (segments.length ? segments : [key]).map(text => text.toUpperCase());
      const widths = lines.map(line => ctx.measureText(line).width);
      const textWidth = widths.length ? Math.max(...widths) : 0;
      const textHeight = lineHeight * (lines.length || 1);
      const boxWidth = textWidth + padX * 2;
      const boxHeight = textHeight + padY * 2;

      const axisEndX = cx + Math.cos(a) * R;
      const axisEndY = cy + Math.sin(a) * R;

      let boxX = cx + Math.cos(a) * (R + 28) - boxWidth / 2;
      let boxY = cy + Math.sin(a) * (R + 28) - boxHeight / 2;
      boxX += Math.cos(a) * 10;
      boxY += Math.sin(a) * 10;

      if (boxX < labelMargin) boxX = labelMargin;
      if (boxX + boxWidth > W - labelMargin) boxX = W - labelMargin - boxWidth;
      if (boxY < labelMargin) boxY = labelMargin;
      if (boxY + boxHeight > H - labelMargin) boxY = H - labelMargin - boxHeight;

      const centerX = boxX + boxWidth / 2;
      const centerY = boxY + boxHeight / 2;

      ctx.strokeStyle = axisColor;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(axisEndX, axisEndY);
      ctx.lineTo(centerX, centerY);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.fillStyle = labelBg;
      ctx.strokeStyle = labelBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 6);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
      }

      lines.forEach((line, idx) => {
        const textX = boxX + padX;
        const textY = boxY + padY + idx * lineHeight;
        ctx.fillStyle = labelShadowColor;
        ctx.fillText(line, textX + 1, textY + 1);
        ctx.fillStyle = labelTextColor;
        ctx.fillText(line, textX, textY);
      });
    }

    // points with glow effect (drawn last so they appear on top)
    clickMaps[groupKey] = [];
    pts.forEach(p=>{
      const color =
        p.state==='granted'?getCSS('--granted'):
        p.state==='denied'?getCSS('--denied'):
        p.state==='prompt'?getCSS('--prompt'):
        p.state==='unknown'?getCSS('--unknown'):getCSS('--unsupported');

      // Draw glow
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
      ctx.beginPath(); ctx.arc(p.x,p.y,6,0,Math.PI*2);
      ctx.fillStyle = color; ctx.fill();

      // Draw point
      ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(p.x,p.y,4,0,Math.PI*2);
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();

      clickMaps[groupKey].push({x:p.x,y:p.y,key:p.key,r:30});
    });
  }

  function getCSS(varName){ return getComputedStyle(document.documentElement).getPropertyValue(varName) || '#999'; }

  // click handler: find nearest point & jump to details
  function setupCanvasClick(groupKey, canvas){
    canvas.addEventListener('click', (ev)=>{
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const hits = clickMaps[groupKey] || [];
      let target = null, dmin = Infinity;
      hits.forEach(p=>{
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < p.r && d < dmin){ dmin = d; target = p; }
      });
      if (target){
        // jump to details and highlight the row
        selectTab('details');
        // auto filter to group
        requestAnimationFrame(() => {
          applyFilter(groupKey);
          const row = document.getElementById(`perm-row-${target.key}`);
          if (row){
            row.scrollIntoView({behavior:'smooth', block:'center'});
            row.classList.remove('highlight'); void row.offsetWidth; row.classList.add('highlight');
          }
        });
      }
    });
  }

  // score link -> details filter
  Object.entries(scoreLinks).forEach(([groupKey, btn])=>{
    btn.addEventListener('click', ()=>{
      selectTab('details');
      applyFilter(groupKey);
      // scroll to first row of the group if exists
      const first = permTableWrap.querySelector(`tbody tr[data-group="${groupKey}"]`);
      if (first){
        first.scrollIntoView({behavior:'smooth', block:'center'});
        first.classList.remove('highlight'); void first.offsetWidth; first.classList.add('highlight');
      }
    });
  });

  // ----- Logging -----
  const LOG_MAX = 30;
  /** ログの先頭に1行足す（textContent なので、どんな文字列でも HTML にならない） */
  const log = (msg) => {
    const time = new Date().toLocaleTimeString();
    const lines = (logEl.textContent || '').split('\n').filter(Boolean).slice(0, LOG_MAX - 1);
    logEl.textContent = [`[${time}] ${msg}`, ...lines].join('\n');
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
    const name = t(nameKey);
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return log(t('log.unsupported', { name }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getTracks().forEach(tr => tr.stop());
      log(t('log.media.ok', { name }));
    } catch (e) {
      log(t('log.media.err', { name, error: errName(e) }));
    }
  }

  /** ボタンの id → 実行する処理 */
  const QUICK_TESTS = {
    askNotif: async () => {
      if (!('Notification' in window)) return log(t('log.unsupported', { name: t('test.notifications') }));
      const res = await Notification.requestPermission();
      log(t('log.notif.result', { state: res }));
    },
    getGeo: () => new Promise(resolve => {
      if (!('geolocation' in navigator)) { log(t('log.unsupported', { name: t('test.geolocation') })); resolve(); return; }
      navigator.geolocation.getCurrentPosition(
        () => { log(t('log.geo.ok')); resolve(); },
        err => { log(t('log.geo.err', { reason: t(`geo.code.${err.code}`) })); resolve(); },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 0 }
      );
    }),
    getCamera: () => mediaTest({ video: true }, 'test.camera'),
    getMic: () => mediaTest({ audio: true }, 'test.microphone'),
    readClip: async () => {
      if (!(navigator.clipboard && navigator.clipboard.readText)) return log(t('log.unsupported', { name: t('test.clipread') }));
      await navigator.clipboard.readText();  // 中身は変数にも残さない
      log(t('log.clipread.ok'));
    },
    writeClip: async () => {
      if (!(navigator.clipboard && navigator.clipboard.writeText)) return log(t('log.unsupported', { name: t('test.clipwrite') }));
      await navigator.clipboard.writeText('test');
      log(t('log.clipwrite.ok'));
    },
    getMIDI: async () => {
      if (!navigator.requestMIDIAccess) return log(t('log.unsupported', { name: t('test.midi') }));
      const access = await navigator.requestMIDIAccess({ sysex: false });
      log(t('log.midi.ok', { inputs: access.inputs.size, outputs: access.outputs.size }));
    },
    askPersist: async () => {
      if (!(navigator.storage && navigator.storage.persist)) return log(t('log.unsupported', { name: t('test.persist') }));
      const granted = await navigator.storage.persist();
      log(t('log.persist.ok', { result: t(`bool.${granted}`) }));
    },
    askIdle: async () => {
      if (!('IdleDetector' in window)) return log(t('log.unsupported', { name: t('test.idle') }));
      const state = await window.IdleDetector.requestPermission();
      log(t('log.idle.ok', { state }));
    },
    testBgSync: async () => {
      if (!('serviceWorker' in navigator)) return log(t('log.unsupported', { name: t('test.sync') }));
      if (!('SyncManager' in window)) return log(t('log.sync.nosync'));
      log(t('log.sync.registering'));
      try {
        const registration = await waitActive(await navigator.serviceWorker.register('sw.js'));
        await registration.sync.register(SYNC_TAG);
        const tags = await registration.sync.getTags();
        log(t('log.sync.ok', { tag: SYNC_TAG, count: tags.length }));
      } catch (e) {
        if (e && e.name === 'TimeoutError') log(t('log.sync.timeout', { sec: SW_TIMEOUT_MS / 1000 }));
        else log(t('log.sync.err', { error: errName(e) }));
      }
    },
    cleanupSW: async () => {
      if (!('serviceWorker' in navigator)) return log(t('log.cleanup.none'));
      const regs = await navigator.serviceWorker.getRegistrations();
      let n = 0;
      for (const r of regs) { if (await r.unregister()) n += 1; }
      log(n ? t('log.cleanup.ok', { n }) : t('log.cleanup.none'));
    },
  };

  /** テストのボタンの表示名（ログ用） */
  const TEST_NAMES = {
    askNotif: 'test.notifications', getGeo: 'test.geolocation', getCamera: 'test.camera', getMic: 'test.microphone',
    readClip: 'test.clipread', writeClip: 'test.clipwrite', getMIDI: 'test.midi', askPersist: 'test.persist',
    askIdle: 'test.idle', testBgSync: 'test.sync', cleanupSW: 'test.cleanup',
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
        log(t('log.error', { name: t(TEST_NAMES[id]), error: errName(e) }));
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
    for (const c of changes) log(t(fromChange ? 'log.change' : 'log.diff', c));
    if (!quiet) log(t('log.rescan', { n: results.length }));
    lastResults = results.slice();
    drawRadarGroup('device', results, canvases.device, ctxs.device);
    drawRadarGroup('data',   results, canvases.data,   ctxs.data);
    drawRadarGroup('comm',   results, canvases.comm,   ctxs.comm);
    renderTable(results);
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

  // setup click detection per canvas
  setupCanvasClick('device', canvases.device);
  setupCanvasClick('data',   canvases.data);
  setupCanvasClick('comm',   canvases.comm);

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

      // アクティブ状態をトグル
      header.classList.toggle('active');
      content.classList.toggle('active');
    });
  });

  // ========================================
  // Initialization
  // ========================================
  // 初期スキャンを実行（開いた直後はログに「照会し直しました」を出さない）
  rescan({ quiet: true });
})();
