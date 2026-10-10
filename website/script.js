/* Agent Gitu site behaviour — shared by all pages. No dependencies. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- mobile nav ---------- */
  var toggle = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');

  function closeNav() {
    if (!links || !toggle) return;
    links.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    links.addEventListener('click', function (e) {
      if (e.target.closest('a')) closeNav();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeNav();
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.nav')) closeNav();
    });
  }

  /* ---------- scroll reveal ---------- */
  var revealables = document.querySelectorAll('.reveal');
  if (revealables.length) {
    if (reduced || !('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(revealables, function (el) { el.classList.add('is-in'); });
    } else {
      var revealObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            revealObs.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      Array.prototype.forEach.call(revealables, function (el) { revealObs.observe(el); });
    }
  }

  /* ---------- docs scrollspy ---------- */
  var spyTargets = document.querySelectorAll('[data-spy-section]');
  if (spyTargets.length && 'IntersectionObserver' in window) {
    var spyObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.id;
        Array.prototype.forEach.call(document.querySelectorAll('[data-spy-link]'), function (a) {
          a.classList.toggle('is-active', a.getAttribute('href') === '#' + id);
        });
      });
    }, { rootMargin: '-96px 0px -62% 0px', threshold: 0 });
    Array.prototype.forEach.call(spyTargets, function (el) { spyObs.observe(el); });
  }

  /* ---------- copy to clipboard ---------- */
  function legacyCopy(text, cb) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); cb(); } catch (err) { /* clipboard unavailable */ }
    document.body.removeChild(ta);
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy');
      var original = btn.textContent;
      var done = function () {
        btn.textContent = 'Copied';
        btn.classList.add('is-done');
        window.setTimeout(function () {
          btn.textContent = original;
          btn.classList.remove('is-done');
        }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text, done); });
      } else {
        legacyCopy(text, done);
      }
    });
  });

  /* ---------- pointer-follow glow on cards ---------- */
  if (!reduced && window.matchMedia('(hover: hover)').matches) {
    Array.prototype.forEach.call(document.querySelectorAll('.card'), function (card) {
      card.addEventListener('mousemove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
  }

  /* ---------- home mockup: cycling tool trace ---------- */
  var step = document.querySelector('[data-cycle]');
  if (step && !reduced) {
    var states = [
      { tag: 'read', txt: 'src/task-ledger.ts \u2014 plan and criteria loaded' },
      { tag: 'read', txt: 'src/project-guard.ts \u2014 repo root locked' },
      { tag: 'run ', txt: 'npm run typecheck \u2192 0 errors' },
      { tag: 'ok  ', txt: 'Evidence recorded \u00b7 criterion accepted' }
    ];
    var i = 0;
    window.setInterval(function () {
      i = (i + 1) % states.length;
      var tagEl = step.querySelector('.tag');
      var txtEl = step.querySelector('.txt');
      if (!tagEl || !txtEl) return;
      step.style.animation = 'none';
      void step.offsetWidth;
      step.style.animation = '';
      tagEl.textContent = states[i].tag;
      txtEl.textContent = states[i].txt;
      step.classList.toggle('ok', states[i].tag.trim() === 'ok');
    }, 2400);
  }

  /* ---------- subscribe form (front-end only) ---------- */
  var form = document.querySelector('[data-subscribe]');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var note = form.querySelector('[data-subscribe-note]');
      if (note) note.textContent = 'Thanks \u2014 you are on the list.';
      form.reset();
    });
  }
})();
