/* ============================================================
   Site search (header). Client-side, powered by the same
   Hugo-generated feed JSON chunks used by the home feed.
   Loads the index lazily on first focus/typing, then filters
   pattern titles + category + tags and shows a dropdown.
   ============================================================ */
(function () {
  'use strict';

  var input = document.getElementById('siteSearch');
  var box = document.getElementById('siteSearchResults');
  if (!input || !box) return;

  var index = null;          // array of {title,url,cover,category,tags,date, _hay}
  var loading = false, items = [];
  var active = -1;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');   // strip diacritics (ü → u)
  }

  function loadIndex() {
    if (index || loading) return index ? Promise.resolve(index) : new Promise(function () {});
    loading = true;
    return fetch('/data/feed/manifest.json', { cache: 'force-cache' })
      .then(function (r) { if (!r.ok) throw new Error('manifest'); return r.json(); })
      .then(function (mf) {
        var chunks = (mf && mf.chunks) || 0;
        var reqs = [];
        for (var i = 1; i <= chunks; i++) reqs.push(
          fetch('/data/feed/part-' + i + '.json', { cache: 'force-cache' })
            .then(function (r) { return r.ok ? r.json() : []; })
            .catch(function () { return []; })
        );
        return Promise.all(reqs);
      })
      .then(function (parts) {
        var all = [];
        parts.forEach(function (arr) { if (Array.isArray(arr)) all = all.concat(arr); });
        all.forEach(function (it) {
          it._hay = norm([it.title, it.category, (it.tags || []).join(' ')].join(' '));
        });
        index = all;
        loading = false;
        return index;
      })
      .catch(function () { loading = false; return []; });
  }

  function search(q) {
    q = norm(q).trim();
    if (!q) return [];
    var words = q.split(/\s+/);
    return index.filter(function (it) {
      return words.every(function (w) { return it._hay.indexOf(w) !== -1; });
    }).slice(0, 8);
  }

  function render(results, q) {
    if (!q) { close(); return; }
    if (!results.length) {
      box.innerHTML = '<div class="sr-empty">No patterns found for “' + esc(q) + '”</div>';
      open();
      return;
    }
    var html = results.map(function (it, i) {
      var thumb = it.cover
        ? '<img class="sr-thumb" src="' + esc(it.cover) + '" alt="" loading="lazy">'
        : '<div class="sr-thumb empty">No img</div>';
      var meta = [it.category, it.date].filter(Boolean).join(' · ');
      return '<a class="sr-item' + (i === 0 ? ' active' : '') + '" role="option" href="' + esc(it.url) +
        '" data-i="' + i + '">' + thumb +
        '<span class="sr-body"><span class="sr-title">' + esc(it.title) + '</span>' +
        (meta ? '<span class="sr-meta">' + esc(meta) + '</span>' : '') + '</span></a>';
    }).join('');
    box.innerHTML = html;
    active = 0;
    open();
  }

  function open() { box.hidden = false; input.setAttribute('aria-expanded', 'true'); }
  function close() { box.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; }

  function goFirst() {
    var first = box.querySelector('.sr-item');
    if (first) location.href = first.getAttribute('href');
  }

  var t;
  input.addEventListener('input', function () {
    var q = input.value;
    clearTimeout(t);
    t = setTimeout(function () {
      loadIndex().then(function () { render(search(q), q); });
    }, 120);
  });

  input.addEventListener('focus', function () {
    loadIndex();
    if (input.value.trim() && box.innerHTML) open();
  });

  input.addEventListener('keydown', function (e) {
    var list = box.querySelectorAll('.sr-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = Math.min(active + 1, list.length - 1);
      list.forEach(function (el, i) { el.classList.toggle('active', i === active); });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(active - 1, 0);
      list.forEach(function (el, i) { el.classList.toggle('active', i === active); });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (list[active]) location.href = list[active].getAttribute('href');
      else goFirst();
    } else if (e.key === 'Escape') {
      close(); input.blur();
    }
  });

  // close on outside click
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('.site-search')) close();
  });
})();
