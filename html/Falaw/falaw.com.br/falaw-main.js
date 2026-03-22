/* ============================================================
   FALAW — falaw-main.js
   Deps: GSAP 3 + ScrollTrigger (CDN)
   ============================================================ */

(function () {
  'use strict';

  /* ── Utils ── */
  const lerp = (a, b, t) => a + (b - a) * t;
  const qs   = (sel, ctx = document) => ctx.querySelector(sel);
  const qsa  = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  /* ────────────────────────────────────────
     CUSTOM CURSOR
  ──────────────────────────────────────── */
  (function initCursor() {
    const cursor = qs('#cursor');
    if (!cursor) return;

    let mx = window.innerWidth / 2, my = window.innerHeight / 2;
    let cx = mx, cy = my;

    document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

    const loop = () => {
      cx = lerp(cx, mx, 0.15);
      cy = lerp(cy, my, 0.15);
      cursor.style.transform = `translate(${cx - cursor.offsetWidth / 2}px, ${cy - cursor.offsetHeight / 2}px)`;
      requestAnimationFrame(loop);
    };
    loop();

    const expand  = () => cursor.classList.add('expanded');
    const collapse = () => cursor.classList.remove('expanded');

    qsa('a, button, .dot, .cta, .team-card, .area-card').forEach(el => {
      el.addEventListener('mouseenter', expand);
      el.addEventListener('mouseleave', collapse);
    });
  })();

  /* ────────────────────────────────────────
     NAV SCROLL PROGRESS BAR
  ──────────────────────────────────────── */
  (function initProgress() {
    const bar = qs('.nav-progress');
    if (!bar) return;
    window.addEventListener('scroll', () => {
      const pct = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight) * 100;
      bar.style.width = pct + '%';
    }, { passive: true });
  })();

  /* ────────────────────────────────────────
     SECTION COUNTER + DOT NAV + ACTIVE LINK
  ──────────────────────────────────────── */
  (function initNav() {
    const sections  = qsa('.section-stack');
    const dots      = qsa('.dot');
    const counter   = qs('.nav-counter');
    const navLinks  = qsa('.nav-links a');
    if (!sections.length) return;

    const labels = sections.map(s => s.dataset.label || '');
    const ids    = sections.map(s => s.id || '');

    let current = 0;

    function setActive(idx) {
      if (idx === current && idx !== 0) return;
      current = idx;

      dots.forEach((d, i) => d.classList.toggle('active', i === idx));

      if (counter) {
        const num = String(idx + 1).padStart(2, '0');
        counter.textContent = `${num} — ${labels[idx] || ''}`;
      }

      navLinks.forEach(a => {
        a.classList.toggle('active', a.getAttribute('href') === `#${ids[idx]}`);
      });

      /* swap dot style for dark sections */
      const isDark = sections[idx].classList.contains('s-stats') ||
                     sections[idx].classList.contains('s-contato');
      dots.forEach(d => d.classList.toggle('dot-dark', isDark));
    }

    /* IntersectionObserver — detects which section is most visible */
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const idx = sections.indexOf(e.target);
          if (idx !== -1) setActive(idx);
        }
      });
    }, { threshold: 0.5 });

    sections.forEach(s => io.observe(s));
    setActive(0);

    /* Click on dot → scroll to section */
    dots.forEach((d, i) => {
      d.addEventListener('click', () => sections[i].scrollIntoView({ behavior: 'smooth' }));
    });
  })();

  /* ────────────────────────────────────────
     COMO ATUAMOS — BURGUNDY SHAPE on SCROLL
  ──────────────────────────────────────── */
  (function initComoShape() {
    const shape   = qs('.como-shape');
    const section = qs('.s-como');
    if (!shape || !section) return;

    let ticking = false;

    function update() {
      const rect = section.getBoundingClientRect();
      /* progress 0 → 1 as section enters and fills viewport */
      const prog = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / window.innerHeight));
      const tx   = (1 - prog) * 120;          /* 120vw → 0vw */
      shape.style.transform = `translateX(${tx}vw)`;
      ticking = false;
    }

    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  })();

  /* ────────────────────────────────────────
     ATUAÇÕES — SVC SHAPES (slide from LEFT)
  ──────────────────────────────────────── */
  (function initSvcShapes() {
    const blocks = qsa('.svc-block');
    if (!blocks.length) return;

    let ticking = false;

    function update() {
      blocks.forEach(block => {
        const shape = qs('.svc-shape', block);
        if (!shape) return;
        const isRight = block.classList.contains('svc-block--right');
        const rect = block.getBoundingClientRect();
        const prog = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / window.innerHeight));
        const tx   = isRight ? (1 - prog) * 120 : (1 - prog) * -120;
        shape.style.transform = `translateX(${tx}vw)`;
      });
      ticking = false;
    }

    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  })();

  /* ────────────────────────────────────────
     GSAP SCROLL REVEAL
  ──────────────────────────────────────── */
  (function initReveal() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
      /* Fallback: show everything without animation */
      qsa('.reveal').forEach(el => {
        el.style.opacity   = 1;
        el.style.transform = 'none';
      });
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    /* Reveals inside sticky sections — grouped trigger per section */
    qsa('.section-stack').forEach(section => {
      const els = qsa('.reveal', section);
      if (!els.length) return;

      gsap.fromTo(els,
        { opacity: 0, y: 30 },
        {
          opacity: 1, y: 0,
          duration: 0.8,
          stagger: 0.1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 80%',
            toggleActions: 'play none none none',
          }
        }
      );
    });

    /* Reveals outside section-stack (e.g. equipe, blog) — individual triggers */
    qsa('.reveal').forEach(el => {
      if (el.closest('.section-stack')) return;
      gsap.fromTo(el,
        { opacity: 0, y: 30 },
        {
          opacity: 1, y: 0,
          duration: 0.7,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 88%',
            toggleActions: 'play none none none',
          }
        }
      );
    });
  })();

  /* ────────────────────────────────────────
     NUMERIC COUNTERS
  ──────────────────────────────────────── */
  (function initCounters() {
    const els = qsa('[data-count]');
    if (!els.length) return;

    const easeOut = t => 1 - Math.pow(1 - t, 3);   /* easeOutCubic */

    function animateCounter(el) {
      const target   = parseFloat(el.dataset.count);
      const suffix   = el.dataset.suffix || '';
      const duration = 1200;
      const start    = performance.now();

      const tick = (now) => {
        const t   = Math.min((now - start) / duration, 1);
        const val = target * easeOut(t);
        el.textContent = (Number.isInteger(target) ? Math.round(val) : val.toFixed(1)) + suffix;
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          animateCounter(e.target);
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.5 });

    els.forEach(el => io.observe(el));
  })();

  /* ────────────────────────────────────────
     AREAS INTERATIVAS — split menu/panel
  ──────────────────────────────────────── */
  (function initAreas() {
    const items  = qsa('.area-item');
    const panels = qsa('.area-panel');
    if (!items.length || !panels.length) return;

    function activate(idx) {
      items.forEach((it, i) => {
        it.classList.toggle('active', i === idx);
        it.setAttribute('aria-pressed', i === idx);
      });
      panels.forEach((p, i) => p.classList.toggle('active', i === idx));
    }

    items.forEach((item, i) => {
      item.addEventListener('mouseenter', () => activate(i));
      item.addEventListener('click',      () => activate(i));
      item.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(i); }
      });
    });
  })();

  /* ────────────────────────────────────────
     MOBILE NAV — hamburger toggle
  ──────────────────────────────────────── */
  (function initBurger() {
    const burger = qs('.nav-burger');
    const nav    = qs('.nav');
    const links  = qs('.nav-links');
    if (!burger || !nav) return;

    function close() {
      nav.classList.remove('nav-open');
      burger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    burger.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('nav-open');
      burger.setAttribute('aria-expanded', String(isOpen));
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    /* Close on link click */
    if (links) {
      qsa('a', links).forEach(a => a.addEventListener('click', close));
    }

    /* Close on Escape */
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') close();
    });
  })();

  /* ────────────────────────────────────────
     FLOATING LABELS (ensure placeholder never shows)
  ──────────────────────────────────────── */
  (function initFloatingLabels() {
    qsa('.form-group input, .form-group textarea').forEach(inp => {
      inp.setAttribute('placeholder', ' ');     /* space triggers :not(:placeholder-shown) */
    });
  })();

})();
