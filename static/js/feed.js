/* ============================================================
   Feed loading modes: infinite scroll / pagination.
   20 / 30 / 50 items per page, preference saved in localStorage.
   Data comes from Hugo-generated JSON chunks; the server-rendered first
   screen of cards is kept as an SEO / no-JS fallback.
   ============================================================ */
(function () {
  'use strict';

  var grid = document.getElementById('feedMasonry');
  var ctl = document.getElementById('feedControls');
  if (!grid || !ctl) return;

  var modeEl = document.getElementById('feedMode');
  var sizeEl = document.getElementById('feedSize');
  var info = document.getElementById('feedInfo');
  var tax = ctl.getAttribute('data-taxonomy') || '';
  var term = ctl.getAttribute('data-term') || '';

  // Taxonomy pages: infer the filter from the URL when the template does not pass it
  if (!tax) {
    var m = location.pathname.match(/^\/(categories|tags)\/([^/]+)/);
    if (m) { tax = m[1]; term = decodeURIComponent(m[2]); }
  }
  term = String(term).toLowerCase();

  var cached = {}, manifest = null, pool = [], loaded = 0;
  var cursor = 0, page = 1, io = null, working = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ls(k, v) {
    try { return v === undefined ? localStorage.getItem(k) : (localStorage.setItem(k, v), null); }
    catch (e) { return null; }
  }
  function size() { return parseInt(sizeEl.value, 10) || 20; }
  function mode() { return modeEl.value; }

  modeEl.value = ls('diy365_feed_mode') || 'infinite';
  sizeEl.value = ls('diy365_feed_size') || '20';
  var hp = location.hash.match(/page=(\d+)/);
  if (hp) page = Math.max(1, parseInt(hp[1], 10));

  function match(it) {
    if (!tax) return true;
    if (tax === 'categories') return String(it.category || '').toLowerCase() === term;
    return (it.tags || []).map(String).some(function (t) { return t.toLowerCase() === term; });
  }
  function chunk(i) {
    if (cached[i]) return Promise.resolve(cached[i]);
    return fetch('/data/feed/part-' + i + '.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('part ' + i); return r.json(); })
      .then(function (d) { cached[i] = d || []; return d || []; })
      .catch(function () { cached[i] = []; return []; });
  }
  function ensure(n) {
    if (!manifest || pool.length >= n || loaded >= manifest.chunks) return Promise.resolve();
    var next = loaded + 1;
    return chunk(next).then(function (items) {
      loaded = next;
      pool = pool.concat(items.filter(match));
      return ensure(n);
    });
  }
  function card(it) {
    var cover = it.cover
      ? '<img class="card-img" src="' + esc(it.cover) + '" alt="' + esc(it.title) + '" loading="lazy" width="300" height="400">'
      : '<div class="card-img" style="background:#f6ece9;aspect-ratio:3/4"></div>';
    var cat = it.category ? '<span class="badge">' + esc(it.category) + '</span>' : '';
    return '<article class="card"><a href="' + esc(it.url) + '">' + cover +
      '<div class="card-body"><h3 class="card-title">' + esc(it.title) + '</h3>' +
      '<div class="card-meta">' + cat + '<span>' + esc(it.date || '') + '</span></div></div></a></article>';
  }
  function extras(html) {
    var old = document.getElementById('feedExtras');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var div = document.createElement('div');
    div.id = 'feedExtras';
    div.innerHTML = html;
    if (grid.nextSibling) grid.parentNode.insertBefore(div, grid.nextSibling);
    else grid.parentNode.appendChild(div);
    return div;
  }
  function scrollToGrid() {
    try { window.scrollTo({ top: Math.max(0, grid.offsetTop - 80), behavior: 'smooth' }); }
    catch (e) { /* ignore */ }
  }

  function renderInfinite() {
    var need = cursor + size();
    return ensure(need).then(function () {
      var list = pool.slice(0, Math.min(need, pool.length));
      grid.innerHTML = list.map(card).join('');
      cursor = list.length;
      var done = loaded >= (manifest ? manifest.chunks : 0);
      extras('<div class="feed-sentinel" id="feedSentinel">' +
        (done ? 'All loaded | ' + pool.length + ' patterns'
              : '<button type="button" class="feed-loadmore" id="feedMore">Load more ↓</button>') +
        '</div>');
      var btn = document.getElementById('feedMore');
      if (btn) btn.addEventListener('click', function () {
        if (working) return;
        working = true; renderInfinite().then(function () { working = false; });
      });
      if (io) io.disconnect();
      if (!done && 'IntersectionObserver' in window) {
        io = new IntersectionObserver(function (entries) {
          if (entries[0].isIntersecting && !working) {
            working = true;
            renderInfinite().then(function () { working = false; });
          }
        }, { rootMargin: '320px' });
        io.observe(document.getElementById('feedSentinel'));
      }
      info.textContent = 'Showing ' + cursor + ' of ' + pool.length;
    });
  }

  function renderPaged() {
    var s = size(), start = (page - 1) * s;
    return ensure(start + s).then(function () {
      if (start >= pool.length && pool.length > 0) {
        page = Math.max(1, Math.ceil(pool.length / s));
        return renderPaged();
      }
      grid.innerHTML = pool.slice(start, start + s).map(card).join('');
      var totalPages = Math.max(1, Math.ceil(pool.length / s));
      var hasNext = loaded < (manifest ? manifest.chunks : 0) || page < totalPages;
      var html = '<div class="feed-pager"><button type="button" data-act="prev"' +
        (page <= 1 ? ' disabled' : '') + '>Previous</button>';
      var from = Math.max(1, page - 2), to = Math.min(totalPages, page + 2);
      for (var p = from; p <= to; p++) {
        html += (p === page)
          ? '<span class="feed-current">' + p + '</span>'
          : '<button type="button" data-page="' + p + '">' + p + '</button>';
      }
      if (to < totalPages) html += '<span class="feed-ellipsis">…</span>';
      html += '<button type="button" data-act="next"' + (hasNext ? '' : ' disabled') + '>Next</button></div>';
      var box = extras(html);
      box.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('button') : null;
        if (!b || b.disabled) return;
        if (b.getAttribute('data-act') === 'prev') page = Math.max(1, page - 1);
        else if (b.getAttribute('data-act') === 'next') page = page + 1;
        else if (b.getAttribute('data-page')) page = parseInt(b.getAttribute('data-page'), 10);
        else return;
        try { history.replaceState(null, '', '#page=' + page); } catch (err) { /* ignore */ }
        scrollToGrid();
        renderPaged();
      });
      info.textContent = 'Page ' + page + ' | ' + s + ' per page | ' + pool.length + ' patterns';
    });
  }

  function render(reset) {
    if (reset) { pool = []; cached = {}; loaded = 0; cursor = 0; page = 1; }
    if (!manifest) return Promise.resolve();
    if (io) { io.disconnect(); io = null; }
    return mode() === 'infinite' ? renderInfinite() : renderPaged();
  }

  modeEl.addEventListener('change', function () {
    ls('diy365_feed_mode', modeEl.value); render(true);
  });
  sizeEl.addEventListener('change', function () {
    ls('diy365_feed_size', sizeEl.value); render(true);
  });

  // On load failure leave the server-rendered first-screen cards untouched
  fetch('/data/feed/manifest.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('manifest'); return r.json(); })
    .then(function (m) { manifest = m; return render(false); })
    .catch(function () { info.textContent = ''; });
})();
