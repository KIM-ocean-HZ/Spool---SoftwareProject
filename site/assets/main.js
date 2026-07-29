/* Shared site behavior: scroll reveals, nav state, screenshot tabs. */
(function () {
  'use strict';

  var nav = document.querySelector('.nav-shell');
  if (nav) {
    var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  var revealed = document.querySelectorAll('.reveal, .reveal-stagger, .thread-seg');
  if ('IntersectionObserver' in window && revealed.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in-view'); io.unobserve(en.target); }
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -40px 0px' });
    revealed.forEach(function (el) { io.observe(el); });
  } else {
    revealed.forEach(function (el) { el.classList.add('in-view'); });
  }

  document.querySelectorAll('.shot-tabs').forEach(function (tabs) {
    var panels = tabs.parentElement.querySelectorAll('.shot-panel');
    tabs.addEventListener('click', function (e) {
      var btn = e.target.closest('.shot-tab');
      if (!btn) return;
      tabs.querySelectorAll('.shot-tab').forEach(function (t) { t.setAttribute('aria-selected', t === btn ? 'true' : 'false'); });
      panels.forEach(function (p) { p.hidden = p.dataset.panel !== btn.dataset.tab; });
    });
  });
})();
