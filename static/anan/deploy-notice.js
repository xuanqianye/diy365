/* Decap CMS 发布成功提示：内容会自动提交到 GitHub 并由 CI 部署上线。 */
(function () {
  'use strict';
  if (!window.CMS || typeof CMS.registerEventListener !== 'function') return;

  var css = [
    '#wb-deploy-notice{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:999999;',
    'max-width:min(560px,calc(100vw - 32px));background:#fffaf3;border:1px solid #f3d7a8;',
    'border-left:6px solid #f59e0b;border-radius:14px;box-shadow:0 12px 34px rgba(45,42,46,.22);',
    'padding:16px 18px;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;',
    'color:#2d2a2e;animation:wbDrop .25s ease both}',
    '@keyframes wbDrop{from{opacity:0;transform:translate(-50%,-14px)}to{opacity:1;transform:translate(-50%,0)}}',
    '#wb-deploy-notice strong{display:block;font-size:17px;font-weight:800;margin-bottom:4px;color:#8a5a00}',
    '#wb-deploy-notice small{display:block;color:#8a7460;font-size:13px;margin-top:4px}',
    '#wb-deploy-notice button{margin-top:12px;border:0;border-radius:8px;background:#f59e0b;',
    'color:#fff;font-weight:700;font-size:14px;padding:8px 18px;cursor:pointer}',
    '#wb-deploy-notice button:hover{background:#e08b06}'
  ].join('');
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var lastShown = 0;

  function showNotice() {
    var now = Date.now();
    if (now - lastShown < 8000 || document.getElementById('wb-deploy-notice')) return;
    lastShown = now;

    var box = document.createElement('div');
    box.id = 'wb-deploy-notice';
    box.setAttribute('role', 'status');
    box.innerHTML =
      '<strong>✅ 发布成功！</strong>' +
      '<span>已经发布成功，看一看前端有没有上线。</span>' +
      '<small>内容已自动提交并部署，稍等片刻刷新前台即可看到。</small>' +
      '<button type="button">知道了</button>';

    box.querySelector('button').addEventListener('click', function () {
      if (box.parentNode) box.parentNode.removeChild(box);
    });
    document.body.appendChild(box);
    window.setTimeout(function () {
      if (box.parentNode) box.parentNode.removeChild(box);
    }, 30000);
  }

  // GitHub 后端发布走 postPublish；部分版本/工作流只触发 postSave，两个都监听并去重。
  ['postPublish', 'postSave'].forEach(function (name) {
    try {
      CMS.registerEventListener({ name: name, handler: function () { showNotice(); } });
    } catch (e) {
      console.warn('[deploy-notice] 无法注册 ' + name, e);
    }
  });
})();
