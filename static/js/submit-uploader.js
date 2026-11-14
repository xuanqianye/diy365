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

    /* ---------- server-issued verification ----------
       The upstream Worker lives on workers.dev, which can be slow or briefly
       unreachable from mainland China. Without a timeout the browser fetch can
       hang forever and the form stays at "Loading verification…" with an empty
       image box. Add an abort timeout, automatic retries and a clear failure
       message; "New question" cancels any in-flight request.
       ------------------------------------------------------------------ */
    var uploadBox = document.querySelector('.sb-upload[data-api]');
    var api = uploadBox ? uploadBox.getAttribute('data-api') : '';
    var capImg = $('sbCaptchaSvg'), capAns = $('sbCaptchaAnswer'),
        capTok = $('sbCaptchaToken'), capBtn = $('sbCaptchaRefresh'), capMsg = $('sbCaptchaMsg');
    var CAP_TIMEOUT = 8000, CAP_RETRIES = 2, capSeq = 0, capCtrl = null;

    function capStatus(t, kind) {
      if (!capMsg) return;
      capMsg.textContent = t;
      capMsg.style.color = kind === 'err' ? '#c0392b' : '';
    }

    function fetchCaptcha(seq) {
      var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
      capCtrl = ctrl;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, CAP_TIMEOUT) : null;
      function done() { if (timer) clearTimeout(timer); }
      return fetch(api + '/captcha?_=' + Date.now(), {
        cache: 'no-store', signal: ctrl ? ctrl.signal : undefined
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (d) {
        done();
        if (seq !== capSeq) return null;      // superseded by a newer load
        if (!d || !d.svg || !d.token) throw new Error('Invalid verification response');
        return d;
      }, function (e) {
        done();
        throw e;
      });
    }

    function loadCaptcha() {
      if (!api || !capImg || !capTok) return;
      var seq = ++capSeq;
      if (capCtrl) { try { capCtrl.abort(); } catch (e) { /* already settled */ } }
      capImg.innerHTML = '';
      capTok.value = '';
      if (capAns) capAns.value = '';
      capStatus('Loading verification…');

      function attempt(n) {
        fetchCaptcha(seq).then(function (d) {
          if (seq !== capSeq || !d) return;
          capImg.innerHTML = d.svg;
          capTok.value = d.token;
          capStatus('');
        }).catch(function () {
          if (seq !== capSeq) return;         // superseded by a newer load
          if (n < CAP_RETRIES) {
            capStatus('Verification is taking longer than usual, retrying…');
            setTimeout(function () { if (seq === capSeq) attempt(n + 1); }, 700);
          } else {
            capStatus('Could not load verification. Check your connection and click "New question" to retry.', 'err');
          }
        });
      }
      attempt(0);
    }
    if (capBtn) capBtn.addEventListener('click', loadCaptcha);
    loadCaptcha();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* ============================================================
   DMCA supporting-evidence uploader  (/copyright-removal/ and /dmca/)
   The receiving Worker only persists a fixed set of DMCA fields, so the
   uploaded image URLs are appended to the `infringing` textarea just before
   the form posts. The admin "版权投诉" panel parses them back into thumbnails.
   ============================================================ */
