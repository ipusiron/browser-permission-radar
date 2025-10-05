// Browser Permission Radar — Day092 (multi radar + score link + point→details jump)

(() => {
  // ----- Tabs -----
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');
  function selectTab(id){
    tabs.forEach(b => b.classList.toggle('active', b.dataset.tab===id));
    panels.forEach(p => p.classList.toggle('visible', p.id===id));
  }
  tabs.forEach(btn => btn.addEventListener('click', () => selectTab(btn.dataset.tab)));

  // ----- Elements -----
  const canvases = {
    device: /** @type {HTMLCanvasElement} */ (document.getElementById('radarDevice')),
    data:   /** @type {HTMLCanvasElement} */ (document.getElementById('radarData')),
    comm:   /** @type {HTMLCanvasElement} */ (document.getElementById('radarComm')),
  };
  const ctxs = {
    device: canvases.device.getContext('2d'),
    data: canvases.data.getContext('2d'),
    comm: canvases.comm.getContext('2d'),
  };
  const scoreEls = {
    device: document.getElementById('score-device'),
    data:   document.getElementById('score-data'),
    comm:   document.getElementById('score-comm'),
  };
  const scoreLinks = {
    device: document.getElementById('scoreLink-device'),
    data:   document.getElementById('scoreLink-data'),
    comm:   document.getElementById('scoreLink-comm'),
  };

  const permTableWrap = document.getElementById('permTableWrap');
  const logEl = document.getElementById('log');

  // Buttons (tests)
  const rescanBtn = document.getElementById('rescanBtn');
  const askNotif = document.getElementById('askNotif');
  const getGeo = document.getElementById('getGeo');
  const getCamera = document.getElementById('getCamera');
  const getMic = document.getElementById('getMic');
  const readClip = document.getElementById('readClip');
  const writeClip = document.getElementById('writeClip');
  const getMIDI = document.getElementById('getMIDI');
  const askPersist = document.getElementById('askPersist');
  const testBgSync = document.getElementById('testBgSync');

  // Category filter chips
  const chips = document.querySelectorAll('.chip');

  // ----- Data model -----
  const GROUPS = {
    device: ['camera','microphone','geolocation','midi'],
    data: ['clipboard-read','clipboard-write','persistent-storage','background-sync'],
    comm: ['notifications','push','payment-handler','idle-detection'],
  };

  const PERMS = [
    { key: 'geolocation',        descriptor: { name: 'geolocation' }, desc: '現在地の緯度・経度を取得します。\n\nリスク: 行動追跡・居場所特定' },
    { key: 'notifications',      descriptor: { name: 'notifications' }, desc: 'プッシュ通知を表示します。\n\nリスク: スパム通知・\nフィッシングサイトへの誘導' },
    { key: 'push',               descriptor: { name: 'push', userVisibleOnly: true }, desc: 'サーバーからのプッシュメッセージを\n受信します。\n\nリスク: バックグラウンド通信・\nトラッキング' },
    { key: 'payment-handler',    descriptor: { name: 'payment-handler' }, desc: '支払い処理を実行します。\n\nリスク: 不正な決済処理・\n金銭的詐欺' },
    { key: 'idle-detection',     descriptor: { name: 'idle-detection' }, desc: 'ユーザーのアイドル状態を検知します。\n\nリスク: 行動監視・\nプライバシー侵害' },
    { key: 'camera',             descriptor: { name: 'camera' }, desc: 'カメラ映像にアクセスします。\n\nリスク: 盗撮・\n顔認証によるプライバシー侵害' },
    { key: 'microphone',         descriptor: { name: 'microphone' }, desc: 'マイク音声にアクセスします。\n\nリスク: 盗聴・\n会話の記録と分析' },
    { key: 'clipboard-read',     descriptor: { name: 'clipboard-read' }, desc: 'クリップボードの内容を読み取ります。\n\nリスク: パスワード窃取・\n機密情報漏洩' },
    { key: 'clipboard-write',    descriptor: { name: 'clipboard-write' }, desc: 'クリップボードに書き込みます。\n\nリスク: 意図しないデータの上書き・\n悪意あるコードの注入' },
    { key: 'midi',               descriptor: { name: 'midi' }, desc: 'MIDI機器にアクセスします。\n\nリスク: デバイス指紋生成・\n周辺機器の識別' },
    { key: 'persistent-storage', descriptor: { name: 'persistent-storage' }, desc: '永続的なストレージを確保します。\n\nリスク: 長期的なトラッキング・\nディスク容量の圧迫' },
    { key: 'background-sync',    descriptor: { name: 'background-sync' }, desc: 'バックグラウンドでデータ同期を\n行います。\n\nリスク: 通信量増加・バッテリー消費・\n意図しない情報送信' },
  ];

  function isPermissionsAPISupported() {
    return !!(navigator.permissions && navigator.permissions.query);
  }
  async function queryPermission(desc) {
    if (!isPermissionsAPISupported()) return { state: 'unsupported' };
    try {
      const status = await navigator.permissions.query(desc);
      return { state: status.state || 'prompt' };
    } catch(e) {
      return { state: 'unsupported' };
    }
  }
  async function featureFallback(key) {
    switch (key) {
      case 'notifications':
        if (!('Notification' in window)) return { state: 'unsupported' };
        // Notification.permission is more reliable than Permissions API for notifications
        return { state: Notification.permission };
      case 'geolocation':        return ('geolocation' in navigator) ? { state: 'prompt' } : { state: 'unsupported' };
      case 'camera':
      case 'microphone':         return (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) ? { state: 'prompt' } : { state: 'unsupported' };
      case 'clipboard-read':
      case 'clipboard-write':    return (navigator.clipboard) ? { state: 'prompt' } : { state: 'unsupported' };
      case 'midi':               return (navigator.requestMIDIAccess) ? { state: 'prompt' } : { state: 'unsupported' };
      case 'persistent-storage': return (navigator.storage && navigator.storage.persist) ? { state: 'prompt' } : { state: 'unsupported' };
      case 'background-sync':    return ('serviceWorker' in navigator) ? { state: 'prompt' } : { state: 'unsupported' };
      default: return { state: 'unsupported' };
    }
  }
  async function scanAllPermissions() {
    const results = [];
    for (const p of PERMS) {
      let res = await queryPermission(p.descriptor);

      // notifications は Notification.permission を優先（Permissions API との同期問題対策）
      if (p.key === 'notifications' && 'Notification' in window) {
        res = { state: Notification.permission };
      } else if (res.state === 'unsupported') {
        // Permissions APIが未対応の場合のみフォールバック
        res = await featureFallback(p.key);
      }

      results.push({ key: p.key, state: res.state });
    }
    return results;
  }

  // ----- Score / state helpers -----
  function stateToScore(state) {
    switch (state) {
      case 'granted': return 1.0;
      case 'prompt': return 0.5;
      case 'denied': return 0.1;
      case 'unsupported': default: return 0.0;
    }
  }
  function avg(nums){ return nums.length ? nums.reduce((a,b)=>a+b,0)/nums.length : 0; }
  function getCSS(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName) || '#999';
  }
  const badges = {
    granted: () => `<span class="status-badge status-granted">● granted</span>`,
    prompt: () => `<span class="status-badge status-prompt">● prompt</span>`,
    denied: () => `<span class="status-badge status-denied">● denied</span>`,
    unsupported: () => `<span class="status-badge status-unsupported">● unsupported</span>`,
  };

  // ----- Details table (with filter) -----
  let lastResults = [];  // cache for filter/jump
  let currentFilter = 'all';

  function renderTable(results){
    const rows = results.map(r => {
      const id = `perm-row-${r.key}`;
      const badge = r.state==='granted'?badges.granted():r.state==='denied'?badges.denied():r.state==='prompt'?badges.prompt():badges.unsupported();
      const group = Object.entries(GROUPS).find(([,list]) => list.includes(r.key))?.[0] || 'other';
      const permInfo = PERMS.find(p => p.key === r.key);
      const description = permInfo?.desc || '';
      return `<tr id="${id}" data-group="${group}">
        <td>
          <a href="#${id}" data-rowlink="${r.key}"><code>${r.key}</code></a>
          ${description ? `<span class="help-icon help-icon-small" data-tooltip="${description}">?</span>` : ''}
        </td>
        <td>${badge}</td>
        <td class="muted">${group}</td>
      </tr>`;
    }).join('');
    permTableWrap.innerHTML = `<table>
      <thead><tr><th>permission</th><th>status</th><th>group</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

    // row link click -> soft highlight
    permTableWrap.querySelectorAll('a[data-rowlink]').forEach(a=>{
      a.addEventListener('click', (e)=>{
        const key = a.getAttribute('data-rowlink');
        const tr = document.getElementById(`perm-row-${key}`);
        if (tr){ tr.classList.remove('highlight'); void tr.offsetWidth; tr.classList.add('highlight'); }
      });
    });

    applyFilter(currentFilter);
  }

  function applyFilter(groupKey){
    currentFilter = groupKey;
    chips.forEach(ch => ch.classList.toggle('active', ch.dataset.filter===groupKey));
    const rows = permTableWrap.querySelectorAll('tbody tr');
    rows.forEach(tr=>{
      const g = tr.getAttribute('data-group');
      tr.style.display = (groupKey==='all' || g===groupKey) ? '' : 'none';
    });
  }

  chips.forEach(ch=>{
    ch.addEventListener('click', ()=>applyFilter(ch.dataset.filter));
  });

  // ----- Radar rendering (per group) with clickable points -----
  /** store click maps: group -> [{x,y,key,r}] */
  const clickMaps = { device:[], data:[], comm:[] };

  function drawRadarGroup(groupKey, results, canvas, ctx){
    const list = GROUPS[groupKey];
    const subset = results.filter(r => list.includes(r.key));
    // score
    const s = avg(subset.map(r => stateToScore(r.state)));
    scoreEls[groupKey].textContent = s.toFixed(2);

    // Update accessibility status
    const statusEl = document.getElementById(`radar-status-${groupKey}`);
    if (statusEl) {
      const summary = subset.map(r => `${r.key}: ${r.state}`).join(', ');
      statusEl.textContent = `${groupKey}カテゴリのスコア: ${s.toFixed(2)}. 権限状態: ${summary}`;
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

    // axes + labels
    ctx.globalAlpha = 0.4;
    for(let i=0;i<N;i++){
      const a = (-Math.PI/2) + (i*(2*Math.PI/N));
      const x = cx + Math.cos(a)*R;
      const y = cy + Math.sin(a)*R;
      ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--accent') || '#00f0ff';
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(x,y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Draw labels with enhanced visibility
    ctx.font = 'bold 13px "Courier New", monospace';
    for(let i=0;i<N;i++){
      const a = (-Math.PI/2) + (i*(2*Math.PI/N));
      const label = subset[i]?.key ?? '';
      const lx = cx + Math.cos(a)*(R+30);
      const ly = cy + Math.sin(a)*(R+30);
      ctx.textAlign = Math.cos(a)>0.1?'left':(Math.cos(a)<-0.1?'right':'center');
      ctx.textBaseline = Math.sin(a)>0.1?'top':(Math.sin(a)<-0.1?'bottom':'middle');

      // Draw text shadow for contrast
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillText(label.toUpperCase(), lx+1, ly+1);

      // Draw main text
      ctx.fillStyle = '#00f0ff';
      ctx.fillText(label.toUpperCase(), lx, ly);
    }

    // polygon
    const pts = subset.map((r,i)=>{
      const a = (-Math.PI/2) + (i*(2*Math.PI/N));
      const rad = R*stateToScore(r.state);
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

    // points with glow effect
    clickMaps[groupKey] = [];
    pts.forEach(p=>{
      const color =
        p.state==='granted'?getCSS('--granted'):
        p.state==='denied'?getCSS('--denied'):
        p.state==='prompt'?getCSS('--prompt'):getCSS('--unsupported');

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

      clickMaps[groupKey].push({x:p.x,y:p.y,key:p.key,r:8});
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
        applyFilter(groupKey);
        const row = document.getElementById(`perm-row-${target.key}`);
        if (row){
          row.scrollIntoView({behavior:'smooth', block:'center'});
          row.classList.remove('highlight'); void row.offsetWidth; row.classList.add('highlight');
        }
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
  const log = (msg) => {
    const time = new Date().toLocaleTimeString();
    const lines = (logEl.textContent || '').split('\n');
    // Keep only the most recent 20 lines
    if (lines.length > 20) {
      lines.length = 20;
    }
    logEl.textContent = `[${time}] ${msg}\n` + lines.join('\n');
  };

  // ----- Tests (safe minimal) -----
  document.getElementById('askNotif').addEventListener('click', async ()=>{
    if (!('Notification' in window)) return log('Notifications unsupported.');
    try{
      const res = await Notification.requestPermission();
      log(`Notification permission: ${res}`);
      await rescan();
    }catch(e){ log(`Notification error: ${e.message}`); }
  });

  document.getElementById('getGeo').addEventListener('click', ()=>{
    if (!('geolocation' in navigator)) return log('Geolocation unsupported.');
    navigator.geolocation.getCurrentPosition(
      pos => { log(`Geolocation ok: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`); rescan(); },
      err => { log(`Geolocation error: ${err.code} ${err.message}`); rescan(); },
      { enableHighAccuracy:false, timeout:5000, maximumAge:0 }
    );
  });

  getCamera.addEventListener('click', async ()=>{
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return log('Camera unsupported.');
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ video:true });
      log('Camera started (auto stop).');
      stream.getTracks().forEach(t => t.stop());
      log('Camera stopped.');
      await rescan();
    }catch(e){ log(`Camera error: ${e.name||''} ${e.message}`); await rescan(); }
  });

  getMic.addEventListener('click', async ()=>{
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return log('Microphone unsupported.');
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
      log('Microphone started (auto stop).');
      stream.getTracks().forEach(t => t.stop());
      log('Microphone stopped.');
      await rescan();
    }catch(e){ log(`Microphone error: ${e.name||''} ${e.message}`); await rescan(); }
  });

  document.getElementById('readClip').addEventListener('click', async ()=>{
    if (!navigator.clipboard) return log('Clipboard API unsupported.');
    try{
      const txt = await navigator.clipboard.readText();
      log(`Clipboard read OK: ${txt ? '(non-empty text)' : '(empty)'}`);
      await rescan();
    }catch(e){ log(`Clipboard read error: ${e.message}`); await rescan(); }
  });

  document.getElementById('writeClip').addEventListener('click', async ()=>{
    if (!navigator.clipboard) return log('Clipboard API unsupported.');
    try{
      await navigator.clipboard.writeText('test');
      log('Clipboard write OK: "test" written.');
      await rescan();
    }catch(e){ log(`Clipboard write error: ${e.message}`); await rescan(); }
  });

  document.getElementById('getMIDI').addEventListener('click', async ()=>{
    if (!navigator.requestMIDIAccess) return log('MIDI unsupported.');
    try{
      const access = await navigator.requestMIDIAccess({ sysex:false });
      const inputs = [...access.inputs.values()].length;
      const outputs = [...access.outputs.values()].length;
      log(`MIDI access OK: inputs=${inputs}, outputs=${outputs}`);
      await rescan();
    }catch(e){ log(`MIDI error: ${e.message}`); await rescan(); }
  });

  document.getElementById('askPersist').addEventListener('click', async ()=>{
    if (!(navigator.storage && navigator.storage.persist)) return log('Persistent Storage unsupported.');
    try{
      const granted = await navigator.storage.persist();
      log(`Persistent Storage: ${granted ? 'granted' : 'denied'}`);
      await rescan();
    }catch(e){ log(`Persistent Storage error: ${e.message}`); await rescan(); }
  });

  testBgSync.addEventListener('click', async ()=>{
    if (!('serviceWorker' in navigator)) return log('Background Sync unsupported.');
    try{
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register('test-sync');
      log('Background Sync registered: test-sync');
      await rescan();
    }catch(e){ log(`Background Sync error: ${e.message}`); await rescan(); }
  });

  document.getElementById('rescanBtn').addEventListener('click', ()=>rescan());

  // ----- Rescan / initial render -----
  async function rescan(){
    const results = await scanAllPermissions();
    lastResults = results.slice();
    // draw each group
    drawRadarGroup('device', results, canvases.device, ctxs.device);
    drawRadarGroup('data',   results, canvases.data,   ctxs.data);
    drawRadarGroup('comm',   results, canvases.comm,   ctxs.comm);
    // table
    renderTable(results);
  }

  // setup click detection per canvas
  setupCanvasClick('device', canvases.device);
  setupCanvasClick('data',   canvases.data);
  setupCanvasClick('comm',   canvases.comm);

  // init
  rescan();
})();
