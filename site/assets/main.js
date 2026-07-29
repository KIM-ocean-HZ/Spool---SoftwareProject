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
     A spool hangs in each side margin and pays its thread out down the page as
     you scroll, winding back in on the way up. The two sides are deliberately
     unalike — different heights, sizes, curves, phase and spin direction — and
     each spool visibly empties as its thread leaves: the wound band thins away
     until only rim and hub remain. Rotation comes from the geometry (arc paid
     out ÷ current band radius), so the spool turns exactly as fast as thread
     leaves it, speeding up as it runs low. Clicking a spool pulls more thread:
     the page glides down about one screen. Otherwise decorative: aria-hidden,
     no keyboard focus, and CSS hides it below 1240px. */
  if (!reduceMotion) {
    // spool geometry in its own 64×64 viewBox (centre 32)
    var SP_FULL = 24;   // wound-band outer radius when nothing has been read
    var SP_CORE = 8.5;  // bare-core radius once everything is paid out

    var SIDES = [
      { side: 'left',
        size: 62, top: '76px',
        curveTop: '162px', curveHeight: 'calc(100vh - 224px)', vh: 640, dir: 1, lead: 0,
        curve: 'M 30 0 C 30 56, 6 88, 9 150 C 12 214, 54 236, 50 300 ' +
               'C 46 362, 4 376, 8 438 C 11 486, 46 498, 43 548 C 41 590, 30 596, 30 640' },
      { side: 'right',
        size: 50, top: '38vh',
        curveTop: 'calc(38vh + 60px)', curveHeight: 'calc(62vh - 130px)', vh: 420, dir: -1, lead: 0.05,
        curve: 'M 26 0 C 26 44, 46 68, 42 122 C 38 170, 8 182, 12 234 ' +
               'C 15 278, 48 288, 44 336 C 40 376, 12 382, 16 420' }
    ];

    var makeMargin = function (cfg) {
      var el = document.createElement('div');
      el.className = 'margin-thread ' + cfg.side;
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML =
        '<svg class="mt-spool" viewBox="0 0 64 64" style="width:' + cfg.size + 'px;height:' + cfg.size +
            'px;left:' + ((60 - cfg.size) / 2) + 'px;top:' + cfg.top + '">' +
          '<g class="mt-spin" style="transform-origin:32px 32px">' +
            '<circle class="mt-flange" cx="32" cy="32" r="29"/>' +
            '<circle class="mt-wound" cx="32" cy="32"/>' +
            '<path class="mt-tail"/>' +
            '<circle class="mt-hub" cx="32" cy="32" r="4.5"/>' +
          '</g>' +
        '</svg>' +
        '<svg class="mt-curve" viewBox="0 0 60 ' + cfg.vh + '" preserveAspectRatio="none" style="top:' +
            cfg.curveTop + ';height:' + cfg.curveHeight + '">' +
          '<path class="mt-path" d="' + cfg.curve + '"/>' +
        '</svg>';
      document.body.appendChild(el);
      el.querySelector('.mt-spool').addEventListener('click', function () {
        window.scrollBy({ top: Math.round(window.innerHeight * 0.85), behavior: 'smooth' });
      });
      return {
        cfg: cfg,
        spin: el.querySelector('.mt-spin'),
        svg: el.querySelector('.mt-curve'),
        path: el.querySelector('.mt-path'),
        wound: el.querySelector('.mt-wound'),
        tail: el.querySelector('.mt-tail'),
        theta: 0,
        prev: -1
      };
    };
    var margins = SIDES.map(makeMargin);

    // one shared frame step, also used by the scratch/test harness math
    var setState = function (m, p) {
      var pp = Math.min(1, Math.max(0, (p - m.cfg.lead) / (1 - m.cfg.lead)));
      // dash metrics in the path's own user units — the only space where
      // Chrome keeps them stable on a stretched (preserveAspectRatio: none) svg
      if (!m.len) {
        m.len = m.path.getTotalLength();
        m.path.style.strokeDasharray = m.len;
      }
      // the extra 1.2 keeps the round linecap from peeking out as a dot at
      // pp = 0; at any other progress it just trims the tip imperceptibly
      m.path.style.strokeDashoffset = (m.len * (1 - pp) + 1.2).toFixed(1);

      // the wound band empties linearly with what has been paid out
      var rOut = SP_CORE + (SP_FULL - SP_CORE) * (1 - pp);
      var band = rOut - SP_CORE;
      m.wound.setAttribute('r', ((rOut + SP_CORE) / 2).toFixed(2));
      m.wound.setAttribute('stroke-width', band.toFixed(2));
      var bare = band < 0.5;
      m.wound.style.opacity = bare ? '0' : '';
      m.tail.style.opacity = bare ? '0' : '';
      if (!bare) {
        m.tail.setAttribute('d',
          'M 32 ' + (32 - rOut).toFixed(1) +
          ' C 39 ' + (30 - rOut).toFixed(1) + ', 46 ' + (26 - rOut).toFixed(1) + ', 55 16');
      }

      var box = m.svg.getBoundingClientRect();
      if (!box.height) { m.prev = pp; return; }

      // physical spin: arc length that left the spool over the band radius,
      // both in on-screen pixels, integrated so direction reverses with scroll
      if (m.prev >= 0 && pp !== m.prev) {
        var arcPx = (pp - m.prev) * m.len * (box.height / m.cfg.vh);
        var radPx = Math.max(rOut, SP_CORE) * (m.cfg.size / 64);
        m.theta += m.cfg.dir * (arcPx / radPx) * 57.2958;
        m.spin.style.transform = 'rotate(' + m.theta.toFixed(1) + 'deg)';
      }
      m.prev = pp;
    };

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

      margins.forEach(function (m) { setState(m, p); });
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
