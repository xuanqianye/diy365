/* ============================================================
   /submit/ 图片上传：直传 Superbed（仅 jpg/png/webp）
   PDF 用 pdf.js 在浏览器内逐页渲染 → 长页自动分段 → 转成 webp/jpg 再上传。
   图床不接受 PDF，所以任何 PDF 都不直接上传，一律先转图片。
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
  var SLICE_RATIO = 1.7;   // 每段高度 ≈ 宽度 × 1.7（长页切开）
  var MAX_SLICES = 6;      // 单页最多切几段

  var zone, input, list, output, statusEl, countEl, form;
  var items = [];          // 上传成功的图片 URL（有序）
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
        '<span class="sb-item-tag">' + (i === 0 ? '封面' : '图 ' + (i + 1)) + '</span>' +
        '<button type="button" class="sb-item-del" aria-label="删除这张图">&times;</button>';
      div.querySelector('.sb-item-del').addEventListener('click', function () {
        items.splice(i, 1);
        render();
      });
      list.appendChild(div);
    });
  }

  /* ---------- 上传单张图片到 Superbed ---------- */
  function uploadBlob(blob, name) {
    setStatus('正在上传：' + name);
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

  /* ---------- canvas → webp（不支持则 jpeg） ---------- */
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
    setStatus('正在加载 PDF 转换组件…');
    return import(PDF_LIB).then(function (mod) {
      mod.GlobalWorkerOptions.workerSrc = PDF_WORKER;
      pdfjs = mod;
      return mod;
    });
  }

  /* ---------- PDF 逐页渲染 + 长页分段 ---------- */
  function convertPdf(file) {
    if (file.size > MAX_PDF_BYTES) {
      return Promise.reject(new Error('PDF 超过 40MB，请先压缩：' + file.name));
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
              setStatus('PDF 转图中：第 ' + pageNo + ' / ' + doc.numPages + ' 页');
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
              // 长页按高度切成多段，避免手机上一张图太长看不清
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
            setStatus('PDF 共 ' + doc.numPages + ' 页，已转换前 ' + MAX_PDF_PAGES + ' 页', 'warn');
          }
        });
      });
    });
  }

  /* ---------- 文件入口 ---------- */
  function handleFiles(files) {
    if (!files || !files.length || busy) return;
    busy = true;
    var chain = Promise.resolve();
    Array.prototype.forEach.call(files, function (f) {
      chain = chain.then(function () {
        if (isImage(f)) {
          if (f.size > MAX_IMG_BYTES) {
            setStatus('图片超过 15MB，已跳过：' + f.name, 'warn');
            return;
          }
          return uploadBlob(f, f.name);
        }
        if (isPdf(f)) return convertPdf(f);
        setStatus('不支持的格式：' + f.name + '（仅 jpg / png / webp，PDF 会自动转图）', 'err');
      }).catch(function (e) {
        setStatus('处理失败：' + f.name + ' — ' + e.message, 'err');
      });
    });
    chain.then(function () {
      busy = false;
      if (items.length) setStatus('完成，共 ' + items.length + ' 张图片已上传', 'ok');
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
          setStatus('图片还在上传/转换中，请稍候再提交', 'err');
          return;
        }
        if (!items.length) {
          e.preventDefault();
          setStatus('请先上传至少一张图片（仅 jpg / png / webp）', 'err');
          zone.focus();
        }
      });
    }
    render();

    /* ---------- 服务端签发的验证码 ---------- */
    var uploadBox = document.querySelector('.sb-upload[data-api]');
    var api = uploadBox ? uploadBox.getAttribute('data-api') : '';
    var capImg = $('sbCaptchaSvg'), capAns = $('sbCaptchaAnswer'),
        capTok = $('sbCaptchaToken'), capBtn = $('sbCaptchaRefresh'), capMsg = $('sbCaptchaMsg');
    function capStatus(t) { if (capMsg) capMsg.textContent = t; }
    function loadCaptcha() {
      if (!api || !capImg || !capTok) return;
      capStatus('正在加载验证码…');
      fetch(api + '/captcha', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          capImg.innerHTML = d.svg || '';
          capTok.value = d.token || '';
          if (capAns) capAns.value = '';
          capStatus('');
        })
        .catch(function () { capStatus('验证码加载失败，请点「换一题」重试'); });
    }
    if (capBtn) capBtn.addEventListener('click', loadCaptcha);
    loadCaptcha();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
