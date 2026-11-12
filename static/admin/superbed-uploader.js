/* Decap CMS custom media library: upload images DIRECTLY to Superbed from the browser.
 *
 * Why browser-direct (not a server proxy):
 *   Superbed blocks datacenter IPs and non-browser requests (CF Workers and server-side
 *   curl both get connection-reset on /upload). The editor's own browser (normal network)
 *   is allowed, so we upload straight from the client.
 *
 * Security note:
 *   The X-API-Key below is read from config.yml (media_library.config.apiKey) and is
 *   necessarily PUBLIC here — Decap CMS runs entirely in the browser. This is the same
 *   key PicGo/ShareX use for Superbed, so it matches intended use. To limit abuse, keep
 *   your Superbed upload quota low and rotate the key if needed.
 */
(function () {
  var CMS = window.CMS;
  if (!CMS) { console.error('Decap CMS not loaded'); return; }

  var SuperbedLibrary = {
    name: 'superbed',
    config: {},
    init: function (args) {
      var options = (args && args.options) || {};
      var handleMediaUpload = args && args.handleMediaUpload;
      var endpoint = (options.config && options.config.endpoint) || 'https://api.superbed.cn/upload';
      var apiKey = (options.config && options.config.apiKey) || '';
      var overlay = null;

      function open(close) {
        overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483000;display:flex;align-items:center;justify-content:center;';
        var box = document.createElement('div');
        box.style.cssText = 'background:#fff;border-radius:10px;padding:22px;width:440px;max-width:92vw;font-family:system-ui,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.3);';
        box.innerHTML =
          '<h3 style="margin:0 0 6px;font-size:18px;">Upload to Superbed</h3>' +
          '<p style="margin:0 0 14px;color:#666;font-size:13px;">Images are stored on the Superbed CDN; the returned URL is inserted into your field.</p>' +
          '<input type="file" accept="image/*" multiple style="display:block;width:100%;margin-bottom:12px;">' +
          '<div class="sb-status" style="margin-bottom:14px;color:#555;font-size:13px;min-height:18px;"></div>' +
          '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
            '<button class="sb-cancel" style="padding:9px 16px;cursor:pointer;border:1px solid #ccc;background:#fff;border-radius:6px;">Cancel</button>' +
            '<button class="sb-upload" style="padding:9px 16px;cursor:pointer;border:none;background:#2f80ed;color:#fff;border-radius:6px;">Upload</button>' +
          '</div>';
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        var input = box.querySelector('input[type=file]');
        var status = box.querySelector('.sb-status');
        var uploadBtn = box.querySelector('.sb-upload');
        var cancelBtn = box.querySelector('.sb-cancel');

        function closeModal() {
          if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
          overlay = null;
          if (typeof close === 'function') close();
        }
        cancelBtn.addEventListener('click', closeModal);

        uploadBtn.addEventListener('click', function () {
          var files = input.files;
          if (!files || !files.length) { status.textContent = 'Please choose an image first.'; return; }
          uploadBtn.disabled = true;
          var results = [];
          var i = 0;
          function next() {
            if (i >= files.length) {
              status.textContent = 'Done — inserting ' + results.length + ' image(s).';
              try { handleMediaUpload(results); } catch (e) { console.error(e); }
              setTimeout(closeModal, 500);
              return;
            }
            var file = files[i];
            status.textContent = 'Uploading ' + (i + 1) + '/' + files.length + ': ' + file.name;
            var fd = new FormData();
            fd.append('file', file, file.name || ('image' + i + '.jpg'));
            var headers = {};
            if (apiKey) headers['X-API-Key'] = apiKey;
            fetch(endpoint, { method: 'POST', headers: headers, body: fd })
              .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
              .then(function (res) {
                var url = res.d && (res.d.url || (res.d.data && res.d.data.url) || res.d.src);
                if (!res.ok || !url) throw new Error((res.d && (res.d.error || res.d.msg)) || ('HTTP ' + (res.ok ? 200 : 'err')));
                results.push({ id: url, url: url });
                i++; next();
              })
              .catch(function (e) {
                status.textContent = 'Upload failed: ' + e.message + '. If blocked, try with your VPN on.';
                uploadBtn.disabled = false;
              });
          }
          next();
        });
      }

      return {
        show: function (showArgs) {
          var close = showArgs && showArgs.close;
          open(close);
        },
        hide: function () {
          if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
          overlay = null;
        },
        onClearControl: function () {},
        onRemoveControl: function () {},
        onSelection: function () {}
      };
    }
  };

  CMS.registerMediaLibrary('superbed', SuperbedLibrary);
  CMS.init();
})();
