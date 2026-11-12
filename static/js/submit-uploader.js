/* ============================================================
   /submit/ image upload: direct to Superbed (JPG / PNG / WebP only).
   PDFs are rendered page by page with pdf.js, long pages are split into
   sections, then converted to WebP/JPEG before upload. PDFs are never
   uploaded directly because the image host does not support them.
   ============================================================ */
(function () {
  'use strict';

  var ENDPOINT = 'https://api.superbed.cn/upload';
  var TOKEN = '41871f8e5d6823960d3128b1ffb518a7';
  var PDF_LIB = '/js/vendor/pdf.min.mjs';
  var PDF_WORKER = '/js/vendor/pdf.worker.min.mjs';

  var MAX_IMG_BYTES = 15 * 1024 * 1024;
  var MAX_PDF_PAGES = 30;
  var MAX_PDF_BYTES = 40 * 1024 * 1024;
  var MAX_CANVAS_W = 1500;
  var SLICE_RATIO = 1.7;   // each section height ~ width * 1.7 (splits long pages)
  var MAX_SLICES = 6;      // max sections per page

  var zone, input, list, output, statusEl, countEl, form;
  var items = [];          // uploaded image URLs, in order
  var busy = false;
  var pdfjs = null;

  function $(id) { return document.getElementById(id); }

  function setStatus(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.className = 'sb-status' + (kind ? ' sb-' + kind : '');
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function isImage(f) {
    return /\.(jpe?g|png|webp)$/i.test(f.name) ||
           ['image/jpeg', 'image/png', 'image/webp'].indexOf(f.type) >= 0;
  }
  function isPdf(f) { return /\.pdf$/i.test(f.name) || f.type === 'application/pdf'; }

  function render() {
    if (output) output.value = items.join('\n');
    if (countEl) countEl.textContent = items.length;
    if (!list) return;
    list.innerHTML = '';
    items.forEach(function (url, i) {
      var div = document.createElement('div');
      div.className = 'sb-item';
      div.innerHTML =
        '<img src="' + esc(url) + '" alt="" loading="lazy">' +
        '<span class="sb-item-tag">' + (i === 0 ? 'Cover' : 'Image ' + (i + 1)) + '</span>' +
        '<button type="button" class="sb-item-del" aria-label="Remove this image">&times;</button>';
      div.querySelector('.sb-item-del').addEventListener('click', function () {
        items.splice(i, 1);
        render();
      });
      list.appendChild(div);
    });
  }

  /* ---------- upload one image to Superbed ---------- */
  function uploadBlob(blob, name) {
    setStatus('Uploading: ' + name);
    var fd = new FormData();
    fd.append('file', blob, name);
    fd.append('token', TOKEN);
    fd.append('categories', 'diy365-submit');
    return fetch(ENDPOINT, { method: 'POST', body: fd })
      .then(function (r) {
        return r.text().then(function (txt) {
          var d = {};
          try { d = JSON.parse(txt); } catch (e) { /* keep empty */ }
          var url = d.url || (d.data && d.data.url) || d.src;
          var badErr = d.err !== undefined && d.err !== 0;
          if (!r.ok || badErr || !url) {
            throw new Error(d.msg || d.error || d.message || txt.slice(0, 120) || ('HTTP ' + r.status));
          }
          return url;
        });
      })
      .then(function (url) {
        items.push(url);
        render();
      });
  }

  /* ---------- canvas -> webp (jpeg fallback) ---------- */
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

  /* ---------- render PDF page by page + split long pages ---------- */
  function convertPdf(file) {
    if (file.size > MAX_PDF_BYTES) {
      return Promise.reject(new Error('PDF is larger than 40 MB. Please compress it first: ' + file.name));
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
              return page.render({ canvasContext: c.getContext('2d'), viewport: vp2 }).promise
                .then(function () { return c; });
            }).then(function (c) {
              // split tall pages so a single image is readable on mobile
              var n = Math.min(Math.ceil(c.height / (c.width * SLICE_RATIO)), MAX_SLICES) || 1;
              var base = file.name.replace(/\.pdf$/i, '').replace(/[^\w\u4e00-\u9fa5-]+/g, '-').slice(0, 40);
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
                    });
                  });
                })(s, n);
              }
              return seq;
            });
          })(p);
        }
        return chain.then(function () {
          if (doc.numPages > MAX_PDF_PAGES) {
            setStatus('PDF has ' + doc.numPages + ' pages; converted the first ' + MAX_PDF_PAGES, 'warn');
          }
        });
      });
    });
  }

  /* ---------- file entry point ---------- */
  function handleFiles(files) {
    if (!files || !files.length || busy) return;
    busy = true;
    var chain = Promise.resolve();
    Array.prototype.forEach.call(files, function (f) {
      chain = chain.then(function () {
        if (isImage(f)) {
          if (f.size > MAX_IMG_BYTES) {
            setStatus('Image exceeds 15 MB, skipped: ' + f.name, 'warn');
            return;
          }
          return uploadBlob(f, f.name);
        }
        if (isPdf(f)) return convertPdf(f);
        setStatus('Unsupported file type: ' + f.name + ' (JPG / PNG / WebP only; PDFs are converted to images)', 'err');
      }).catch(function (e) {
        setStatus('Could not process ' + f.name + ' — ' + e.message, 'err');
      });
    });
    chain.then(function () {
      busy = false;
      if (items.length) setStatus('Done — ' + items.length + ' image(s) uploaded', 'ok');
      render();
    });
  }

  function init() {
    zone = $('sbDrop'); input = $('sbFiles'); list = $('sbList');
    output = $('sbUrls'); statusEl = $('sbStatus'); countEl = $('sbCount');
    if (!zone || !input) return;
    form = zone.closest('form');

    zone.addEventListener('click', function () { input.click(); });
    zone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', function () {
      handleFiles(input.files);
      input.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('sb-drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('sb-drag'); });
    });
    zone.addEventListener('drop', function (e) { handleFiles(e.dataTransfer.files); });

    if (form) {
      form.addEventListener('submit', function (e) {
        if (busy) {
          e.preventDefault();
          setStatus('Images are still uploading / converting. Please wait before submitting.', 'err');
          return;
        }
        if (!items.length) {
          e.preventDefault();
          setStatus('Please upload at least one image (JPG / PNG / WebP).', 'err');
          zone.focus();
        }
      });
    }
    render();

    /* ---------- server-issued verification ---------- */
    var uploadBox = document.querySelector('.sb-upload[data-api]');
    var api = uploadBox ? uploadBox.getAttribute('data-api') : '';
    var capImg = $('sbCaptchaSvg'), capAns = $('sbCaptchaAnswer'),
        capTok = $('sbCaptchaToken'), capBtn = $('sbCaptchaRefresh'), capMsg = $('sbCaptchaMsg');
    function capStatus(t) { if (capMsg) capMsg.textContent = t; }
    function loadCaptcha() {
      if (!api || !capImg || !capTok) return;
      capStatus('Loading verification…');
      fetch(api + '/captcha', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          capImg.innerHTML = d.svg || '';
          capTok.value = d.token || '';
          if (capAns) capAns.value = '';
          capStatus('');
        })
        .catch(function () { capStatus('Could not load verification. Click "New question" to retry.'); });
    }
    if (capBtn) capBtn.addEventListener('click', loadCaptcha);
    loadCaptcha();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
