/* ============================================================
   DIY365 CMS - admin panels: 投稿审核 / 版权投诉
   Records live in the diy365-submit Worker KV, NOT in the GitHub repo
   Decap reads. A DMCA request must NEVER be publishable: the old panel
   showed "直接发布" for every type, which is how a takedown request was
   accidentally published as a pattern article.

   The admin key is entered once and kept in this browser's localStorage;
   it is never written into any file served by the site.
   ============================================================ */
(function () {
  'use strict';
  var API = 'https://diy365-submit.binean2046.workers.dev';
  var KEY_STORE = 'diy365_admin_key';
  var PAT_STORE = 'diy365_github_pat';
  var HANDLED_STORE = 'diy365_dmca_handled';
  var REPO = 'xuanqianye/diy365';
  var BTN = 'padding:5px 12px;border:1px solid #e5dbd7;border-radius:999px;' +
    'background:#fff;color:#2d2a2e;font:600 12px system-ui,sans-serif;cursor:pointer';
  var BTN_DANGER = 'padding:5px 12px;border:1px solid #f0c9d3;border-radius:999px;' +
    'background:#fff;color:#c2536f;font:600 12px system-ui,sans-serif;cursor:pointer';
  var BTN_PUB = 'padding:5px 12px;border:0;border-radius:999px;background:#d96b86;' +
    'color:#fff;font:600 12px system-ui,sans-serif;cursor:pointer';
  var BTN_OK = 'padding:5px 12px;border:0;border-radius:999px;background:#2e8b57;' +
    'color:#fff;font:600 12px system-ui,sans-serif;cursor:pointer';
  var overlay = null;
  var currentItems = [];
  var mode = 'review';          // 'review' | 'copyright'

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function getKey() { try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } }
  function setKey(k) { try { localStorage.setItem(KEY_STORE, k); } catch (e) {} }
  function body() { return document.getElementById('wbRvBody'); }

  /* ---------- record classification ---------- */
  function isDmca(it) {
    var t = String((it && it.type) || '').toLowerCase();
    return t === 'dmca' ||
      /DMCA Removal Request|Copyright Removal Request/i.test(String((it && it.md) || ''));
  }
  function isPattern(it) {
    var t = String((it && it.type) || '').toLowerCase();
    // legacy records without a type but with pattern front matter are patterns
    return t === 'submission' || (!t && !isDmca(it));
  }
  function handledMap() {
    try { return JSON.parse(localStorage.getItem(HANDLED_STORE) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function isHandled(id) { return !!handledMap()[id]; }
  function setHandled(id, on) {
    var m = handledMap();
    if (on) m[id] = Date.now(); else delete m[id];
    try { localStorage.setItem(HANDLED_STORE, JSON.stringify(m)); } catch (e) {}
  }

  /* ---------- shared floating toolbar (also used by tag-presets.js) ---------- */
  function ensureBar() {
    var bar = document.getElementById('wbAdminBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'wbAdminBar';
      bar.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483000;' +
        'display:flex;flex-direction:column;align-items:flex-end;gap:8px;';
      document.body.appendChild(bar);
    }
    return bar;
  }
  function barButton(id, label, bg) {
    var b = document.createElement('button');
    b.id = id;
    b.type = 'button';
    b.innerHTML = label;
    b.style.cssText = 'padding:9px 15px;border:none;border-radius:999px;background:' + bg +
      ';color:#fff;font:600 13px system-ui,sans-serif;cursor:pointer;position:relative;' +
      'box-shadow:0 6px 18px rgba(45,42,46,.25);white-space:nowrap;';
    return b;
  }

  /* ---------- overlay ---------- */
  function ensure() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'wbReviewOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483100;' +
      'background:rgba(30,26,30,.55);display:none;';
    overlay.innerHTML =
      '<div style="position:absolute;top:4vh;left:50%;transform:translateX(-50%);' +
      'width:min(920px,94vw);height:88vh;background:#fff;border-radius:14px;' +
      'box-shadow:0 18px 60px rgba(0,0,0,.28);display:flex;flex-direction:column;' +
      'overflow:hidden;font:14px/1.6 system-ui,-apple-system,sans-serif;color:#2d2a2e">' +
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 18px;' +
      'border-bottom:1px solid #eee;background:#fffaf7">' +
      '<strong id="wbRvTitle" style="font-size:16px"></strong>' +
      '<span id="wbRvHint" style="color:#8a8288;font-size:12px"></span>' +
      '<button id="wbRvRefresh" type="button" style="' + BTN + ';margin-left:auto">刷新</button>' +
      '<button id="wbRvKey" type="button" style="' + BTN + '">修改密钥</button>' +
      '<button id="wbRvClose" type="button" style="' + BTN + '">关闭</button>' +
      '</div><div id="wbRvBody" style="flex:1;overflow:auto;padding:16px 18px"></div></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.getElementById('wbRvClose').onclick = close;
    document.getElementById('wbRvRefresh').onclick = function () { load(); };
    document.getElementById('wbRvKey').onclick = function () { setKey(''); promptKey(); };
    return overlay;
  }
  function updateHeader() {
    var t = document.getElementById('wbRvTitle');
    var h = document.getElementById('wbRvHint');
    if (t) t.textContent = mode === 'copyright' ? '版权投诉' : '投稿审核';
    if (h) h.textContent = mode === 'copyright'
      ? '只查看 / 处理 DMCA 版权移除请求，本面板不会把内容发布到前台'
      : '直接发布 / 编辑后发布 = 写入 GitHub 仓库；前台上线仍需等待部署';
  }
  function open(which) {
    mode = which === 'copyright' ? 'copyright' : 'review';
    ensure();
    updateHeader();
    overlay.style.display = 'block';
    if (!getKey()) promptKey(); else load();
  }
  function close() { if (overlay) overlay.style.display = 'none'; }

  function promptKey() {
    body().innerHTML =
      '<div style="max-width:480px;margin:8vh auto;text-align:center">' +
      '<h2 style="font-size:18px;margin:0 0 8px">请输入管理密钥</h2>' +
      '<p style="color:#8a8288">投稿审核与版权投诉共用同一把密钥，只需输入一次，' +
      '保存在本机浏览器，不会写进网站源码。</p>' +
      '<input id="wbRvKeyInput" type="password" placeholder="ADMIN_KEY" ' +
      'style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #ddd;' +
      'border-radius:8px;font:14px monospace" />' +
      '<div id="wbRvKeyErr" style="color:#c2536f;margin-top:8px;min-height:20px"></div>' +
      '<button id="wbRvKeySave" type="button" style="margin-top:6px;padding:9px 22px;' +
      'border:0;border-radius:999px;background:#d96b86;color:#fff;font-weight:700;cursor:pointer">保存并加载</button>' +
      '</div>';
    var input = document.getElementById('wbRvKeyInput');
    input.focus();
    var save = function () {
      var v = (input.value || '').trim();
      if (!v) { document.getElementById('wbRvKeyErr').textContent = '密钥不能为空'; return; }
      setKey(v);
      load();
    };
    document.getElementById('wbRvKeySave').onclick = save;
    input.onkeydown = function (e) { if (e.key === 'Enter') save(); };
  }

  function load() {
    if (!getKey()) { promptKey(); return; }
    body().innerHTML = '<p style="color:#8a8288">正在加载记录…</p>';
    fetch(API + '/admin/list?key=' + encodeURIComponent(getKey()), { cache: 'no-store' })
      .then(function (r) {
        return r.json().then(function (j) { return { status: r.status, j: j }; });
      })
      .then(function (res) {
        if (res.status !== 200 || !res.j.ok) {
          body().innerHTML = '<p style="color:#c2536f">加载失败（HTTP ' + res.status + '）：' +
            esc(res.j && res.j.error || '') + '。请点右上角「修改密钥」重试。</p>';
          return;
        }
        currentItems = res.j.items || [];
        updateBadge();
        render();
      })
      .catch(function (e) {
        body().innerHTML = '<p style="color:#c2536f">网络错误：' + esc(e.message) + '</p>';
      });
  }

  function updateBadge() {
    var b = document.getElementById('wbDmcaBadge');
    if (!b) return;
    var n = 0;
    currentItems.forEach(function (it) { if (isDmca(it) && !isHandled(it.id)) n++; });
    b.textContent = n ? String(n) : '';
    b.style.display = n ? 'inline-block' : 'none';
  }

  /* ---------- markdown helpers for copyright records ---------- */
  function parseFields(md) {
    var out = [];
    String(md || '').split(/\r?\n/).forEach(function (line) {
      var m = line.match(/^-\s*([^:]{2,60}):\s*(.*)$/);
      if (m) out.push([m[1].trim(), m[2].trim()]);
    });
    return out;
  }
  function evidenceUrls(md) {
    var urls = [], re = /https?:\/\/[^\s<>"')]+/g, m;
    var s = String(md || '');
    while ((m = re.exec(s)) !== null) {
      var u = m[0].replace(/[.,;]+$/, '');
      if (/^https?:\/\/(www\.)?diy365\.cc/i.test(u)) continue;   // reported page, not evidence
      if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(u) || /imagehub|superbed|img[0-9]?\./i.test(u)) {
        if (urls.indexOf(u) < 0) urls.push(u);
      }
    }
    return urls.slice(0, 12);
  }
  function linkify(v) {
    var safe = esc(v);
    return safe.replace(/(https?:\/\/[^\s<]+)/g, function (u) {
      return '<a href="' + u + '" target="_blank" rel="noopener" style="color:#c2536f">' + u + '</a>';
    });
  }

  /* ---------- render ---------- */
  function render() {
    var list = [];
    currentItems.forEach(function (it, i) {
      if (mode === 'copyright' ? isDmca(it) : !isDmca(it)) list.push({ it: it, i: i });
    });
    if (!list.length) {
      body().innerHTML = '<div style="padding:40px 10px;text-align:center;color:#8a8288">' +
        (mode === 'copyright'
          ? '暂无版权投诉记录。<br><span style="font-size:12px">有人在 /copyright-removal/ 提交 DMCA 请求后会出现在这里，' +
            '右下角「版权投诉」按钮会显示待处理数量。</span>'
          : '暂无图解投稿。<br><span style="font-size:12px">版权投诉已移到独立的「版权投诉」面板。</span>') +
        '</div>';
      return;
    }
    var head = mode === 'copyright' ? copyrightSummary(list) : '';
    body().innerHTML = head + list.map(function (v) {
      return mode === 'copyright' ? renderDmca(v.it, v.i) : renderSubmission(v.it, v.i);
    }).join('');

    /* Decap re-renders its React tree continuously, so per-button onclick handlers
       can be dropped. Delegate all clicks to the stable container instead. */
    var host = body();
    if (host._wbClick) host.removeEventListener('click', host._wbClick);
    host._wbClick = function (e) {
      var btn = closestAction(e.target);
      if (!btn || !host.contains(btn)) return;
      try {
        onAction(btn.getAttribute('data-act'), Number(btn.getAttribute('data-i')), btn);
      } catch (err) {
        window.alert('操作失败：' + (err && err.message ? err.message : String(err)));
      }
    };
    host.addEventListener('click', host._wbClick);
  }

  function copyrightSummary(list) {
    var open = 0;
    list.forEach(function (v) { if (!isHandled(v.it.id)) open++; });
    return '<div style="margin-bottom:14px;padding:12px 14px;border-radius:10px;' +
      'background:#fff4f5;border:1px solid #f3d3da;color:#8a2b3d">' +
      '<b>共 ' + list.length + ' 条版权投诉，待处理 ' + open + ' 条。</b>' +
      '<div style="font-size:12px;margin-top:4px;color:#8a5a64">' +
      '版权投诉不是文章，本面板没有发布按钮；请按 DMCA 流程核实后手动下架对应内容，' +
      '再点「标记已处理」。"已处理" 状态保存在本机浏览器。</div></div>';
  }

  function renderSubmission(it, i) {
    var edited;
    try { edited = draftToPublish(it.md || ''); }
    catch (e) { edited = String(it.md == null ? '' : it.md); }
    var canPublish = isPattern(it);
    var typeLabel = String(it.type || 'submission');
    var actionBtns = canPublish
      ? '<button data-act="pub" data-i="' + i + '" type="button" style="' + BTN_PUB + '">直接发布</button>' +
        '<button data-act="edit" data-i="' + i + '" type="button" style="' + BTN + '">编辑后发布</button>'
      : '<span style="padding:4px 10px;border-radius:999px;background:#f2eee9;' +
        'color:#8a6a54;font-size:11px">留言 / 其它类型 · 不可发布</span>';
    return '<div style="border:1px solid #eee;border-radius:10px;padding:12px 14px;margin-bottom:12px">' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
      '<strong>' + esc(it.title || '(无标题)') + '</strong>' +
      '<span style="color:#8a8288;font-size:12px">' +
      esc(it.createdAt || '') + ' · ' + esc(typeLabel) + ' · ' +
      esc(it.name || '') + ' · ' + esc(it.email || '') + '</span>' +
      '<span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">' +
      actionBtns +
      '<button data-act="copy" data-i="' + i + '" type="button" style="' + BTN + '">复制 Markdown</button>' +
      '<button data-act="del" data-i="' + i + '" type="button" style="' + BTN_DANGER + '">删除</button>' +
      '</span></div>' +
      '<details style="margin-top:8px"><summary style="cursor:pointer;color:#8a8288;font-size:12px">查看 Markdown</summary>' +
      '<pre style="white-space:pre-wrap;word-break:break-word;background:#faf5ef;padding:12px;' +
      'border-radius:10px;font:12px/1.5 monospace">' + esc(it.md || '') + '</pre></details>' +
      (canPublish
        ? '<div id="wbRvEdit-' + i + '" style="display:none;margin-top:10px;padding:12px;' +
          'background:#fffaf7;border:1px solid #f0d9df;border-left:3px solid #d96b86;border-radius:8px">' +
          '<div style="color:#8a8288;font-size:12px;margin-bottom:6px">编辑 Markdown 后再发布（draft 已改为 false；如需分类请在后台文章里重新选择已有分类）</div>' +
          '<textarea id="wbRvEditTa-' + i + '" style="width:100%;height:220px;box-sizing:border-box;' +
          'padding:10px;border:1px solid #ddd;border-radius:8px;font:12px/1.5 monospace;background:#fff">' +
          esc(edited) + '</textarea>' +
          '<div style="margin-top:8px;display:flex;gap:8px;align-items:center">' +
          '<button data-act="save" data-i="' + i + '" type="button" style="' + BTN_PUB + '">保存并发布</button>' +
          '<button data-act="cancel" data-i="' + i + '" type="button" style="' + BTN + '">取消</button>' +
          '</div></div>'
        : '') +
      '</div>';
  }

  function renderDmca(it, i) {
    var done = isHandled(it.id);
    var fields = parseFields(it.md);
    var ev = evidenceUrls(it.md);
    var rows = fields.map(function (f) {
      return '<div style="display:flex;gap:10px;padding:5px 0;border-bottom:1px solid #f6eeee;' +
        'font-size:13px"><span style="flex:0 0 168px;color:#8a8288">' + esc(f[0]) + '</span>' +
        '<span style="flex:1;min-width:0;word-break:break-word">' + linkify(f[1]) + '</span></div>';
    }).join('');
    var thumbs = ev.length
      ? '<div style="margin-top:10px"><div style="color:#8a8288;font-size:12px;margin-bottom:6px">' +
        '证明材料（' + ev.length + ' 张，点击可放大）</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' + ev.map(function (u) {
          return '<a href="' + esc(u) + '" target="_blank" rel="noopener">' +
            '<img src="' + esc(u) + '" alt="evidence" loading="lazy" ' +
            'style="height:96px;max-width:150px;object-fit:cover;border:1px solid #eee;' +
            'border-radius:8px;background:#faf5ef"></a>';
        }).join('') + '</div></div>'
      : '<div style="margin-top:10px;color:#a08a90;font-size:12px">未附证明材料</div>';
    return '<div style="border:1px solid #f0d9df;border-left:4px solid #c2536f;' +
      'border-radius:10px;padding:12px 14px;margin-bottom:12px;background:' +
      (done ? '#fafafa' : '#fffafa') + '">' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
      '<strong style="color:#8a2b3d">版权移除请求' + (done ? '' : ' · 待处理') + '</strong>' +
      '<span style="color:#8a8288;font-size:12px">' + esc(it.createdAt || '') +
      ' · ' + esc(it.name || '') + ' · ' + esc(it.email || '') + '</span>' +
      '<span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">' +
      '<button data-act="handled" data-i="' + i + '" type="button" style="' +
      (done ? BTN : BTN_OK) + '">' + (done ? '取消已处理' : '标记已处理') + '</button>' +
      '<button data-act="copy" data-i="' + i + '" type="button" style="' + BTN + '">复制内容</button>' +
      '<button data-act="del" data-i="' + i + '" type="button" style="' + BTN_DANGER + '">删除记录</button>' +
      '</span></div>' +
      '<div style="margin-top:10px">' + (rows || '<span style="color:#8a8288">（无结构化字段，请查看原始内容）</span>') + '</div>' +
      thumbs +
      '<details style="margin-top:10px"><summary style="cursor:pointer;color:#8a8288;font-size:12px">查看原始 Markdown</summary>' +
      '<pre style="white-space:pre-wrap;word-break:break-word;background:#faf5ef;padding:12px;' +
      'border-radius:10px;font:12px/1.5 monospace">' + esc(it.md || '') + '</pre></details>' +
      '</div>';
  }

  function closestAction(node) {
    while (node && node.nodeType === 1) {
      if (node.getAttribute && node.getAttribute('data-act')) return node;
      if (node === document.body) break;
      node = node.parentNode;
    }
    return null;
  }

  function onAction(act, i, btn) {
    var it = currentItems[i];
    if (!it) { window.alert('这条记录已不存在，请点右上角「刷新」'); return; }
    var box, ta;
    switch (act) {
      case 'copy': copyText(it.md || '', btn); break;
      case 'del': remove(i); break;
      case 'pub': publish(i, it.md || '', btn); break;
      case 'handled':
        setHandled(it.id, !isHandled(it.id));
        updateBadge();
        render();
        break;
      case 'edit':
        box = document.getElementById('wbRvEdit-' + i);
        if (!box) { window.alert('编辑区未找到，请点右上角「刷新」后重试'); return; }
        var opening = box.style.display === 'none';
        box.style.display = opening ? 'block' : 'none';
        btn.textContent = opening ? '收起编辑' : '编辑后发布';
        if (opening) {
          ta = document.getElementById('wbRvEditTa-' + i);
          if (ta) { ta.focus(); try { ta.setSelectionRange(0, 0); } catch (e) {} }
          if (box.scrollIntoView) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
        break;
      case 'cancel':
        box = document.getElementById('wbRvEdit-' + i);
        if (box) box.style.display = 'none';
        var toggle = body().querySelector('[data-act="edit"][data-i="' + i + '"]');
        if (toggle) toggle.textContent = '编辑后发布';
        break;
      case 'save':
        ta = document.getElementById('wbRvEditTa-' + i);
        publish(i, ta ? ta.value : (it.md || ''), btn);
        break;
    }
  }

  function flash(btn, text) {
    var old = btn.textContent;
    btn.textContent = text;
    setTimeout(function () { btn.textContent = old; }, 1600);
  }
  function copyText(text, btn) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { flash(btn, '已复制'); },
        function () { legacyCopy(text, btn); }
      );
    } else legacyCopy(text, btn);
  }
  function legacyCopy(text, btn) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); flash(btn, '已复制'); }
    catch (e) { flash(btn, '复制失败'); }
    document.body.removeChild(ta);
  }

  /* ---------- publish: write a reviewed *pattern* into the GitHub repo ---------- */
  function ghToken() {
    var keys = ['decap-cms-user', 'netlify-cms-user'];
    try {
      for (var j = 0; j < localStorage.length; j++) {
        var k = localStorage.key(j);
        if (k && /cms[-_]user/i.test(k) && keys.indexOf(k) < 0) keys.push(k);
      }
      for (var n = 0; n < keys.length; n++) {
        var raw = localStorage.getItem(keys[n]);
        if (!raw) continue;
        try {
          var u = JSON.parse(raw);
          var t = u.token || (u.auth && u.auth.token) || (u.data && u.data.token);
          if (t) return t;
        } catch (e) { /* not JSON, ignore */ }
      }
      return localStorage.getItem(PAT_STORE) || '';
    } catch (e) { return ''; }
  }
  function ensureToken() {
    var t = ghToken();
    if (t) return t;
    var pat = window.prompt('未找到后台登录凭据。请粘贴一个有 contents:write 权限的 GitHub PAT（只保存在本机浏览器）：', '');
    if (!pat) return '';
    pat = pat.trim();
    try { localStorage.setItem(PAT_STORE, pat); } catch (e) {}
    return pat;
  }
  function base64Utf8(s) { return btoa(unescape(encodeURIComponent(s))); }
  function draftToPublish(md) {
    return String(md == null ? '' : md).replace(/^draft:\s*true\s*$/m, 'draft: false');
  }
  function todayCN() {
    return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  }
  function withFrontMatter(content, slug) {
    var s = String(content == null ? '' : content);
    var m = s.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
    if (m) {
      var fm = m[2];
      if (!/^date:/m.test(fm)) fm += '\ndate: ' + todayCN();
      if (!/^draft:/m.test(fm)) fm += '\ndraft: false';
      if (!/^slug:/m.test(fm)) fm += '\nslug: ' + slug;
      return m[1] + fm + m[3] + s.slice(m[0].length);
    }
    return '---\ndate: ' + todayCN() + '\ndraft: false\nslug: ' + slug + '\n---\n\n' + s;
  }
  function makeSlug(s) {
    var v = String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '').slice(0, 40);
    return v || 'pattern';
  }

  function publish(i, md, btn) {
    var it = currentItems[i];
    if (!it) return;
    /* HARD GUARD: the previous version published a DMCA request as a pattern.
       Only type=submission (or a legacy untyped pattern) may ever be published. */
    if (isDmca(it) || !isPattern(it)) {
      window.alert('这条记录不是图解投稿，不能发布到前台。\n\n' +
        '版权投诉请到右下角「版权投诉」面板处理；留言类记录也不提供发布。');
      return;
    }
    var token = ensureToken();
    if (!token) return;
    var slug = makeSlug(it.title) + '-' + Date.now().toString(36);
    var content = withFrontMatter(draftToPublish(md == null ? (it.md || '') : md), slug);
    if (!content.trim()) { window.alert('内容为空，无法发布'); return; }
    var path = 'content/patterns/' + slug + '.md';
    var old = btn ? btn.textContent : '';
    if (btn) { btn.textContent = '发布中…'; btn.disabled = true; }
    fetch('https://api.github.com/repos/' + REPO + '/contents/' + path, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({
        message: 'Publish reviewed submission: ' + (it.title || slug),
        content: base64Utf8(content),
        branch: 'main'
      })
    }).then(function (r) {
      return r.json().then(function (j) { return { status: r.status, j: j }; });
    }).then(function (res) {
      if (res.status !== 201 && res.status !== 200) {
        window.alert('发布失败（HTTP ' + res.status + '）：' +
          (res.j.message || JSON.stringify(res.j)) + '\n\n若是 401，请在后台退出后重新用 GitHub 登录。');
        if (btn) { btn.textContent = old; btn.disabled = false; }
        return;
      }
      window.alert('已发布到后台仓库：' + path + '\n\n前台上线需等待部署完成。');
      fetch(API + '/admin/delete?key=' + encodeURIComponent(getKey()) +
        '&id=' + encodeURIComponent(it.id), { cache: 'no-store' })
        .then(function () { load(); })
        .catch(function () { load(); });
    }).catch(function (e) {
      window.alert('网络错误：' + e.message);
      if (btn) { btn.textContent = old; btn.disabled = false; }
    });
  }

  function remove(i) {
    var it = currentItems[i];
    if (!it) return;
    var what = mode === 'copyright' ? '版权投诉' : '记录';
    if (!window.confirm('确定删除这条' + what + '？删除后不可恢复。\n\n' + (it.title || ''))) return;
    fetch(API + '/admin/delete?key=' + encodeURIComponent(getKey()) +
      '&id=' + encodeURIComponent(it.id), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) { window.alert('删除失败：' + (j.error || '')); return; }
        load();
      })
      .catch(function (e) { window.alert('网络错误：' + e.message); });
  }

  /* Floating launchers inside the CMS. Decap re-renders its SPA, so keep
     re-adding the buttons whenever they disappear. */
  function addLaunchers() {
    var bar = ensureBar();
    if (!document.getElementById('wbReviewBtn')) {
      var btn = barButton('wbReviewBtn', '投稿审核', '#d96b86');
      btn.title = '查看 / 发布图解投稿（版权投诉不在这里）';
      btn.addEventListener('click', function () { open('review'); });
      bar.appendChild(btn);
    }
    if (!document.getElementById('wbDmcaBtn')) {
      var d = barButton('wbDmcaBtn',
        '版权投诉 <span id="wbDmcaBadge" style="display:none;position:absolute;top:-6px;' +
        'right:-6px;min-width:18px;height:18px;line-height:18px;padding:0 4px;' +
        'border-radius:999px;background:#ffd93d;color:#5a3b00;font-size:11px;' +
        'font-weight:800;text-align:center"></span>', '#8a2b3d');
      d.title = '查看 DMCA 版权移除请求（不会发布到前台）';
      d.addEventListener('click', function () { open('copyright'); });
      bar.appendChild(d);
    }
    updateBadge();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addLaunchers);
  else addLaunchers();
  if (window.MutationObserver) {
    new MutationObserver(function () {
      if (!document.getElementById('wbReviewBtn') || !document.getElementById('wbDmcaBtn')) addLaunchers();
    }).observe(document.body, { childList: true });
  }

  window.DIY365Review = {
    open: function () { open('review'); },
    openCopyright: function () { open('copyright'); },
    close: close
  };
})();
