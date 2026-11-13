/* Decap CMS 常驻提示：同步机制说明（不依赖 CMS 是否初始化，直接挂到 body） */
(function () {
  'use strict';
  if (document.getElementById('wb-sync-notice')) return;

  var css = [
    '#wb-sync-notice{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:999998;',
    'max-width:min(700px,calc(100vw - 32px));background:#f3f8ff;border:1px solid #bcd4f5;',
    'border-left:6px solid #3b82f6;border-radius:14px;box-shadow:0 12px 34px rgba(45,42,46,.18);',
    'padding:14px 38px 14px 16px;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;',
    'color:#1f2d3d;animation:wbSyncDrop .25s ease both}',
    '@keyframes wbSyncDrop{from{opacity:0;transform:translate(-50%,14px)}to{opacity:1;transform:translate(-50%,0)}}',
    '#wb-sync-notice b{color:#1d4ed8}',
    '#wb-sync-notice code{background:#e3edff;border-radius:5px;padding:1px 6px;font-size:13px;color:#1d4ed8}',
    '#wb-sync-notice .x{position:absolute;top:8px;right:10px;border:0;background:transparent;',
    'font-size:18px;line-height:1;color:#6b7a8d;cursor:pointer;padding:2px 6px}',
    '#wb-sync-notice .x:hover{color:#1f2d3d}'
  ].join('');
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var box = document.createElement('div');
  box.id = 'wb-sync-notice';
  box.setAttribute('role', 'note');
  box.innerHTML =
    '<button class="x" type="button" aria-label="关闭">×</button>' +
    '<span>💡 <b>同步说明：</b>线上和远程仓库会自动更新；本地工作区要手动 <code>git pull</code> 才同步。</span>';

  box.querySelector('.x').addEventListener('click', function () {
    if (box.parentNode) box.parentNode.removeChild(box);
  });
  document.body.appendChild(box);
})();
