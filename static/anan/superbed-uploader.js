/* Decap CMS custom media library: upload DIRECTLY to Superbed from the browser.
 *
 * Why browser-direct (not a server proxy):
 *   Superbed blocks datacenter IPs and non-browser requests (CF Workers and server-side
 *   curl both get connection-reset on /upload). The editor's own browser is allowed.
 *
 * Auth: Superbed reads the token from the MULTIPART FORM FIELD `token`, NOT the
 *   X-API-Key header (the header method returns "Missing API key"). Same as PicGo/ShareX.
 *   The key is necessarily public here (Decap runs entirely in the browser).
 *
 * PDF support (Superbed does NOT accept PDF files):
 *   Selecting a PDF renders each page with pdf.js, splits tall pages into sections,
 *   converts each section to WebP (JPEG fallback) and uploads every image separately.
 *   Use the step-by-step images field for PDFs so every page is kept.
 *   Limits: 30 pages, 40 MB per PDF, 1500 px render width, 6 sections per page.
 *
 * Decap 3.x notes (verified in the bundle):
 *   - registerMediaLibrary expects the LIBRARY OBJECT (carrying `name`), not a string.
 *   - init() receives `handleInsert`; enableStandalone() must return true or the
 *     media button is hidden.
 *   - handleInsert must receive ABSOLUTE URL STRING(S), never {id,url} objects
 *     (objects get public_folder prepended -> "/uploads/https://..." -> broken).
 *   - allowMultiple defaults to TRUE for media libraries; a single value is passed
 *     as one string, multiple values as an array of strings.
 */
