/* Share dialog + back-to-top. Vanilla JS, no dependencies. */
(function () {
  'use strict';

  var data = document.getElementById('share-data');
  var overlay = document.getElementById('shareOverlay');
  if (!data || !overlay) return;

  var btnCopy = document.getElementById('shareCopyBtn');
  var previewImg = document.getElementById('sharePreviewImg');
  var previewTitle = document.getElementById('sharePreviewTitle');
  var previewUrl = document.getElementById('sharePreviewUrl');
  var copyUrl = document.getElementById('shareCopyUrl');
  var backToTop = document.getElementById('backToTop');
  var channels = overlay.querySelectorAll('.share-channel');
  var lastFocused = null;

  function pageUrl() {
    // Use the real address (apex vs www, hash-free) instead of the Hugo permalink.
    return window.location.href.split('#')[0];
  }
  function pageTitle() {
    return (data.getAttribute('data-title') || document.title || '').trim();
  }
  function pageImage() {
    var img = data.getAttribute('data-image') || '';
    if (img && img.charAt(0) === '/') img = window.location.origin + img;
    return img;
  }

  function buildLinks() {
    var url = pageUrl();
    var title = pageTitle();
    var img = pageImage();
    var enc = encodeURIComponent;

    var links = {
      facebook: 'https://www.facebook.com/sharer/sharer.php?u=' + enc(url),
      x: 'https://twitter.com/intent/tweet?text=' + enc(title) + '&url=' + enc(url),
      pinterest: 'https://pinterest.com/pin/create/button/?url=' + enc(url) +
                 '&description=' + enc(title) + (img ? '&media=' + enc(img) : ''),
      telegram: 'https://t.me/share/url?url=' + enc(url) + '&text=' + enc(title),
      email: 'mailto:?subject=' + enc(title) + '&body=' + enc(title + '\n\n' + url)
    };

    Array.prototype.forEach.call(channels, function (a) {
      a.setAttribute('href', links[a.getAttribute('data-channel')] || '#');
    });
  }

  function openDialog() {
    var url = pageUrl();
    buildLinks();
    previewTitle.textContent = pageTitle();
    previewUrl.textContent = url;
    copyUrl.textContent = url;
    if (previewImg) previewImg.src = pageImage();
    btnCopy.textContent = data.getAttribute('data-copy-label') || 'Copy';
    btnCopy.classList.remove('is-copied');

    lastFocused = document.activeElement;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    var closeBtn = overlay.querySelector('.js-share-close');
    if (closeBtn) closeBtn.focus();
  }

  function closeDialog() {
    overlay.hidden = true;
    document.body.style.overflow = '';
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }

  function copyLink() {
    var url = pageUrl();
    var done = function () {
      btnCopy.textContent = data.getAttribute('data-copied-label') || 'Copied!';
      btnCopy.classList.add('is-copied');
      window.setTimeout(function () {
        btnCopy.textContent = data.getAttribute('data-copy-label') || 'Copy';
        btnCopy.classList.remove('is-copied');
      }, 1800);
    };
    var fallback = function () {
      var ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
      document.body.removeChild(ta);
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(done, fallback);
    } else {
      fallback();
    }
  }

  document.addEventListener('click', function (e) {
    var opener = e.target.closest ? e.target.closest('.js-share-open') : null;
    if (opener) { e.preventDefault(); openDialog(); return; }
    if ((e.target.closest && e.target.closest('.js-share-close')) || e.target === overlay) {
      e.preventDefault(); closeDialog(); return;
    }
    if (e.target === btnCopy) { e.preventDefault(); copyLink(); }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !overlay.hidden) closeDialog();
  });

  // Back to top
  function onScroll() {
    if (!backToTop) return;
    if (window.pageYOffset > 300) backToTop.classList.add('is-visible');
    else backToTop.classList.remove('is-visible');
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  if (backToTop) {
    backToTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
})();
