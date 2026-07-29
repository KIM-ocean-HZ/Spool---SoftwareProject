/* Shared site behavior: scroll reveals, nav state, screenshot tabs, and the
   thread motif — a progress thread across the top and section threads that
   draw out as you scroll down and wind back in as you scroll up. */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var nav = document.querySelector('.nav-shell');
  if (nav) {
    var onNav = function () { nav.classList.toggle('scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onNav, { passive: true });
    onNav();
  }

  /* one-shot reveals (copy blocks, cards) */
  var revealed = document.querySelectorAll('.reveal, .reveal-stagger');
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

  /* the thread: bidirectional, tied to the reader's own scrolling */
  var segs = Array.prototype.slice.call(document.querySelectorAll('.thread-seg'));
  if (reduceMotion) {
    segs.forEach(function (s) { s.classList.add('in-view'); });
  } else {
    var prog = document.createElement('div');
    prog.className = 'thread-progress';
    prog.setAttribute('aria-hidden', 'true');
    prog.innerHTML = '<div class="tp-line"></div><div class="tp-tip"></div>';
    document.body.appendChild(prog);
    var tpLine = prog.querySelector('.tp-line');
    var tpTip = prog.querySelector('.tp-tip');

    var ticking = false;
    var update = function () {
      ticking = false;
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      tpLine.style.transform = 'scaleX(' + p + ')';
      tpTip.style.left = (p * 100) + '%';
      var vh = window.innerHeight;
      segs.forEach(function (s) {
        var r = s.getBoundingClientRect();
        // The segment draws while it travels from 92% to 45% of the viewport
        // height — scrolling back up rewinds it the same way.
        var f = (vh * 0.92 - r.top) / (vh * 0.47);
        f = Math.min(1, Math.max(0, f));
        s.style.transform = 'scaleY(' + f + ')';
      });
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* screenshot tab groups */
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
