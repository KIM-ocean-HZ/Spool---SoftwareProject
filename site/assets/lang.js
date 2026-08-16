/* Language is the URL: / is English, /zh/ is Chinese. Each page ships its own
   text already in place, so nothing here rewrites the DOM — this only tells the
   interactive demo which language to build in, and forwards the ?lang= links
   that were shared while the toggle was still client-side.

   The other language's address is read off the toggle in the nav, so a page
   without a translation simply has no toggle and no forwarding. */
(function () {
  'use strict';

  var zh = document.documentElement.lang.slice(0, 2) === 'zh';
  window.spoolSiteLang = zh ? 'zh' : 'en';

  var other = document.querySelector('.lang-toggle');
  if (!other) return;
  var want;
  try {
    want = new URLSearchParams(location.search).get('lang');
  } catch (e) {
    return; /* very old browser — the toggle itself still works */
  }
  if ((want === 'zh' && !zh) || (want === 'en' && zh)) {
    location.replace(other.href + location.hash);
  }
})();