(function () {
  'use strict';

  var ENDPOINT = 'https://api.superbed.cn/upload';
  var TOKEN = '41871f8e5d6823960d3128b1ffb518a7';
  var MAX_FILES = 5;
  var MAX_BYTES = 15 * 1024 * 1024;
  var MARK = '\n\nSupporting evidence (uploaded images):\n';
  var SUCCESS_TITLE = 'Submission successful!';
  var SUCCESS_TEXT = 'We will process your copyright removal request promptly. ' +
                     'Any infringing content will be removed in a timely manner.';

  var zone, input, list, statusEl, countEl, output, form, infringing;
  var items = [];
  var busy = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function setStatus(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.className = 'sb-status' + (kind ? ' sb-' + kind : '');
  }
  function isImage(f) {
    return /\.(jpe?g|png|webp)$/i.test(f.name) ||
           ['image/jpeg', 'image/png', 'image/webp'].indexOf(f.type) >= 0;
  }

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
        '<span class="sb-item-tag">Evidence ' + (i + 1) + '</span>' +
        '<button type="button" class="sb-item-del" aria-label="Remove this image">&times;</button>';
      div.querySelector('.sb-item-del').addEventListener('click', function () {
        items.splice(i, 1);
        render();
      });
      list.appendChild(div);
    });
  }

  function uploadOne(f) {
    setStatus('Uploading: ' + f.name + '…');
    var fd = new FormData();
    fd.append('file', f, f.name);
    fd.append('token', TOKEN);
    fd.append('categories', 'diy365-dmca-evidence');
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
      .then(function (url) { items.push(url); render(); });
  }

  function handleFiles(files) {
    if (!files || !files.length || busy) return;
    busy = true;
    var chain = Promise.resolve();
    Array.prototype.forEach.call(files, function (f) {
      chain = chain.then(function () {
        if (items.length >= MAX_FILES) {
          setStatus('最多上传 5 张证明材料，已忽略其余文件。', 'warn');
          return;
        }
        if (!isImage(f)) {
          setStatus('仅支持 JPG / PNG / WebP 图片：' + f.name, 'warn');
          return;
        }
        if (f.size > MAX_BYTES) {
          setStatus('图片超过 15 MB，已跳过：' + f.name, 'warn');
          return;
        }
        return uploadOne(f);
      }).catch(function (e) {
        setStatus('上传失败 ' + f.name + ' — ' + e.message, 'err');
      });
    });
    chain.then(function () {
      busy = false;
      if (items.length && !/上传失败/.test(statusEl ? statusEl.textContent : '')) {
        setStatus('已上传 ' + items.length + ' 张证明材料', 'ok');
      }
      render();
    });
  }

  /* ---------- DMCA confirmation ----------------------------------
     The Worker's generic "Thank you! Your pattern is pending review" page
     is wrong for a copyright notice. We post the form ourselves (simple
     urlencoded request, CORS is open on the Worker) and render the correct
     confirmation in place, so this works without redeploying the Worker.
     ------------------------------------------------------------------ */
  function showSuccess(form) {
    var card = document.createElement('div');
    card.className = 'form-wrap';
    card.setAttribute('role', 'status');
    card.innerHTML =
      '<h2 style="margin-top:0">' + SUCCESS_TITLE + '</h2>' +
      '<p>' + SUCCESS_TEXT + '</p>' +
      '<p><a class="btn" href="/">Back to the site</a></p>';
    if (form.parentNode) form.parentNode.replaceChild(card, form);
    if (card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function showError(form, msg) {
    var btn = form.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = false; btn.textContent = 'Submit Removal Request'; }
    var old = form.querySelector('.dmca-submit-error');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var box = document.createElement('div');
    box.className = 'dmca-submit-error';
    box.style.cssText = 'margin:12px 0;padding:12px 14px;border:1px solid #e8b4bd;' +
      'border-radius:10px;background:#fff5f7;color:#a1324a;font-size:.9rem';
    box.innerHTML = '<strong>' + esc(msg) + '</strong>' +
      '<div style="margin-top:8px"><a href="#" class="dmca-fallback" ' +
      'style="color:#c2536f;font-weight:600">Submit using the standard page</a></div>';
    form.insertBefore(box, form.firstChild);
    var link = box.querySelector('.dmca-fallback');
    if (link) link.addEventListener('click', function (ev) {
      ev.preventDefault();
      form.submit();   // native POST -> Worker page, bypasses this handler
    });
    if (box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function submitDmca(form) {
    var btn = form.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
    var params = new URLSearchParams();
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled) return;
      var t = (el.type || '').toLowerCase();
      if (t === 'file' || t === 'submit' || t === 'button' || t === 'reset' || t === 'image') return;
      if ((t === 'checkbox' || t === 'radio') && !el.checked) return;
      params.append(el.name, el.value == null ? '' : el.value);
    });
    fetch(form.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: params.toString()
    }).then(function (r) {
      return r.text().then(function (txt) {
        if (!r.ok || /Submission not completed/i.test(txt)) {
          var m = txt.match(/<p>([\s\S]*?)<\/p>/);
          var raw = m ? m[1].replace(/<[^>]*>/g, '').trim() : ('HTTP ' + r.status);
          throw new Error(raw || 'Submission failed');
        }
        return txt;
      });
    }).then(function () {
      showSuccess(form);
    }).catch(function (err) {
      showError(form, err && err.message ? err.message : 'Network error. Please try again.');
    });
  }

  function init() {
    zone = $('dmcaDrop');
    input = $('dmcaFiles');
    if (!zone || !input) return;   // not a DMCA form page
    list = $('dmcaList');
    statusEl = $('dmcaStatus');
    countEl = $('dmcaCount');
    output = $('dmcaEvidenceUrls');
    form = zone.closest('form');
    infringing = form ? form.querySelector('[name="infringing"]') : null;

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
          setStatus('证明材料仍在上传，请稍等几秒再提交。', 'err');
          return;
        }
        /* Worker's buildDmca() keeps `infringing` verbatim in the KV record.
           Rebuild this value on every submit so a failed/retried submit does
           not duplicate the evidence block. */
        if (infringing) {
          var clean = String(infringing.value || '').split(MARK)[0].trim();
          infringing.value = clean + (items.length ? MARK + items.join('\n') : '');
        }
        // Legacy browsers / missing endpoint: keep the native form POST.
        if (typeof fetch !== 'function' || typeof URLSearchParams !== 'function' || !form.action) return;
        e.preventDefault();
        submitDmca(form);
      });
    }
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
