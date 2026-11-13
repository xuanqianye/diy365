/* 后台「标签预设」：把当前选中的标签存为命名预设，下次一键套用。
 *
 * 使用 field-helper.js 暴露的：
 *   __diy365GetField('tags')  -> 当前标签数组
 *   __diy365SetField('tags', arr) -> 写入（与 Decap 内部 DRAFT_CHANGE_FIELD 一致）
 *
 * 说明：
 *   - 预设保存在浏览器 localStorage（key: diy365_tag_presets），每台电脑各自一份。
 *   - 「套用」采用「并集去重」：把预设标签追加到当前已选标签里（不会删掉已有的），
 *     重复套用同一预设不会重复添加。
 *   - 仅在正在编辑某篇草稿时有效。
 */
(function () {
  if (!window.CMS) return;

  var KEY = 'diy365_tag_presets';

  function getPresets() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
  }
  function setPresets(arr) {
    try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch (e) {}
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

  /* ---------- UI ---------- */
  var btn, panel, panelOpen = false;

  function buildUI() {
    btn = document.createElement('button');
    btn.textContent = '🏷️ 标签预设';
    btn.title = '保存 / 套用标签组合';
    btn.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147482000;padding:10px 14px;' +
      'background:#2f80ed;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.25);font-family:system-ui,sans-serif;';
    document.body.appendChild(btn);
    btn.addEventListener('click', togglePanel);

    panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;right:14px;bottom:58px;z-index:2147482000;width:300px;max-height:70vh;' +
      'overflow:auto;background:#fff;border:1px solid #e2e2e2;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.25);' +
      'font-family:system-ui,sans-serif;font-size:13px;color:#222;display:none;';
    document.body.appendChild(panel);
  }

  function togglePanel() {
    panelOpen = !panelOpen;
    panel.style.display = panelOpen ? 'block' : 'none';
    if (panelOpen) render();
  }

  function render() {
    var presets = getPresets();
    var cur = getCurrentTags();
    var html = '';
    html += '<div style="padding:12px 14px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">';
    html += '<b style="font-size:14px;">🏷️ 标签预设</b>';
    html += '<span style="cursor:pointer;color:#999;font-size:16px;line-height:1;" data-act="close">×</span></div>';

    html += '<div style="padding:10px 14px;border-bottom:1px solid #eee;">';
    html += '当前标签：<b>' + (cur.length ? cur.join('、') : '（无）') + '</b>';
    html += '<div style="margin-top:8px;display:flex;gap:6px;">';
    html += '<input id="tp-name" placeholder="预设名称，如 植物/节日" style="flex:1;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:13px;">';
    html += '<button data-act="save" style="padding:6px 10px;background:#2f80ed;color:#fff;border:none;border-radius:6px;cursor:pointer;">保存当前</button>';
    html += '</div></div>';

    html += '<div style="padding:6px 14px 12px;">';
    if (!presets.length) {
      html += '<div style="color:#999;padding:8px 0;">还没有预设。选中若干标签后点「保存当前」即可建立。</div>';
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
    html += '</div>';
    panel.innerHTML = html;

    panel.querySelector('[data-act="close"]').addEventListener('click', togglePanel);
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
    if (!name) name = '预设' + (getPresets().length + 1);
    var presets = getPresets();
    var exist = presets.findIndex(function (p) { return p.name === name; });
    var rec = { name: name, tags: cur.slice() };
    if (exist >= 0) presets[exist] = rec; else presets.push(rec);
    setPresets(presets);
    if (input) input.value = '';
    render();
  }

  function onApply(i) {
    var presets = getPresets();
    var p = presets[i];
    if (!p) return;
    var cur = getCurrentTags();
    var union = cur.slice();
    (p.tags || []).forEach(function (t) { if (union.indexOf(t) < 0) union.push(t); });
    var ok = setTags(union);
    if (ok) {
      var input = panel.querySelector('#tp-name');
      if (input) input.value = '';
      render();
      // 短暂提示已套用
      btn.textContent = '✅ 已套用 ' + p.name;
      setTimeout(function () { btn.textContent = '🏷️ 标签预设'; }, 1500);
    } else {
      alert('套用失败：请确认你正在编辑一篇草稿（已打开某个文章）。');
    }
  }

  function onDelete(i) {
    var presets = getPresets();
    presets.splice(i, 1);
    setPresets(presets);
    render();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function init() {
    if (document.getElementById('tp-root')) return;
    buildUI();
  }

  // Decap 加载后 DOM 已就绪；延迟一点确保 body 存在
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
