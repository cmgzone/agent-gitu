/* Small enhancements. The pages and their content work without JavaScript. */
(() => {
  'use strict';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.main-navigation');
  function closeNav(returnFocus = false) {
    if (!toggle || !nav) return;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation');
    nav.classList.remove('is-open');
    if (returnFocus) toggle.focus();
  }
  toggle?.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    nav?.classList.toggle('is-open', open);
  });
  nav?.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeNav();
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.site-header')) closeNav();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toggle?.getAttribute('aria-expanded') === 'true') closeNav(true);
  });

  if ('IntersectionObserver' in window && !reduced.matches) {
    document.documentElement.classList.add('js-enabled');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
      },
      { threshold: 0.07 },
    );
    document.querySelectorAll('[data-reveal]').forEach((element) => observer.observe(element));
  }

  const motionButton = document.createElement('button');
  motionButton.type = 'button';
  motionButton.className = 'motion-control';
  document.querySelector('.footer-bottom')?.append(motionButton);
  let paused = reduced.matches;
  function syncMotion() {
    document.body.dataset.motion = paused || reduced.matches ? 'paused' : 'playing';
    motionButton.textContent = reduced.matches ? 'Reduced motion on' : paused ? 'Resume motion' : 'Pause motion';
    motionButton.setAttribute('aria-pressed', String(paused || reduced.matches));
    motionButton.disabled = reduced.matches;
  }
  motionButton.addEventListener('click', () => {
    paused = !paused;
    syncMotion();
  });
  reduced.addEventListener('change', () => {
    paused = reduced.matches;
    syncMotion();
  });
  syncMotion();
  document.addEventListener('visibilitychange', () => document.body.classList.toggle('page-hidden', document.hidden));

  const states = {
    work: {
      image: 'assets/gitu-cowork.jpg',
      title: 'AGENT GITU / COWORK',
      alt: 'Actual Agent Gitu Cowork chat with Mailbox, Gmail, and Google Calendar connection suggestions for Atlas',
      caption: 'Real app screenshot · Connections assigned to Atlas.',
    },
    code: {
      image: 'assets/gitu-coding.jpg',
      title: 'AGENT GITU / CODING',
      alt: 'Actual dark-theme Agent Gitu coding conversation with repository reads and expanded command activity',
      caption: 'Real app screenshot · Repository reads and command results in the conversation.',
    },
    connections: {
      image: 'assets/gitu-connections.jpg',
      title: 'AGENT GITU / CONNECTIONS',
      alt: 'Actual Agent Gitu Connections screen with teammate-scoped apps, connection states, and proactive update controls',
      caption: 'Real app screenshot · Your apps, account status, and proactive update controls.',
    },
  };
  const tabs = [...document.querySelectorAll('[data-demo-tab]')];
  const panel = document.querySelector('#demo-panel');
  let demoTimer;
  function selectTab(tab, focus = false) {
    const state = states[tab.dataset.demoTab];
    if (!state || !panel) return;
    tabs.forEach((item) => {
      item.setAttribute('aria-selected', String(item === tab));
      item.tabIndex = item === tab ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', tab.id);
    for (const [selector, value] of Object.entries({ title: state.title, caption: state.caption })) {
      const element = document.querySelector(`[data-demo-${selector}]`);
      if (element) element.textContent = value;
    }
    const screenshot = document.querySelector('[data-demo-image]');
    if (screenshot) {
      screenshot.src = state.image;
      screenshot.alt = state.alt;
    }
    const full = document.querySelector('[data-demo-full]');
    if (full) full.href = state.image;
    clearTimeout(demoTimer);
    panel.classList.remove('demo-changing');
    if (!paused && !reduced.matches) {
      void panel.offsetWidth;
      panel.classList.add('demo-changing');
      demoTimer = setTimeout(() => panel.classList.remove('demo-changing'), 450);
    }
    if (focus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (event) => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) {
        event.preventDefault();
        selectTab(tabs[next], true);
      }
    });
  });
  document.querySelectorAll('[data-copy]').forEach((button) =>
    button.addEventListener('click', async () => {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(button.dataset.copy);
        button.textContent = 'Copied';
      } catch {
        const code = button.closest('.code-block')?.querySelector('code');
        if (code) {
          const range = document.createRange();
          range.selectNodeContents(code);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        }
        button.textContent = 'Text selected';
      }
      setTimeout(() => {
        button.textContent = 'Copy';
      }, 1800);
    }),
  );
})();
