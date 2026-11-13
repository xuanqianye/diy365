/* Decap CMS 常驻提示：登录白名单 fail-closed 故障排查（不依赖 CMS 是否初始化，直接挂到 body） */
(function () {
  'use strict';
  if (document.getElementById('wb-wl-notice')) return;

  var css = [
    '#wb-wl-notice{position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:999998;',
    'max-width:min(720px,calc(100vw - 32px));background:#fff7ed;border:1px solid #fcd9a8;',
    'border-left:6px solid #f59e0b;border-radius:14px;box-shadow:0 12px 34px rgba(45,42,46,.18);',
    'padding:14px 38px 14px 16px;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;',
    'color:#5b3a09;animation:wbWlDrop .25s ease both}',
    '@keyframes wbWlDrop{from{opacity:0;transform:translate(-50%,14px)}to{opacity:1;transform:translate(-50%,0)}}',
    '#wb-wl-notice b{color:#b45309}',
    '#wb-wl-notice code{background:#fde9cf;border-radius:5px;padding:1px 6px;font-size:13px;color:#b45309}',
    '#wb-wl-notice .x{position:absolute;top:8px;right:10px;border:0;background:transparent;',
    'font-size:18px;line-height:1;color:#a8742f;cursor:pointer;padding:2px 6px}',
    '#wb-wl-notice .x:hover{color:#5b3a09}'
  ].join('');
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var box = document.createElement('div');
  box.id = 'wb-wl-notice';
  box.setAttribute('role', 'note');
  box.innerHTML =
    '<button class="x" type="button" aria-label="关闭">×</button>' +
    '<span>⚠️ <b>白名单故障排查：</b>本站登录白名单采用 fail‑closed 策略——若 <code>GitHub API</code> 偶发故障导致取不到用户名，会判定为「拒绝登录」。万一你某天突然登不进后台，先排查是不是 GitHub API 抽风：临时把 <code>diy365-auth</code> Worker 的白名单去掉再部署，即可进后台。</span>';

  box.querySelector('.x').addEventListener('click', function () {
    if (box.parentNode) box.parentNode.removeChild(box);
  });
  document.body.appendChild(box);
})();
