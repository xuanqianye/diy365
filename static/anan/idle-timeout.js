/**
 * 闲置超时自动退出（安全增强）
 * - 超过 1 小时（IDLE_LIMIT_MS）无任何操作，则清除 Decap 登录态并刷新页面，强制重新登录。
 * - 最后 5 分钟弹出一次温和提示。
 * - 仅在「已登录」状态下计时；未登录 / 登录流程中不计时，避免误踢。
 */
(function () {
  var IDLE_LIMIT_MS = 60 * 60 * 1000;   // 1 小时
  var WARN_BEFORE_MS = 5 * 60 * 1000;   // 到期前 5 分钟提示
  var CHECK_INTERVAL_MS = 30 * 1000;    // 每 30 秒检查一次

  var lastActive = Date.now();
  var warned = false;

  // Decap / Netlify CMS 把登录态存在 localStorage，key 前缀为 netlify-cms（或 decap-cms）。
  function isLoggedIn() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        if ((k.indexOf('netlify-cms') === 0 || k.indexOf('decap-cms') === 0) && localStorage.getItem(k)) {
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  function markActive() {
    lastActive = Date.now();
    warned = false;
  }

  // 监听常见用户操作事件（捕获阶段，覆盖 Decap 内部元素）。
  ['mousemove', 'keydown', 'click', 'scroll', 'touchstart', 'focus'].forEach(function (ev) {
    window.addEventListener(ev, markActive, true);
  });

  function logout() {
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && (k.indexOf('netlify-cms') === 0 || k.indexOf('decap-cms') === 0)) {
          localStorage.removeItem(k);
        }
      }
    } catch (e) {}
    location.reload();
  }

  function showWarn() {
    var b = document.createElement('div');
    b.textContent = '安全提示：超过 1 小时未操作将自动退出登录，请注意保存未发布的编辑。';
    b.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99999',
      'background:#f59e0b', 'color:#1a1a1a', 'font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif',
      'text-align:center', 'padding:10px 12px', 'box-shadow:0 2px 8px rgba(0,0,0,.2)'
    ].join(';');
    (document.body || document.documentElement).appendChild(b);
    setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 10000);
  }

  setInterval(function () {
    if (!isLoggedIn()) {
      // 未登录（含登录流程中）：不计时，避免把正在登录的人踢掉。
      lastActive = Date.now();
      warned = false;
      return;
    }
    var idle = Date.now() - lastActive;
    if (idle >= IDLE_LIMIT_MS) {
      logout();
      return;
    }
    if (!warned && idle >= IDLE_LIMIT_MS - WARN_BEFORE_MS) {
      warned = true;
      showWarn();
    }
  }, CHECK_INTERVAL_MS);
})();
