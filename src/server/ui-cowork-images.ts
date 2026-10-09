export const COWORK_IMAGES_CSS = String.raw`
  .cw-photo-strip { display:flex; align-items:center; gap:0; width:100%; min-width:0; box-sizing:border-box; overflow-x:auto; padding:32px 22px 44px; margin:0 0 4px; scroll-snap-type:x proximity; perspective:900px; }
  .cw-photo-strip.me { justify-content:flex-end; align-self:flex-end; }
  .cw-photo-card { --photo-x:-4px; --photo-y:-6px; --photo-z:0px; --photo-roll:-5deg; --photo-yaw:-12deg; position:relative; flex:0 0 clamp(148px,17vw,200px); aspect-ratio:3/4; padding:0; border-radius:18px; overflow:hidden; cursor:pointer; scroll-snap-align:center; transform-origin:50% 65%; backface-visibility:hidden; }
  .cw-photo-card + .cw-photo-card { margin-left:-24px; }
  .cw-photo-card:nth-child(even) { --photo-x:4px; --photo-y:14px; --photo-roll:6deg; --photo-yaw:12deg; }
  .cw-photo-card img { display:block; width:100%; height:100%; object-fit:contain; pointer-events:none; }
  #cw .cw-photo-card { border:0 !important; background:transparent !important; box-shadow:none !important; backdrop-filter:none !important; -webkit-backdrop-filter:none !important; transform:translate3d(var(--photo-x),var(--photo-y),var(--photo-z)) rotateX(var(--photo-rx,0deg)) rotateY(calc(var(--photo-yaw) + var(--photo-ry,0deg))) rotateZ(var(--photo-roll)); transition:transform .38s cubic-bezier(.33,0,.25,1),opacity .38s cubic-bezier(.33,0,.25,1); }
  .cw-photo-card.is-new { animation:cw-photo-arrive .38s cubic-bezier(.16,1,.3,1) backwards; animation-delay:var(--photo-delay,0ms); }
  #cw .cw-photo-card.is-hovered, #cw .cw-photo-card:focus-visible { --photo-x:0px; --photo-y:-12px; --photo-z:60px; --photo-roll:0deg; --photo-yaw:0deg; z-index:3; }
  #cw .cw-photo-card.is-tracking { transition-duration:100ms; }
  #cw .cw-photo-card:active { --photo-z:18px; --photo-y:-6px; transition-duration:120ms; }
  @media(hover:hover) { #cw .cw-photo-strip.is-active .cw-photo-card:not(.is-hovered):not(:focus-visible) { --photo-x:-64px; --photo-y:26px; --photo-roll:-12deg; --photo-yaw:-24deg; --photo-z:-180px; opacity:.55; } #cw .cw-photo-strip.is-active .cw-photo-card:nth-child(even):not(.is-hovered):not(:focus-visible) { --photo-x:64px; --photo-roll:14deg; --photo-yaw:24deg; } }
  #cw .cw-photo-card:only-child { flex-basis:min(100%,360px); aspect-ratio:auto; --photo-x:0px; --photo-y:0px; --photo-roll:0deg; --photo-yaw:0deg; }
  .cw-photo-card:only-child img { max-height:400px; height:auto; }
  @media(max-width:720px) { .cw-photo-card { flex-basis:160px; border-radius:15px; } .cw-photo-strip { padding-inline:10px; } }
  @keyframes cw-photo-arrive { from { opacity:0; translate:0 18px; scale:.96; } to { opacity:1; translate:0 0; scale:1; } }
  body.cowork .cw-media-lightbox { inset:0; margin:0; width:100vw; height:100dvh; max-width:none; max-height:none; box-sizing:border-box; border:0; border-radius:0; background:transparent; box-shadow:none; overflow:hidden; }
  body.cowork .cw-media-lightbox::backdrop { background:var(--cw-chat-surface,var(--bg)); backdrop-filter:none; -webkit-backdrop-filter:none; animation:cw-backdrop-open .42s ease both; }
  body.cowork .cw-media-lightbox.is-closing::backdrop { animation:cw-backdrop-close .32s ease both; }
  body.cowork .cw-media-lightbox :is(header,footer) { animation:cw-controls-open .45s ease both; transition:opacity .2s ease; }
  body.cowork .cw-media-lightbox.is-closing :is(header,footer) { opacity:0; animation:none; pointer-events:none; }
  body.cowork .cw-media-lightbox header { position:absolute; inset:0 0 auto; z-index:2; padding:20px; }
  body.cowork .cw-media-lightbox header strong { display:none; }
  body.cowork .cw-media-lightbox header button { order:-1; width:44px; height:44px; display:grid; place-items:center; border-radius:50%; background:color-mix(in srgb,var(--card) 78%,transparent); color:var(--text); }
  body.cowork .cw-media-lightbox header a { margin-left:auto; display:flex; align-items:center; gap:8px; padding:12px 18px; border:0; border-radius:999px; background:color-mix(in srgb,var(--card) 78%,transparent); color:var(--text); }
  body.cowork .cw-lightbox-stage { height:100%; background:transparent; padding:82px 72px; box-sizing:border-box; }
  body.cowork .cw-lightbox-stage img { width:min(58vw,560px); height:min(76dvh,700px); max-width:100%; max-height:100%; padding:0; box-sizing:border-box; border-radius:18px; background:transparent; border:0; object-fit:contain; }
  body.cowork .cw-media-lightbox footer { position:absolute; bottom:20px; left:0; right:0; padding:0; }
  body.cowork .cw-media-lightbox footer button { position:fixed; top:calc(50% - 22px); width:44px; height:44px; display:grid; place-items:center; border:0; border-radius:50%; background:color-mix(in srgb,var(--card) 78%,transparent); color:var(--text); }
  body.cowork .cw-media-lightbox [data-image-prev] { left:clamp(16px,15vw,240px); }
  body.cowork .cw-media-lightbox [data-image-next] { right:clamp(16px,15vw,240px); }
  body.cowork .cw-media-lightbox footer button:disabled { visibility:hidden; }
  #cwPhotoPreview header :is(button,a), #cwPhotoPreview footer button { background:color-mix(in srgb,var(--card) 78%,transparent) !important; }
  @keyframes cw-backdrop-open { from { opacity:0; } to { opacity:1; } }
  @keyframes cw-backdrop-close { from { opacity:1; } to { opacity:0; } }
  @keyframes cw-controls-open { 0%,25% { opacity:0; } 100% { opacity:1; } }
  @media(max-width:720px) { body.cowork .cw-lightbox-stage { padding:82px 58px; } body.cowork .cw-lightbox-stage img { width:100%; } }
  @media(prefers-reduced-motion:reduce) { #cw .cw-photo-card { transition:none; } .cw-photo-card.is-new, body.cowork .cw-media-lightbox::backdrop, body.cowork .cw-media-lightbox :is(header,footer) { animation:none; } }
`;

