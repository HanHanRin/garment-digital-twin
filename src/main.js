import './style.css';
import { FactoryScene } from './scene.js';
import { makeReplay, STATUS, clockText, elapsedText, matchesAsset } from './replay.js';

const paths = {
  weave: '<path d="M5 3v18M12 3v18M19 3v18M3 5h18M3 12h18M3 19h18"/>',
  cube: '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 10v9M3 8l9 5 9-5M7.5 5.5l9 5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  focus: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/><circle cx="12" cy="12" r="4"/>',
  home: '<path d="m3 10 9-7 9 7v10H3V10Z"/><path d="M9 20v-7h6v7"/>',
  top: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M10 10v10"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8l10-5Zm-9 10 9 4 9-4M3 17l9 4 9-4"/>',
  tag: '<path d="M3 3h8l10 10-8 8L3 11V3Z"/><circle cx="7.5" cy="7.5" r="1"/>',
  flow: '<path d="M4 5h10a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8h10M1 2l3 3-3 3m15 10 3 3-3 3"/>',
  play: '<path d="m8 4 12 8-12 8V4Z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M7 5h3v14H7zm7 0h3v14h-3z" fill="currentColor" stroke="none"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  close: '<path d="m5 5 14 14M5 19 19 5"/>',
  bolt: '<path d="m14 2-9 12h6l-1 8 9-12h-6l1-8Z"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.cube}</svg>`;
const $ = selector => document.querySelector(selector);
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function getData(file, type = 'json') {
  const r = await fetch(`${import.meta.env.BASE_URL}data/${file}`);
  if (!r.ok) throw new Error(`无法载入 ${file} (${r.status})`);
  return type === 'text' ? r.text() : r.json();
}

async function start() {
  const [layout, catalogRows, manifest, events, raw] = await Promise.all([
    getData('factory-layout.json'), getData('machine-catalog.json'), getData('manifest.json'),
    getData('events.json'), getData('telemetry.jsonl', 'text'),
  ]);
  const catalogs = new Map(catalogRows.map(c => [c.catalog_id, c]));
  const assets = new Map(layout.assets.map(a => [a.asset_id, a]));
  const rows = raw.trim().split('\n').map(line => JSON.parse(line));
  const replay = makeReplay(rows, [...assets.keys()], manifest.sample_interval_s, manifest.duration_s);
  const state = { time: 150, playing: true, speed: 2, selected: 'SEW-A-04', query: '', status: 'all', zone: 'all', labels: false, flows: true };
  const scenarios = events.filter(e => e.phase === 'raised');
  let scene;

  $('#app').innerHTML = `
    <header class="topbar">
      <a class="brand" href="./" aria-label="织境首页"><span class="brand-symbol">${icon('weave')}</span><span>织境<span class="brand-en">FABRIC TWIN</span></span></a>
      <nav aria-label="主导航"><span class="nav-active">车间孪生</span><button class="text-button" id="about-top">数据说明</button></nav>
      <div class="header-end"><span class="mock-tag"><i></i>MOCK 演示</span><span class="header-date">2026.11.10</span><button class="icon-button mobile-assets" id="asset-toggle" aria-label="打开设备列表">${icon('layers')}</button></div>
    </header>
    <div class="page-heading"><div><div class="eyebrow">WORKSHOP DIGITAL TWIN <span>/ 01</span></div><h1>服装行业 数字孪生<span class="heading-dot">.</span></h1><p>服装制造车间 · 三维空间与设备状态同步回放</p></div><div class="project-chip">${icon('cube')}<div><strong>服装车间示例</strong><span>36 × 24 m <b>·</b> 864 m²</span></div></div></div>
    <main class="workspace">
      <aside class="asset-panel" aria-label="车间资产列表">
        <div class="panel-title"><h2>车间资产 <span>22</span></h2><span class="small-label">ASSETS</span><button class="icon-button mobile-close" id="asset-close" aria-label="关闭设备列表">${icon('close')}</button></div>
        <label class="search-box">${icon('search')}<input id="search" type="search" placeholder="搜索设备、型号…" aria-label="搜索设备或型号" autocomplete="off"></label>
        <select id="zone-filter" aria-label="按区域筛选"><option value="all">全部区域</option>${layout.zones.map(z => `<option value="${z.zone_id}">${z.name}</option>`).join('')}</select>
        <div class="status-filters" role="group" aria-label="按状态筛选"><button class="active" data-status="all">全部</button><button data-status="running">运行</button><button data-status="fault">故障</button><button data-status="offline">离线</button><button data-status="idle">空闲</button></div>
        <div id="asset-list" class="asset-list"></div>
        <div class="asset-footer"><span id="asset-count">22 个资产</span><span>点击定位 ${icon('arrow')}</span></div>
      </aside>
      <section class="center-panel" aria-label="三维车间与回放">
        <div class="metric-strip"><div><span>运行工位</span><strong id="running-count">—<small>/ 18</small></strong></div><div><span>故障工位</span><strong id="fault-count">0</strong></div><div><span>数据离线</span><strong id="offline-count">0</strong></div><div class="snapshot-metric"><span>数据快照</span><strong id="sample-clock">09:02:30</strong></div></div>
        <div class="viewport" id="viewport"><div id="scene"></div><div class="scene-top"><span class="scene-chip"><i></i>车间全景 <span>3D</span></span><span class="scene-id">MOCK-GARMENT-01</span></div>
          <div class="scene-toolbar" aria-label="场景工具"><button class="icon-button" id="overview" aria-label="复位全景视角" title="全景视角">${icon('home')}</button><button class="icon-button" id="top-view" aria-label="切换俯视图" title="俯视图">${icon('top')}</button><span></span><button class="icon-button" id="labels" aria-label="显示全部设备标签" aria-pressed="false" title="设备标签">${icon('tag')}</button><button class="icon-button active" id="flows" aria-label="切换物流示意" aria-pressed="true" title="物流示意">${icon('flow')}</button></div>
          <div class="scene-bottom"><div class="legend"><span><i class="running"></i>运行</span><span><i class="idle"></i>空闲</span><span><i class="fault"></i>故障</span><span><i class="offline"></i>离线</span></div><span class="orbit-hint">拖动旋转 · 滚轮缩放 · 点击设备</span></div>
          <div id="scene-error" class="scene-error" hidden></div>
        </div>
        <section class="playback" aria-label="状态回放控制">
          <div class="playback-heading"><span class="section-caption">${icon('reset')} 运行回放 <span class="live-label" id="playing-state">回放中</span></span><span class="sim-clock" id="sim-clock">09:02:30</span><span class="duration-label">10 分钟模拟记录</span></div>
          <div class="timeline-wrap"><input id="timeline" type="range" min="0" max="600" step="1" value="150" aria-label="回放时间（秒）"><div class="event-markers">${scenarios.map((e, i) => `<button style="left:${e.sim_time_s / 6}%" data-scenario="${i}" title="${elapsedText(e.sim_time_s)} ${e.message}" aria-label="跳转到${e.message}"><i></i></button>`).join('')}</div><div class="timeline-ticks"><span>00:00</span><span>02:00</span><span>04:00</span><span>06:00</span><span>08:00</span><span>10:00</span></div></div>
          <div class="playback-bottom"><div class="transport"><button class="play-button" id="play" aria-label="暂停回放">${icon('pause')}</button><button class="icon-button" id="restart" aria-label="从头播放" title="从头播放">${icon('reset')}</button><select id="speed" aria-label="播放速度"><option value="0.5">0.5×</option><option value="1">1×</option><option value="2" selected>2×</option><option value="4">4×</option></select></div><span class="event-hint"><i></i> 时间轴标记可直接跳转异常</span><span class="elapsed" id="elapsed">02:30 / 10:00</span></div>
        </section>
      </section>
      <aside class="detail-panel" aria-label="设备详情与场景演示">
        <div class="panel-title"><h2>资产详情</h2><button class="icon-button" id="focus-selected" aria-label="聚焦选中设备" title="聚焦设备">${icon('focus')}</button></div>
        <div id="detail"></div>
        <section class="scenario-section"><div class="section-heading"><h3>试一试异常场景</h3><span>3 个场景</span></div><p>跳转并暂停，观察模型和数据的变化。</p><div class="scenario-list">${scenarios.map((e, i) => `<button class="scenario-button" data-scenario="${i}"><span class="scenario-number">0${i + 1}</span><span><strong>${['缝纫机断线', '设备数据离线', '熨烫工位异常'][i]}</strong><small>${elapsedText(e.sim_time_s)} · ${e.asset_id}</small></span>${icon('arrow')}</button>`).join('')}</div></section>
      </aside>
    </main>
    <footer class="page-footer"><span><i></i>模拟数据驱动 · 每 5 秒一个状态快照</span><button class="text-button" id="about-bottom">${icon('info')} 关于数据与模型</button><a href="${import.meta.env.BASE_URL}data/floorplan.svg" target="_blank" rel="noopener">查看平面图 ↗</a></footer>
    <dialog id="about-dialog" aria-labelledby="about-title"><div class="dialog-top"><span class="eyebrow">ABOUT THIS DEMO</span><button class="icon-button" id="about-close" aria-label="关闭数据说明">${icon('close')}</button></div><h2 id="about-title">让空间与状态连起来。</h2><p>本演示使用 <strong>build-factory-twin</strong> Skill 自带的服装车间数据。22 个资产、六个区域和 2,662 条状态快照，由相同的数据源驱动三维场景、设备列表和详情面板。</p><div class="about-grid"><div><strong>空间与外观</strong><p>36 × 24 米虚构布局。设备为程序化类别简模，工作站尺寸均为假设，并非厂商精确 CAD。</p></div><div><strong>型号与状态</strong><p>缝纫机系列名称参考 JUKI 公开资料；订单、工时、温度和运行状态全部为合成数据。</p></div><div><strong>计数的含义</strong><p>完成计数是单个工位独立的模拟工序次数，不是成衣产量。未模拟上下游积压与排产。</p></div><div><strong>动画的含义</strong><p>物流路径和针杆动画用于示意。离线表示数据不可用，不能据此判断实际设备停机。</p></div></div><div class="dialog-links"><a class="primary-link" href="${import.meta.env.BASE_URL}data/assets.csv" download>${icon('download')} 下载设备台账</a><a href="${import.meta.env.BASE_URL}data/factory-layout.json" download>布局 JSON ↗</a><a href="${import.meta.env.BASE_URL}data/telemetry.jsonl" download>状态记录 ↗</a></div></dialog>
  `;

  function matching() {
    const frame = replay.frame(state.time);
    return new Set(layout.assets.filter(a => matchesAsset(a, catalogs.get(a.catalog_id), frame.get(a.asset_id), state)).map(a => a.asset_id));
  }

  function renderList(frame, matched) {
    $('#asset-list').innerHTML = layout.zones.map(zone => {
      const group = layout.assets.filter(a => a.zone_id === zone.zone_id && matched.has(a.asset_id));
      if (!group.length) return '';
      return `<div class="asset-group"><div class="group-title">${zone.name.replace(' / A·B 两线', '')}<span>${group.length}</span></div>${group.map(a => {
        const snapshot = frame.get(a.asset_id), cat = catalogs.get(a.catalog_id);
        return `<button class="asset-row ${a.asset_id === state.selected ? 'selected' : ''}" data-asset="${a.asset_id}" aria-pressed="${a.asset_id === state.selected}"><span class="asset-icon">${icon(a.catalog_id === 'rack' ? 'layers' : 'cube')}</span><span class="asset-row-text"><strong>${a.asset_id}</strong><small>${cat.category_name}</small></span><i class="status-dot ${snapshot.status}" title="${STATUS[snapshot.status].label}"></i><span class="sr-only">${a.catalog_id === 'rack' ? '静态资产' : STATUS[snapshot.status].label}</span></button>`;
      }).join('')}</div>`;
    }).join('') || '<div class="empty-state">没有匹配的设备<span>试试其他名称、区域或状态。</span></div>';
    $('#asset-count').textContent = `${matched.size} / 22 个资产`;
  }

  function sparkline(history) {
    const points = history.map((r, i) => ({ x: i / Math.max(1, history.length - 1) * 240, y: r.temperature_c == null ? null : 50 - (r.temperature_c - 26) / 26 * 40 }));
    let path = '', gap = true;
    for (const p of points) {
      if (p.y === null) { gap = true; continue; }
      path += `${gap ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)} `; gap = false;
    }
    return `<svg class="sparkline" viewBox="0 0 240 60" preserveAspectRatio="none" aria-label="所选设备最近两分钟的模拟温度趋势"><path d="M0 20h240M0 40h240" stroke="#e8eeea" fill="none"/><path d="${path}" fill="none" stroke="#4b9680" stroke-width="2" stroke-linejoin="round"/></svg>`;
  }

  function renderDetail(frame) {
    const a = assets.get(state.selected), cat = catalogs.get(a.catalog_id), r = frame.get(a.asset_id);
    const status = a.catalog_id === 'rack' ? '静态资产' : STATUS[r.status].label;
    const zone = layout.zones.find(z => z.zone_id === a.zone_id);
    $('#detail').innerHTML = `
      <div class="asset-illustration"><span>${icon(a.catalog_id === 'rack' ? 'layers' : 'cube')}</span><div class="illustration-grid"></div><span class="illustration-type">${a.catalog_id === 'rack' ? 'STORAGE' : 'WORKSTATION'}</span><i class="illustration-dot ${r.status}"></i></div>
      <div class="selected-title"><div><span class="small-label">${cat.category_name}</span><h3 id="selected-id">${a.asset_id}</h3></div><span class="status-pill ${r.status}" id="selected-status"><i></i>${status}</span></div>
      <div class="model-name">${escape(cat.brand ? `${cat.brand} ${cat.model_reference}` : cat.category_name)}</div>
      <div class="detail-location"><span>${zone.name.replace(' / A·B 两线', '')}${a.line_id ? ` / ${a.line_id} 线` : ''}</span><span>${a.position_m[0]} m, ${a.position_m[2]} m</span></div>
      ${r.alarm_code ? `<div class="alarm-box ${r.status}">${icon('bolt')}<div><strong>${scenarios.find(e => e.code === r.alarm_code)?.message || r.alarm_code}</strong><small>${r.alarm_code}</small></div></div>` : ''}
      <div class="telemetry-grid"><div><span>模拟温度</span><strong id="temperature">${r.temperature_c == null ? '—' : r.temperature_c.toFixed(1)}<small>${r.temperature_c == null ? '' : '°C'}</small></strong></div><div><span>缝纫速度</span><strong id="sewing-speed">${r.sewing_speed_sti_min == null ? '—' : r.sewing_speed_sti_min.toLocaleString()}<small>${r.sewing_speed_sti_min == null ? '' : '针/分'}</small></strong></div></div>
      ${a.catalog_id === 'rack' ? '<div class="static-note">静态货架资产，无加工或遥测读数。</div>' : `<div class="operation-heading"><span>本工位工序进度</span><strong>${Math.round(r.cycle_progress * 100)}%</strong></div><div class="progress-track"><span style="width:${r.cycle_progress * 100}%"></span></div><div class="operation-count">独立完成 <strong>${r.completed_operations}</strong> 次工序<span>非成衣产量</span></div><div class="chart-heading"><span>模拟温度趋势</span><span>最近 2 分钟</span></div>${sparkline(replay.history(a.asset_id, state.time))}`}
      <div class="data-updated">快照 ${clockText(r.sim_time_s)}<span>每 5 秒更新</span></div>
    `;
  }

  let lastSample = -1;
  function update(force = false) {
    const sample = Math.floor(state.time / 5) * 5;
    $('#sim-clock').textContent = clockText(state.time);
    $('#elapsed').textContent = `${elapsedText(state.time)} / 10:00`;
    $('#timeline').value = state.time;
    $('#timeline').style.setProperty('--progress', `${state.time / 6}%`);
    $('#play').innerHTML = icon(state.playing ? 'pause' : 'play');
    $('#play').setAttribute('aria-label', state.playing ? '暂停回放' : '播放回放');
    $('#playing-state').textContent = state.playing ? '回放中' : '已暂停';
    $('#playing-state').classList.toggle('paused', !state.playing);
    if (!force && sample === lastSample) return;
    lastSample = sample;
    const frame = replay.frame(state.time), matched = matching();
    const work = [...frame.values()].filter(r => assets.get(r.asset_id).catalog_id !== 'rack');
    $('#running-count').innerHTML = `${work.filter(r => r.status === 'running').length}<small>/ 18</small>`;
    $('#fault-count').textContent = work.filter(r => r.status === 'fault').length;
    $('#fault-count').classList.toggle('has-fault', work.some(r => r.status === 'fault'));
    $('#offline-count').textContent = work.filter(r => r.status === 'offline').length;
    $('#sample-clock').textContent = clockText(sample);
    renderList(frame, matched); renderDetail(frame);
    scene?.updateStates(frame, matched, state.selected);
  }

  function select(id, focus = true) {
    state.selected = id; update(true);
    if (focus) scene?.focus(id);
    $('.asset-panel').classList.remove('mobile-open');
  }
  function scenario(index) {
    const e = scenarios[index];
    state.time = e.sim_time_s; state.playing = false;
    state.status = 'all'; state.zone = 'all'; state.query = '';
    $('#search').value = ''; $('#zone-filter').value = 'all';
    document.querySelectorAll('[data-status]').forEach(b => b.classList.toggle('active', b.dataset.status === 'all'));
    select(e.asset_id, true);
  }
  try {
    scene = new FactoryScene($('#scene'), layout, catalogs, select);
  } catch (e) {
    $('#scene-error').hidden = false;
    $('#scene-error').textContent = '当前浏览器无法初始化 3D。请使用支持 WebGL2 的浏览器；设备列表与回放仍可操作。';
    console.error(e);
  }
  $('#scene').addEventListener('scene-error', e => { $('#scene-error').hidden = false; $('#scene-error').textContent = e.detail; });
  $('#asset-list').addEventListener('click', e => { const button = e.target.closest('[data-asset]'); if (button) select(button.dataset.asset); });
  $('#search').addEventListener('input', e => { state.query = e.target.value; update(true); });
  $('#zone-filter').addEventListener('change', e => { state.zone = e.target.value; update(true); });
  document.querySelectorAll('[data-status]').forEach(b => b.addEventListener('click', () => {
    state.status = b.dataset.status;
    document.querySelectorAll('[data-status]').forEach(button => button.classList.toggle('active', button === b));
    update(true);
  }));
  document.querySelectorAll('[data-scenario]').forEach(b => b.addEventListener('click', () => scenario(Number(b.dataset.scenario))));
  $('#timeline').addEventListener('input', e => { state.time = Number(e.target.value); state.playing = false; update(true); });
  $('#play').addEventListener('click', () => { if (state.time >= 600) state.time = 0; state.playing = !state.playing; update(true); });
  $('#restart').addEventListener('click', () => { state.time = 0; state.playing = true; update(true); });
  $('#speed').addEventListener('change', e => { state.speed = Number(e.target.value); });
  $('#overview').addEventListener('click', () => scene?.setView('overview'));
  $('#top-view').addEventListener('click', () => scene?.setView('top'));
  $('#focus-selected').addEventListener('click', () => scene?.focus(state.selected));
  $('#labels').addEventListener('click', e => {
    state.labels = !state.labels; scene?.setLabels(state.labels);
    e.currentTarget.classList.toggle('active', state.labels); e.currentTarget.setAttribute('aria-pressed', String(state.labels));
  });
  $('#flows').addEventListener('click', e => {
    state.flows = !state.flows; scene?.setFlows(state.flows);
    e.currentTarget.classList.toggle('active', state.flows); e.currentTarget.setAttribute('aria-pressed', String(state.flows));
  });
  $('#asset-toggle').addEventListener('click', () => $('.asset-panel').classList.add('mobile-open'));
  $('#asset-close').addEventListener('click', () => $('.asset-panel').classList.remove('mobile-open'));
  for (const id of ['#about-top', '#about-bottom']) $(id).addEventListener('click', () => $('#about-dialog').showModal());
  $('#about-close').addEventListener('click', () => $('#about-dialog').close());
  $('#about-dialog').addEventListener('click', e => { if (e.target === $('#about-dialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close(); } });

  update(true);
  let previousTime = performance.now(), lastUi = 0, animationId;
  function loop(now) {
    const dt = Math.min((now - previousTime) / 1000, .1); previousTime = now;
    if (state.playing) { state.time = Math.min(600, state.time + dt * state.speed); if (state.time >= 600) state.playing = false; }
    if (now - lastUi > 100) { update(); lastUi = now; }
    scene?.render(dt, state.time);
    animationId = requestAnimationFrame(loop);
  }
  animationId = requestAnimationFrame(loop);
  if (import.meta.hot) import.meta.hot.dispose(() => {
    cancelAnimationFrame(animationId);
    scene?.dispose();
  });
}

start().catch(error => {
  console.error(error);
  $('#app').innerHTML = `<main class="load-error"><h1>车间资料暂未载入</h1><p>${escape(error.message)}</p><button onclick="location.reload()">重新载入</button></main>`;
});
