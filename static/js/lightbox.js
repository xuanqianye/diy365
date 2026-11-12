/* Lightbox: click article images to open, scroll/pinch/buttons to zoom, drag to pan.
   Targets: .post-cover, .pattern-step, and any image inside .post-content. */
(function () {
  'use strict';

  var overlay, stage, imgEl, zoomVal, counterEl, prevBtn, nextBtn;
  var images = [];
  var currentIndex = 0;
  var zoom = 1, posX = 0, posY = 0;
  var dragging = false, startX = 0, startY = 0, startPosX = 0, startPosY = 0;

  var SELECTOR = '.post-cover, .pattern-step, .post-content img';

  function build() {
    if (document.getElementById('lb-overlay')) return;
    overlay = document.createElement('div');
    overlay.id = 'lb-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Image viewer');
    overlay.innerHTML =
      '<div class="lb-toolbar">' +
        '<button class="lb-btn" id="lb-zoom-out" aria-label="Zoom out">&minus;</button>' +
        '<span class="lb-zoom" id="lb-zoom-val">100%</span>' +
        '<button class="lb-btn" id="lb-zoom-in" aria-label="Zoom in">+</button>' +
        '<span class="lb-counter" id="lb-counter"></span>' +
        '<button class="lb-btn lb-close" id="lb-close" aria-label="Close">&times;</button>' +
      '</div>' +
      '<button class="lb-nav lb-prev" id="lb-prev" aria-label="Previous image">&#8249;</button>' +
      '<div id="lb-stage" class="lb-stage"><img class="lb-img" id="lb-img" alt=""></div>' +
      '<button class="lb-nav lb-next" id="lb-next" aria-label="Next image">&#8250;</button>';
    document.body.appendChild(overlay);

    stage = overlay.querySelector('#lb-stage');
    imgEl = overlay.querySelector('#lb-img');
    zoomVal = overlay.querySelector('#lb-zoom-val');
    counterEl = overlay.querySelector('#lb-counter');
    prevBtn = overlay.querySelector('#lb-prev');
    nextBtn = overlay.querySelector('#lb-next');

    overlay.querySelector('#lb-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target === stage) close();
    });
    overlay.querySelector('#lb-zoom-in').addEventListener('click', function () { setZoom(zoom + 0.25); });
    overlay.querySelector('#lb-zoom-out').addEventListener('click', function () { setZoom(zoom - 0.25); });
    prevBtn.addEventListener('click', function (e) { e.stopPropagation(); show(currentIndex - 1); });
    nextBtn.addEventListener('click', function (e) { e.stopPropagation(); show(currentIndex + 1); });

    stage.addEventListener('wheel', function (e) {
      e.preventDefault();
      setZoom(zoom + (e.deltaY < 0 ? 0.15 : -0.15));
    }, { passive: false });

    imgEl.addEventListener('dblclick', function (e) { e.stopPropagation(); setZoom(zoom > 1 ? 1 : 2); });

    imgEl.addEventListener('mousedown', startDrag);
    imgEl.addEventListener('touchstart', startDrag, { passive: false });
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('touchmove', onDrag, { passive: false });
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);
    document.addEventListener('keydown', onKey);
  }

  function collect() {
    images = Array.prototype.slice.call(document.querySelectorAll(SELECTOR));
  }

  function open(index) {
    build();
    collect();
    if (!images.length) return;
    currentIndex = index;
    show(currentIndex);
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function show(index) {
    if (!images.length) return;
    currentIndex = (index + images.length) % images.length;
    var el = images[currentIndex];
    var src = el.getAttribute('data-full') || el.getAttribute('src') || el.src;
    imgEl.src = src;
    resetZoom();
    counterEl.textContent = images.length > 1 ? (currentIndex + 1) + ' / ' + images.length : '';
    var multi = images.length > 1;
    prevBtn.style.display = multi ? '' : 'none';
    nextBtn.style.display = multi ? '' : 'none';
  }

  function setZoom(z) {
    zoom = Math.min(5, Math.max(0.2, z));
    imgEl.style.transform = 'translate(' + posX + 'px,' + posY + 'px) scale(' + zoom + ')';
    zoomVal.textContent = Math.round(zoom * 100) + '%';
  }
  function resetZoom() { posX = 0; posY = 0; setZoom(1); }

  function startDrag(e) {
    if (zoom <= 1) return;
    dragging = true;
    var p = point(e);
    startX = p.x; startY = p.y; startPosX = posX; startPosY = posY;
    imgEl.style.cursor = 'grabbing';
  }
  function onDrag(e) {
    if (!dragging) return;
    e.preventDefault();
    var p = point(e);
    posX = startPosX + (p.x - startX);
    posY = startPosY + (p.y - startY);
    imgEl.style.transform = 'translate(' + posX + 'px,' + posY + 'px) scale(' + zoom + ')';
  }
  function endDrag() { dragging = false; imgEl.style.cursor = 'grab'; }
  function point(e) {
    if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }
  function onKey(e) {
    if (!overlay || !overlay.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(currentIndex - 1);
    else if (e.key === 'ArrowRight') show(currentIndex + 1);
  }
  function close() {
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    imgEl.src = '';
  }

  function init() {
    collect();
    images.forEach(function (img, i) {
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        open(i);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
