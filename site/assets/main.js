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

  /* ---- the thread in the margins ----
     A spool sits in each side margin; its thread pays out down the page as you
     scroll and winds back in when you scroll up, the spool turning with it.
     Decorative only: aria-hidden, pointer-events none, and CSS hides the whole
     thing below the width where the margins are wide enough to hold it. */
  if (!reduceMotion) {
    var CURVE =
      'M 28 4 C 28 60, 8 92, 8 150 C 8 214, 48 246, 48 310 ' +
      'C 48 374, 8 406, 8 470 C 8 528, 28 556, 28 600';

    var makeMargin = function (side) {
      var el = document.createElement('div');
      el.className = 'margin-thread ' + side;
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML =
        '<svg class="mt-spool" viewBox="0 0 56 56">' +
          '<g class="mt-spin" style="transform-origin:28px 28px">' +
            '<circle class="mt-ring" cx="28" cy="28" r="24"/>' +
            '<circle class="mt-ring" cx="28" cy="28" r="16.5"/>' +
            '<circle class="mt-ring mt-ring-in" cx="28" cy="28" r="9"/>' +
            '<circle class="mt-hub" cx="28" cy="28" r="3.4"/>' +
            '<path class="mt-tail" d="M 28 4 A 24 24 0 0 1 50 19"/>' +
          '</g>' +
        '</svg>' +
        '<svg class="mt-curve" viewBox="0 0 56 600" preserveAspectRatio="none">' +
          '<path class="mt-path" pathLength="1000" vector-effect="non-scaling-stroke" d="' + CURVE + '"/>' +
        '</svg>' +
        '<span class="mt-end"></span>';
      document.body.appendChild(el);
      return {
        root: el,
        spin: el.querySelector('.mt-spin'),
        svg: el.querySelector('.mt-curve'),
        path: el.querySelector('.mt-path'),
        end: el.querySelector('.mt-end')
      };
    };
    var margins = [makeMargin('left'), makeMargin('right')];

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
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;

      tpLine.style.transform = 'scaleX(' + p + ')';
      tpTip.style.left = (p * 100) + '%';

      margins.forEach(function (m) {
        // pathLength is normalised to 1000, so the offset is just the remainder
        m.path.style.strokeDashoffset = (1000 * (1 - p)).toFixed(1);
        // a little under one turn across the whole page — it should read as
        // unwinding, not spinning
        m.spin.style.transform = 'rotate(' + (p * 190).toFixed(1) + 'deg)';
        // park the thread-end dot at the drawn tip. preserveAspectRatio is
        // "none", so user units map independently on each axis.
        var box = m.svg.getBoundingClientRect();
        if (!box.height) return;
        var pt = m.path.getPointAtLength(m.path.getTotalLength() * p);
        m.end.style.transform =
          'translate(' + (pt.x / 56 * box.width).toFixed(1) + 'px,' +
          (pt.y / 600 * box.height + box.top).toFixed(1) + 'px)';
        m.end.style.opacity = p > 0.004 ? '1' : '0';
      });
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* screenshot tab groups — tabs up top; groups with data-arrows also get
     prev/next buttons at the image's sides */
  document.querySelectorAll('.shot-group').forEach(function (group) {
    var tabs = group.querySelector('.shot-tabs');
    if (!tabs) return;
    var btns = Array.prototype.slice.call(tabs.querySelectorAll('.shot-tab'));
    var panels = group.querySelectorAll('.shot-panel');
    var select = function (idx) {
      btns.forEach(function (t, i) { t.setAttribute('aria-selected', i === idx ? 'true' : 'false'); });
      panels.forEach(function (p) { p.hidden = p.dataset.panel !== btns[idx].dataset.tab; });
    };
    tabs.addEventListener('click', function (e) {
      var btn = e.target.closest('.shot-tab');
      if (btn) select(btns.indexOf(btn));
    });
    if (!group.hasAttribute('data-arrows')) return;
    var step = function (d) {
      var cur = btns.findIndex(function (t) { return t.getAttribute('aria-selected') === 'true'; });
      select((cur + d + btns.length) % btns.length);
    };
    [['prev', '‹', -1], ['next', '›', 1]].forEach(function (spec) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'shot-arrow ' + spec[0];
      b.textContent = spec[1];
      b.setAttribute('aria-label', spec[0] === 'prev' ? 'Previous screenshot' : 'Next screenshot');
      b.addEventListener('click', function () { step(spec[2]); });
      group.appendChild(b);
    });
  });
})();
