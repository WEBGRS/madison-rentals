/* Isthmus Rentals — map + filters + data-gap tracker */
(() => {
  const D = window.HOUSING;
  if (!D) { document.body.innerHTML = '<p style="padding:24px">data/properties.js is missing. Run <code>python scraper/run_all.py</code> first.</p>'; return; }
  const P = D.properties.filter(p => !p.hidden), META = D.meta;

  // ---------- i18n
  const ZH = {
    tagline: 'UW–Madison 周边租房', tab_map: '地图', tab_gaps: '缺失信息', tab_sources: '数据来源',
    search_ph: '街道、楼名或房东', bedrooms: '卧室数', studio: '单间', per_person: '每人', whole_unit: '整套',
    pick: '在地图上选我自己的位置', lease: '租期', term_any: '不限', term_2728: '2027 秋季（2027–28）',
    term_now: '现在 / 2026–27 和转租', term_unknown: '未说明', sort: '排序', sort_dist: '最近',
    sort_price: '每人最便宜', sort_rent: '总租金最低', more: '更多筛选', f_priced: '有公开价格',
    f_heat: '含暖气', f_allutil: '全包水电', f_net: '含网络', f_cats: '可养猫', f_dogs: '可养狗',
    f_inunit: '室内洗衣机', f_parking: '提供停车', f_furn: '带家具', f_ac: '有空调', landlord: '房东',
    all_landlords: '全部房东', reset: '重置', export: '下载 CSV', pick_hint: '点击地图设定你的位置，按 Esc 取消。',
    gaps_intro: '下面每个物业都缺少租房需要的信息，或不同来源之间数据冲突。选一个房东，查看要问他们什么。',
  };
  const ZHF = {
    props: n => `<b>${n}</b> 个物业`, units: n => `<b>${n}</b> 个户型/单元`,
    price_lbl: (v, basis) => `${basis === 'bed' ? '每人' : '整套'}最高 <b>${v}</b>`,
    dist_lbl: v => `距离 ≤ <b>${v} 英里</b>`, count: n => `${n} 个物业`,
    from: '起', per_person: '/人', per_unit: '/月', no_price: '未公开价格', walk: (m, mi, r) => `步行约 <b>${m} 分钟</b>（直线 ${mi} 英里）到 ${r}`,
    gaps: n => `${n} 项缺失`, not_stated: '未说明',
  };
  const ENF = {
    props: n => `<b>${n}</b> properties`, units: n => `<b>${n}</b> units & floor plans`,
    price_lbl: (v, basis) => `Max <b>${v}</b> ${basis === 'bed' ? 'per person' : 'whole unit'}`,
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
  const bucket = v => v == null ? 'p0' : BUCKETS.find(b => v >= b[0] && v < b[1])[2];
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue('--' + n).trim();

  // ---------- state
  const LM = META.landmarks;
  const state = {
    q: '', beds: new Set(), basis: 'bed', price: 3000, dist: 2, ref: 'Bascom Hall', refPt: LM['Bascom Hall'],
    term: '', sort: 'dist', landlord: '', checks: {}, sel: null,
  };

  // ---------- map
  const map = L.map('map', { zoomControl: true, preferCanvas: true }).setView(LM['Bascom Hall'], 15);
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const esri = n => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${n}/MapServer/tile/{z}/{y}/{x}`;
  const ESRI_ATTR = 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, &copy; OpenStreetMap contributors';
  L.tileLayer(esri(dark ? 'World_Dark_Gray_Base' : 'World_Light_Gray_Base'), { maxZoom: 20, maxNativeZoom: 16, attribution: ESRI_ATTR }).addTo(map);
  L.tileLayer(esri(dark ? 'World_Dark_Gray_Reference' : 'World_Light_Gray_Reference'), { maxZoom: 20, maxNativeZoom: 16, pane: 'shadowPane' }).addTo(map);
  const ringLayer = L.layerGroup().addTo(map);
  const markerLayer = L.layerGroup().addTo(map);
  const tagLayer = L.layerGroup().addTo(map);
  let refMarker = null;

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
    const cap = state.basis === 'bed' ? 3000 : 12000;
    if (state.price < cap) {
      const v = state.basis === 'bed' ? x.per_bed : (x.basis === 'unit' ? x.rent : (x.beds ? x.rent * x.beds : null));
      if (v == null || v > state.price) return false;
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
      if (p._d > state.dist) continue;
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
      p._minRent = rents.length ? Math.min(...rents) : null;
      out.push(p);
    }
    const key = state.sort;
    out.sort((a, b) => {
      if (key === 'price') return (a._minBed ?? 1e9) - (b._minBed ?? 1e9) || a._d - b._d;
      if (key === 'rent') return (a._minRent ?? 1e9) - (b._minRent ?? 1e9) || a._d - b._d;
      return a._d - b._d;
    });
    return out;
  }

  // ---------- render
  let current = [];
  const markers = new Map();
  function render() {
    current = filtered();
    $('count').textContent = F().count(current.length);
    const noCap = state.price >= (state.basis === 'bed' ? 3000 : 12000);
    $('price-lbl').innerHTML = noCap ? (lang === 'zh' ? '价格<b>不限</b>' : 'Price: <b>any</b>') : F().price_lbl(money(state.price), state.basis);
    $('dist-lbl').innerHTML = F().dist_lbl(state.dist.toFixed(2).replace(/0$/, ''));
    renderList();
    renderMarkers();
  }

  function priceHTML(p) {
    if (p._minBed != null) return `<div class="price">${p._minBedDiv ? '≈' : ''}${money(p._minBed)}<small>${F().from} ${F().per_person}${p._minBedDiv ? (lang === 'zh' ? '（整套÷卧室）' : ' (unit ÷ beds)') : ''}</small></div>`;
    if (p._minRent != null) return `<div class="price">${money(p._minRent)}<small>${F().per_unit}</small></div>`;
    return `<div class="price none">${F().no_price}</div>`;
  }

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
      const sub = [p.name ? p.address : null, p.landlord, `${p._d.toFixed(2)} mi · ${walkMin(p._d)} min`].filter(Boolean).map(esc).join(' — ');
      const has2728 = p._ls.some(x => x.term === '2027-28');
      const gapsN = (p.gaps || []).filter(g => !/not listed/.test(g)).length;
      return `<li class="res${state.sel === p.id ? ' sel' : ''}" data-id="${esc(p.id)}" tabindex="0">
        <span class="dot ${bucket(p._minBed)}" style="${p._minBed != null ? `background:var(--${bucket(p._minBed)})` : ''}"></span>
        <h3>${esc(title)}</h3>${priceHTML(p)}
        <div class="sub">${sub}</div>
        <div class="tags">${bedsSummary(p._ls) ? `<span class="tag">${esc(bedsSummary(p._ls))}</span>` : ''}${has2728 ? '<span class="tag t2728">2027–28</span>' : ''}${p.stale ? `<span class="tag gap">${lang === 'zh' ? '可能过期' : 'May be outdated'}</span>` : ''}${gapsN ? `<span class="tag gap">${F().gaps(gapsN)}</span>` : ''}</div>
      </li>`;
    }).join('');
    ol.innerHTML = html + (current.length > 400 ? `<li class="empty">${lang === 'zh' ? '只显示前 400 个，用筛选缩小范围。' : 'Showing the first 400. Filter to narrow down.'}</li>` : '');
  }

  function renderMarkers() {
    markerLayer.clearLayers();
    markers.clear();
    current.forEach(p => {
      const b = bucket(p._minBed);
      const col = cssVar(b);
      const m = L.circleMarker([p.lat, p.lng], {
        radius: state.sel === p.id ? 9 : 6, weight: b === 'p0' ? 2 : 1.5,
        color: b === 'p0' ? col : (dark ? '#10161D' : '#fff'), fillColor: col, fillOpacity: b === 'p0' ? 0.15 : 0.95,
      });
      m.bindTooltip(`${esc(p.name || p.address)}<br>${p._minBed != null ? money(p._minBed) + F().per_person : (p._minRent != null ? money(p._minRent) + F().per_unit : F().no_price)}`, { direction: 'top' });
      m.on('click', () => select(p.id, false));
      m.addTo(markerLayer);
      markers.set(p.id, m);
    });
    renderTags();
  }

  function renderTags() {
    tagLayer.clearLayers();
    if (map.getZoom() < 17) return;
    const bounds = map.getBounds();
    current.filter(p => bounds.contains([p.lat, p.lng])).slice(0, 160).forEach(p => {
      const v = p._minBed != null ? money(p._minBed) : (p._minRent != null ? money(p._minRent) : '?');
      const b = bucket(p._minBed);
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: '', html: `<span class="price-tag${v === '?' ? ' none' : ''}" style="--c:var(--${b})">${v}</span>`, iconSize: [0, 0] }),
      }).on('click', () => select(p.id, false)).addTo(tagLayer);
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
    else if (Array.isArray(v)) v = v.join(', ');
    return esc(v) + provTag(p, k);
  }

  function termLabel(t) {
    if (!t) return lang === 'zh' ? '未说明' : 'not stated';
    return t;
  }

  function select(id, pan = true) {
    state.sel = id;
    const p = P.find(x => x.id === id);
    if (!p) return;
    const d = miles(state.refPt, [p.lat, p.lng]);
    const zh = lang === 'zh';
    const ls = p._ls && current.includes(p) ? p._ls : p.listings;
    const units = ls.map(x => {
      const what = [x.unit, x.plan].filter(Boolean).join(' · ') || '—';
      const bb = `${x.beds == null ? '?' : x.beds === 0 ? (zh ? '单间' : 'Studio') : x.beds + (zh ? '卧' : 'bd')}${x.baths != null ? ' / ' + x.baths + (zh ? '卫' : 'ba') : ''}`;
      const basisLbl = x.basis === 'bed' ? (zh ? '每人价' : 'per person') : (x.beds > 1 ? (zh ? '整套价' : 'whole unit') : '');
      const rent = x.rent ? money(x.rent) + (x.rent_max && x.rent_max !== x.rent ? '–' + money(x.rent_max) : '') + (basisLbl ? `<div class="basis ${x.basis}">${basisLbl}</div>` : '') : `<span class="nostate">${zh ? '未公开' : 'not posted'}</span>`;
      const per = x.per_bed && x.pb_div ? `<div class="muted">≈ ${money(x.per_bed)}${zh ? '/人' : '/person'} (÷${x.beds})</div>` : '';
      const flags = [...(x.flags || []), ...((x.notes || []).filter(n => !/banner/i.test(n) && /call for|blocked|not stated|per room|per-bed|Shared|lease year/i.test(n)))];
      return `<tr class="${x.flags ? 'flagged' : ''}">
        <td>${esc(what)}<div class="muted">${esc(PROV[x.src === 'uw_offcampus' ? 'uw' : 'official'][zh ? 1 : 0])}${x.status ? ' · ' + esc(x.status) : ''}</div>${flags.length ? `<div class="muted">${flags.map(esc).join('<br>')}</div>` : ''}</td>
        <td>${bb}${x.sqft ? `<div class="muted">${x.sqft.toLocaleString()} ft²</div>` : ''}</td>
        <td class="r">${rent}${per}</td>
        <td>${esc(x.avail === 'now' ? (zh ? '现在' : 'Now') : (x.avail || '—'))}<div class="muted">${esc(termLabel(x.term))}</div></td>
      </tr>`;
    }).join('');
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
    if (gapList.length) issues.push(`<p><b>${zh ? '缺失' : 'Missing'}:</b> ${gapList.map(esc).join(', ')}</p>`);
    const unclear = [...(p.conflicts || []), ...(p.stale || [])];
    if (unclear.length) issues.push(`<p><b>${zh ? '不清楚 / 可能过期' : 'Unclear or possibly outdated'}:</b></p><ul>${unclear.map(u => `<li>${esc(u)}</li>`).join('')}</ul>`);
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
    dr.innerHTML = `<button class="close" aria-label="Close">×</button>
      <h2>${esc(p.name || p.address)}</h2>
      <p class="addr">${esc(p.name ? p.address || '' : '')}${p.name && p.address ? ', ' : ''}${esc(p.city)} ${esc(p.zip || '')} — ${esc(p.landlord || (zh ? '房东未知' : 'Landlord unknown'))}</p>
      <div class="contact">${contact || `<span class="nostate">${zh ? '没找到联系方式' : 'No contact found'}</span>`}</div>
      <div class="walk">${F().walk(walkMin(d), d.toFixed(2), esc(state.ref))}${p.geo && p.geo.startsWith('nominatim') ? `<br><small>${zh ? '位置为近似值（按地址检索）' : 'Approximate location (geocoded)'}</small>` : ''}</div>
      ${photos ? `<div class="photos">${photos}</div>` : ''}
      ${issues.length ? `<div class="issues">${issues.join('')}</div>` : ''}
      <h4>${zh ? '户型与价格' : 'Units and prices'} (${ls.length})</h4>
      <table class="units"><thead><tr><th>${zh ? '单元/户型' : 'Unit / plan'}</th><th>${zh ? '房型' : 'Size'}</th><th class="r">${zh ? '月租' : 'Rent'}</th><th>${zh ? '入住' : 'Move-in'}</th></tr></thead><tbody>${units}</tbody></table>
      <h4>${zh ? '条件' : 'Terms'}</h4>
      <dl class="facts">${facts}${utilTxt}${fees}</dl>
      ${p.amenities ? `<h4>${zh ? '设施' : 'Amenities'}</h4><p class="desc">${p.amenities.map(esc).join(', ')}</p>` : ''}
      ${p.description ? `<h4>${zh ? '描述（原文）' : 'Description'}</h4><p class="desc">${esc(p.description.slice(0, 1500))}</p>` : ''}
      <h4>${zh ? '数据来源' : 'Where this came from'}</h4>
      <ol class="srcs">${(p.links || []).map(([l, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(l)}</a></li>`).join('')}</ol>`;
    dr.hidden = false;
    dr.scrollTop = 0;
    dr.querySelector('.close').onclick = closeDrawer;
    document.querySelectorAll('.res.sel').forEach(e => e.classList.remove('sel'));
    const li = document.querySelector(`.res[data-id="${CSS.escape(id)}"]`);
    if (li) { li.classList.add('sel'); if (!pan) li.scrollIntoView({ block: 'nearest' }); }
    markers.forEach((m, k) => m.setRadius(k === id ? 9 : 6));
    if (pan) map.panTo([p.lat, p.lng]);
  }
  function closeDrawer() {
    $('drawer').hidden = true;
    state.sel = null;
    markers.forEach(m => m.setRadius(6));
    document.querySelectorAll('.res.sel').forEach(e => e.classList.remove('sel'));
  }

  // ---------- controls
  const refSel = $('ref');
  Object.keys(LM).forEach(k => refSel.add(new Option(k, k)));
  refSel.add(new Option('My point', '__mine'));
  refSel.onchange = () => {
    if (refSel.value === '__mine') { startPick(); return; }
    state.ref = refSel.value; state.refPt = LM[refSel.value]; drawRings(); render();
  };
  let picking = false;
  function startPick() { picking = true; $('pick-hint').hidden = false; map.getContainer().style.cursor = 'crosshair'; }
  function stopPick() { picking = false; $('pick-hint').hidden = true; map.getContainer().style.cursor = ''; }
  $('pick').onclick = startPick;
  map.on('click', e => {
    if (!picking) return;
    state.ref = lang === 'zh' ? '我的位置' : 'my point';
    state.refPt = [e.latlng.lat, e.latlng.lng];
    refSel.value = '__mine';
    stopPick(); drawRings(); render();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (picking) stopPick(); else closeDrawer(); }
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
    const pr = $('price');
    if (state.basis === 'bed') { pr.min = 500; pr.max = 3000; pr.step = 50; } else { pr.min = 800; pr.max = 12000; pr.step = 100; }
    pr.value = pr.max; state.price = +pr.max; render();
  };
  $('price').oninput = e => { state.price = +e.target.value; render(); };
  $('dist').oninput = e => { state.dist = +e.target.value; render(); };
  $('term').onchange = e => { state.term = e.target.value; render(); };
  $('sort').onchange = e => { state.sort = e.target.value; render(); };
  const CHK = { 'f-priced': 'priced', 'f-heat': 'heat', 'f-allutil': 'allutil', 'f-net': 'net', 'f-cats': 'cats', 'f-dogs': 'dogs', 'f-inunit': 'inunit', 'f-parking': 'parking', 'f-furn': 'furn', 'f-ac': 'ac' };
  Object.entries(CHK).forEach(([id, k]) => { $(id).onchange = e => { state.checks[k] = e.target.checked; render(); }; });
  const llSel = $('landlord');
  const llCount = {};
  P.forEach(p => { if (p.landlord) llCount[p.landlord] = (llCount[p.landlord] || 0) + 1; });
  Object.entries(llCount).sort((a, b) => b[1] - a[1]).forEach(([n, c]) => llSel.add(new Option(`${n} (${c})`, n)));
  llSel.onchange = e => { state.landlord = e.target.value; render(); };
  $('reset').onclick = () => {
    Object.assign(state, { q: '', beds: new Set(), price: state.basis === 'bed' ? 3000 : 12000, dist: 2, term: '', sort: 'dist', landlord: '', checks: {} });
    $('q').value = ''; $('beds').querySelectorAll('button').forEach(b => b.classList.remove('on'));
    $('price').value = $('price').max; $('dist').value = 2; $('term').value = ''; $('sort').value = 'dist'; llSel.value = '';
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
  };

  // ---------- legend + header stats
  function renderLegend() {
    const zh = lang === 'zh';
    $('legend').innerHTML = `<b>${zh ? '每人最低月租' : 'Lowest rent per person'}</b>` +
      [['p1', '< $900'], ['p2', '$900–1,199'], ['p3', '$1,200–1,499'], ['p4', '$1,500–1,899'], ['p5', '$1,900+']].map(([c, t]) => `<span class="row"><i style="background:var(--${c})"></i>${t}</span>`).join('') +
      `<span class="row"><i style="border:2px solid var(--p0)"></i>${zh ? '未公开价格' : 'No price posted'}</span>` +
      `<span class="row"><i style="background:var(--badger);border-radius:0;transform:rotate(45deg)"></i>${zh ? '参考点（圈 = 0.5 英里）' : 'Reference point, rings every 0.5 mi'}</span>`;
    $('stat-props').innerHTML = F().props(META.properties);
    $('stat-units').innerHTML = F().units(META.listings);
  }

  // ---------- tabs
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + t.dataset.view));
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
      ${ps.map(p => `<tr><td><a data-go="${esc(p.id)}">${esc(p.name ? p.name + ' — ' : '')}${esc(p.address || '')}</a></td><td>${esc((p.gaps || []).join(', ') || '—')}</td><td>${esc([...(p.conflicts || []), ...(p.stale || [])].join('; ') || '—')}</td></tr>`).join('')}
      </tbody></table>`;
    $('copy-draft').onclick = async () => {
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
      <p>步行时间按直线距离 × 1.25、每小时 3 英里估算，只作参考。</p>` : `
      <h2>Where the data comes from</h2>
      <p>Collected on <b>${esc(META.built)}</b> for everything within ${META.radius_mi} miles (straight line) of Bascom Hall. Landlord websites come first; the UW off-campus listing service (offcampushousing.wisc.edu) fills in landlords without a site we can read. When the same unit appears in both, the landlord site wins and the UW row is hidden.</p>
      <p>The small mark next to each value says where it came from: <span class="prov official">site</span> a structured field on the landlord website; <span class="prov uw">UW list</span> the UW off-campus listing service; <span class="prov inferred">inferred</span> read from the listing's description text; <span class="prov absent">not listed</span> missing from an otherwise complete amenity list, so worth confirming. Values no source gives show as <span class="nostate">Not stated</span>.</p>
      <p>Walking times assume 1.25× the straight-line distance at 3 mph. Treat them as estimates.</p>`;
    $('sources').innerHTML += `<h2>${zh ? '各来源条数' : 'Rows by source'}</h2><table><tbody>${rows}</tbody></table>
      <h2>${zh ? '各房东物业数' : 'Properties by landlord'}</h2><table><tbody>${llRows}</tbody></table>
      ${META.no_geo && META.no_geo.length ? `<h2>${zh ? '无法定位' : 'Could not be placed on the map'}</h2><ul>${META.no_geo.map(([a, b]) => `<li>${esc(a)}: ${esc(b)}</li>`).join('')}</ul>` : ''}`;
  }

  // ---------- language
  $('lang').onclick = () => {
    lang = lang === 'zh' ? 'en' : 'zh'; safeSet('lang', lang); applyLang(); renderLegend(); render();
    if ($('view-gaps').classList.contains('active')) renderGaps();
    if ($('view-sources').classList.contains('active')) renderSources();
    if (state.sel) select(state.sel, false);
  };

  applyLang();
  renderLegend();
  drawRings();
  render();

  // Admin entry + deep link (#p=<id>) when served by server.py
  if (location.protocol.startsWith('http')) {
    fetch('/api/status').then(r => {
      if (!r.ok) return;
      const a = Object.assign(document.createElement('a'), { href: '/admin/', className: 'lang', textContent: lang === 'zh' ? '后台' : 'Admin' });
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
