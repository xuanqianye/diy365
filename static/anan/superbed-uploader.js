/* Decap CMS custom media library: upload images DIRECTLY to Superbed from the browser.
 *
 * Why browser-direct (not a server proxy):
 *   Superbed blocks datacenter IPs and non-browser requests (CF Workers and server-side
 *   curl both get connection-reset on /upload). The editor's own browser (normal network)
 *   is allowed, so we upload straight from the client.
 *
 * Security note:
 *   The token below is read from config.yml (media_library.config.apiKey) and is
 *   necessarily PUBLIC here — Decap CMS runs entirely in the browser. This is the same
 *   key PicGo/ShareX use for Superbed, so it matches intended use. To limit abuse, keep
 *   your Superbed upload quota low and rotate the key if needed.
 *
 *   AUTH NOTE: Superbed authenticates via the `token` MULTIPART FORM FIELD, NOT the
 *   `X-API-Key` header. The header method returns "Missing API key" (verified), so we
 *   append `token` to the FormData. This matches the official PicGo/ShareX config.
 *
 * IMPORTANT: Decap 3.x registerMediaLibrary expects the LIBRARY OBJECT as the first arg
 * (not a string name), and init() receives `handleInsert` (not `handleMediaUpload`).
 * Decap also hides the media button unless enableStandalone() returns true.
 */
(function () {
  var CMS = window.CMS;
  if (!CMS) { console.error('Decap CMS not loaded'); return; }

  var SuperbedLibrary = {
    name: 'superbed',
    config: {},
    init: function (args) {
      var options = (args && args.options) || {};
      // Decap 3.x passes `handleInsert`; older docs called it `handleMediaUpload`.
      var handleInsert = args && (args.handleInsert || args.handleMediaUpload);
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
          '<input type="file" accept="image/*,.pdf" multiple style="display:block;width:100%;margin-bottom:12px;">' +
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
          if (typeof close === 'function') { try { close(); } catch (e) { console.error(e); } }
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
              try { if (typeof handleInsert === 'function') handleInsert(results); } catch (e) { console.error(e); }
              setTimeout(closeModal, 500);
              return;
            }
            var file = files[i];
            status.textContent = 'Uploading ' + (i + 1) + '/' + files.length + ': ' + file.name;
            var fd = new FormData();
            fd.append('file', file, file.name || ('file' + i));
            // Superbed auth = `token` MULTIPART FORM FIELD (NOT X-API-Key header — that
            // returns "Missing API key"). Same as the official PicGo/ShareX config.
            if (apiKey) fd.append('token', apiKey);
            fd.append('categories', 'diy365'); // album on superbed (auto-created)
            fetch(endpoint, { method: 'POST', body: fd })
              .then(function (r) {
                return r.text().then(function (txt) {
                  var d = null;
                  try { d = JSON.parse(txt); } catch (e) { d = { _raw: txt }; }
                  return { ok: r.ok, status: r.status, d: d, txt: txt };
                });
              })
              .then(function (res) {
                var d = res.d || {};
                var url = d.url || (d.data && d.data.url) || d.src || (d.data && d.data.src);
                if (!res.ok || !url || (typeof d.err !== 'undefined' && d.err !== 0)) {
                  var msg = d.error || d.msg || d.message || (typeof d.err !== 'undefined' ? ('err=' + d.err) : '') || res.txt || ('HTTP ' + (res.status || 'err'));
                  throw new Error(msg);
                }
                results.push({ id: url, name: file.name, url: url });
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
        enableStandalone: function () { return true; }
      };
    }
  };

  // Decap 3.x: registerMediaLibrary( libraryObject )  -- the object carries `name`.
  CMS.registerMediaLibrary(SuperbedLibrary);
  CMS.init();
})();