(function () {
  var CMS = window.CMS;
  if (!CMS) { console.error('Decap CMS not loaded'); return; }

  var PDF_LIB = '/js/vendor/pdf.min.mjs';
  var PDF_WORKER = '/js/vendor/pdf.worker.min.mjs';

  var MAX_IMG_BYTES = 15 * 1024 * 1024;
  var MAX_PDF_BYTES = 40 * 1024 * 1024;
  var MAX_PDF_PAGES = 30;
  var MAX_CANVAS_W = 1500;
  var SLICE_RATIO = 1.7;   // each section height ~ width * 1.7
  var MAX_SLICES = 6;      // max sections per page

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
      var pdfjs = null;

      function statusEl() {
        return overlay ? overlay.querySelector('.sb-status') : null;
      }
      function setStatus(msg) {
        var el = statusEl();
        if (el) el.textContent = msg || '';
      }

      /* ---------- upload a single image blob/file to Superbed ---------- */
      function uploadBlob(blob, name) {
        setStatus('Uploading: ' + name);
        var fd = new FormData();
        fd.append('file', blob, name || 'image.webp');
        if (apiKey) fd.append('token', apiKey);
        fd.append('categories', 'diy365'); // album on Superbed (auto-created)
        return fetch(endpoint, { method: 'POST', body: fd })
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
              var msg = d.error || d.msg || d.message ||
                (typeof d.err !== 'undefined' ? ('err=' + d.err) : '') ||
                res.txt || ('HTTP ' + (res.status || 'err'));
              throw new Error(String(msg).slice(0, 160));
            }
            return url;
          });
      }

      /* ---------- canvas -> WebP (JPEG fallback) ---------- */
      function canvasToImage(canvas) {
        return new Promise(function (resolve) {
          canvas.toBlob(function (b) {
            if (b && b.type === 'image/webp') { resolve({ blob: b, ext: 'webp' }); return; }
            canvas.toBlob(function (b2) {
              resolve({ blob: b2 || b, ext: 'jpg' });
            }, 'image/jpeg', 0.88);
          }, 'image/webp', 0.88);
        });
      }

      function loadPdfjs() {
        if (pdfjs) return Promise.resolve(pdfjs);
        setStatus('Loading PDF converter…');
        return import(PDF_LIB).then(function (mod) {
          mod.GlobalWorkerOptions.workerSrc = PDF_WORKER;
          pdfjs = mod;
          return mod;
        });
      }

      function isImage(f) {
        return /\.(jpe?g|png|webp)$/i.test(f.name) ||
          ['image/jpeg', 'image/png', 'image/webp'].indexOf(f.type) >= 0;
      }
      function isPdf(f) {
        return /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
      }

      /* ---------- PDF: render page by page, split tall pages, upload each section ---------- */
      function processPdf(file, results) {
        if (file.size > MAX_PDF_BYTES) {
          return Promise.reject(new Error('PDF is larger than 40 MB. Please compress it first.'));
        }
        return loadPdfjs().then(function (lib) {
          return file.arrayBuffer().then(function (buf) {
            return lib.getDocument({ data: buf }).promise;
          }).then(function (doc) {
            var pages = Math.min(doc.numPages, MAX_PDF_PAGES);
            var chain = Promise.resolve();

            for (var p = 1; p <= pages; p++) {
              (function (pageNo) {
                chain = chain.then(function () {
                  setStatus('Converting PDF: page ' + pageNo + ' of ' + doc.numPages);
                  return doc.getPage(pageNo);
                }).then(function (page) {
                  var vp = page.getViewport({ scale: 1.5 });
                  var scale = Math.min(1, MAX_CANVAS_W / vp.width) * 1.5;
                  var vp2 = page.getViewport({ scale: scale });
                  var c = document.createElement('canvas');
                  c.width = Math.max(1, Math.round(vp2.width));
                  c.height = Math.max(1, Math.round(vp2.height));
                  return page.render({ canvasContext: c.getContext('2d'), viewport: vp2 })
                    .promise.then(function () { return c; });
                }).then(function (c) {
                  // Split tall pages so each image stays readable on mobile.
                  var n = Math.min(Math.ceil(c.height / (c.width * SLICE_RATIO)), MAX_SLICES) || 1;
                  var base = file.name.replace(/\.pdf$/i, '')
                    .replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 40) || 'pattern';
                  var seq = Promise.resolve();
                  for (var s = 0; s < n; s++) {
                    (function (idx, total) {
                      seq = seq.then(function () {
                        var y = Math.round(idx * c.height / total);
                        var h = Math.round((idx + 1) * c.height / total) - y;
                        var seg = document.createElement('canvas');
                        seg.width = c.width;
                        seg.height = Math.max(1, h);
                        seg.getContext('2d').drawImage(c, 0, y, c.width, h, 0, 0, c.width, h);
                        return canvasToImage(seg).then(function (img) {
                          var name = base + '-p' + pageNo +
                            (total > 1 ? '-s' + (idx + 1) : '') + '.' + img.ext;
                          return uploadBlob(img.blob, name);
                        }).then(function (url) { results.push(url); });
                      });
                    })(s, n);
                  }
                  return seq;
                });
              })(p);
            }

            return chain.then(function () {
              if (doc.numPages > MAX_PDF_PAGES) {
                setStatus('PDF has ' + doc.numPages + ' pages; converted the first ' + MAX_PDF_PAGES + '.');
              }
            });
          });
        });
      }

      /* ---------- one selected file -> one or more uploaded URLs ---------- */
      function processFile(file, results) {
        if (isPdf(file)) return processPdf(file, results);
        if (isImage(file)) {
          if (file.size > MAX_IMG_BYTES) {
            setStatus('Image exceeds 15 MB, skipped: ' + file.name);
            return Promise.resolve();
          }
          return uploadBlob(file, file.name).then(function (url) { results.push(url); });
        }
        setStatus('Unsupported file type: ' + file.name + ' (JPG / PNG / WebP, or PDF)');
        return Promise.resolve();
      }

      function open(close, allowMultiple) {
        overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483000;display:flex;align-items:center;justify-content:center;';
        var box = document.createElement('div');
        box.style.cssText = 'background:#fff;border-radius:10px;padding:22px;width:460px;max-width:92vw;font-family:system-ui,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.3);';
        box.innerHTML =
          '<h3 style="margin:0 0 6px;font-size:18px;">Upload to Superbed</h3>' +
          '<p style="margin:0 0 8px;color:#555;font-size:13px;line-height:1.5;">JPG / PNG / WebP only on the image host. Selecting a <b>PDF</b> automatically splits every page into images before uploading (long pages are cut into sections).</p>' +
          '<p style="margin:0 0 12px;color:#8a6a00;font-size:12px;line-height:1.5;">Tip: choose PDFs on the step-by-step images field so every page is kept. Using the cover field keeps only the first image.</p>' +
          '<input type="file" accept="image/*,.pdf,application/pdf" style="display:block;width:100%;margin-bottom:10px;">' +
          '<div class="sb-status" style="margin-bottom:14px;color:#555;font-size:13px;min-height:18px;line-height:1.4;"></div>' +
          '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
            '<button class="sb-cancel" style="padding:9px 16px;cursor:pointer;border:1px solid #ccc;background:#fff;border-radius:6px;">Cancel</button>' +
            '<button class="sb-upload" style="padding:9px 16px;cursor:pointer;border:none;background:#2f80ed;color:#fff;border-radius:6px;">Upload</button>' +
          '</div>';
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        var input = box.querySelector('input[type=file]');
        // allowMultiple defaults to true in Decap; a single value must be ONE string.
        input.multiple = !!allowMultiple;
        var uploadBtn = box.querySelector('.sb-upload');
        var cancelBtn = box.querySelector('.sb-cancel');

        function closeModal() {
          if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
          overlay = null;
          if (typeof close === 'function') { try { close(); } catch (e) { console.error(e); } }
        }
        cancelBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

        uploadBtn.addEventListener('click', function () {
          var files = input.files;
          if (!files || !files.length) { setStatus('Please choose an image or a PDF first.'); return; }
          uploadBtn.disabled = true;
          var results = [];
          var chain = Promise.resolve();

          Array.prototype.forEach.call(files, function (f) {
            chain = chain.then(function () { return processFile(f, results); })
              .catch(function (e) {
                setStatus('Could not process ' + f.name + ' — ' + e.message);
              });
          });

          chain.then(function () {
            if (!results.length) {
              setStatus('Nothing was uploaded. Please try again.');
              uploadBtn.disabled = false;
              return;
            }
            var urls = results.slice();
            // A PDF produces several images: always insert them as an array so no
            // page is lost, even if Decap reports allowMultiple=false for this field.
            var multi = allowMultiple || urls.length > 1;
            setStatus('Done — ' + urls.length + ' image(s) uploaded. Inserting…');
            try {
              if (typeof handleInsert === 'function') handleInsert(multi ? urls : urls[0]);
            } catch (e) { console.error(e); }
            setTimeout(closeModal, 700);
          });
        });
      }

      return {
        show: function (showArgs) {
          var close = showArgs && showArgs.close;
          var allowMultiple = !!(showArgs && showArgs.allowMultiple);
          open(close, allowMultiple);
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

  CMS.registerMediaLibrary(SuperbedLibrary);
  CMS.init();
})();
