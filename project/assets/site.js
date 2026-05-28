/* ===================================================================
   Thiink Media Graphics — Site engine
   Splash · Reveal observer · Parallax · Nav · Marquee
   =================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     1. Splash screen
     ------------------------------------------------------------------ */
  function initSplash() {
    const splash = document.querySelector('.splash');
    if (!splash) return;

    // Respect short-circuit: ?nosplash, or if visited within last 25 min
    const params = new URLSearchParams(location.search);
    const lastVisit = +sessionStorage.getItem('tmg-splash') || 0;
    const now = Date.now();
    const skip = params.has('nosplash') || (now - lastVisit < 25 * 60 * 1000);

    if (skip) {
      splash.classList.add('is-gone');
      splash.style.transition = 'none';
      requestAnimationFrame(() => splash.remove());
      return;
    }

    // Lock scroll while splash visible
    const html = document.documentElement;
    html.style.overflow = 'hidden';

    const dismiss = () => {
      splash.classList.add('is-gone');
      html.style.overflow = '';
      sessionStorage.setItem('tmg-splash', String(Date.now()));
      setTimeout(() => splash.remove(), 1000);
    };

    // Auto-dismiss after splash sequence (~3.4s)
    setTimeout(dismiss, 3400);

    // Click to skip
    splash.addEventListener('click', dismiss, { once: true });
  }

  /* ------------------------------------------------------------------
     2. Sticky nav state
     ------------------------------------------------------------------ */
  function initNav() {
    const nav = document.querySelector('.site-nav');
    if (!nav) return;
    let last = 0;
    const onScroll = () => {
      const y = window.scrollY;
      nav.classList.toggle('scrolled', y > 60);
      last = y;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // Mobile toggle
    const toggle = nav.querySelector('.nav-toggle');
    const links = nav.querySelector('.nav-links');
    if (toggle && links) {
      toggle.addEventListener('click', () => {
        const open = links.style.display === 'flex';
        links.style.display = open ? 'none' : 'flex';
        links.style.position = 'absolute';
        links.style.top = '100%';
        links.style.right = '0';
        links.style.flexDirection = 'column';
        links.style.background = 'rgba(24,25,27,.96)';
        links.style.padding = '24px';
        links.style.gap = '18px';
      });
    }
  }

  /* ------------------------------------------------------------------
     3. Scroll reveal — IntersectionObserver
     ------------------------------------------------------------------ */
  function initReveal() {
    const els = document.querySelectorAll('[data-reveal]');
    if (!els.length) return;

    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          // double-rAF to ensure browser sees the initial CSS state
          // before adding the transition target
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              e.target.classList.add('is-in');
            });
          });
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });

    els.forEach(el => io.observe(el));

    // Safety net: if observer hasn't fired by 2.4s, force-reveal anything
    // currently in viewport. Covers iframe / pause edge cases.
    setTimeout(() => {
      els.forEach(el => {
        if (el.classList.contains('is-in')) return;
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) {
          el.classList.add('is-in');
        }
      });
    }, 2400);
  }

  /* ------------------------------------------------------------------
     4. Parallax — rAF-driven, picks up [data-parallax] elements
        data-parallax="0.4"  → multiplier
        data-parallax-axis="y" (default) | "x"
        IMPORTANT: snapshot each element's UNTRANSFORMED layout center
        ONCE (before applying any transform), then compute offset against
        that fixed value. Reading getBoundingClientRect after the
        transform compounds the offset and pushes elements off-screen.
     ------------------------------------------------------------------ */
  function initParallax() {
    const raw = [...document.querySelectorAll('[data-parallax]')];
    if (!raw.length) return;

    const items = [];
    let vh = window.innerHeight;

    // Cache each element's untransformed center-Y (and center-X) in
    // document coordinates. Must be measured BEFORE any transform.
    function measure() {
      items.length = 0;
      for (const el of raw) {
        // ensure no leftover transform skews the measurement
        el.style.transform = '';
        const r = el.getBoundingClientRect();
        items.push({
          el,
          mul: parseFloat(el.dataset.parallax) || 0.3,
          axis: el.dataset.parallaxAxis || 'y',
          centerY: r.top + window.scrollY + r.height / 2,
          centerX: r.left + window.scrollX + r.width / 2
        });
      }
    }
    measure();

    let ticking = false;
    const update = () => {
      const sy = window.scrollY;
      const sx = window.scrollX;
      for (const it of items) {
        const offset = ((it.centerY - sy) - vh / 2) * -it.mul;
        it.el.style.transform = it.axis === 'x'
          ? `translate3d(${offset}px, 0, 0)`
          : `translate3d(0, ${offset}px, 0)`;
      }
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => {
      vh = window.innerHeight;
      measure();
      update();
    });

    // images & fonts can change layout — re-measure after load
    window.addEventListener('load', () => { measure(); update(); });
    update();
  }

  /* ------------------------------------------------------------------
     5. Number count-up (data-count="240")
     ------------------------------------------------------------------ */
  function initCounters() {
    const counters = document.querySelectorAll('[data-count]');
    if (!counters.length) return;

    const animate = (el) => {
      const target = parseFloat(el.dataset.count);
      const suffix = el.dataset.countSuffix || '';
      const prefix = el.dataset.countPrefix || '';
      const dur = 1800;
      const start = performance.now();
      const tick = (t) => {
        const p = Math.min(1, (t - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        const v = Math.round(target * eased);
        el.textContent = prefix + v + suffix;
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = prefix + target + suffix;
      };
      requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { animate(e.target); io.unobserve(e.target); }
      });
    }, { threshold: 0.4 });
    counters.forEach(el => { el.textContent = '0'; io.observe(el); });
  }

  /* ------------------------------------------------------------------
     6. Marquee (line-based, infinite)
     ------------------------------------------------------------------ */
  function initMarquee() {
    document.querySelectorAll('.marquee').forEach(m => {
      const track = m.querySelector('.marquee__track');
      if (!track) return;
      // duplicate content for seamless loop
      track.innerHTML = track.innerHTML + track.innerHTML;
    });
  }

  /* ------------------------------------------------------------------
     7. Magnetic CTA — small interaction polish
     ------------------------------------------------------------------ */
  function initMagnetic() {
    document.querySelectorAll('[data-magnetic]').forEach(el => {
      const strength = parseFloat(el.dataset.magnetic) || 18;
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) / r.width;
        const y = (e.clientY - r.top - r.height / 2) / r.height;
        el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
      });
      el.addEventListener('mouseleave', () => { el.style.transform = ''; });
    });
  }

  /* ------------------------------------------------------------------
     8. Inline-SVG logo loader
        <span data-logo="assets/logos/mark-monogram.svg"></span>
        — fetches the SVG, strips empty class defs, applies currentColor
          to any unfilled path so CSS can recolor it.
     ------------------------------------------------------------------ */
  const _logoCache = new Map();
  async function fetchSvg(url) {
    if (_logoCache.has(url)) return _logoCache.get(url);
    const p = fetch(url).then(r => r.text()).catch(() => null);
    _logoCache.set(url, p);
    return p;
  }
  async function inlineLogos() {
    const els = document.querySelectorAll('[data-logo]');
    if (!els.length) return;
    const parser = new DOMParser();
    await Promise.all([...els].map(async el => {
      const txt = await fetchSvg(el.dataset.logo);
      if (!txt) return;
      const doc = parser.parseFromString(txt, 'image/svg+xml');
      const svg = doc.documentElement;
      if (!svg || svg.nodeName === 'parsererror') return;
      // give shapes a fill so they render — favour currentColor for recoloring
      svg.querySelectorAll('path, polygon, polyline, rect, circle, ellipse')
         .forEach(p => {
           if (!p.getAttribute('fill') && !p.style.fill) {
             p.setAttribute('fill', 'currentColor');
           }
         });
      // strip width/height so it scales to its container
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.style.display = 'block';
      el.innerHTML = '';
      el.appendChild(svg);
      el.classList.add('is-loaded');
    }));
  }

  /* ------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------ */
  const boot = () => {
    inlineLogos();        // load first so splash sees the logo
    initSplash();
    initNav();
    initReveal();
    initParallax();
    initCounters();
    initMarquee();
    initMagnetic();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
