/* Isthmus Rentals query engine: filter, sort and shape properties. Plain JS with no DOM or network access,
   shared by the page in local mode, the Cloudflare Worker (worker/src/worker.js) and the Node tests.
   Loaded as a classic script; it sets globalThis.IsthmusEngine. */
(function (root) {
  'use strict';
  var RAD = Math.PI / 180;
  function miles(a, b) {
    var dLa = (b[0] - a[0]) * RAD, dLo = (b[1] - a[1]) * RAD;
    var h = Math.pow(Math.sin(dLa / 2), 2) + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.pow(Math.sin(dLo / 2), 2);
    return 2 * 3958.8 * Math.asin(Math.sqrt(h));
  }
  // Whole-unit rent of a listing: per-person prices times the people living there
  function unitRent(x) {
    if (x.rent == null) return null;
    return x.basis === 'unit' ? x.rent : x.rent * Math.max(1, x.beds || 0) * (x.shared ? 2 : 1);
  }
  var BOUNDS = { bed: [500, 3000], unit: [800, 12000] };
  var STALE = /last updated|already passed|update date unknown|site not updated/i;
  var CHECKS = ['priced', 'heat', 'allutil', 'net', 'cats', 'dogs', 'inunit', 'parking', 'furn', 'ac'];
  var SORTS = ['dist', 'bus', 'places', 'price', 'price_desc', 'ppsf', 'size', 'movein', 'choice', 'complete'];
  var LIMITS = { page: 60, places: 10, peek: 60, find: 8 };
  var r3 = function (v) { return v == null ? null : Math.round(v * 1000) / 1000; };
  var unconfirmed = function (x) { return !!(x.bv && (x.bv[0] === 'none' || x.bv[0] === 'range-out')); };

  function prepare(data, transit) {
    var P = (data.properties || []).filter(function (p) { return !p.hidden && p.lat != null; });
    var stops = (transit && transit.stops) || [];
    P.forEach(function (p) {
      p._text = [p.name, p.address, p.landlord, p.zip].filter(Boolean).join(' ').toLowerCase();
      var u = p.utilities || [];
      p._heat = u.indexOf('heat') >= 0;
      p._net = u.indexOf('internet') >= 0;
      p._allutil = ['heat', 'electric', 'water'].every(function (k) { return u.indexOf(k) >= 0; });
      var pets = (p.pets || '').toLowerCase();
      p._cats = /cat/.test(pets) && !/cats not allowed|no pets/.test(pets);
      p._dogs = /dog/.test(pets) && !/dogs not allowed|no pets/.test(pets);
      p._inunit = /in[ -]?unit|washer & dryer|washer and dryer/i.test(p.laundry || '');
      p._parking = !!p.parking && !/^street\b|no parking|none/i.test(p.parking);
      p._furn = p.furnished === true;
      p._ac = p.ac === true;
      p._gapsN = (p.gaps || []).filter(function (g) { return !/not listed|rent basis/.test(g); }).length;
      p._stale = (p.stale || []).some(function (s) { return STALE.test(s); });
      var best = null;
      stops.forEach(function (s) { var d = miles([p.lat, p.lng], [s[0], s[1]]); if (best == null || d < best) best = d; });
      p._busD = best;
    });
    var llCount = {};
    P.forEach(function (p) { if (p.landlord) llCount[p.landlord] = (llCount[p.landlord] || 0) + 1; });
    var near = P.filter(function (p) { return p.dist <= 1; });
    var med = function (a) { return a.slice().sort(function (x, y) { return x - y; })[a.length >> 1]; };
    return {
      P: P,
      byId: new Map(P.map(function (p) { return [p.id, p]; })),
      meta: data.meta || {},
      landlords: Object.entries(llCount).sort(function (a, b) { return b[1] - a[1]; }),
      home: near.length ? [med(near.map(function (p) { return p.lat; })), med(near.map(function (p) { return p.lng; }))] : null,
      hasBus: stops.length > 0,
    };
  }

  // Validate and fill a query from the page; anything unexpected falls back to the default
  function params(q) {
    q = q || {};
    var basis = q.basis === 'unit' ? 'unit' : 'bed', lo = BOUNDS[basis][0], hi = BOUNDS[basis][1];
    var num = function (v, d) { return typeof v === 'number' && isFinite(v) ? v : d; };
    var pt = function (v) { return Array.isArray(v) && v.length === 2 && v.every(function (n) { return typeof n === 'number' && isFinite(n); }) ? [v[0], v[1]] : null; };
    var checks = {};
    CHECKS.forEach(function (k) { if (q.checks && q.checks[k]) checks[k] = true; });
    return {
      text: String(q.text || '').trim().toLowerCase().slice(0, 80),
      beds: Array.isArray(q.beds) ? q.beds.filter(function (b) { return b === (b | 0) && b >= 0 && b <= 5; }) : [],
      basis: basis,
      price: Math.min(Math.max(num(q.price, hi), lo), hi),
      priceMin: Math.min(Math.max(num(q.priceMin, lo), lo), hi),
      dist: Math.min(Math.max(num(q.dist, 2), 0.25), 2),
      ref: pt(q.ref),
      term: typeof q.term === 'string' ? q.term.slice(0, 30) : '',
      sort: SORTS.indexOf(q.sort) >= 0 ? q.sort : 'dist',
      landlord: typeof q.landlord === 'string' ? q.landlord.slice(0, 120) : '',
      checks: checks,
      noShared: q.noShared !== false,
      places: Array.isArray(q.places) ? q.places.map(pt).filter(Boolean).slice(0, LIMITS.places) : [],
      offset: Math.max(0, Math.floor(num(q.offset, 0))),
      limit: Math.min(Math.max(1, Math.floor(num(q.limit, LIMITS.page))), LIMITS.page),
    };
  }

  function matches(x, s) {
    if (s.noShared && x.shared) return false;
    if (s.beds.length) {
      if (x.beds == null) return false;
      if (s.beds.indexOf(x.beds >= 5 ? 5 : Math.floor(x.beds)) < 0) return false;
    }
    if (s.term) {
      if (s.term === 'unknown') { if (x.term) return false; } else if (x.term !== s.term) return false;
    }
    var lo = BOUNDS[s.basis][0], hi = BOUNDS[s.basis][1];
    if (s.price < hi || s.priceMin > lo) {
      var v = s.basis === 'bed' ? x.per_bed : unitRent(x);
      if (v == null || (s.price < hi && v > s.price) || (s.priceMin > lo && v < s.priceMin)) return false;
    }
    if (s.checks.priced && !x.rent) return false;
    return true;
  }

  function evaluate(p, s, ref, today) {
    var d = miles(ref, [p.lat, p.lng]);
    if (s.dist < 2 && d > s.dist) return null;
    if (s.text && p._text.indexOf(s.text) < 0) return null;
    if (s.landlord && p.landlord !== s.landlord) return null;
    var c = s.checks;
    if ((c.heat && !p._heat) || (c.net && !p._net) || (c.allutil && !p._allutil) || (c.cats && !p._cats) || (c.dogs && !p._dogs) ||
      (c.inunit && !p._inunit) || (c.parking && !p._parking) || (c.furn && !p._furn) || (c.ac && !p._ac)) return null;
    var ls = p.listings.filter(function (x) { return matches(x, s); });
    if (!ls.length) return null;
    var nums = function (f) { return ls.map(f).filter(function (v) { return v != null; }); };
    var pb = nums(function (x) { return x.per_bed; });
    var minBed = pb.length ? Math.min.apply(null, pb) : null;
    var units = nums(unitRent), rents = nums(function (x) { return x.rent; });
    var sq = ls.map(function (x) { return x.sqft; }).filter(function (v) { return v >= 150; });
    var psf = ls.filter(function (x) { return x.sqft >= 150 && unitRent(x) != null; }).map(function (x) { return unitRent(x) / x.sqft; });
    // Earliest move-in; 'now' and dates already past count as today
    var moves = ls.map(function (x) {
      if (x.avail === 'now') return today;
      return /^\d{4}-\d{2}-\d{2}$/.test(x.avail || '') ? (x.avail < today ? today : x.avail) : null;
    }).filter(Boolean).sort();
    var beds = [];
    ls.forEach(function (x) { if (x.beds != null && beds.indexOf(x.beds) < 0) beds.push(x.beds); });
    return {
      id: p.id, name: p.name || null, address: p.address || null, landlord: p.landlord || null, lat: p.lat, lng: p.lng,
      _d: r3(d), _n: ls.length,
      _minBed: minBed,
      _minBedDiv: minBed != null && ls.every(function (x) { return x.per_bed !== minBed || !!x.pb_div; }),
      _minBedUnv: minBed != null && ls.some(function (x) { return x.per_bed === minBed && unconfirmed(x); }),
      _minUnit: units.length ? Math.min.apply(null, units) : null,
      _minRent: rents.length ? Math.min.apply(null, rents) : null,
      _maxSqft: sq.length ? Math.max.apply(null, sq) : null,
      _ppsf: psf.length ? r3(Math.min.apply(null, psf)) : null,
      _moveIn: moves[0] || null,
      _busD: r3(p._busD),
      _placesAvg: s.places.length ? r3(s.places.reduce(function (t, pl) { return t + miles([p.lat, p.lng], pl); }, 0) / s.places.length) : null,
      _beds: beds.sort(function (a, b) { return a - b; }),
      _2728: ls.some(function (x) { return x.term === '2027-28'; }),
      _unv: ls.some(unconfirmed),
      _stale: p._stale,
      _gapsN: p._gapsN,
    };
  }

  var SORTV = {
    dist: function (r) { return r._d; },
    bus: function (r) { return r._busD; },
    places: function (r) { return r._placesAvg; },
    price: function (r, s) { return s.basis === 'bed' ? r._minBed : r._minUnit; },
    price_desc: function (r, s) { return s.basis === 'bed' ? r._minBed : r._minUnit; },
    ppsf: function (r) { return r._ppsf; },
    size: function (r) { return r._maxSqft; },
    movein: function (r) { return r._moveIn; },
    choice: function (r) { return r._n; },
    complete: function (r) { return r._gapsN; },
  };
  var DIR = { price_desc: -1, size: -1, choice: -1 };

  function defaultRef(ix) {
    var lm = ix.meta.landmarks || {};
    return lm['Bascom Hall'] || [43.0753, -89.4041];
  }

  // Matching properties: map markers for all of them, list rows for one page
  function search(ix, q, opt) {
    var s = params(q), ref = s.ref || defaultRef(ix), today = new Date().toISOString().slice(0, 10);
    var out = [];
    ix.P.forEach(function (p) { var r = evaluate(p, s, ref, today); if (r) out.push(r); });
    var val = SORTV[s.sort], dir = DIR[s.sort] || 1, v = new Map();
    out.forEach(function (r) { v.set(r, val(r, s)); });
    // Properties without the sorted value go last; ties fall back to distance
    out.sort(function (a, b) {
      var va = v.get(a), vb = v.get(b);
      if (va == null || vb == null) return ((va == null) - (vb == null)) || a._d - b._d;
      return dir * (va < vb ? -1 : va > vb ? 1 : 0) || a._d - b._d;
    });
    var price = function (r) { return s.basis === 'bed' ? r._minBed : r._minUnit; };
    var all = opt && opt.all;
    return {
      total: out.length,
      markers: out.map(function (r) { return [r.id, Math.round(r.lat * 1e5) / 1e5, Math.round(r.lng * 1e5) / 1e5, price(r), r._n]; }),
      rows: all ? out : out.slice(s.offset, s.offset + s.limit),
    };
  }

  // One property for the detail panel, with the indexes of the listings that pass the filters
  function property(ix, id, q) {
    var p = ix.byId.get(id);
    if (!p) return null;
    var s = params(q), match = [];
    p.listings.forEach(function (x, i) { if (matches(x, s)) match.push(i); });
    if (!match.length) p.listings.forEach(function (x, i) { if (!(s.noShared && x.shared)) match.push(i); });
    var clean = {};
    Object.keys(p).forEach(function (k) { if (k[0] !== '_') clean[k] = p[k]; });
    return { p: clean, match: match };
  }

  function peek(ix, ids) {
    return (Array.isArray(ids) ? ids : []).slice(0, LIMITS.peek).map(function (id) {
      var p = ix.byId.get(id);
      return p ? [p.id, p.name || p.address || ''] : null;
    }).filter(Boolean);
  }

  function find(ix, text) {
    var t = String(text || '').trim().toLowerCase().slice(0, 80);
    if (t.length < 2) return [];
    return ix.P.filter(function (p) { return p._text.indexOf(t) >= 0; }).slice(0, LIMITS.find).map(function (p) {
      return { id: p.id, name: p.name || p.address, sub: p.name ? p.address || '' : '', lat: p.lat, lng: p.lng };
    });
  }

  function byLandlord(ix) {
    var m = {};
    ix.P.forEach(function (p) {
      if (p.gaps || p.conflicts || p.stale) (m[p.landlord || '(landlord unknown)'] = m[p.landlord || '(landlord unknown)'] || []).push(p);
    });
    return m;
  }

  // Missing-info tab: totals per gap and landlords with something to ask
  function gaps(ix) {
    var tot = {};
    ix.P.forEach(function (p) { (p.gaps || []).forEach(function (g) { tot[g] = (tot[g] || 0) + 1; }); });
    var m = byLandlord(ix);
    return {
      summary: Object.entries(tot).sort(function (a, b) { return b[1] - a[1]; }),
      landlords: Object.keys(m).map(function (k) { return [k, m[k].length]; }).sort(function (a, b) { return b[1] - a[1]; }),
    };
  }

  function gapLandlord(ix, ll) {
    var ps = (byLandlord(ix)[ll] || []).slice().sort(function (a, b) { return a.dist - b.dist; });
    return ps.map(function (p) {
      return {
        id: p.id, name: p.name || null, address: p.address || null, dist: p.dist, gaps: p.gaps || null, conflicts: p.conflicts || null,
        stale: p.stale || null, email: p.email || null, phone: p.phone || null, landlord_site: p.landlord_site || null,
      };
    });
  }

  function metaOf(ix) {
    return { meta: ix.meta, landlords: ix.landlords, home: ix.home, hasBus: ix.hasBus };
  }

  root.IsthmusEngine = {
    prepare: prepare, params: params, search: search, property: property, peek: peek, find: find,
    gaps: gaps, gapLandlord: gapLandlord, metaOf: metaOf, miles: miles, unitRent: unitRent, BOUNDS: BOUNDS, LIMITS: LIMITS,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
