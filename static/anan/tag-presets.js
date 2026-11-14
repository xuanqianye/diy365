/* 后台「标签预设」：把当前选中的标签存为命名预设，下次一键套用。
 *
 * 预设保存在仓库 data/tag-presets.json，跨设备共享（不是浏览器 localStorage）。
 * 后端 /api/tag-presets 直接复用本浏览器 Decap 的 GitHub 登录态
 * （X-GH-Token 请求头），无需在 Cloudflare 另配 GH_TOKEN。
 *
 * 使用 field-helper.js 暴露的：
 *   __diy365GetField('tags')  -> 当前标签数组
 *   __diy365SetField('tags', arr) -> 写入（与 Decap 内部 DRAFT_CHANGE_FIELD 一致）
 *
 * 说明：
 *   - 「套用」采用「并集去重」：把预设标签追加到当前已选标签里（不会删掉已有的）。
 *   - 仅在正在编辑某篇草稿时有效。
 *   - 浮动按钮与「投稿审核 / 版权投诉」共用右下角工具条 #wbAdminBar，互不重叠。
 */
(function () {
  if (!window.CMS) return;

  var API = '/api/tag-presets';
  var presets = [];
  var loaded = false;
  var loadErr = '';

  /* Decap 把 GitHub OAuth token 存在 localStorage；与 review-panel.js 同一套查找逻辑。 */
  function cmsToken() {
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
        } catch (e) { /* not JSON */ }
      }
      return localStorage.getItem('diy365_github_pat') || '';
    } catch (e) { return ''; }
  }
  function apiHeaders() {
    var h = { 'Content-Type': 'application/json' };
    var t = cmsToken();
    if (t) h['X-GH-Token'] = t;
    return h;
  }
  function getCurrentTags() {
    var t = (typeof window.__diy365GetField === 'function') ? window.__diy365GetField('tags') : null;
    if (!t) return [];
    return Array.isArray(t) ? t : [t];
  }
  function setTags(arr) {
    if (typeof window.__diy365SetField === 'function') return window.__diy365SetField('tags', arr);
    return false;
  }

  /* ---------- 与后端交互 ---------- */
  function load() {
    return fetch(API, { credentials: 'same-origin', headers: { 'X-GH-Token': cmsToken() } })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        presets = (j && j.presets) || [];
        loaded = true;
        loadErr = (j && j.error) || '';
      })
      .catch(function () { loaded = true; loadErr = 'fetch_failed'; });
  }
  function savePreset(name, tags) {
    return fetch(API, {
      method: 'POST', headers: apiHeaders(),
      body: JSON.stringify({ action: 'save', name: name, tags: tags })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.ok && Array.isArray(j.presets)) presets = j.presets;
      return j;
    });
  }
  function deletePreset(name) {
    return fetch(API, {
      method: 'POST', headers: apiHeaders(),
      body: JSON.stringify({ action: 'delete', name: name })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.ok && Array.isArray(j.presets)) presets = j.presets;
      return j;
    });
  }

  /* ---------- UI ---------- */
  var btn, panel, panelOpen = false;

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
  function addButton() {
    if (document.getElementById('tpLaunch')) return;
    btn = document.createElement('button');
    btn.id = 'tpLaunch';
    btn.type = 'button';
    btn.textContent = '🏷️ 标签预设';
    btn.title = '保存 / 套用标签组合（存于仓库，跨设备共享）';
    btn.style.cssText = 'padding:9px 15px;border:none;border-radius:999px;background:#2f80ed;' +
      'color:#fff;font:600 13px system-ui,sans-serif;cursor:pointer;white-space:nowrap;' +
      'box-shadow:0 6px 18px rgba(45,42,46,.25);';
    btn.addEventListener('click', togglePanel);
    ensureBar().appendChild(btn);
  }
  function buildPanel() {
    panel = document.createElement('div');
    /* bottom:160px keeps the panel above the 3-button toolbar instead of covering it */
    panel.style.cssText = 'position:fixed;right:20px;bottom:160px;z-index:2147482000;width:320px;' +
      'max-height:64vh;overflow:auto;background:#fff;border:1px solid #e2e2e2;border-radius:10px;' +
      'box-shadow:0 8px 30px rgba(0,0,0,.25);font-family:system-ui,sans-serif;font-size:13px;' +
      'color:#222;display:none;';
    document.body.appendChild(panel);
  }
  function togglePanel() {
    if (!panel) return;
    panelOpen = !panelOpen;
    panel.style.display = panelOpen ? 'block' : 'none';
    if (panelOpen) render();
  }
  function errText(code) {
    if (code === 'need_login') return '请先用 GitHub 登录后台（登录态即凭据），登录后点「重新加载」。';
    if (code === 'not_configured') return '后端缺少 GitHub 凭据，请更新 /api/tag-presets 到最新版本。';
    if (code === 'fetch_failed') return '无法连接 /api/tag-presets，请检查网络或稍后重试。';
    return '后端返回错误：' + code;
  }

  function render() {
    var cur = getCurrentTags();
    var html = '';
    html += '<div style="padding:12px 14px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">';
    html += '<b style="font-size:14px;">🏷️ 标签预设</b>';
    html += '<span style="cursor:pointer;color:#999;font-size:16px;line-height:1;" data-act="close">×</span></div>';

    if (!loaded) {
      html += '<div style="padding:10px 14px;color:#888;">加载预设中…</div>';
    } else if (loadErr) {
      html += '<div style="padding:10px 14px;color:#c0392b;background:#fdf3f2;">' +
        escapeHtml(errText(loadErr)) +
        '<div style="margin-top:6px"><button data-act="reload" style="padding:4px 10px;' +
        'background:#fff;border:1px solid #e2b6bb;border-radius:6px;cursor:pointer;color:#c0392b;">重新加载</button></div></div>';
    }

    html += '<div style="padding:10px 14px;border-bottom:1px solid #eee;">';
    html += '当前标签：<b>' + escapeHtml(cur.length ? cur.join('、') : '（无）') + '</b>';
    html += '<div style="margin-top:8px;display:flex;gap:6px;">';
    html += '<input id="tp-name" placeholder="预设名称，如 植物/节日" style="flex:1;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:13px;">';
    html += '<button data-act="save" style="padding:6px 10px;background:#2f80ed;color:#fff;border:none;border-radius:6px;cursor:pointer;">保存当前</button>';
    html += '</div></div>';

    html += '<div style="padding:6px 14px 12px;">';
    if (loaded && !loadErr) {
      if (!presets.length) {
        html += '<div style="color:#999;padding:8px 0;">还没有预设。选中若干标签后点「保存当前」即可建立（存到仓库，换设备也能用）。</div>';
      } else {
        presets.forEach(function (p, i) {
          html += '<div style="display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid #f3f3f3;">';
          html += '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">';
          html += '<b>' + escapeHtml(p.name) + '</b> <span style="color:#888;">(' + (p.tags || []).length + ')</span></span>';
          html += '<button data-act="apply" data-i="' + i + '" style="padding:4px 9px;background:#27ae60;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:12px;">套用</button>';
          html += '<button data-act="del" data-i="' + i + '" style="padding:4px 9px;background:#e74c3c;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:12px;">删</button>';
          html += '</div>';
        });
      }
    }
    html += '</div>';
    panel.innerHTML = html;

    var closeEl = panel.querySelector('[data-act="close"]');
    if (closeEl) closeEl.addEventListener('click', togglePanel);
    var reloadBtn = panel.querySelector('[data-act="reload"]');
    if (reloadBtn) reloadBtn.addEventListener('click', function () {
      loaded = false; render();
      load().then(function () { render(); });
    });
    var saveBtn = panel.querySelector('[data-act="save"]');
    if (saveBtn) saveBtn.addEventListener('click', onSave);
    panel.querySelectorAll('[data-act="apply"]').forEach(function (b) {
      b.addEventListener('click', function () { onApply(parseInt(b.getAttribute('data-i'), 10)); });
    });
    panel.querySelectorAll('[data-act="del"]').forEach(function (b) {
      b.addEventListener('click', function () { onDelete(parseInt(b.getAttribute('data-i'), 10)); });
    });
  }

  function onSave() {
    var cur = getCurrentTags();
    if (!cur.length) { alert('当前没有选中任何标签，无法保存预设。请先在「标签」字段选好标签。'); return; }
    var input = panel.querySelector('#tp-name');
    var name = (input && input.value || '').trim();
    if (!name) name = '预设' + (presets.length + 1);
    savePreset(name, cur.slice()).then(function (j) {
      if (j && j.ok) {
        if (input) input.value = '';
        render();
        btn.textContent = '✅ 已保存 ' + name;
        setTimeout(function () { btn.textContent = '🏷️ 标签预设'; }, 1500);
      } else {
        alert('保存失败：' + (j ? errText(j.error || 'unknown') : '未知错误'));
      }
    }).catch(function () { alert('保存失败：网络错误。'); });
  }
  function onApply(i) {
    var p = presets[i];
    if (!p) return;
    var cur = getCurrentTags();
    var union = cur.slice();
    (p.tags || []).forEach(function (t) { if (union.indexOf(t) < 0) union.push(t); });
    if (setTags(union)) {
      render();
      btn.textContent = '✅ 已套用 ' + p.name;
      setTimeout(function () { btn.textContent = '🏷️ 标签预设'; }, 1500);
    } else {
      alert('套用失败：请确认你正在编辑一篇草稿（已打开某个文章）。');
    }
  }
  function onDelete(i) {
    var p = presets[i];
    if (!p) return;
    if (!confirm('删除预设「' + p.name + '」？')) return;
    deletePreset(p.name).then(function (j) {
      if (j && j.ok) render();
      else alert('删除失败：' + (j ? errText(j.error || 'unknown') : '未知错误'));
    }).catch(function () { alert('删除失败：网络错误。'); });
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function init() {
    addButton();
    buildPanel();
    load().then(function () { if (panelOpen) render(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  /* Decap re-renders its SPA and may drop our button; keep it in the shared bar. */
  if (window.MutationObserver) {
    new MutationObserver(function () {
      if (!document.getElementById('tpLaunch')) addButton();
    }).observe(document.body, { childList: true });
  }
})();
