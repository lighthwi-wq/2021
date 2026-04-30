/* ==========================================================================
   Login screen interactions
   - Mouse parallax (sets --mx / --my / --px / --py on .login-screen)
   - Card spotlight (sets --card-mx / --card-my on .login-card)
   - Trend point tooltip
   - Password visibility toggle
   - CapsLock warning
   - Submit ripple + loading feedback
   ========================================================================== */
(() => {
  'use strict';

  /* ---------- 1. Background parallax ---------- */
  function initLoginBackgroundMotion() {
    const login = document.getElementById('loginScreen');
    if (!login) return;

    let raf = null;
    const apply = (e) => {
      const rect = login.getBoundingClientRect();
      const xRatio = (e.clientX - rect.left) / rect.width;
      const yRatio = (e.clientY - rect.top) / rect.height;
      const x = Math.max(-1, Math.min(1, xRatio * 2 - 1));
      const y = Math.max(-1, Math.min(1, yRatio * 2 - 1));
      login.style.setProperty('--mx', x.toFixed(3));
      login.style.setProperty('--my', y.toFixed(3));
      login.style.setProperty('--px', `${(xRatio * 100).toFixed(2)}%`);
      login.style.setProperty('--py', `${(yRatio * 100).toFixed(2)}%`);
      const intensity = (Math.abs(x) + Math.abs(y)) / 2;
      login.style.setProperty('--mx-intensity', intensity.toFixed(3));
    };

    login.addEventListener('mousemove', (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        apply(e);
        raf = null;
      });
    });

    login.addEventListener('mouseleave', () => {
      login.style.setProperty('--mx', '0');
      login.style.setProperty('--my', '0');
      login.style.setProperty('--px', '50%');
      login.style.setProperty('--py', '50%');
      login.style.setProperty('--mx-intensity', '0');
    });

    /* Card spotlight */
    const card = login.querySelector('.login-card');
    if (card) {
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const cx = ((e.clientX - r.left) / r.width) * 100;
        const cy = ((e.clientY - r.top)  / r.height) * 100;
        card.style.setProperty('--card-mx', `${cx.toFixed(2)}%`);
        card.style.setProperty('--card-my', `${cy.toFixed(2)}%`);
      });
      card.addEventListener('mouseleave', () => {
        card.style.setProperty('--card-mx', '50%');
        card.style.setProperty('--card-my', '50%');
      });
    }
  }

  /* ---------- 2. Trend point tooltip on the bg SVG ---------- */
  function initTrendPointTooltip() {
    const svg = document.querySelector('.login-bg-graph');
    const tooltip = document.getElementById('loginPointTooltip');
    if (!svg || !tooltip) return;
    const rect = tooltip.querySelector('rect');
    const text = tooltip.querySelector('text');

    svg.querySelectorAll('.trend-point[data-point-label]').forEach((pt) => {
      pt.addEventListener('mouseenter', () => {
        const label = pt.getAttribute('data-point-label') || '';
        text.textContent = label;
        // Approximate text width (SVG font 13px → ~7.4px/char)
        const w = Math.max(120, Math.min(360, label.length * 7.6 + 28));
        rect.setAttribute('width', w);
        const cx = parseFloat(pt.getAttribute('cx')) || 0;
        const cy = parseFloat(pt.getAttribute('cy')) || 0;
        const tx = Math.max(10, Math.min(1200 - w - 10, cx - w / 2));
        const ty = Math.max(10, cy - 56);
        tooltip.setAttribute('transform', `translate(${tx}, ${ty})`);
        tooltip.setAttribute('opacity', '1');
      });
      pt.addEventListener('mouseleave', () => {
        tooltip.setAttribute('opacity', '0');
      });
    });
  }

  /* ---------- 2.5 Dynamic trend comet motion ---------- */
  function initTrendCometMotion() {
    const svg = document.querySelector('.login-bg-graph');
    const path = svg?.querySelector('.trend.main');
    const comet = svg?.querySelector('.trend-comet');
    const tail = svg?.querySelector('.trend-comet-tail');
    if (!svg || !path || !comet || !tail || !path.getTotalLength) return;

    const total = path.getTotalLength();
    let rafId = null;
    let start = performance.now();

    const draw = (now) => {
      const elapsed = now - start;
      const t = ((elapsed * 0.06) % total);
      const tTail = (t - 22 + total) % total;
      const p = path.getPointAtLength(t);
      const p2 = path.getPointAtLength(tTail);
      comet.setAttribute('cx', p.x.toFixed(2));
      comet.setAttribute('cy', p.y.toFixed(2));
      tail.setAttribute('cx', p2.x.toFixed(2));
      tail.setAttribute('cy', p2.y.toFixed(2));
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      } else if (!document.hidden && !rafId) {
        start = performance.now();
        rafId = requestAnimationFrame(draw);
      }
    });
  }

  /* ---------- 3. Password show / hide ---------- */
  function initPasswordToggle() {
    const pw = document.getElementById('loginPassword');
    if (!pw || pw.parentElement.querySelector('.password-toggle')) return;

    const eyeOn  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    const eyeOff = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'password-toggle';
    btn.setAttribute('aria-label', '비밀번호 표시');
    btn.innerHTML = eyeOff;
    pw.parentElement.appendChild(btn);

    btn.addEventListener('click', () => {
      const showing = pw.type === 'text';
      pw.type = showing ? 'password' : 'text';
      btn.innerHTML = showing ? eyeOff : eyeOn;
      btn.setAttribute('aria-label', showing ? '비밀번호 표시' : '비밀번호 숨김');
    });
  }

  /* ---------- 4. CapsLock warning ---------- */
  function initCapsWarn() {
    const pw = document.getElementById('loginPassword');
    if (!pw || pw.parentElement.querySelector('.caps-warn')) return;

    const warn = document.createElement('span');
    warn.className = 'caps-warn';
    warn.textContent = 'CapsLock 켜짐';
    pw.parentElement.appendChild(warn);

    const update = (e) => {
      const on = e.getModifierState && e.getModifierState('CapsLock');
      warn.classList.toggle('show', !!on);
    };
    pw.addEventListener('keydown', update);
    pw.addEventListener('keyup', update);
    pw.addEventListener('blur',  () => warn.classList.remove('show'));
  }

  /* ---------- 5. Submit button ripple ---------- */
  function initRipple() {
    const btn = document.querySelector('.login-submit');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      const r = btn.getBoundingClientRect();
      const span = document.createElement('span');
      span.className = 'ripple';
      const size = Math.max(r.width, r.height);
      span.style.width  = `${size}px`;
      span.style.height = `${size}px`;
      span.style.left   = `${e.clientX - r.left - size / 2}px`;
      span.style.top    = `${e.clientY - r.top  - size / 2}px`;
      btn.appendChild(span);
      setTimeout(() => span.remove(), 700);
    });
  }

  /* ---------- 6. Submit loading state hook ---------- */
  /* The main app controls actual auth. We just expose a cooperative class
     to allow the main login handler to flip a loading spinner. */
  function initSubmitFeedback() {
    const form = document.getElementById('loginForm');
    const btn  = document.querySelector('.login-submit');
    if (!form || !btn) return;
    form.addEventListener('submit', () => {
      btn.classList.add('is-loading');
      // The main app removes this class on success; on failure we restore.
      setTimeout(() => btn.classList.remove('is-loading'), 1200);
    });
  }

  /* ---------- 7. Donut center counter ---------- */
  function initDonutCounters() {
    const counters = document.querySelectorAll('.donut-live-value[data-counter-target]');
    if (!counters.length) return;

    counters.forEach((el, idx) => {
      const target = parseFloat(el.getAttribute('data-counter-target') || '0');
      if (Number.isNaN(target)) return;
      const duration = 1500 + idx * 260;
      const start = performance.now();

      const tick = (now) => {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        const value = target * eased;
        el.textContent = `${value.toFixed(1)}%`;
        if (p < 1) requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initLoginBackgroundMotion();
    initTrendPointTooltip();
    initTrendCometMotion();
    initPasswordToggle();
    initCapsWarn();
    initRipple();
    initSubmitFeedback();
    initDonutCounters();
  });
})();
