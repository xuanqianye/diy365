/* Cookie 同意横幅 + 追踪脚本门控（GDPR）
 * - 首次访问：显示横幅，不加载任何分析脚本
 * - 同意：记录选择并加载 GA4 + 51.la
 * - 拒绝：记录选择，永不加载分析脚本
 * - 已同意的回头客：直接加载分析脚本
 */
(function () {
  var KEY = 'cc_consent';
  var consent = null;
  try { consent = localStorage.getItem(KEY); } catch (e) {}

  function loadAnalytics() {
    // Google Analytics 4
    var ga = window.__GA_ID__;
    if (ga) {
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ga;
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      function gtag() { dataLayer.push(arguments); }
      gtag('js', new Date());
      gtag('config', ga);
    }

    // 51.la
    var laId = window.__LA_ID__, laCk = window.__LA_CK__;
    if (laId) {
      var laInited = false;
      function initLA() {
        if (laInited || !window.LA) return;
        laInited = true;
        LA.init({ id: laId, ck: laCk || laId });
      }
      var s2 = document.createElement('script');
      s2.async = true;
      s2.charset = 'UTF-8';
      s2.src = '//sdk.51.la/js-sdk-pro.min.js';
      s2.onload = initLA;
      document.head.appendChild(s2);
      // 兜底：onload 偶发不触发时再试一次
      setTimeout(initLA, 800);
    }
  }

  function hideBanner() {
    var b = document.getElementById('cc-banner');
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }

  function showBanner() {
    if (document.getElementById('cc-banner')) return;
    var b = document.createElement('div');
    b.id = 'cc-banner';
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-label', 'Cookie 同意');
    b.innerHTML =
      '<div class="cc-card">' +
        '<p class="cc-text">我们使用 Cookie 与同类技术（Google Analytics、51.la）来分析网站流量。点击「同意」即表示你允许我们收集匿名访问数据；「拒绝」则不会加载任何追踪脚本。</p>' +
        '<div class="cc-actions">' +
          '<button type="button" class="cc-btn cc-accept" id="cc-accept">同意</button>' +
          '<button type="button" class="cc-btn cc-reject" id="cc-reject">拒绝</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(b);

    document.getElementById('cc-accept').addEventListener('click', function () {
      try { localStorage.setItem(KEY, 'granted'); } catch (e) {}
      hideBanner();
      loadAnalytics();
    });
    document.getElementById('cc-reject').addEventListener('click', function () {
      try { localStorage.setItem(KEY, 'denied'); } catch (e) {}
      hideBanner();
    });
  }

  if (consent === 'granted') {
    loadAnalytics();
  } else if (consent === 'denied') {
    /* 不加载任何追踪脚本 */
  } else {
    showBanner();
  }
})();