import { CHAT_BUBBLE_MOTION_JS } from './ui-chat-surface.js';

export const COWORK_IMAGES_JS = String.raw`
  ${CHAT_BUBBLE_MOTION_JS}
  function cwPhotoReducedMotion() { return typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function cwBindPhotoMotion(root) {
    root.querySelectorAll('[data-cwphoto]').forEach(function(card){
      if(card.dataset.photoMotion)return;card.dataset.photoMotion='true';
      var strip=card.parentElement,bounds=null,frame=0;
      function reset(){cancelAnimationFrame(frame);frame=0;card.classList.remove('is-hovered','is-tracking');strip.classList.remove('is-active');card.style.removeProperty('--photo-rx');card.style.removeProperty('--photo-ry');}
      card.addEventListener('pointerenter',function(event){if(event.pointerType!=='mouse'||cwPhotoReducedMotion())return;bounds=card.getBoundingClientRect();strip.classList.add('is-active');card.classList.add('is-hovered');});
      card.addEventListener('pointermove',function(event){
        if(!card.classList.contains('is-hovered')||!bounds||cwPhotoReducedMotion())return;
        var x=Math.max(-1,Math.min(1,(event.clientX-bounds.left)/bounds.width*2-1)),y=Math.max(-1,Math.min(1,(event.clientY-bounds.top)/bounds.height*2-1));
        cancelAnimationFrame(frame);frame=requestAnimationFrame(function(){if(!card.isConnected)return;card.classList.add('is-tracking');card.style.setProperty('--photo-rx',(-y*7).toFixed(2)+'deg');card.style.setProperty('--photo-ry',(x*9).toFixed(2)+'deg');card.style.setProperty('--photo-glow-x',((x+1)*50)+'%');card.style.setProperty('--photo-glow-y',((y+1)*50)+'%');});
      });
      card.addEventListener('pointerleave',reset);card.addEventListener('pointercancel',reset);
    });
  }
  function cwPhotoFlightTransform(from,to,roll) {
    if(!from||!to||!from.width||!from.height||!to.width||!to.height)return null;
    return 'translate('+(from.left+from.width/2-to.left-to.width/2)+'px,'+(from.top+from.height/2-to.top-to.height/2)+'px) rotate('+(roll||0)+'deg) scale('+(from.width/to.width)+','+(from.height/to.height)+')';
  }
  function cwAnimateChatBubbles(root) {
    var cw=cwEnsure(),seen=cw.bubbleSeen||(cw.bubbleSeen=new Set());
    var reduced=typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.querySelectorAll('[data-cwentrance]').forEach(function(row){
      var id=row.getAttribute('data-cwentrance');if(!id)return;
      var key=cw.active+'/'+(cw.threadId||'')+'/'+id;if(seen.has(key))return;seen.add(key);
      if(!reduced)chatBubbleEntrance(row);
    });
  }
  function cwPrimeChatBubbles(messages) {
    var cw=cwEnsure(),seen=cw.bubbleSeen||(cw.bubbleSeen=new Set());
    messages.forEach(function(message){if(message.id)seen.add(cw.active+'/'+(cw.threadId||'')+'/'+message.id);});
  }
  function cwPhotoCardsHtml(files,role) {
    if(!files.length)return '';
    var cw=cwEnsure(),seen=cw.photoSeen||(cw.photoSeen=new Set());
    return '<div class="cw-photo-strip'+(role==='user'?' me':'')+'" role="group" aria-label="Shared images">'+files.map(function(file){
      var fresh=!seen.has(file.id);seen.add(file.id);
      var source=file.url||'/api/cowork/artifacts/'+encodeURIComponent(file.id)+'?inline=1';
      return '<button type="button" class="cw-photo-card'+(fresh?' is-new':'')+'" data-cwphoto="'+esc(file.id)+'"'+(file.url?' data-cwphoto-url="'+esc(file.url)+'"':'')+' aria-label="View image: '+esc(file.name||'Shared image')+'"><img src="'+esc(source)+'" alt="'+esc(file.alt||file.name||'Shared image')+'" loading="lazy" decoding="async"></button>';
    }).join('')+'</div>';
  }
`;
