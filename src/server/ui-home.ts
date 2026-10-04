// Compact home navigation with the same locally bundled Cowork companion.
export const HOME_CSS = String.raw`
  .home > .home-cta { order: -1; width: min(540px, 100%); align-self: center; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .home-cta-btn { --cta-accent: var(--accent); display: flex; align-items: center; gap: 12px; min-width: 0; padding: 13px 15px; border: 1px solid var(--border); border-radius: 14px; background: var(--card); color: var(--text); text-align: left; cursor: pointer; transition: background .18s ease, border-color .18s ease, transform .18s ease; }
  .home-cta-btn.team { --cta-accent: var(--run); }
  .home-cta-btn:hover { background: var(--hover); border-color: var(--cta-accent); transform: translateY(-2px); }
  .home-cta-btn:focus-visible { outline: 2px solid var(--cta-accent); outline-offset: 3px; }
  .home-cta-btn .cta-ico { display: grid; place-items: center; width: 34px; height: 34px; flex: none; border-radius: 10px; background: color-mix(in srgb, var(--cta-accent) 10%, var(--card)); color: var(--cta-accent); }
  .home-cta-btn .cta-ico svg { width: 18px; height: 18px; }
  .home-cta-btn .cta-body { min-width: 0; flex: 1; }
  .home-cta-btn .cta-t { display: block; font-size: 13px; font-weight: 600; }
  .home-cta-btn .cta-d { display: block; font-size: 11px; color: var(--muted); margin-top: 3px; }
  .home-cta-btn .cta-arrow { font-size: 17px; color: var(--muted); }
  .home-brand-lockup { display: flex; flex-direction:column; justify-content: center; align-items: center; gap: 10px; }
  .home-character { width:96px; height:96px; object-fit:contain; animation:homeCharacterFloat 5s ease-in-out infinite; }
  @keyframes homeCharacterFloat { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-5px); } }
  .home .home-brand-lockup h1 { width: auto; }
  .home-composer-wrap { width:min(760px,100%); min-width:0; }
  .home-composer-wrap .composer { width:100%; }
  .home-blob { width: clamp(72px, 10vw, 108px); height: auto; flex: none; overflow: visible; }
  .home-blob-body { transform-origin: 60px 83px; animation: homeBlobBob 5s ease-in-out infinite; }
  .home-blob-eye { transform-box: fill-box; transform-origin: center; animation: homeBlobBlink 6s ease-in-out infinite; }
  .home-blob-eye.wink { animation-name: homeBlobWink; }
  .home-blob-tongue { transform-box: fill-box; transform-origin: center top; animation: homeBlobTongue 6s ease-in-out infinite; }
  .home-blob-shadow { transform-origin: 60px 108px; animation: homeBlobShadow 5s ease-in-out infinite; }
  @keyframes homeBlobBob { 0%,100% { transform: translateY(0) rotate(-5deg); } 45% { transform: translateY(-8px) rotate(5deg); } 65% { transform: translateY(-3px) rotate(0deg) scale(1.04,.96); } }
  @keyframes homeBlobBlink { 0%,44%,48%,100% { transform: scaleY(1); } 46% { transform: scaleY(.08); } }
  @keyframes homeBlobWink { 0%,18%,38%,44%,48%,100% { transform: scaleY(1); } 23%,33%,46% { transform: scaleY(.12); } }
  @keyframes homeBlobTongue { 0%,15%,40%,100% { transform: scaleY(.05); } 22%,33% { transform: scaleY(1); } }
  @keyframes homeBlobShadow { 0%,100% { transform: scaleX(1); opacity: .18; } 45% { transform: scaleX(.8); opacity: .1; } }
  @media (max-width: 480px) { .home > .home-cta { gap: 8px; } .home-cta-btn { padding: 11px; gap: 8px; } .home-cta-btn .cta-arrow { display: none; } .home-cta-btn .cta-d { font-size: 10px; } .home-brand-lockup { gap: 8px; } .home .home-brand-lockup h1 { font-size: 36px; } }
  @media (prefers-reduced-motion: reduce) { .home-character,.home-blob * { animation: none !important; } .home-blob-tongue { transform: scaleY(.05); } }
`;
export const HOME_CHARACTER_HTML = '<img class="home-character" src="/characters/purple.png?v=opendots1" width="96" height="96" alt="" aria-hidden="true" draggable="false">';

export const HOME_BLOB_HTML = '<svg class="home-blob" viewBox="0 0 120 120" aria-hidden="true" focusable="false">' +
  '<defs><radialGradient id="homeBlobFill" cx="30%" cy="20%" r="85%"><stop stop-color="#cbbdff"/><stop offset=".5" stop-color="#9580ff"/><stop offset="1" stop-color="#6550cf"/></radialGradient></defs>' +
  '<ellipse class="home-blob-shadow" cx="60" cy="108" rx="34" ry="5" fill="#7160cb" opacity=".18"/>' +
  '<g class="home-blob-body"><path d="M17 64C10 39 27 15 49 16C63 8 84 16 92 29C104 34 110 52 103 66C112 90 91 101 71 96C52 107 23 98 20 82C12 77 12 69 17 64Z" fill="url(#homeBlobFill)"/>' +
  '<ellipse cx="36" cy="33" rx="12" ry="6" fill="white" opacity=".22" transform="rotate(-32 36 33)"/>' +
  '<ellipse cx="33" cy="66" rx="8" ry="4" fill="#f4a4d2" opacity=".65"/><ellipse cx="87" cy="66" rx="8" ry="4" fill="#f4a4d2" opacity=".65"/>' +
  '<g class="home-blob-eye"><ellipse cx="44" cy="51" rx="6" ry="10" fill="#262144"/><circle cx="46" cy="48" r="2" fill="white"/></g>' +
  '<g class="home-blob-eye wink"><ellipse cx="77" cy="49" rx="6" ry="10" fill="#262144"/><circle cx="79" cy="46" r="2" fill="white"/></g>' +
  '<path d="M49 69Q60 85 72 67" fill="#36234e" stroke="#36234e" stroke-width="3" stroke-linecap="round"/>' +
  '<path class="home-blob-tongue" d="M58 74Q70 71 68 79Q64 90 59 81Z" fill="#ff91bd"/></g></svg>';
