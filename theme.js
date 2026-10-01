/* Appearance preference (light / dark / system, accent color, basemap), shared by the map and admin pages.
   Load in <head> so the theme is set before first paint. Default: light theme, lake accent, color basemap. */
(function () {
  var KT = 'isthmus:theme', KA = 'isthmus:accent', KB = 'isthmus:basemap';
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var listeners = [];
  var ACCENTS = [
    ['lake', '#2E6F8E', 'Lake blue', '湖蓝'],
    ['red', '#C5050C', 'Badger red', '威大红'],
    ['pine', '#2E7D4F', 'Pine green', '松绿'],
    ['dusk', '#6A4FB8', 'Dusk purple', '暮紫'],
  ];

  function get(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
  function mode() { return get(KT, 'light'); }
  function accent() { return get(KA, 'lake'); }
  function basemap() { return get(KB, 'color'); }
  function resolved() { var t = mode(); return t === 'auto' ? (mq && mq.matches ? 'dark' : 'light') : t; }

  function apply() {
    var t = resolved();
    root.setAttribute('data-theme', t);
    root.setAttribute('data-accent', accent());
    root.setAttribute('data-basemap', basemap());
    root.style.colorScheme = t;
    for (var i = 0; i < listeners.length; i++) listeners[i](t, accent());
  }
  apply();
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (mode() === 'auto') apply(); });

  function zh() { return (get('isthmus:lang', 'en') === 'zh'); }

  function mount(btn) {
    var panel = document.createElement('div');
    panel.className = 'appearance-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    btn.parentNode.appendChild(panel);
    panel.addEventListener('click', function (e) { e.stopPropagation(); });  // keep open while choosing

    function render() {
      var z = zh(), m = mode(), a = accent(), bm = basemap();
      var modes = [['light', 'Light', '亮色'], ['dark', 'Dark', '暗色'], ['auto', 'System', '跟随系统']];
      var maps = [['color', 'Color', '彩色'], ['gray', 'Gray', '灰色'], ['satellite', 'Satellite', '卫星']];
      panel.innerHTML =
        '<div class="ap-row"><span class="ap-lbl">' + (z ? '主题' : 'Theme') + '</span><div class="seg ap-seg">' +
        modes.map(function (o) {
          return '<button data-mode="' + o[0] + '" class="' + (m === o[0] ? 'on' : '') + '">' + (z ? o[2] : o[1]) + '</button>';
        }).join('') + '</div></div>' +
        '<div class="ap-row"><span class="ap-lbl">' + (z ? '主色' : 'Accent') + '</span><div class="swatches">' +
        ACCENTS.map(function (c) {
          return '<button data-accent="' + c[0] + '" class="' + (a === c[0] ? 'on' : '') + '" style="background:' + c[1] +
            '" title="' + (z ? c[3] : c[2]) + '" aria-label="' + (z ? c[3] : c[2]) + '"></button>';
        }).join('') + '</div></div>' +
        (document.getElementById('map') ? '<div class="ap-row"><span class="ap-lbl">' + (z ? '地图' : 'Map') + '</span><div class="seg ap-seg">' +
          maps.map(function (o) {
            return '<button data-bm="' + o[0] + '" class="' + (bm === o[0] ? 'on' : '') + '">' + (z ? o[2] : o[1]) + '</button>';
          }).join('') + '</div></div>' : '');
      panel.querySelectorAll('[data-bm]').forEach(function (b) {
        b.onclick = function () { put(KB, b.getAttribute('data-bm')); apply(); render(); };
      });
      panel.querySelectorAll('[data-mode]').forEach(function (b) {
        b.onclick = function () { put(KT, b.getAttribute('data-mode')); apply(); render(); };
      });
      panel.querySelectorAll('[data-accent]').forEach(function (b) {
        b.onclick = function () { put(KA, b.getAttribute('data-accent')); apply(); render(); };
      });
    }
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (panel.hidden) { render(); panel.hidden = false; } else { panel.hidden = true; }
    });
    document.addEventListener('click', function (e) { if (!panel.hidden && !panel.contains(e.target)) panel.hidden = true; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') panel.hidden = true; });
  }

  window.IsthmusTheme = {
    mode: mode, accent: accent, basemap: basemap,
    isDark: function () { return resolved() === 'dark'; },
    onChange: function (f) { listeners.push(f); },
  };
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('appearance');
    if (btn) mount(btn);
  });
})();
