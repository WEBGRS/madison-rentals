/* Keep one site's saved data in the visitor's madisonstudents.com account (canonical copy: C:\Users\ghs\webgrs-guard\acct-sync.js; sync.py copies it).
   Load after account.js:  <script src="acct-sync.js" defer></script>
   var s = window.MSSync('rentals', {
     get: function () { return {...} },            // this device's data, JSON-safe
     set: function (data) { ... },                 // replace local data and re-render; data null = start empty
     merge: function (local, server) { return {...} },
     empty: function (data) { return true/false }  // nothing worth keeping
   });
   s.changed();   // after every local edit
   Local storage stays the working copy; the account gets a copy after each change and is read on load and sign-in.
   Another account's copy on this device is replaced, never mixed. */
(function () {
  if (window.MSSync) return;
  var A = function () { return window.MSAccount; };

  window.MSSync = function (site, o) {
    var KEY = 'msac:' + site;
    var st = { dirty: false, seen: 0, owner: '' };
    try { var j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && typeof j === 'object') st = { dirty: !!j.dirty, seen: +j.seen || 0, owner: j.owner || '' }; } catch (e) { /* storage blocked */ }
    var timer = 0, applying = false, lastPull = 0, started = false;
    function keep() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* storage blocked */ } }
    function user() { var a = A(); return a && a.user; }
    function apply(d) { applying = true; try { o.set(d); } finally { applying = false; } }

    function push(beacon) {
      clearTimeout(timer);
      var u = user();
      if (!u || !st.dirty) return Promise.resolve();
      return A().save(site, o.get(), { beacon: !!beacon }).then(function (r) {
        st.seen = r.updated; st.dirty = false; st.owner = u.email; keep();
      }, function () { /* stays dirty; the next change or visit retries */ });
    }

    function pull(signin) {
      lastPull = Date.now();
      return A().load(site).then(function (r) {
        var u = user();
        if (!u) return;
        var email = u.email;
        if (st.owner && st.owner !== email) {
          apply(r.data || null);
          st.seen = r.data ? r.updated : 0; st.dirty = false; st.owner = email; keep();
          return;
        }
        if (!r.data) {
          if (!o.empty(o.get())) { st.dirty = true; keep(); return push(); }
          st.owner = email; keep(); return;
        }
        var serverNew = r.updated > st.seen;
        if (serverNew && (st.dirty || (signin && !o.empty(o.get())))) {
          apply(o.merge(o.get(), r.data)); st.dirty = true; keep(); return push();
        }
        if (serverNew) { apply(r.data); st.seen = r.updated; st.owner = email; keep(); return; }
        if (st.dirty) return push();
      }, function () { /* offline or signed out: keep the local copy */ });
    }

    function start() {
      if (started || !A()) return;
      started = true;
      var a = A();
      a.ready.then(function (u) { if (u) pull(false); });
      a.on(function (u, why) {
        if (why === 'signin') { st.seen = 0; keep(); pull(true); }
        else { clearTimeout(timer); st.seen = 0; st.dirty = false; if (why === 'delete') st.owner = ''; keep(); }
      });
      document.addEventListener('visibilitychange', function () {
        if (!user()) return;
        if (document.visibilityState === 'hidden') push(true);
        else if (Date.now() - lastPull > 60000) pull(false);
      });
    }
    if (A()) start(); else window.addEventListener('load', start, { once: true });

    return {
      changed: function () {
        if (applying) return;
        st.dirty = true; keep();
        if (user()) { clearTimeout(timer); timer = setTimeout(push, 1200); }
      },
      push: push,
      pull: pull,
    };
  };
})();
