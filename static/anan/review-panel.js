/* ============================================================
   DIY365 CMS - embedded submission review panel
   Submissions are stored in the diy365-submit Worker KV, NOT in the
   GitHub repo Decap reads. This panel keeps the review workflow inside
   /anan/ instead of opening a separate Worker tab.

   The admin key is entered once and kept in this browser's localStorage;
   it is never written into any file served by the site.
   ============================================================ */
(function () {
  var API = 'https://diy365-submit.binean2046.workers.dev';
  var KEY_STORE = 'diy365_admin_key';
  var PAT_STORE = 'diy365_github_pat';
  var REPO = 'xuanqianye/diy365';
  var BTN = 'padding:5px 12px;border:1px solid #e5dbd7;border-radius:999px;' +
    'background:#fff;color:#2d2a2e;font:600 12px system-ui,sans-serif;cursor:pointer';
  var BTN_DANGER = 'padding:5px 12px;border:1px solid #f0c9d3;border-radius:999px;' +
    'background:#fff;color:#c2536f;font:600 12px system-ui,sans-serif;cursor:pointer';
  var BTN_PUB = 'padding:5px 12px;border:0;border-radius:999px;background:#d96b86;' +
    'color:#fff;font:600 12px system-ui,sans-serif;cursor:pointer';
  var overlay = null;
  var currentItems = [];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function getKey() { try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } }
  function setKey(k) { try { localStorage.setItem(KEY_STORE, k); } catch (e) {} }
  function body() { return document.getElementById('wbRvBody'); }

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
      '<strong style="font-size:16px">投稿审核</strong>' +
      '<span style="color:#8a8288;font-size:12px">直接发布 / 编辑后发布 = 写入 GitHub 仓库；前台上线仍需用 WorkBuddy 推送</span>' +
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

  function open() {
    ensure().style.display = 'block';
    if (!getKey()) promptKey(); else load();
  }
  function close() { if (overlay) overlay.style.display = 'none'; }

  function promptKey() {
    body().innerHTML =
      '<div style="max-width:480px;margin:8vh auto;text-align:center">' +
      '<h2 style="font-size:18px;margin:0 0 8px">请输入投稿管理密钥</h2>' +
      '<p style="color:#8a8288">只需输入一次，之后保存在本机浏览器，不会写进网站源码。</p>' +
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
    body().innerHTML = '<p style="color:#8a8288">正在加载投稿列表…</p>';
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
        render();
      })
      .catch(function (e) {
        body().innerHTML = '<p style="color:#c2536f">网络错误：' + esc(e.message) + '</p>';
      });
  }

  function render() {
    if (!currentItems.length) { body().innerHTML = '<p style="color:#8a8288">暂无投稿。</p>'; return; }
    body().innerHTML = currentItems.map(function (it, i) {
      return '<div style="border:1px solid #eee;border-radius:10px;padding:12px 14px;margin-bottom:12px">' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        '<strong>' + esc(it.title || '(无标题)') + '</strong>' +
        '<span style="color:#8a8288;font-size:12px">' +
        esc(it.createdAt || '') + ' · ' + esc(it.type || '') + ' · ' +
        esc(it.name || '') + ' · ' + esc(it.email || '') + '</span>' +
        '<span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">' +
        '<button data-pub="' + i + '" type="button" style="' + BTN_PUB + '">直接发布</button>' +
        '<button data-edit="' + i + '" type="button" style="' + BTN + '">编辑后发布</button>' +
        '<button data-copy="' + i + '" type="button" style="' + BTN + '">复制 Markdown</button>' +
        '<button data-del="' + i + '" type="button" style="' + BTN_DANGER + '">删除</button>' +
        '</span></div>' +
        '<details style="margin-top:8px"><summary style="cursor:pointer;color:#8a8288;font-size:12px">查看 Markdown</summary>' +
        '<pre style="white-space:pre-wrap;word-break:break-word;background:#faf5ef;padding:12px;' +
        'border-radius:10px;font:12px/1.5 monospace">' + esc(it.md || '') + '</pre></details>' +
        '<div id="wbRvEdit-' + i + '" style="display:none;margin-top:10px">' +
        '<div style="color:#8a8288;font-size:12px;margin-bottom:6px">编辑 Markdown 后再发布（draft 已改为 false；如需分类请在后台文章里重新选择已有分类）</div>' +
        '<textarea id="wbRvEditTa-' + i + '" style="width:100%;height:220px;box-sizing:border-box;' +
        'padding:10px;border:1px solid #ddd;border-radius:8px;font:12px/1.5 monospace">' +
        esc(draftToPublish(it.md || '')) + '</textarea>' +
        '<div style="margin-top:8px;display:flex;gap:8px;align-items:center">' +
        '<button data-save="' + i + '" type="button" style="' + BTN_PUB + '">保存并发布</button>' +
        '<button data-cancel="' + i + '" type="button" style="' + BTN + '">取消</button>' +
        '</div></div></div>';
    }).join('');

    Array.prototype.forEach.call(body().querySelectorAll('[data-copy]'), function (btn) {
      btn.onclick = function () { copyText(currentItems[Number(btn.dataset.copy)].md || '', btn); };
    });
    Array.prototype.forEach.call(body().querySelectorAll('[data-del]'), function (btn) {
      btn.onclick = function () { remove(Number(btn.dataset.del)); };
    });
    Array.prototype.forEach.call(body().querySelectorAll('[data-pub]'), function (btn) {
      btn.onclick = function () {
        var i = Number(btn.dataset.pub);
        publish(i, currentItems[i].md || '', btn);
      };
    });
    Array.prototype.forEach.call(body().querySelectorAll('[data-edit]'), function (btn) {
      btn.onclick = function () {
        document.getElementById('wbRvEdit-' + btn.dataset.edit).style.display = 'block';
      };
    });
    Array.prototype.forEach.call(body().querySelectorAll('[data-cancel]'), function (btn) {
      btn.onclick = function () {
        document.getElementById('wbRvEdit-' + btn.dataset.cancel).style.display = 'none';
      };
    });
    Array.prototype.forEach.call(body().querySelectorAll('[data-save]'), function (btn) {
      btn.onclick = function () {
        var i = Number(btn.dataset.save);
        var ta = document.getElementById('wbRvEditTa-' + i);
        publish(i, ta.value, btn);
      };
    });
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

  /* ---------- publish: write a reviewed submission into the GitHub repo ----------
     Decap stores its OAuth token (scope=repo) in localStorage; reuse it instead of
     asking the editor for another secret. If it cannot be found, fall back to a
     PAT entered once and kept in this browser only. */
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
  function draftToPublish(md) { return md.replace(/^draft:\s*true\s*$/m, 'draft: false'); }
  function makeSlug(s) {
    var v = String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '').slice(0, 40);
    return v || 'pattern';
  }

  function publish(i, md, btn) {
    var it = currentItems[i];
    if (!it) return;
    var token = ensureToken();
    if (!token) return;
    var slug = makeSlug(it.title) + '-' + Date.now().toString(36);
    var content = draftToPublish(md || it.md || '');
    if (!content.trim()) { window.alert('内容为空，无法发布'); return; }
    // Give every published submission a short permalink, matching the new slug field.
    if (!/^slug:\s*\S+/m.test(content)) {
      content = content.replace(/^draft:\s*false\s*$/m, 'draft: false\nslug: ' + slug);
    }
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
      window.alert('已发布到后台仓库：' + path +
        '\n\n刷新后台后可在「钩针图解」里继续编辑；前台上线仍需用 WorkBuddy 推送。');
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
    if (!window.confirm('确定删除这条投稿？删除后不可恢复。\n\n' + (it.title || ''))) return;
    fetch(API + '/admin/delete?key=' + encodeURIComponent(getKey()) +
      '&id=' + encodeURIComponent(it.id), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) { window.alert('删除失败：' + (j.error || '')); return; }
        load();
      })
      .catch(function (e) { window.alert('网络错误：' + e.message); });
  }

  /* Floating launcher inside the CMS. Decap re-renders its SPA, so keep
     re-adding the button whenever it disappears. */
  function addLauncher() {
    if (document.getElementById('wbReviewBtn')) return;
    var btn = document.createElement('button');
    btn.id = 'wbReviewBtn';
    btn.type = 'button';
    btn.textContent = '投稿审核';
    btn.title = '在后台里查看/管理投稿（首次需输入管理密钥）';
    btn.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483000;' +
      'padding:10px 16px;border:none;border-radius:999px;background:#d96b86;color:#fff;' +
      'font:600 14px system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(45,42,46,.25);';
    btn.addEventListener('click', open);
    document.body.appendChild(btn);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addLauncher);
  else addLauncher();
  if (window.MutationObserver) {
    new MutationObserver(function () {
      if (!document.getElementById('wbReviewBtn')) addLauncher();
    }).observe(document.body, { childList: true });
  }

  window.DIY365Review = { open: open, close: close };
})();
