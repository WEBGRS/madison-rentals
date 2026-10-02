/* Isthmus Rentals — map + filters + data-gap tracker */
(() => {
  const D = window.HOUSING;
  if (!D) { document.body.innerHTML = '<p style="padding:24px">data/properties.js is missing. Run <code>python scraper/run_all.py</code> first.</p>'; return; }
  const P = D.properties.filter(p => !p.hidden), META = D.meta;

  // ---------- i18n
  const ZH = {
    tagline: 'UW–Madison 周边租房', tab_map: '地图', tab_gaps: '缺失信息', tab_sources: '数据来源',
    search_ph: '街道、楼名或房东', bedrooms: '卧室数', studio: '单间', per_person: '每人', whole_unit: '整套',
    lease: '租期', term_any: '不限', term_2728: '2027 秋季（2027–28）',
    term_now: '现在 / 2026–27 和转租', term_unknown: '未说明', sort: '排序', sort_dist: '最近',
    sort_price: '每人最便宜', sort_rent: '总租金最低', more: '更多筛选', f_priced: '有公开价格',
    f_heat: '含暖气', f_allutil: '全包水电', f_net: '含网络', f_cats: '可养猫', f_dogs: '可养狗',
    f_inunit: '室内洗衣机', f_parking: '提供停车', f_furn: '带家具', f_ac: '有空调', landlord: '房东',
    all_landlords: '全部房东', reset: '重置', export: '下载 CSV', pick_hint: '点地图选一个位置。', pick_cancel: '取消',
    gaps_intro: '下面每个物业都缺少租房需要的信息，或不同来源之间数据冲突。选一个房东，查看要问他们什么。',
    noshared: '不算合住（两人一间的每人价）',
    appearance: '外观', ftoggle: '价格、距离等筛选',
    places: '我常去的地方', place_add: '＋ 添加地点', place_q_ph: '楼名、店名或街道地址', place_search: '搜索',
    place_map: '在地图上点选', place_gps: '用我现在的位置', place_name_ph: '起个名字，比如 实验室、健身房',
    place_save: '保存', place_cancel: '取消',
  };
  const ZHF = {
    props: n => `<b>${n}</b> 个物业`, units: n => `<b>${n}</b> 个户型/单元`,
    dist_lbl: v => `距离 ≤ <b>${v} 英里</b>`, count: n => `${n} 个物业`,
    from: '起', per_person: '/人', per_unit: '/月', no_price: '未公开价格', walk: (m, mi, r) => `步行约 <b>${m} 分钟</b>（直线 ${mi} 英里）到 ${r}`,
    gaps: n => `${n} 项缺失`, not_stated: '未说明',
  };
  const ENF = {
    props: n => `<b>${n}</b> properties`, units: n => `<b>${n}</b> units & floor plans`,
    dist_lbl: v => `Within <b>${v} mi</b> of`, count: n => `${n} ${n === 1 ? 'property' : 'properties'}`,
    from: 'from', per_person: '/person', per_unit: '/mo', no_price: 'No price posted',
    walk: (m, mi, r) => `About <b>${m} min</b> walk (${mi} mi straight line) to ${r}`,
    gaps: n => `${n} missing`, not_stated: 'Not stated',
  };
  let lang = safeGet('lang') || 'en';
  const EN_TEXT = {};
  document.querySelectorAll('[data-i18n]').forEach(el => { EN_TEXT[el.dataset.i18n] = el.textContent; });
  const EN_PH = {};
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { EN_PH[el.dataset.i18nPh] = el.placeholder; });
  const F = () => (lang === 'zh' ? ZHF : ENF);
  function applyLang() {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = lang === 'zh' ? (ZH[el.dataset.i18n] || EN_TEXT[el.dataset.i18n]) : EN_TEXT[el.dataset.i18n]; });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = lang === 'zh' ? ZH[el.dataset.i18nPh] : EN_PH[el.dataset.i18nPh]; });
    document.getElementById('lang').textContent = lang === 'zh' ? 'English' : '中文';
  }

  // ---------- helpers
  function safeGet(k) { try { return localStorage.getItem('isthmus:' + k); } catch { return null; } }
  function safeSet(k, v) { try { localStorage.setItem('isthmus:' + k, v); } catch { /* storage blocked */ } }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = v => v == null ? '' : '$' + Math.round(v).toLocaleString('en-US');
  const $ = id => document.getElementById(id);
  function miles(a, b) {
    const R = 3958.8, r = Math.PI / 180;
    const dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const walkMin = mi => Math.round(mi * 1.25 * 20); // grid detour 1.25x, 3 mph
  const BUCKETS = [[0, 900, 'p1'], [900, 1200, 'p2'], [1200, 1500, 'p3'], [1500, 1900, 'p4'], [1900, 1e9, 'p5']];
  const BUCKETS_UNIT = [[0, 1500, 'p1'], [1500, 2500, 'p2'], [2500, 3500, 'p3'], [3500, 5000, 'p4'], [5000, 1e9, 'p5']];
  const bucket = v => v == null ? 'p0' : BUCKETS.find(b => v >= b[0] && v < b[1])[2];
  // Whole-unit rent of a listing: per-person prices times the people living there
  const unitRent = x => x.rent == null ? null : x.basis === 'unit' ? x.rent : x.rent * Math.max(1, x.beds || 0) * (x.shared ? 2 : 1);
  const priceBounds = () => (state.basis === 'bed' ? [500, 3000] : [800, 12000]);
  // Price a property shows: lowest among its listings that pass the filters, per person or whole unit
  const shownPrice = p => (state.basis === 'bed' ? p._minBed : p._minUnit);
  const pbucket = p => {
    const v = shownPrice(p);
    return v == null ? 'p0' : (state.basis === 'bed' ? BUCKETS : BUCKETS_UNIT).find(b => v >= b[0] && v < b[1])[2];
  };
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue('--' + n).trim();

  // ---------- state
  const LM = META.landmarks;
  const state = {
    q: '', beds: new Set(), basis: 'bed', price: 3000, priceMin: 500, dist: 2, ref: 'Bascom Hall', refPt: LM['Bascom Hall'],
    term: '', sort: 'dist', landlord: '', checks: {}, sel: null, noShared: safeGet('noshared') !== '0', refKey: 'Bascom Hall',
  };

  // ---------- map
  // Open on where the listings are (median of those within a mile), wider on phones
  const near = P.filter(p => p.dist <= 1 && p.lat);
  const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
  const home = near.length ? [med(near.map(p => p.lat)), med(near.map(p => p.lng))] : LM['Bascom Hall'];
  const map = L.map('map', { zoomControl: true, preferCanvas: true }).setView(home, matchMedia('(max-width: 860px)').matches ? 14 : 15);
  let dark = window.IsthmusTheme ? IsthmusTheme.isDark() : false;
  const basemap = () => (window.IsthmusTheme ? IsthmusTheme.basemap() : 'color');
  const esri = n => `https://server.arcgisonline.com/ArcGIS/rest/services/${n}/MapServer/tile/{z}/{y}/{x}`;
  const ESRI = 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>';
  // Basemaps: color (topographic, campus buildings named), gray canvas, satellite with street labels
  const BASEMAPS = {
    color: d => [L.tileLayer(esri('World_Topo_Map'), { maxZoom: 20, maxNativeZoom: 19, className: d ? 'bm-night' : '', attribution: `${ESRI} — Esri, HERE, Garmin, USGS, &copy; OpenStreetMap contributors, GIS User Community` })],
    gray: d => [
      L.tileLayer(esri(`Canvas/${d ? 'World_Dark_Gray_Base' : 'World_Light_Gray_Base'}`), { maxZoom: 20, maxNativeZoom: 16, attribution: `${ESRI}, HERE, Garmin, &copy; OpenStreetMap contributors` }),
      L.tileLayer(esri(`Canvas/${d ? 'World_Dark_Gray_Reference' : 'World_Light_Gray_Reference'}`), { maxZoom: 20, maxNativeZoom: 16, pane: 'shadowPane' }),
    ],
    satellite: d => [
      L.tileLayer(esri('World_Imagery'), { maxZoom: 20, maxNativeZoom: 19, className: d ? 'bm-dim' : '', attribution: `${ESRI} — Esri, Maxar, Earthstar Geographics, GIS User Community` }),
      L.tileLayer(esri('Reference/World_Transportation'), { maxZoom: 20, maxNativeZoom: 19, pane: 'shadowPane' }),
      L.tileLayer(esri('Reference/World_Boundaries_and_Places'), { maxZoom: 20, maxNativeZoom: 19, pane: 'shadowPane' }),
    ],
  };
  let tiles = [], tileKey = '';
  function setTiles() {
    const bm = BASEMAPS[basemap()] ? basemap() : 'color';
    const key = bm + (dark ? ':dark' : '');
    if (key === tileKey) return;
    tiles.forEach(t => t.remove());
    tiles = BASEMAPS[bm](dark);
    tiles.forEach(t => t.addTo(map));
    tileKey = key;
  }
  setTiles();
  if (window.IsthmusTheme) {
    IsthmusTheme.onChange(() => {
      dark = IsthmusTheme.isDark();
      setTiles();
      drawRings(); renderMarkers(); renderLegend();
      if (state.sel) select(state.sel, false);
    });
  }
  const ringLayer = L.layerGroup().addTo(map);
  const markerLayer = L.layerGroup().addTo(map);
  const tagLayer = L.layerGroup().addTo(map);
  const selLayer = L.layerGroup().addTo(map);
  let refMarker = null;

  // Ring around the open property
  function markSel() {
    selLayer.clearLayers();
    const p = state.sel && P.find(x => x.id === state.sel);
    if (!p) return;
    const m = markers.get(p.id);
    if (m) m.bringToFront();
    L.marker([p.lat, p.lng], { interactive: false, keyboard: false, icon: L.divIcon({ className: '', html: '<span class="sel-ring"></span>', iconSize: [0, 0] }) }).addTo(selLayer);
  }

  // ---------- bus stops (Madison Metro GTFS via scraper/transit.py)
  const TR = window.TRANSIT && window.TRANSIT.stops ? window.TRANSIT : null;
  const BUS_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M4 1h8a2 2 0 0 1 2 2v8a1 1 0 0 1-1 1v1.5a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5V12H5v1.5a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5V12a1 1 0 0 1-1-1V3a2 2 0 0 1 2-2zM4 3v4h8V3zm1 6.2a.9.9 0 1 0 0 1.8a.9.9 0 1 0 0-1.8zm6 0a.9.9 0 1 0 0 1.8a.9.9 0 1 0 0-1.8z"/></svg>';
  const routeOrder = r => (/^\d+$/.test(r) ? 1000 + +r : r.charCodeAt(0));
  const routeBadges = rs => [...rs].sort((a, b) => routeOrder(a) - routeOrder(b)).map(r => {
    const c = (TR && TR.routes[r]) || ['#24476B', '#FFFFFF', ''];
    return `<span class="rt" style="background:${c[0]};color:${c[1]}"${c[2] ? ` title="${esc(c[2])}"` : ''}>${esc(r)}</span>`;
  }).join('');
  map.createPane('bus').style.zIndex = 450;
  const busLayer = L.layerGroup();
  let showBus = safeGet('bus') !== '0';
  if (TR) TR.stops.forEach(([lat, lng, name, rs]) => {
    const m = L.marker([lat, lng], { pane: 'bus', keyboard: false, icon: L.divIcon({ className: '', html: `<span class="bus-stop">${BUS_SVG}</span>`, iconSize: [16, 16], iconAnchor: [8, 8] }) });
    m.bindTooltip(`<b>${esc(name)}</b><div class="rts">${routeBadges(rs.split(' '))}</div>`, { direction: 'top', offset: [0, -8], className: 'bus-tip' });
    m.on('click', () => m.openTooltip());
    m.addTo(busLayer);
  });
  // Stops only from street level up
  function syncBus() {
    const on = !!TR && showBus && map.getZoom() >= 16;
    if (on && !map.hasLayer(busLayer)) busLayer.addTo(map);
    else if (!on && map.hasLayer(busLayer)) busLayer.remove();
  }
  map.on('zoomend', syncBus);
  syncBus();
  // Nearest stops; both sides of a street share a name and are merged
  function nearStops(pt, max = 0.35) {
    if (!TR) return [];
    const by = new Map();
    TR.stops.forEach(([lat, lng, name, rs]) => {
      const d = miles(pt, [lat, lng]);
      if (d > max) return;
      const g = by.get(name) || { name, d, routes: new Set() };
      g.d = Math.min(g.d, d);
      rs.split(' ').forEach(r => g.routes.add(r));
      by.set(name, g);
    });
    return [...by.values()].sort((a, b) => a.d - b.d).slice(0, 3);
  }
  function busBlock(p) {
    if (!TR) return '';
    const zh = lang === 'zh';
    const ss = nearStops([p.lat, p.lng]);
    const rows = ss.length
      ? ss.map(s => `<div class="bus-row"><span class="bus-stop">${BUS_SVG}</span><span>${esc(s.name)} <small>${zh ? `步行约 ${Math.max(1, walkMin(s.d))} 分钟` : `${Math.max(1, walkMin(s.d))} min walk`}</small></span><span class="rts">${routeBadges(s.routes)}</span></div>`).join('')
      : `<div class="bus-row"><span class="bus-stop">${BUS_SVG}</span><span>${zh ? '0.35 英里内没有公交站' : 'No bus stop within 0.35 mi'}</span></div>`;
    return `<div class="bus" aria-label="${zh ? '附近公交站' : 'Nearby bus stops'}">${rows}</div>`;
  }

  function drawRings() {
    ringLayer.clearLayers();
    const red = cssVar('badger');
    [0.5, 1, 1.5, 2].forEach(r => {
      L.circle(state.refPt, { radius: r * 1609.34, color: red, weight: 1, dashArray: '4 6', fill: false, interactive: false }).addTo(ringLayer);
      const lat = state.refPt[0] + r / 69.0;
      L.marker([lat, state.refPt[1]], { interactive: false, icon: L.divIcon({ className: '', html: `<span class="ring-label">${r} mi</span>`, iconSize: [40, 14], iconAnchor: [20, 7] }) }).addTo(ringLayer);
    });
    if (refMarker) refMarker.remove();
    refMarker = L.marker(state.refPt, { icon: L.divIcon({ className: '', html: '<div class="campus-pin"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), keyboard: false })
      .bindTooltip(state.ref).addTo(map);
  }

  // ---------- derived per property
  P.forEach(p => {
    p._text = [p.name, p.address, p.landlord, p.zip].filter(Boolean).join(' ').toLowerCase();
    const u = (p.utilities || []);
    p._heat = u.includes('heat');
    p._net = u.includes('internet');
    p._allutil = ['heat', 'electric', 'water'].every(x => u.includes(x));
    const pets = (p.pets || '').toLowerCase();
    p._cats = /cat/.test(pets) && !/cats not allowed|no pets/.test(pets);
    p._dogs = /dog/.test(pets) && !/dogs not allowed|no pets/.test(pets);
    p._inunit = /in[ -]?unit|washer & dryer|washer and dryer/i.test(p.laundry || '');
    p._parking = !!p.parking && !/^street\b|no parking|none/i.test(p.parking);
    p._furn = p.furnished === true;
    p._ac = p.ac === true;
  });

  function listingMatches(x) {
    if (state.noShared && x.shared) return false;
    if (state.beds.size) {
      const b = x.beds;
      if (b == null) return false;
      const k = b >= 5 ? 5 : Math.floor(b);
      if (!state.beds.has(k)) return false;
    }
    if (state.term) {
      if (state.term === 'unknown') { if (x.term) return false; }
      else if (x.term !== state.term) return false;
    }
    const [floor, cap] = priceBounds();
    if (state.price < cap || state.priceMin > floor) {
      const v = state.basis === 'bed' ? x.per_bed : unitRent(x);
      if (v == null || (state.price < cap && v > state.price) || (state.priceMin > floor && v < state.priceMin)) return false;
    }
    if (state.checks.priced && !x.rent) return false;
    return true;
  }

  function filtered() {
    const q = state.q.trim().toLowerCase();
    const c = state.checks;
    const out = [];
    for (const p of P) {
      p._d = miles(state.refPt, [p.lat, p.lng]);
      if (state.dist < 2 && p._d > state.dist) continue;
      if (q && !p._text.includes(q)) continue;
      if (state.landlord && p.landlord !== state.landlord) continue;
      if (c.heat && !p._heat) continue;
      if (c.net && !p._net) continue;
      if (c.allutil && !p._allutil) continue;
      if (c.cats && !p._cats) continue;
      if (c.dogs && !p._dogs) continue;
      if (c.inunit && !p._inunit) continue;
      if (c.parking && !p._parking) continue;
      if (c.furn && !p._furn) continue;
      if (c.ac && !p._ac) continue;
      const ls = p.listings.filter(listingMatches);
      if (!ls.length) continue;
      const pb = ls.map(x => x.per_bed).filter(v => v != null);
      const rents = ls.map(x => x.rent).filter(v => v != null);
      p._ls = ls;
      p._minBed = pb.length ? Math.min(...pb) : null;
      p._minBedDiv = p._minBed != null && ls.every(x => x.per_bed !== p._minBed || x.pb_div);
      p._minBedUnv = p._minBed != null && ls.some(x => x.per_bed === p._minBed && x.bv && ['none', 'range-out'].includes(x.bv[0]));
      p._minRent = rents.length ? Math.min(...rents) : null;
      const units = ls.map(unitRent).filter(v => v != null);
      p._minUnit = units.length ? Math.min(...units) : null;
      out.push(p);
    }
    const key = state.sort;
    out.sort((a, b) => {
      if (key === 'price') return (a._minBed ?? 1e9) - (b._minBed ?? 1e9) || a._d - b._d;
      if (key === 'rent') return (a._minUnit ?? 1e9) - (b._minUnit ?? 1e9) || a._d - b._d;
      return a._d - b._d;
    });
    return out;
  }

  // ---------- anonymous usage events (public build only; #notrack opts this browser out)
  const TRACK = META.track;
  if (/notrack/.test(location.hash)) safeSet('notrack', '1');
  const tracking = !!TRACK && !safeGet('notrack') && location.protocol === 'https:';
  const rid = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => (b % 36).toString(36)).join('');
  let vid = safeGet('vid');
  if (!vid) { vid = rid(8); safeSet('vid', vid); }
  const sid = rid(6);
  const mobile = matchMedia('(max-width: 860px)').matches ? 1 : 0;
  function track(e, extra = {}) {
    if (!tracking) return;
    const body = JSON.stringify({ v: 1, e, vid, sid, m: mobile, l: lang, ...extra });
    try { fetch(`https://ntfy.sh/${TRACK}`, { method: 'POST', body, keepalive: true }).catch(() => { }); } catch { /* offline */ }
  }
  let lastSnap = null, snapTimer = null;
  function filterSnapshot() {
    const s = {};
    if (state.q.trim()) s.q = state.q.trim().slice(0, 60);
    if (state.beds.size) s.beds = [...state.beds].sort();
    if (state.basis !== 'bed') s.basis = state.basis;
    if (state.price < priceBounds()[1]) s.price = state.price;
    if (state.priceMin > priceBounds()[0]) s.priceMin = state.priceMin;
    if (state.dist < 2) s.dist = state.dist;
    if (state.refKey !== 'Bascom Hall') s.ref = state.refKey.startsWith('place:') ? 'my place' : state.refKey;
    if (state.term) s.term = state.term;
    if (state.sort !== 'dist') s.sort = state.sort;
    if (state.landlord) s.landlord = state.landlord;
    if (!state.noShared) s.shared = 1;
    const c = Object.keys(state.checks).filter(k => state.checks[k]);
    if (c.length) s.checks = c;
    return s;
  }
  function trackFilters() {
    if (!tracking) return;
    if (lastSnap === null) { lastSnap = JSON.stringify(filterSnapshot()); return; }
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => {
      const s = filterSnapshot(), j = JSON.stringify(s);
      if (j !== lastSnap && Object.keys(s).length) track('filter', { f: s, n: current.length });
      lastSnap = j;
    }, 2500);
  }

  // ---------- render
  let current = [];
  const markers = new Map();
  function render() {
    current = filtered();
    trackFilters();
    $('count').textContent = F().count(current.length);
    const [pf, pc] = priceBounds();
    const noCap = state.price >= pc && state.priceMin <= pf;
    $('price-lbl').innerHTML = priceLabel();
    syncFills();
    $('dist-lbl').innerHTML = state.dist >= 2 ? (lang === 'zh' ? '距离<b>不限</b> · 参考点' : 'Any distance from') : F().dist_lbl(state.dist.toFixed(2).replace(/0$/, ''));
    renderList();
    renderMarkers();
    const nMore = Object.values(state.checks).filter(Boolean).length + (state.landlord ? 1 : 0);
    $('more-n').textContent = nMore ? ` (${nMore})` : '';
    const nAll = nMore + (noCap ? 0 : 1) + (state.dist < 2 ? 1 : 0) + (state.term ? 1 : 0) + (state.noShared ? 0 : 1);
    $('ftoggle-n').textContent = nAll ? ` (${nAll})` : '';
    setViewSwitch();
  }

  // ---------- phone layout: map or list, one at a time
  const phone = matchMedia('(max-width: 860px)');
  function setViewSwitch() {
    const zh = lang === 'zh';
    const listMode = document.body.classList.contains('m-list');
    $('viewswitch').textContent = listMode ? (zh ? '看地图' : 'Show map') : (zh ? `看列表 · ${current.length}` : `Show list · ${current.length}`);
  }
  // Phone: price, distance and the rest fold under one button
  $('ftoggle').onclick = () => {
    const open = document.querySelector('.filters').classList.toggle('open');
    $('ftoggle').setAttribute('aria-expanded', open);
  };
  $('viewswitch').onclick = () => {
    if (picking) { pickFromList = false; stopPick(); }
    document.body.classList.toggle('m-list');
    setViewSwitch();
    if (!document.body.classList.contains('m-list')) setTimeout(() => map.invalidateSize(), 0);
    window.scrollTo(0, 0);
  };

  function priceLabel() {
    const zh = lang === 'zh', [pf, pc] = priceBounds();
    const who = state.basis === 'bed' ? (zh ? '每人' : 'per person') : (zh ? '整套' : 'whole unit');
    const lo = money(state.priceMin), hi = money(state.price), noFloor = state.priceMin <= pf, noCap = state.price >= pc;
    if (noFloor && noCap) return zh ? '价格<b>不限</b>' : 'Price: <b>any</b>';
    if (noFloor) return zh ? `${who}最高 <b>${hi}</b>` : `Up to <b>${hi}</b> ${who}`;
    if (noCap) return zh ? `${who}最低 <b>${lo}</b>` : `From <b>${lo}</b> ${who}`;
    return zh ? `${who} <b>${lo}–${hi}</b>` : `<b>${lo}–${hi}</b> ${who}`;
  }
  // Colored part of the slider tracks
  function syncFills() {
    const [lo, hi] = priceBounds(), pct = v => ((v - lo) / (hi - lo)) * 100;
    $('price-fill').style.left = pct(state.priceMin) + '%';
    $('price-fill').style.right = (100 - pct(state.price)) + '%';
    $('price-min').style.zIndex = state.priceMin > (lo + hi) / 2 ? 3 : 1;
    $('dist-fill').style.left = '0';
    $('dist-fill').style.right = (100 - ((state.dist - 0.25) / 1.75) * 100) + '%';
  }
  function setPriceRange() {
    const [lo, hi] = priceBounds(), step = state.basis === 'bed' ? 50 : 100;
    ['price-min', 'price'].forEach(id => { const el = $(id); el.min = lo; el.max = hi; el.step = step; });
    state.priceMin = lo; state.price = hi;
    $('price-min').value = lo; $('price').value = hi;
  }

  function priceHTML(p) {
    const zh = lang === 'zh';
    if (state.basis === 'unit') {
      return p._minUnit != null
        ? `<div class="price" title="${zh ? '整套月租（按人计价的按人数相加）' : 'Monthly rent for the whole unit (per-person prices added up)'}">${money(p._minUnit)}<small>${zh ? '整套起' : 'whole unit, from'}</small></div>`
        : `<div class="price none">${F().no_price}</div>`;
    }
    if (p._minBed != null) {
      const tip = (p._minBedDiv ? (zh ? '整套租金 ÷ 卧室数' : 'Whole-unit rent ÷ bedrooms') : (zh ? '每人价格' : 'Per-person price'))
        + (p._minBedUnv ? (zh ? '；未核实是否整套价' : '; not confirmed as a whole-unit price') : '');
      return `<div class="price" title="${esc(tip)}">${p._minBedDiv ? '≈' : ''}${money(p._minBed)}${p._minBedUnv ? '?' : ''}<small>${zh ? '每人起' : 'per person, from'}</small></div>`;
    }
    if (p._minRent != null) return `<div class="price">${money(p._minRent)}<small>${zh ? '每月起' : 'per month, from'}</small></div>`;
    return `<div class="price none">${F().no_price}</div>`;
  }
  const distLabel = mi => lang === 'zh' ? `${mi.toFixed(2)} 英里 · 步行 ${walkMin(mi)} 分钟` : `${mi.toFixed(2)} mi · ${walkMin(mi)} min walk`;

  function bedsSummary(ls) {
    const s = [...new Set(ls.map(x => x.beds).filter(b => b != null))].sort((a, b) => a - b);
    if (!s.length) return '';
    const f = b => b === 0 ? (lang === 'zh' ? '单间' : 'Studio') : `${b}${lang === 'zh' ? ' 卧' : ' BR'}`;
    return s.length > 3 ? `${f(s[0])}–${f(s[s.length - 1])}` : s.map(f).join(', ');
  }

  function renderList() {
    const ol = $('results');
    if (!current.length) {
      ol.innerHTML = `<li class="empty">${lang === 'zh' ? '没有符合条件的物业。放宽价格或距离，或点“重置”。' : 'Nothing matches. Widen the price or distance, or press Reset.'}</li>`;
      return;
    }
    const html = current.slice(0, 400).map(p => {
      const title = p.name || p.address || '—';
      const sub = (p.name && p.address ? `<span>${esc(p.address)}</span>` : '')
        + `<span>${p.landlord ? esc(p.landlord) + ' · ' : ''}<span class="nw">${distLabel(p._d)}</span></span>`
        + placeDistLine(p);
      const has2728 = p._ls.some(x => x.term === '2027-28');
      const gapsN = (p.gaps || []).filter(g => !/not listed|rent basis/.test(g)).length;
      return `<li class="res${state.sel === p.id ? ' sel' : ''}" data-id="${esc(p.id)}" tabindex="0">
        <span class="dot ${pbucket(p)}" style="${shownPrice(p) != null ? `background:var(--${pbucket(p)})` : ''}"></span>
        <h3>${esc(title)}</h3>${priceHTML(p)}
        <div class="sub">${sub}</div>
        <div class="tags">${bedsSummary(p._ls) ? `<span class="tag">${esc(bedsSummary(p._ls))}</span>` : ''}${has2728 ? '<span class="tag t2728">2027–28</span>' : ''}${(p.stale || []).some(s => /last updated|already passed|update date unknown|site not updated/i.test(s)) ? `<span class="tag gap">${lang === 'zh' ? '可能过期' : 'May be outdated'}</span>` : ''}${p._ls.some(x => x.bv && ['none', 'range-out'].includes(x.bv[0])) ? `<span class="tag gap">${lang === 'zh' ? '计价未核实' : 'Price basis unconfirmed'}</span>` : ''}${gapsN ? `<span class="tag gap">${F().gaps(gapsN)}</span>` : ''}</div>
      </li>`;
    }).join('');
    ol.innerHTML = html + (current.length > 400 ? `<li class="empty">${lang === 'zh' ? '只显示前 400 个，用筛选缩小范围。' : 'Showing the first 400. Filter to narrow down.'}</li>` : '');
  }

  function renderMarkers() {
    markerLayer.clearLayers();
    markers.clear();
    const zh = lang === 'zh';
    current.forEach(p => {
      const b = pbucket(p);
      const col = cssVar(b);
      const m = L.circleMarker([p.lat, p.lng], {
        radius: state.sel === p.id ? 9 : 6, weight: b === 'p0' ? 2 : 1.5,
        color: b === 'p0' ? col : (dark ? '#10161D' : '#fff'), fillColor: col, fillOpacity: b === 'p0' ? 0.15 : 0.95,
      });
      const v = shownPrice(p), n = p._ls.length;
      const what = state.basis === 'bed' ? (zh ? '每人' : 'per person') : (zh ? '整套' : 'whole unit');
      m.bindTooltip(`<b>${esc(p.name || p.address)}</b><br>${v != null ? (zh ? `${what} ${money(v)} 起` : `From ${money(v)} ${what}`) : F().no_price}`
        + `<br><small>${zh ? `${n} 个户型符合筛选` : `${n} matching ${n === 1 ? 'unit or plan' : 'units or plans'}`}</small>`, { direction: 'top' });
      m.on('click', () => { if (!picking) select(p.id, false); });
      m.addTo(markerLayer);
      markers.set(p.id, m);
    });
    renderTags();
    markSel();
  }

  function renderTags() {
    tagLayer.clearLayers();
    if (map.getZoom() < 17) return;
    const bounds = map.getBounds();
    current.filter(p => bounds.contains([p.lat, p.lng])).slice(0, 160).forEach(p => {
      const v = shownPrice(p) != null ? money(shownPrice(p)) : '?';
      const b = pbucket(p);
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: '', html: `<span class="price-tag${v === '?' ? ' none' : ''}" style="--c:var(--${b})">${v}</span>`, iconSize: [0, 0] }),
      }).on('click', () => { if (!picking) select(p.id, false); }).addTo(tagLayer);
    });
  }
  map.on('zoomend moveend', renderTags);

  // ---------- detail drawer
  const PROV = {
    official: ['site', '官网'], uw: ['UW list', 'UW 列表'], inferred: ['inferred', '推断'], absent: ['not listed', '未列出'],
    manual: ['checked', '人工核实'],
  };
  function provTag(p, k) {
    const s = (p.prov || {})[k];
    if (!s) return '';
    const t = PROV[s][lang === 'zh' ? 1 : 0];
    const tip = { official: 'From the landlord website', uw: 'From the UW off-campus listing service', inferred: 'Read from the listing description, not a structured field', absent: 'Not in the amenity list — confirm with the landlord', manual: 'Corrected by hand, e.g. from a landlord reply' }[s];
    return `<span class="prov ${s}" title="${esc(tip)}">${t}</span>`;
  }
  function factVal(p, k, v) {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) return `<span class="nostate">${F().not_stated}</span>`;
    if (v === true) v = lang === 'zh' ? '是' : 'Yes';
    else if (v === false) v = lang === 'zh' ? '否' : 'No';
    else if (v === 'not listed') v = lang === 'zh' ? '未列出（需确认）' : 'Not mentioned (ask)';
    else if (Array.isArray(v)) v = lang === 'zh' ? v.map(t => UTIL_ZH[t] || t).join('、') : v.join(', ');
    else if (lang === 'zh' && ZH_RULES[k]) v = zhText(v, ZH_RULES[k]);
    return esc(v) + provTag(p, k);
  }

  const BV = {
    text: ['listing says', '原文写明'], policy: ['landlord policy', '房东说明'], uw: ['UW label', 'UW 标注'],
    price: ['by price', '按价格判断'], rule: ['inferred', '推断'], manual: ['checked', '人工核实'], none: ['unconfirmed', '未核实'],
    context: ['plan note', '户型说明'], ladder: ['building prices', '同楼价格阶梯'], same: ['same as sibling', '同楼同价'],
    range: ['$800–1,500 rule', '按 800–1500 区间'], 'range-out': ['unclear', '不清楚'],
  };
  function bvTag(bv) {
    if (!bv) return '';
    const zh = lang === 'zh';
    const tip = (bv[1] ? `“${bv[1]}”` : '') + (bv[2] ? `\n${bv[2]}` : '') || (zh ? '没有找到房东说明价格是整套还是每人' : 'No statement found on whether this price is for the whole unit or per person');
    const inner = esc(BV[bv[0]][zh ? 1 : 0]);
    return bv[2] ? ` <a class="bv ${bv[0]}" href="${esc(bv[2])}" target="_blank" rel="noopener" title="${esc(tip)}">${inner}</a>`
      : ` <span class="bv ${bv[0]}" title="${esc(tip)}">${inner}</span>`;
  }

  const STATUS_ZH = {
    available: '可租', listed: '在租', rented: '已租', limited: '余量有限', 'limited availability': '余量有限',
    call: '需致电询价', 'pricing not published': '价格未公布', unknown: '未知', pending: '待定', 'available now': '现可租',
  };
  function statusLabel(s) {
    if (!s) return '';
    if (lang !== 'zh') return s;
    const k = s.toLowerCase();
    return STATUS_ZH[k] || (/^showings begin/.test(k) ? s.replace(/showings begin/i, '看房开始于') : /rented/.test(k) ? '已租' : s);
  }
  function dateLabel(a) {
    if (!a) return '—';
    if (a === 'now') return lang === 'zh' ? '现在' : 'Now';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a);
    if (!m) return a;
    return lang === 'zh' ? `${+m[1]}/${+m[2]}/${+m[3]}` : `${+m[2]}/${+m[3]}/${m[1]}`;
  }

  const TERM_ZH = { 'past date': '日期已过', later: '更晚', 'now / 2026-27': '现在 / 2026–27', '2025-26 (old)': '2025–26（旧）' };
  function termLabel(t) {
    if (!t) return lang === 'zh' ? '租期未说明' : 'term not stated';
    return lang === 'zh' ? TERM_ZH[t] || t : t;
  }
  // Term adds nothing when the move-in date already shows the same year
  const termRedundant = x => x.term && x.avail && (x.avail === 'now' ? x.term.startsWith('now') : x.term.startsWith(x.avail.slice(0, 4)));
  function moveIn(a) {
    if (!a) return '—';
    if (a === 'now') return lang === 'zh' ? '现在可入住' : 'Move-in now';
    return lang === 'zh' ? `${dateLabel(a)} 入住` : `Move-in ${dateLabel(a)}`;
  }

  // ---------- Chinese display of English source values (kept in English unless fully translated)
  const UTIL_ZH = { water: '水', heat: '暖气', sewer: '下水道', trash: '垃圾清运', 'hot water': '热水', electric: '电', gas: '燃气', internet: '网络', cable: '有线电视' };
  const ZH_RULES = {
    pets: [
      [/cats? not allowed/gi, '不许养猫'], [/(small )?dogs? not allowed/gi, '不许养狗'], [/no pets( allowed)?/gi, '不许养宠物'],
      [/pets negotiable/gi, '宠物可商量'], [/pets allowed/gi, '可养宠物'], [/small dogs? & cats?/gi, '可养猫和小型犬'],
      [/dogs? & cats?/gi, '可养猫和狗'], [/small dogs?( allowed)?/gi, '可养小型犬'], [/cats?( allowed| friendly)?/gi, '可养猫'],
      [/dogs?( allowed| friendly)?/gi, '可养狗'], [/\s*[;,]\s*/g, '；'], [/\.$/, ''],
    ],
    laundry: [
      [/\(washer: (\$[\d.]+), dryer: (\$[\d.]+)\)/gi, '（洗 $1，烘 $2）'], [/laundry on-?site|on[ -]site/gi, '楼内洗衣房'],
      [/in[ -]unit/gi, '室内洗衣机'], [/washer & dryer/gi, '室内洗衣机和烘干机'], [/laundry included/gi, '含洗衣'],
      [/laundromat/gi, '附近洗衣店'], [/nearby/gi, '附近洗衣房'], [/each floor/gi, '每层洗衣房'], [/hookups/gi, '洗衣机接口'],
      [/\s*,\s*/g, '；'], [/\s+（/g, '（'],
    ],
    parking: [
      [/local ordinances apply/gi, '遵守当地规定'], [/subject to availability/gi, '视空位而定'], [/call for availability/gi, '需致电询问'],
      [/\(included\)/gi, '（含在房租里）'], [/\(available\)/gi, '（有空位）'], [/\(rented\)/gi, '（已租完）'],
      [/\(monthly: (\$\d+)\)/gi, '（每月 $1）'], [/\(monthly\)/gi, '（按月付）'], [/parking (\$\d+)\/mo/gi, '停车位 $1/月'],
      [/paid parking/gi, '付费停车'], [/off-street parking/gi, '路外停车位'], [/driveway parking/gi, '车道停车'],
      [/surface lot/gi, '地面停车场'], [/underground and surface parking available/gi, '有地下和地面停车位'],
      [/surface parking available/gi, '有地面停车位'], [/parking included/gi, '含停车位'], [/parking is extra\.?/gi, '停车另收费'],
      [/^street\b/gi, '路边停车'], [/^available$/gi, '有'], [/\s*;\s*/g, '；'], [/\s*\(\s*/g, '（'], [/\s*\)/g, '）'],
    ],
  };
  function zhText(s, rules) {
    let t = String(s);
    for (const [re, r] of rules) t = t.replace(re, r);
    return /[A-Za-z]{2,}/.test(t) ? s : t;
  }
  const ZH_GAP = {
    'furnished? (not listed)': '是否带家具（未列出）', 'air conditioning (not listed)': '空调（未列出）', 'pet policy': '宠物政策',
    '2027-28 availability/pricing': '2027–28 房源与价格', parking: '停车', 'square footage': '面积', 'utilities included': '包含哪些水电',
    laundry: '洗衣', 'furnished?': '是否带家具', 'available date': '入住日期', 'air conditioning': '空调',
    'rent basis (per person or whole unit)': '计价方式（每人还是整套）', 'contact info': '联系方式', rent: '租金',
  };
  const ZH_NOTE = [
    [/^UW listing: price update date unknown$/i, () => 'UW 列表：价格更新日期未知'],
    [/^UW listing price last updated (\S+)$/i, (_, d) => `UW 列表价格最后更新于 ${dateLabel(d)}`],
    [/^available date (\S+) already passed$/i, (_, d) => `入住日期 ${dateLabel(d)} 已过`],
    [/^site says call for pricing\/availability$/i, () => '官网写着价格和空房需致电询问'],
    [/^lease year not stated on listing$/i, () => '房源没写租约年份'],
    [/^Shared = two people per bedroom, price per person$/i, () => '合住：两人一间，价格为每人'],
    [/^per-bed space (\$[\d,]+); entire unit (\$[\d,]+)$/i, (_, a, b) => `每床位 ${a}；整套 ${b}`],
    [/^floor plan page blocked by Cloudflare during scrape$/i, () => '抓取时户型页被 Cloudflare 拦截'],
    [/^Rent basis: (.+) leases by the bed; price treated as per person$/i, (_, n) => `计价：${n} 按床位出租，价格按每人算`],
    [/^Rent basis: listing says "(.+)"; price treated as per person$/i, (_, q) => `计价：原文写着“${q}”，价格按每人算`],
    [/^Rent basis: (\$[\d,]+) for (\d+) bedrooms is too low for a whole unit; treated as per person( \(confirm\))?$/i, (_, a, b, c) => `计价：${b} 卧整套只要 ${a} 太低，按每人算${c ? '（待确认）' : ''}`],
    [/^Rent basis: sublet at (\$[\d,]+) for a (\d+)bedroom unit; likely one room, treated as per person$/i, (_, a, b) => `计价：${b} 卧转租 ${a}，多半是一间，按每人算`],
    [/^rent basis unclear: listed per person, but too high for one person$/i, () => '计价不清楚：标的是每人价，但一个人付这个价太高'],
    [/^Rent basis unclear: price is outside the usual \$800–1,500 per person either way$/i, () => '计价不清楚：无论按每人还是整套，都不在常见的每人 $800–1,500 区间'],
  ];
  function zhNote(s) {
    if (lang !== 'zh') return s;
    if (ZH_GAP[s]) return ZH_GAP[s];
    const hit = ZH_NOTE.find(([re]) => re.test(s));
    return hit ? s.replace(hit[0], hit[1]) : s;
  }

  const opened = new Set();
  function select(id, pan = true) {
    state.sel = id;
    const p = P.find(x => x.id === id);
    if (!p) return;
    if (!opened.has(id)) { opened.add(id); track('open', { p: id, d: Math.round(p.dist * 100) / 100 }); }
    const d = miles(state.refPt, [p.lat, p.lng]);
    const zh = lang === 'zh';
    const ls = p._ls && current.includes(p) ? p._ls : p.listings.filter(x => !(state.noShared && x.shared));
    const hiddenShared = state.noShared ? p.listings.filter(x => x.shared).length : 0;
    // Marketing headlines repeated on most units ("In the Center of It All") add nothing per row
    const planN = {};
    ls.forEach(x => { if (x.plan) planN[x.plan] = (planN[x.plan] || 0) + 1; });
    const noisyPlan = pl => pl && ls.length >= 4 && planN[pl] >= Math.max(3, ls.length * 0.3) && !/bed|bath|studio|卧|plan|floor/i.test(pl);
    const bbOf = x => `${x.beds == null ? '?' : x.beds === 0 ? (zh ? '单间' : 'Studio') : x.beds + (zh ? '卧' : 'bd')}${x.baths != null ? ' / ' + x.baths + (zh ? '卫' : 'ba') : ''}`;
    const fpName = x => (x.plan || '').split(' — ')[0] || (zh ? '户型图' : 'Floor plan');
    const fpCap = x => [fpName(x), bbOf(x), x.sqft ? x.sqft.toLocaleString() + ' ft²' : ''].filter(Boolean).join(' · ');
    const unitRow = x => {
      const plan = noisyPlan(x.plan) && x.unit ? null : x.plan;
      const what = [x.unit, plan].filter(Boolean).join(' · ') || '—';
      const bb = bbOf(x);
      const unv = x.bv && ['none', 'range-out'].includes(x.bv[0]);
      const basisLbl = x.shared ? (zh ? '合住每人价（两人一间）' : 'per person, shared room')
        : x.basis === 'bed' ? (zh ? '每人价' : 'per person') : (x.beds > 1 ? (unv ? (zh ? '整套价？' : 'whole unit?') : (zh ? '整套价' : 'whole unit')) : '');
      const rent = x.rent ? money(x.rent) + (x.rent_max && x.rent_max !== x.rent ? '–' + money(x.rent_max) : '') + (basisLbl ? `<div class="basis ${x.basis}">${basisLbl}${x.shared ? '' : bvTag(x.bv)}</div>` : '') : `<span class="nostate">${zh ? '未公开' : 'not posted'}</span>`;
      const per = x.per_bed && (x.pb_div || (x.shared && x.per_bed !== x.rent)) ? `<div class="muted${unv ? ' unv' : ''}">≈ ${money(x.per_bed)}${zh ? '/人' : '/person'}${x.pb_div ? ` (÷${x.beds})` : ''}${unv ? (zh ? ' 未核实' : ' unconfirmed') : ''}</div>` : '';
      const flags = [...(x.flags || []), ...((x.notes || []).filter(n => !/banner/i.test(n) && /call for|blocked|not stated|per room|per-bed|Shared|lease year/i.test(n)))];
      return `<tr class="${x.flags ? 'flagged' : ''}${x.shared ? ' shared' : ''}">
        <td class="u-what">${esc(what)}${x.fpimg ? `<button type="button" class="fp-link" data-img="${esc(x.fpimg)}" data-cap="${esc(fpCap(x))}">${zh ? '户型图' : 'Floor plan'}</button>` : ''}<div class="muted src">${esc(PROV[x.src === 'uw_offcampus' ? 'uw' : 'official'][zh ? 1 : 0])}${x.status ? ' · ' + esc(statusLabel(x.status)) : ''}</div>${flags.length ? `<div class="muted fl">${flags.map(f => esc(zhNote(f))).join('<br>')}</div>` : ''}</td>
        <td class="u-size">${bb}${x.sqft ? `<div class="muted">${x.sqft.toLocaleString()} ft²</div>` : ''}</td>
        <td class="r u-rent">${rent}${per}</td>
        <td class="u-when">${esc(moveIn(x.avail))}${termRedundant(x) ? '' : `<div class="muted">${esc(termLabel(x.term))}</div>`}</td>
      </tr>`;
    };
    // Group by bedroom count (shared rooms separately)
    const groups = new Map();
    ls.slice().sort((a, b) => (a.beds ?? 99) - (b.beds ?? 99) || (a.shared ? 1 : 0) - (b.shared ? 1 : 0) || (a.rent || 1e9) - (b.rent || 1e9))
      .forEach(x => { const k = `${x.shared ? 'S' : ''}${x.beds ?? '?'}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); });
    const range = (vals, f = money) => { const v = vals.filter(n => n != null); if (!v.length) return ''; const lo = Math.min(...v), hi = Math.max(...v); return lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`; };
    const openAll = ls.length <= 8;
    const units = [...groups.entries()].map(([k, xs], gi) => {
      const b = xs[0].beds;
      const label = (xs[0].shared ? (zh ? '合住 · ' : 'Shared · ') : '') + (b == null ? '?' : b === 0 ? (zh ? '单间' : 'Studio') : zh ? `${b} 卧` : `${b} bedroom${b > 1 ? 's' : ''}`);
      const unitMode = state.basis === 'unit';
      const pp = range(xs.map(unitMode ? unitRent : x => x.per_bed));
      const sq = range(xs.map(x => x.sqft), v => v.toLocaleString());
      // Distinct floor plan drawings in this group
      const fps = [...new Map(xs.filter(x => x.fpimg).map(x => [x.fpimg, x])).values()].slice(0, 10);
      const summary = [
        zh ? `${xs.length} 个` : `${xs.length} listed`,
        pp ? (zh ? `${unitMode ? '整套' : '每人'} ${pp}` : `${pp} ${unitMode ? 'whole unit' : 'per person'}`) : (zh ? '价格未公开' : 'no price posted'),
        sq ? `${sq} ft²` : '',
        fps.length ? (zh ? '有户型图' : 'floor plans') : '',
      ].filter(Boolean).join(' · ');
      const strip = fps.length ? `<div class="fp-strip">${fps.map(x => `<button type="button" class="fp-thumb" data-img="${esc(x.fpimg)}" data-cap="${esc(fpCap(x))}"><img src="${esc(x.fpimg)}" alt="${esc(fpCap(x))}" loading="lazy" onerror="this.parentElement.remove()"><span>${esc(fpName(x))}</span></button>`).join('')}</div>` : '';
      return `<details class="ugroup"${openAll || gi === 0 ? ' open' : ''}><summary><b>${label}</b><span>${esc(summary)}</span></summary>
        ${strip}<table class="units"><tbody>${xs.map(unitRow).join('')}</tbody></table></details>`;
    }).join('');
    const unitMode = state.basis === 'unit';
    const ppAll = range(ls.map(unitMode ? unitRent : x => x.per_bed));
    const bedsAll = bedsSummary(ls);
    const terms = [...new Set(ls.map(x => x.term).filter(Boolean))].filter(t => t !== 'past date').slice(0, 2);
    const overview = [ppAll ? (zh ? `${unitMode ? '整套' : '每人'} ${ppAll}` : `${ppAll} ${unitMode ? 'whole unit' : 'per person'}`) : '', bedsAll, zh ? `${ls.length} 个户型` : `${ls.length} listed`, ...terms.map(termLabel)]
      .filter(Boolean).map(s => `<span>${esc(s)}</span>`).join('');
    const facts = [
      ['utilities', zh ? '含的水电' : 'Included', p.utilities],
      ['tenant_pays', zh ? '租客自付' : 'Tenant pays', p.tenant_pays],
      ['pets', zh ? '宠物' : 'Pets', p.pets],
      ['parking', zh ? '停车' : 'Parking', p.parking],
      ['laundry', zh ? '洗衣' : 'Laundry', p.laundry],
      ['ac', zh ? '空调' : 'Air conditioning', p.ac],
      ['furnished', zh ? '家具' : 'Furnished', p.furnished],
      ['deposit', zh ? '押金' : 'Deposit', p.deposit ? money(p.deposit) : null],
    ].map(([k, l, v]) => `<dt>${l}</dt><dd>${factVal(p, k, v)}</dd>`).join('');
    const utilTxt = p.utilities_text ? `<dt>${zh ? '原文' : 'As written'}</dt><dd>${esc(p.utilities_text.slice(0, 220))}</dd>` : '';
    const fees = p.fees ? `<dt>${zh ? '费用' : 'Fees'}</dt><dd>${p.fees.map(esc).join('<br>')}${provTag(p, 'fees')}</dd>` : '';
    const issues = [];
    const gapList = (p.gaps || []);
    if (gapList.length) issues.push(`<p><b>${zh ? '缺失：' : 'Missing:'}</b> ${gapList.map(g => esc(zhNote(g))).join(zh ? '、' : ', ')}</p>`);
    const unclear = [...(p.conflicts || []), ...(p.stale || [])];
    if (unclear.length) issues.push(`<p><b>${zh ? '不清楚 / 可能过期：' : 'Unclear or possibly outdated:'}</b></p><ul>${unclear.map(u => `<li>${esc(zhNote(u))}</li>`).join('')}</ul>`);
    const banners = [...new Set(p.listings.flatMap(x => (x.notes || []).filter(n => /^Site banner:/.test(n))))];
    if (banners.length) issues.push(`<p><b>${zh ? '官网公告' : 'Landlord site says'}:</b> ${banners.map(b => esc(b.replace(/^Site banner:\s*/, ''))).join(' / ')}</p>`);
    if (p.uw_dupes_hidden) issues.push(`<p>${zh ? `另有 ${p.uw_dupes_hidden} 条 UW 列表重复数据已隐藏（以官网为准）。` : `${p.uw_dupes_hidden} duplicate rows from the UW list are hidden in favor of the landlord site.`}</p>`);
    const photos = (p.photos || []).slice(0, 6).map(u => `<img src="${esc(u)}" alt="" loading="lazy" onerror="this.remove()">`).join('');
    const uwLink = (p.links || []).find(([l]) => /UW Off-Campus/.test(l));
    const contact = [
      p.phone ? `<a href="tel:${esc(p.phone.replace(/[^\d+]/g, ''))}">${esc(p.phone)}</a>` : '',
      p.email ? `<span>${esc(p.email)}</span>` : '',
      p.landlord_site ? `<a href="${esc(p.landlord_site)}" target="_blank" rel="noopener">${zh ? '房东官网' : 'Landlord website'}</a>` : '',
      p.contact_hidden && uwLink ? `<a href="${esc(uwLink[1])}" target="_blank" rel="noopener">${zh ? '通过 UW 租房列表联系房东' : 'Contact through the UW listing'}</a>` : '',
    ].filter(Boolean).join('');
    const dr = $('drawer');
    dr.innerHTML = `<div class="dhead"><h2>${esc(p.name || p.address)}</h2><button class="close" aria-label="Close">×</button></div>
      <p class="addr">${esc(p.name ? p.address || '' : '')}${p.name && p.address ? ', ' : ''}${esc(p.city)} ${esc(p.zip || '')} — ${esc(p.landlord || (zh ? '房东未知' : 'Landlord unknown'))}</p>
      ${overview ? `<div class="overview">${overview}</div>` : ''}
      <div class="contact">${contact || `<span class="nostate">${zh ? '没找到联系方式' : 'No contact found'}</span>`}</div>
      <div class="walk">${F().walk(walkMin(d), d.toFixed(2), esc(state.ref))}${p.geo && p.geo.startsWith('nominatim') ? `<br><small>${zh ? '位置为近似值（按地址检索）' : 'Approximate location (geocoded)'}</small>` : ''}${placesBlock(p)}</div>
      ${busBlock(p)}
      ${photos ? `<div class="photos">${photos}</div>` : ''}
      ${issues.length ? `<div class="issues">${issues.join('')}</div>` : ''}
      <h4>${zh ? '户型与价格' : 'Units and prices'}</h4>
      ${units}
      ${hiddenShared ? `<p class="hidden-note">${zh ? `另有 ${hiddenShared} 个合住价格（两人一间）未显示，关掉左侧"不算合住"可查看。` : `${hiddenShared} shared-room prices (two people per bedroom) are hidden; turn off "Leave out shared rooms" to see them.`}</p>` : ''}
      <h4>${zh ? '条件' : 'Terms'}</h4>
      <dl class="facts">${facts}${utilTxt}${fees}</dl>
      ${p.amenities ? `<h4>${zh ? '设施（原文）' : 'Amenities'}</h4><p class="desc">${p.amenities.filter(a => !/^[\d.,$\s]+$/.test(a)).map(esc).join(', ')}</p>` : ''}
      ${p.description ? `<h4>${zh ? '描述（原文）' : 'Description'}</h4><p class="desc">${esc(p.description.slice(0, 1500))}</p>` : ''}
      <h4>${zh ? '数据来源' : 'Where this came from'}</h4>
      <ol class="srcs">${(p.links || []).map(([l, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(l)}</a></li>`).join('')}</ol>`;
    dr.hidden = false;
    document.body.classList.add('m-drawer');
    dr.scrollTop = 0;
    dr.querySelector('.close').onclick = closeDrawer;
    document.querySelectorAll('.res.sel').forEach(e => e.classList.remove('sel'));
    const li = document.querySelector(`.res[data-id="${CSS.escape(id)}"]`);
    if (li) { li.classList.add('sel'); if (!pan) li.scrollIntoView({ block: 'nearest' }); }
    markers.forEach((m, k) => m.setRadius(k === id ? 9 : 6));
    markSel();
    drawPlaceLines(p);
    if (pan) map.panTo([p.lat, p.lng]);
  }
  // Floor plan drawings open full size
  function openLightbox(src, cap) {
    $('lb-img').src = src;
    $('lb-img').alt = cap || '';
    $('lb-cap').textContent = cap || '';
    $('lightbox').hidden = false;
    $('lb-close').focus();
    track('plan', { p: state.sel });
  }
  function closeLightbox() { $('lightbox').hidden = true; $('lb-img').removeAttribute('src'); }
  $('lightbox').onclick = e => { if (e.target === $('lightbox') || e.target.closest('#lb-close')) closeLightbox(); };
  $('drawer').addEventListener('click', e => {
    const b = e.target.closest('[data-img]');
    if (b) openLightbox(b.dataset.img, b.dataset.cap);
  });
  function closeDrawer() {
    $('drawer').hidden = true;
    document.body.classList.remove('m-drawer');
    if (phone.matches && !document.body.classList.contains('m-list')) setTimeout(() => map.invalidateSize(), 0);
    state.sel = null;
    markers.forEach(m => m.setRadius(6));
    markSel();
    lineLayer.clearLayers();
    document.querySelectorAll('.res.sel').forEach(e => e.classList.remove('sel'));
  }

  // ---------- controls
  const refSel = $('ref');
  // ---------- my places (saved in this browser only)
  let places = [];
  try { places = (JSON.parse(safeGet('places') || '[]') || []).filter(x => x && x.id && isFinite(x.lat) && isFinite(x.lng)); } catch { places = []; }
  const savePlaces = () => safeSet('places', JSON.stringify(places));
  const placeLayer = L.layerGroup().addTo(map);
  const lineLayer = L.layerGroup().addTo(map);
  const previewLayer = L.layerGroup().addTo(map);
  const pinIcon = (name, cls) => L.divIcon({ className: '', html: `<div class="place-pin ${cls || ''}"><span>${esc(name)}</span></div>`, iconSize: [0, 0], iconAnchor: [0, 0] });
  const mi2 = d => `${d.toFixed(2)}${lang === 'zh' ? ' 英里' : ' mi'}`;

  function fillRef() {
    refSel.innerHTML = '';
    Object.keys(LM).forEach(k => refSel.add(new Option(k, k)));
    if (places.length) {
      const g = document.createElement('optgroup');
      g.label = lang === 'zh' ? '我常去的地方' : 'My places';
      places.forEach(pl => g.appendChild(new Option(pl.name, 'place:' + pl.id)));
      refSel.appendChild(g);
    }
    refSel.value = state.refKey;
  }
  function setRef(key, save = true) {
    const pl = key.startsWith('place:') ? places.find(x => 'place:' + x.id === key) : null;
    if (pl) { state.ref = pl.name; state.refPt = [pl.lat, pl.lng]; }
    else { if (!LM[key]) key = 'Bascom Hall'; state.ref = key; state.refPt = LM[key]; }
    state.refKey = key;
    refSel.value = key;
    if (save) safeSet('ref', key);
  }
  function refChanged() { drawRings(); renderPlaces(); render(); if (state.sel) select(state.sel, false); }
  refSel.onchange = () => { setRef(refSel.value); refChanged(); };

  function renderPlaces() {
    const zh = lang === 'zh';
    placeLayer.clearLayers();
    places.forEach(pl => {
      const key = 'place:' + pl.id, on = state.refKey === key;
      L.marker([pl.lat, pl.lng], { icon: pinIcon(pl.name, on ? 'ref' : ''), keyboard: false, zIndexOffset: 1000 })
        .bindTooltip(on ? (zh ? '距离从这里算，再点一下取消' : 'Distances are measured from here; click again to stop') : (zh ? '点一下，从这里算距离' : 'Click to measure distances from here'), { direction: 'top', offset: [0, -30] })
        .on('click', () => { setRef(on ? 'Bascom Hall' : key); refChanged(); })
        .addTo(placeLayer);
    });
    $('place-chips').innerHTML = places.length
      ? places.map(pl => `<span class="pchip${state.refKey === 'place:' + pl.id ? ' on' : ''}" data-id="${esc(pl.id)}"><button type="button" class="pc-name" title="${zh ? '从这里算距离' : 'Measure distances from here'}">${esc(pl.name)}</button><button type="button" class="pc-x" aria-label="${zh ? '删除' : 'Remove'} ${esc(pl.name)}">×</button></span>`).join('')
      : `<span class="place-hint">${zh ? '加上实验室、健身房或打工的地方，就能看到每套房到那里的直线距离。' : 'Add your lab, gym or job to see how far each rental is from it.'}</span>`;
  }
  $('place-chips').onclick = e => {
    const chip = e.target.closest('.pchip');
    if (!chip) return;
    const key = 'place:' + chip.dataset.id;
    if (e.target.closest('.pc-x')) {
      places = places.filter(x => 'place:' + x.id !== key);
      savePlaces();
      if (state.refKey === key) setRef('Bascom Hall');
      fillRef(); refChanged(); renderLegend();
      return;
    }
    setRef(state.refKey === key ? 'Bascom Hall' : key);
    refChanged();
    const pl = places.find(x => 'place:' + x.id === key);
    if (pl && !phone.matches) map.panTo([pl.lat, pl.lng]);
  };
  // Straight-line distance from a rental to each place: list line, drawer rows, dashed lines on the map
  const placeDistLine = p => places.length ? `<span class="pd">${places.slice(0, 3).map(pl => `<span class="nw">${esc(pl.name)} ${mi2(miles([p.lat, p.lng], [pl.lat, pl.lng]))}</span>`).join(' · ')}</span>` : '';
  function placesBlock(p) {
    const zh = lang === 'zh';
    const others = places.filter(pl => 'place:' + pl.id !== state.refKey);
    if (!others.length) return '';
    return `<ul class="pdist">${others.map(pl => {
      const d = miles([p.lat, p.lng], [pl.lat, pl.lng]);
      return `<li><b>${esc(pl.name)}</b><span>${zh ? `直线 ${mi2(d)} · 步行约 ${walkMin(d)} 分钟` : `${mi2(d)} straight line · about ${walkMin(d)} min walk`}</span></li>`;
    }).join('')}</ul>`;
  }
  function drawPlaceLines(p) {
    lineLayer.clearLayers();
    if (!p || !places.length) return;
    const ink = cssVar('ink');
    places.forEach(pl => {
      const a = [p.lat, p.lng], b = [pl.lat, pl.lng];
      L.polyline([a, b], { color: ink, weight: 2.5, opacity: 0.85, dashArray: '1 7', lineCap: 'round', interactive: false }).addTo(lineLayer);
      L.marker([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], { interactive: false, keyboard: false, icon: L.divIcon({ className: '', html: `<span class="dist-tag">${mi2(miles(a, b))}</span>`, iconSize: [0, 0] }) }).addTo(lineLayer);
    });
  }

  // Adding a place: search, click the map, or the device location
  let picking = false, pickCb = null, pickFromList = false, pending = null, searchSeq = 0;
  function startPick(cb) {
    picking = true; pickCb = cb;
    pickFromList = phone.matches && document.body.classList.contains('m-list');
    if (pickFromList) { document.body.classList.remove('m-list'); setViewSwitch(); setTimeout(() => map.invalidateSize(), 0); }
    $('pick-hint').hidden = false;
    map.getContainer().classList.add('picking');
  }
  function stopPick() {
    picking = false; pickCb = null;
    $('pick-hint').hidden = true;
    map.getContainer().classList.remove('picking');
    if (pickFromList) { document.body.classList.add('m-list'); setViewSwitch(); pickFromList = false; }
  }
  $('pick-cancel').onclick = stopPick;
  map.on('click', e => {
    if (!picking) return;
    const cb = pickCb;
    stopPick();
    if (cb) cb(e.latlng);
  });
  const placeMsg = t => { $('place-msg').textContent = t || ''; $('place-msg').hidden = !t; };
  function resetPending() {
    pending = null;
    $('place-name-row').hidden = true;
    $('place-results').innerHTML = '';
    placeMsg('');
    previewLayer.clearLayers();
  }
  function openPlaceForm(open) {
    $('place-form').hidden = !open;
    $('place-add').setAttribute('aria-expanded', open);
    if (!open) { resetPending(); $('place-q').value = ''; if (picking) stopPick(); }
  }
  $('place-add').onclick = () => { const open = $('place-form').hidden; openPlaceForm(open); if (open && !phone.matches) $('place-q').focus(); };
  function choose(lat, lng, name, how) {
    resetPending();
    pending = { lat, lng, how };
    $('place-name').value = name || '';
    $('place-name-row').hidden = false;
    L.marker([lat, lng], { icon: pinIcon(name || (lang === 'zh' ? '新地点' : 'New place'), 'preview'), interactive: false, keyboard: false, zIndexOffset: 1100 }).addTo(previewLayer);
    if (!phone.matches) map.setView([lat, lng], Math.max(map.getZoom(), 15));
    setTimeout(() => { $('place-name').focus(); $('place-name').select(); }, 0);
  }
  $('place-save').onclick = () => {
    if (!pending) return;
    const zh = lang === 'zh';
    const name = ($('place-name').value.trim() || (zh ? `地点 ${places.length + 1}` : `Place ${places.length + 1}`)).slice(0, 40);
    places.push({ id: Date.now().toString(36), name, lat: +pending.lat.toFixed(6), lng: +pending.lng.toFixed(6) });
    if (places.length > 10) places.shift();
    savePlaces();
    track('place', { how: pending.how, n: places.length });
    openPlaceForm(false);
    if (state.refKey.startsWith('place:') && !places.some(x => 'place:' + x.id === state.refKey)) setRef('Bascom Hall');
    fillRef(); refChanged(); renderLegend();
  };
  $('place-name').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('place-save').click(); } };
  $('place-cancel').onclick = resetPending;
  $('place-map').onclick = () => startPick(ll => choose(ll.lat, ll.lng, '', 'map'));
  $('place-gps').onclick = () => {
    const zh = lang === 'zh';
    if (!navigator.geolocation) { placeMsg(zh ? '这个浏览器不能提供位置。' : 'This browser cannot share its location.'); return; }
    placeMsg(zh ? '正在定位…' : 'Finding your location…');
    navigator.geolocation.getCurrentPosition(
      pos => choose(pos.coords.latitude, pos.coords.longitude, zh ? '我的位置' : 'My location', 'gps'),
      err => placeMsg(err.code === 1
        ? (zh ? '没有定位权限。在浏览器设置里允许这个网站使用位置，再试一次。' : 'Location access is blocked. Allow it for this site in your browser settings, then try again.')
        : (zh ? '没拿到位置。可以改用搜索，或在地图上点选。' : 'Could not get your location. Search or click the map instead.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  };
  async function searchPlace() {
    const zh = lang === 'zh', q = $('place-q').value.trim();
    if (!q) { $('place-q').focus(); return; }
    const seq = ++searchSeq, ql = q.toLowerCase();
    resetPending();
    placeMsg(zh ? '搜索中…' : 'Searching…');
    // Campus landmarks and rentals on this map first, then OpenStreetMap
    const local = [
      ...Object.entries(LM).filter(([k]) => k.toLowerCase().includes(ql)).map(([k, v]) => ({ name: k, sub: zh ? '校园地标' : 'Campus landmark', lat: v[0], lng: v[1] })),
      ...P.filter(p => p._text.includes(ql)).slice(0, 3).map(p => ({ name: p.name || p.address, sub: p.name ? p.address : '', lat: p.lat, lng: p.lng })),
    ];
    let remote = [];
    try {
      const u = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({ q, format: 'jsonv2', addressdetails: '1', limit: '6', countrycodes: 'us', viewbox: '-89.60,43.20,-89.20,42.95', bounded: '1', 'accept-language': 'en' });
      const r = await fetch(u);
      if (r.ok) remote = (await r.json()).map(h => {
        const a = h.address || {};
        const street = [a.house_number, a.road].filter(Boolean).join(' ');
        return { name: h.name || street || (h.display_name || '').split(', ')[0], sub: [h.name ? street : '', a.city || a.town || a.village || ''].filter(Boolean).join(', '), lat: +h.lat, lng: +h.lon };
      });
    } catch { /* offline or blocked */ }
    if (seq !== searchSeq) return;
    // Same name within ~500 ft counts as one result
    const res = [];
    [...local, ...remote].forEach(h => { if (!res.some(r => r.name.toLowerCase() === h.name.toLowerCase() && miles([r.lat, r.lng], [h.lat, h.lng]) < 0.1)) res.push(h); });
    res.splice(8);
    placeMsg(res.length ? '' : (zh ? '没找到。试试英文名或门牌地址，或者在地图上点选。' : 'No match. Try the English name or a street address, or click the map.'));
    $('place-results').innerHTML = res.map((h, i) => `<li><button type="button" data-i="${i}"><b>${esc(h.name)}</b>${h.sub ? `<span>${esc(h.sub)}</span>` : ''}</button></li>`).join('');
    $('place-results').onclick = e => { const b = e.target.closest('button[data-i]'); if (b) { const h = res[+b.dataset.i]; choose(h.lat, h.lng, h.name, 'search'); } };
  }
  $('place-search').onclick = searchPlace;
  $('place-q').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); searchPlace(); } };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (!$('lightbox').hidden) closeLightbox(); else if (picking) stopPick(); else closeDrawer(); }
  });

  $('q').oninput = e => { state.q = e.target.value; render(); };
  $('beds').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const k = +b.dataset.b;
    state.beds.has(k) ? state.beds.delete(k) : state.beds.add(k);
    b.classList.toggle('on'); render();
  };
  $('basis').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    state.basis = b.dataset.basis;
    $('basis').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    setPriceRange(); renderLegend(); render();
  };
  // Two thumbs on one track; neither may pass the other
  $('price-min').oninput = e => { state.priceMin = Math.min(+e.target.value, state.price - +e.target.step); e.target.value = state.priceMin; render(); };
  $('price').oninput = e => { state.price = Math.max(+e.target.value, state.priceMin + +e.target.step); e.target.value = state.price; render(); };
  $('dist').oninput = e => { state.dist = +e.target.value; render(); };
  $('term').onchange = e => { state.term = e.target.value; render(); };
  $('sort').onchange = e => { state.sort = e.target.value; render(); };
  const CHK = { 'f-priced': 'priced', 'f-heat': 'heat', 'f-allutil': 'allutil', 'f-net': 'net', 'f-cats': 'cats', 'f-dogs': 'dogs', 'f-inunit': 'inunit', 'f-parking': 'parking', 'f-furn': 'furn', 'f-ac': 'ac' };
  Object.entries(CHK).forEach(([id, k]) => { $(id).onchange = e => { state.checks[k] = e.target.checked; render(); }; });
  $('f-noshared').checked = state.noShared;
  $('f-noshared').onchange = e => {
    state.noShared = e.target.checked; safeSet('noshared', state.noShared ? '1' : '0');
    renderLegend(); render();
    if (state.sel) select(state.sel, false);
  };
  const llSel = $('landlord');
  const llCount = {};
  P.forEach(p => { if (p.landlord) llCount[p.landlord] = (llCount[p.landlord] || 0) + 1; });
  Object.entries(llCount).sort((a, b) => b[1] - a[1]).forEach(([n, c]) => llSel.add(new Option(`${n} (${c})`, n)));
  llSel.onchange = e => { state.landlord = e.target.value; render(); };
  $('reset').onclick = () => {
    Object.assign(state, { q: '', beds: new Set(), price: state.basis === 'bed' ? 3000 : 12000, dist: 2, term: '', sort: 'dist', landlord: '', checks: {}, noShared: true });
    $('f-noshared').checked = true; safeSet('noshared', '1');
    $('q').value = ''; $('beds').querySelectorAll('button').forEach(b => b.classList.remove('on'));
    setPriceRange(); $('dist').value = 2; $('term').value = ''; $('sort').value = 'dist'; llSel.value = '';
    Object.keys(CHK).forEach(id => { $(id).checked = false; });
    render();
  };
  $('results').onclick = e => { const li = e.target.closest('.res'); if (li) select(li.dataset.id); };
  $('results').onkeydown = e => { if (e.key === 'Enter') { const li = e.target.closest('.res'); if (li) select(li.dataset.id); } };

  $('export').onclick = () => {
    const cols = ['landlord', 'name', 'address', 'unit', 'plan', 'beds', 'baths', 'sqft', 'rent', 'rent_max', 'basis', 'per_bed', 'avail', 'term', 'status', 'dist_mi', 'utilities', 'pets', 'parking', 'laundry', 'phone', 'email', 'source_url'];
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [cols.join(',')];
    current.forEach(p => p._ls.forEach(x => rows.push([p.landlord, p.name, p.address, x.unit, x.plan, x.beds, x.baths, x.sqft, x.rent, x.rent_max, x.basis, x.per_bed, x.avail, x.term, x.status, p._d.toFixed(2), (p.utilities || []).join(' '), p.pets, p.parking, p.laundry, p.phone, p.email, x.url].map(q).join(','))));
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'madison-rentals.csv' });
    a.click(); URL.revokeObjectURL(a.href);
    track('csv', { n: current.length });
  };

  // ---------- legend + header stats
  function renderLegend() {
    const zh = lang === 'zh';
    const lgOpen = safeGet('legend') ? safeGet('legend') === '1' : !matchMedia('(max-width: 860px)').matches;
    $('legend').classList.toggle('closed', !lgOpen);
    const unitMode = state.basis === 'unit';
    const head = unitMode ? (zh ? '整套最低月租' : 'Lowest whole-unit rent')
      : state.noShared ? (zh ? '每人最低月租（一人一间）' : 'Lowest rent, own bedroom') : (zh ? '每人最低月租（含合住）' : 'Lowest rent per person, incl. shared');
    $('legend').innerHTML = `<button class="lg-head" type="button" aria-expanded="${lgOpen}">${head}</button><div class="lg-body">` +
      (unitMode ? [['p1', '< $1,500'], ['p2', '$1,500–2,499'], ['p3', '$2,500–3,499'], ['p4', '$3,500–4,999'], ['p5', '$5,000+']]
        : [['p1', '< $900'], ['p2', '$900–1,199'], ['p3', '$1,200–1,499'], ['p4', '$1,500–1,899'], ['p5', '$1,900+']]).map(([c, t]) => `<span class="row"><i style="background:var(--${c})"></i>${t}</span>`).join('') +
      `<span class="row"><i style="border:2px solid var(--p0)"></i>${zh ? '未公开价格' : 'No price posted'}</span>` +
      `<span class="row"><i style="background:var(--badger);border-radius:0;transform:rotate(45deg)"></i>${zh ? '参考点（圈 = 0.5 英里）' : 'Reference point, rings every 0.5 mi'}</span>` +
      (places.length ? `<span class="row"><i class="lg-place"></i>${zh ? '我常去的地方' : 'My places'}</span>` : '') +
      (TR ? `<label class="row lg-bus"><input type="checkbox" id="lg-bus"${showBus ? ' checked' : ''}><span class="bus-stop sm">${BUS_SVG}</span>${zh ? '公交站（放大后显示）' : 'Bus stops (zoom in to see)'}</label>` : '') + '</div>';
    $('legend').querySelector('.lg-head').onclick = () => { safeSet('legend', $('legend').classList.contains('closed') ? '1' : '0'); renderLegend(); };
    if ($('lg-bus')) $('lg-bus').onchange = e => { showBus = e.target.checked; safeSet('bus', showBus ? '1' : '0'); syncBus(); };
    $('stat-props').innerHTML = F().props(META.properties);
    $('stat-units').innerHTML = F().units(META.listings);
  }

  // ---------- tabs
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + t.dataset.view));
    if (t.dataset.view !== 'map') track('tab', { t: t.dataset.view });
    if (t.dataset.view === 'map') setTimeout(() => map.invalidateSize(), 0);
    if (t.dataset.view === 'gaps') renderGaps();
    if (t.dataset.view === 'sources') renderSources();
  });

  // ---------- gaps view
  const QUESTIONS = {
    'rent': ['What is the monthly rent for each unit or floor plan for the 2027–28 lease year?', '2027–28 每个户型的月租是多少？'],
    '2027-28 availability/pricing': ['Which units are available for a lease starting August 2027, and when will 2027–28 pricing be posted?', '哪些单元 2027 年 8 月起可租？2027–28 价格何时公布？'],
    'available date': ['What is the lease start (move-in) date?', '起租/入住日期是哪天？'],
    'utilities included': ['Which utilities are included in rent (heat, hot water, electricity, water/sewer, internet, trash), and are there flat utility fees?', '房租包含哪些水电网？有没有固定的水电费？'],
    'pet policy': ['What is the pet policy (cats, dogs, pet rent or deposit)?', '宠物政策是什么（猫、狗、宠物租金/押金）？'],
    'parking': ['Is parking available, and how much is it per month?', '有没有停车位？每月多少钱？'],
    'laundry': ['Is laundry in the unit, shared in the building, or not available? Is it free or coin/card?', '洗衣机在室内、楼内公用还是没有？免费还是投币？'],
    'square footage': ['What is the square footage of each unit?', '每个单元多少平方英尺？'],
    'air conditioning': ['Do the units have air conditioning (central, window unit, or none)?', '有没有空调（中央/窗式/没有）？'],
    'air conditioning (not listed)': ['Your listing does not mention air conditioning. Do the units have AC?', '房源没提空调，到底有没有？'],
    'furnished?': ['Are the units furnished, unfurnished, or is furniture optional?', '带不带家具？可选吗？'],
    'furnished? (not listed)': ['Your listing does not mention furniture. Are the units furnished?', '房源没提家具，是否带家具？'],
    'contact info': ['(No phone or email found — find a contact first.)', '（没找到电话或邮箱，先找联系方式）'],
    'rent basis (per person or whole unit)': ['Is the listed rent for the whole unit or per person?', '标价是整套的还是每人的？'],
  };
  const byLL = {};
  P.forEach(p => { if (p.gaps || p.conflicts || p.stale) (byLL[p.landlord || '(landlord unknown)'] ||= []).push(p); });
  let gapSel = null;
  function renderGaps() {
    const zh = lang === 'zh';
    const tot = {};
    P.forEach(p => (p.gaps || []).forEach(g => { tot[g] = (tot[g] || 0) + 1; }));
    $('gap-summary').innerHTML = `<table class="sumtbl">${Object.entries(tot).sort((a, b) => b[1] - a[1]).map(([g, n]) => `<tr><td>${esc(zh ? (QUESTIONS[g] || [g, g])[1].replace(/？.*$/, '') : g)}</td><td>${n}</td></tr>`).join('')}</table>`;
    const lls = Object.entries(byLL).sort((a, b) => b[1].length - a[1].length);
    $('gap-landlords').innerHTML = lls.map(([ll, ps]) => `<li data-ll="${esc(ll)}" class="${ll === gapSel ? 'sel' : ''}"><span>${esc(ll)} ${safeGet('emailed:' + ll) ? `<span class="done">${zh ? '已发' : 'emailed'}</span>` : ''}</span><span>${ps.length}</span></li>`).join('');
    $('gap-landlords').onclick = e => { const li = e.target.closest('li'); if (li) { gapSel = li.dataset.ll; renderGaps(); } };
    if (!gapSel) gapSel = lls[0][0];
    renderGapDetail(gapSel);
  }
  function draftEmail(ll, ps) {
    const counts = {};
    ps.forEach(p => (p.gaps || []).forEach(g => { counts[g] = (counts[g] || 0) + 1; }));
    const qs = Object.entries(counts).filter(([g]) => g !== 'contact info').sort((a, b) => b[1] - a[1]).map(([g]) => '- ' + (QUESTIONS[g] || [g])[0]);
    const basisQ = ps.filter(p => (p.stale || []).some(s => /rent basis/i.test(s)));
    if (basisQ.length) qs.unshift(`- Is the listed rent per person or for the whole unit? (${basisQ.map(p => p.name || p.address).slice(0, 6).join('; ')})`);
    const list = ps.slice(0, 25).map(p => `- ${p.name ? p.name + ', ' : ''}${p.address || ''}`);
    return `Subject: Questions about your campus-area rentals for 2027–28\n\nHi ${ll},\n\nI'm a UW–Madison student looking for housing for the 2027–28 school year. I'm interested in these properties:\n${list.join('\n')}${ps.length > 25 ? `\n(and ${ps.length - 25} more)` : ''}\n\nI couldn't find the following on your listings:\n${qs.join('\n')}\n\nThank you!\n`;
  }
  function renderGapDetail(ll) {
    const zh = lang === 'zh';
    const ps = (byLL[ll] || []).slice().sort((a, b) => a.dist - b.dist);
    const p0 = ps.find(p => p.email) || ps.find(p => p.phone) || ps[0] || {};
    const site = (ps.find(p => p.landlord_site) || {}).landlord_site;
    const counts = {};
    ps.forEach(p => (p.gaps || []).forEach(g => { counts[g] = (counts[g] || 0) + 1; }));
    const done = !!safeGet('emailed:' + ll);
    $('gap-detail').innerHTML = `<h2>${esc(ll)}</h2>
      <p>${p0.email ? `${zh ? '邮箱' : 'Email'}: <b>${esc(p0.email)}</b>` : (zh ? '没找到邮箱' : 'No email found')}${p0.phone ? ` — ${zh ? '电话' : 'phone'} ${esc(p0.phone)}` : ''}${site ? ` — <a href="${esc(site)}" target="_blank" rel="noopener">${zh ? '官网' : 'website'}</a>` : ''}</p>
      <h4>${zh ? '要问的问题' : 'Questions to ask'}</h4>
      <ul class="q">${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([g, n]) => `<li>${esc((QUESTIONS[g] || [g, g])[zh ? 1 : 0])} <span class="muted">(${n})</span></li>`).join('')}</ul>
      <div class="btns">
        <button class="btn" id="copy-draft">${zh ? '复制英文邮件草稿' : 'Copy email draft'}</button>
        <label><input type="checkbox" id="emailed" ${done ? 'checked' : ''}> ${zh ? '已发邮件' : 'Emailed'}</label>
      </div>
      <textarea class="draft" id="draft" aria-label="Email draft">${esc(draftEmail(ll, ps))}</textarea>
      <h4>${zh ? '物业' : 'Properties'} (${ps.length})</h4>
      <table class="gtable"><thead><tr><th>${zh ? '物业' : 'Property'}</th><th>${zh ? '缺失' : 'Missing'}</th><th>${zh ? '不清楚 / 可能过期' : 'Unclear or outdated'}</th></tr></thead><tbody>
      ${ps.map(p => `<tr><td><a data-go="${esc(p.id)}">${esc(p.name ? p.name + ' — ' : '')}${esc(p.address || '')}</a></td><td>${esc((p.gaps || []).map(zhNote).join(zh ? '、' : ', ') || '—')}</td><td>${esc([...(p.conflicts || []), ...(p.stale || [])].map(zhNote).join(zh ? '；' : '; ') || '—')}</td></tr>`).join('')}
      </tbody></table>`;
    $('copy-draft').onclick = async () => {
      track('draft', { ll });
      try { await navigator.clipboard.writeText($('draft').value); $('copy-draft').textContent = zh ? '已复制' : 'Copied'; }
      catch { $('draft').select(); }
    };
    $('emailed').onchange = e => { e.target.checked ? safeSet('emailed:' + ll, TODAY_ISO()) : (() => { try { localStorage.removeItem('isthmus:emailed:' + ll); } catch { } })(); renderGaps(); };
    $('gap-detail').querySelectorAll('a[data-go]').forEach(a => a.onclick = () => {
      document.querySelector('.tab[data-view="map"]').click();
      setTimeout(() => { const p = P.find(x => x.id === a.dataset.go); map.setView([p.lat, p.lng], 17); select(p.id); }, 50);
    });
  }
  const TODAY_ISO = () => new Date().toISOString().slice(0, 10);

  // ---------- sources view
  function renderSources() {
    const zh = lang === 'zh';
    const s = META.sources, lab = META.source_labels;
    const rows = Object.entries(s).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<tr><td>${esc(lab[k] || k)}</td><td class="r">${n}</td></tr>`).join('');
    const llRows = Object.entries(llCount).sort((a, b) => b[1] - a[1]).map(([n, c]) => `<tr><td>${esc(n)}</td><td class="r">${c}</td></tr>`).join('');
    $('sources').innerHTML = zh ? `
      <h2>数据从哪来</h2>
      <p>数据于 <b>${esc(META.built)}</b> 抓取，范围是 Bascom Hall 周围 ${META.radius_mi} 英里（直线）。房东官网优先；UW 校外租房列表（offcampushousing.wisc.edu）补充没有官网数据的房东。同一单元两边都有时，以官网为准，UW 那条隐藏。</p>
      <p>每个字段旁边的小标签说明它从哪来：<span class="prov official">官网</span> 房东网站的结构化字段；<span class="prov uw">UW 列表</span> UW 校外租房服务；<span class="prov inferred">推断</span> 从房源描述文字里读出来的；<span class="prov absent">未列出</span> 设施清单里没提，需要向房东确认。没有任何来源的值显示为 <span class="nostate">未说明</span>。</p>
      <p>步行时间按直线距离 × 1.25、每小时 3 英里估算，只作参考。</p>
      ${TR ? `<p>公交站和线路来自 Madison Metro 官方 GTFS 数据（${esc(TR.built)} 下载）。「我常去的地方」只存在你自己的浏览器里；搜索地址时，搜索词会发给 OpenStreetMap 的 Nominatim 服务。</p>` : ''}` : `
      <h2>Where the data comes from</h2>
      <p>Collected on <b>${esc(META.built)}</b> for everything within ${META.radius_mi} miles (straight line) of Bascom Hall. Landlord websites come first; the UW off-campus listing service (offcampushousing.wisc.edu) fills in landlords without a site we can read. When the same unit appears in both, the landlord site wins and the UW row is hidden.</p>
      <p>The small mark next to each value says where it came from: <span class="prov official">site</span> a structured field on the landlord website; <span class="prov uw">UW list</span> the UW off-campus listing service; <span class="prov inferred">inferred</span> read from the listing's description text; <span class="prov absent">not listed</span> missing from an otherwise complete amenity list, so worth confirming. Values no source gives show as <span class="nostate">Not stated</span>.</p>
      <p>Walking times assume 1.25× the straight-line distance at 3 mph. Treat them as estimates.</p>
      ${TR ? `<p>Bus stops and routes come from Madison Metro's GTFS feed (downloaded ${esc(TR.built)}). Your places are saved only in this browser; address searches are sent to OpenStreetMap's Nominatim service.</p>` : ''}`;
    $('sources').innerHTML += `<h2>${zh ? '各来源条数' : 'Rows by source'}</h2><table><tbody>${rows}</tbody></table>
      <h2>${zh ? '各房东物业数' : 'Properties by landlord'}</h2><table><tbody>${llRows}</tbody></table>
      ${META.no_geo && META.no_geo.length ? `<h2>${zh ? '无法定位' : 'Could not be placed on the map'}</h2><ul>${META.no_geo.map(([a, b]) => `<li>${esc(a)}: ${esc(b)}</li>`).join('')}</ul>` : ''}
      ${TRACK ? `<h2>${zh ? '使用统计' : 'Usage counts'}</h2><p>${zh
        ? '为了改进这个页面，它会匿名记录打开了哪些物业、用了哪些筛选和搜索词。不记录姓名、IP 地址或位置，不使用 cookie，浏览器里只存一个随机编号。'
        : 'To improve this page it records, anonymously, which properties are opened and which filters and searches are used. No names, IP addresses or locations are stored and no cookies are set; the browser keeps only a random ID.'}</p>` : ''}`;
  }

  // ---------- language
  $('lang').onclick = () => {
    lang = lang === 'zh' ? 'en' : 'zh'; safeSet('lang', lang); applyLang(); fillRef(); renderPlaces(); renderLegend(); render();
    track('lang', { to: lang });
    if ($('view-gaps').classList.contains('active')) renderGaps();
    if ($('view-sources').classList.contains('active')) renderSources();
    if (state.sel) select(state.sel, false);
  };

  applyLang();
  setRef(safeGet('ref') || 'Bascom Hall', false);
  fillRef();
  renderPlaces();
  renderLegend();
  drawRings();
  render();
  let refHost = '';
  try { refHost = document.referrer ? new URL(document.referrer).hostname : ''; } catch { /* bad referrer */ }
  track('view', { ref: refHost, w: innerWidth, deep: (location.hash.match(/p=([^&]+)/) || [])[1] || undefined });

  // Admin entry + deep link (#p=<id>) when served by server.py
  if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) {
    fetch('/api/status').then(r => {
      if (!r.ok) return;
      const a = Object.assign(document.createElement('a'), { href: '/admin/', className: 'lang', id: 'admin-link', textContent: lang === 'zh' ? '后台' : 'Admin' });
      a.style.textDecoration = 'none';
      document.querySelector('.top-right').prepend(a);
    }).catch(() => { });
  }
  const deep = decodeURIComponent((location.hash.match(/p=([^&]+)/) || [])[1] || '');
  if (deep && P.some(p => p.id === deep)) {
    const p = P.find(x => x.id === deep);
    map.setView([p.lat, p.lng], 17);
    select(deep, false);
  }
})();
