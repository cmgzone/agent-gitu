export const COWORK_GALLERY_CSS = String.raw`
  .cw-gallery { height:100%; overflow:auto; padding:28px clamp(16px,4vw,48px) 40px; }
  .cw-gallery-head { display:flex; align-items:flex-start; gap:14px; margin-bottom:26px; }
  .cw-gallery-head h1 { margin:0 0 5px; font-size:28px; letter-spacing:-.04em; line-height:1.2; }
  .cw-gallery-head p { color:var(--muted); margin:0; font-size:12px; }
  .cw-gallery-head .cw-gallery-back { width:36px; height:36px; display:grid; place-items:center; color:var(--muted); flex:none; }
  .cw-gallery-toolbar { display:flex; align-items:center; gap:14px; justify-content:space-between; flex-wrap:wrap; margin-bottom:22px; }
  .cw-gallery-filters { display:flex; gap:5px; flex-wrap:wrap; }
  .cw-gallery-filters button { font:inherit; color:var(--muted); padding:7px 11px; border-radius:999px; }
  .cw-gallery-filters button[aria-pressed=true] { color:var(--accent); }
  .cw-gallery-search { min-width:0; width:220px; border:0; border-bottom:1px solid var(--border2); padding:9px 4px; background:transparent; color:var(--text); font:inherit; }
  .cw-gallery-summary { font-size:11px; color:var(--muted); margin-bottom:14px; }
  .cw-gallery-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr)); gap:18px; }
  .cw-gallery-tile { min-width:0; overflow:hidden; background:var(--card); border:1px solid var(--border); border-radius:18px; }
  .cw-rich-card { min-width:0; border:0; background:transparent; box-shadow:none; }
  .cw-gallery-tile.is-new,.cw-rich-card.is-new { animation:cw-media-arrive .4s cubic-bezier(.16,1,.3,1) both; animation-delay:var(--media-delay,0ms); }
  .cw-gallery-visual { width:100%; aspect-ratio:4/3; position:relative; overflow:hidden; background:var(--card2); display:grid; place-items:center; }
  .cw-gallery-visual > img { width:100%; height:100%; object-fit:cover; transition:transform .35s ease; }
  .cw-gallery-visual:hover > img { transform:scale(1.025); }
  .cw-gallery-visual > svg { width:44px; height:44px; color:var(--accent); stroke-width:1.3; }
  .cw-gallery-visual video { width:100%; height:100%; object-fit:contain; background:#101114; }
  .cw-gallery-visual audio { width:90%; position:absolute; bottom:14px; left:5%; }
  .cw-gallery-visual .cw-media-kind { position:absolute; left:12px; top:12px; font-size:10px; font-weight:600; padding:4px 8px; border-radius:999px; background:rgba(18,20,26,.65); color:#fff; backdrop-filter:blur(10px); pointer-events:none; }
  .cw-gallery-copy { padding:13px 14px 14px; display:flex; gap:10px; align-items:center; }
  .cw-gallery-copy > div { flex:1; min-width:0; }
  .cw-gallery-copy strong { display:block; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cw-gallery-copy small { display:block; margin-top:3px; color:var(--muted); font-size:10px; }
  .cw-gallery-copy .btn { padding:5px; min-width:30px; flex:none; color:var(--muted); }
  .cw-gallery-empty { padding:70px 16px; text-align:center; color:var(--muted); }
  .cw-gallery-empty > svg { width:44px; height:44px; margin-bottom:10px; color:var(--accent); stroke-width:1.2; }
  .cw-media-link { display:inline-flex; align-items:center; gap:7px; margin-top:10px; padding:5px 0; color:var(--accent); font:inherit; font-size:12px; }
  .cw-media-link svg { width:16px; height:16px; }
  .cw-media-stack-row { margin:-4px 0 8px; max-width:390px; }
  .cw-media-stack-row.me { align-self:flex-end; }
  .cw-media-stack-trigger { padding:4px 0; display:flex; align-items:center; gap:16px; color:var(--text); font:inherit; text-align:left; width:100%; border-radius:14px; }
  .cw-media-stack { width:140px; height:94px; flex:none; display:block; position:relative; }
  .cw-stack-sheet { position:absolute; top:14px; left:8px; width:90px; height:66px; border:1px solid var(--border); border-radius:9px; overflow:hidden; display:grid; place-items:center; background:var(--card); box-shadow:0 5px 13px rgba(0,0,0,.13); transform:rotate(var(--stack-angle,-8deg)); transition:transform .24s cubic-bezier(.16,1,.3,1); }
  .cw-stack-sheet:nth-child(2) { left:27px; top:10px; --stack-angle:0deg; }
  .cw-stack-sheet:nth-child(3) { left:47px; top:16px; --stack-angle:8deg; }
  .cw-stack-sheet img { width:100%; height:100%; object-fit:cover; }
  .cw-stack-sheet > svg { width:28px; height:28px; color:var(--accent); stroke-width:1.4; }
  .cw-media-stack-trigger:hover .cw-stack-sheet:first-child { transform:translateX(-4px) rotate(-12deg); }
  .cw-media-stack-trigger:hover .cw-stack-sheet:nth-child(3) { transform:translateX(4px) rotate(12deg); }
  .cw-media-stack-trigger.is-new .cw-stack-sheet { animation:cw-stack-arrive .45s cubic-bezier(.16,1,.3,1) both; animation-delay:var(--stack-delay,0ms); }
  .cw-media-stack-copy { display:flex; flex-direction:column; gap:5px; min-width:0; }
  .cw-media-stack-copy strong { font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cw-media-stack-copy > span { display:flex; align-items:center; gap:6px; font-size:11px; color:var(--muted); }
  .cw-media-stack-copy svg { width:13px; height:13px; transform:rotate(180deg); }
  @keyframes cw-stack-arrive { from { opacity:0; transform:translateY(12px) rotate(0deg) scale(.9); } to { opacity:1; transform:translateY(0) rotate(var(--stack-angle,-8deg)) scale(1); } }
  .cw-gallery-toggle { position:absolute; right:55px; top:12px; width:32px; height:32px; display:grid; place-items:center; color:var(--muted); }
  .cw-rich-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr)); gap:16px; margin:12px 0 2px; white-space:normal; }
  .cw-chat-media-grid { width:min(92%,680px); grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr)); margin:0 0 6px; }
  .cw-chat-media-grid:has(> :only-child) { width:min(100%,320px); }
  .cw-chat-media-grid.me { align-self:flex-end; }
  .cw-rich-card .cw-embed { margin:0; border:0; border-radius:0; }
  .cw-rich-visual { aspect-ratio:16/9; position:relative; overflow:hidden; border-radius:12px; background:var(--card2); }
  .cw-rich-visual iframe { width:100%; height:100%; max-width:none; aspect-ratio:auto; border:0; border-radius:0; display:block; }
  .cw-rich-visual > button { padding:0; width:100%; height:100%; display:grid; place-items:center; color:var(--accent); }
  .cw-rich-map-link { width:100%; height:100%; display:grid; place-items:center; text-decoration:none; }
  .cw-rich-visual img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
  .cw-rich-play { position:relative; width:46px; height:46px; border-radius:50%; display:grid; place-items:center; background:rgba(15,17,25,.65); color:white; backdrop-filter:blur(8px); box-shadow:0 5px 22px rgba(0,0,0,.15); }
  .cw-rich-play svg { width:22px; height:22px; }
  .cw-map-cover { background:linear-gradient(140deg,color-mix(in srgb,var(--accent) 10%,var(--card2)),var(--card2)); }
  .cw-map-cover::before { content:''; position:absolute; inset:0; opacity:.18; background:repeating-linear-gradient(30deg,transparent 0 24px,var(--muted) 25px 26px,transparent 27px 52px); }
  .cw-map-pin { position:relative; display:flex; flex-direction:column; align-items:center; gap:8px; font-size:11px; color:var(--muted); }
  .cw-map-pin svg { width:32px; height:32px; color:var(--accent); stroke-width:1.5; }
  .cw-rich-copy { padding:9px 1px 0; display:flex; align-items:center; gap:12px; }
  .cw-rich-copy > div { min-width:0; flex:1; }
  .cw-rich-copy strong { display:block; font-size:12px; overflow-wrap:anywhere; line-height:1.4; }
  .cw-rich-copy small { display:block; color:var(--muted); font-size:10px; margin-top:4px; }
  .cw-rich-copy a { flex:none; color:var(--accent); font-size:11px; text-decoration:none; display:inline-flex; align-items:center; gap:4px; }
  .cw-media-lightbox { width:min(1100px,94vw); max-height:94dvh; padding:0; border:1px solid var(--border); border-radius:20px; background:var(--bg); color:var(--text); box-shadow:var(--shadow-float); }
  .cw-media-lightbox::backdrop { background:rgba(10,12,18,.72); backdrop-filter:blur(8px); }
  .cw-media-lightbox header,.cw-media-lightbox footer { display:flex; align-items:center; gap:12px; padding:14px 18px; }
  .cw-media-lightbox header strong { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }
  .cw-media-lightbox header button { width:34px; height:34px; color:var(--muted); }
  .cw-lightbox-stage { height:min(65dvh,720px); display:grid; place-items:center; background:var(--card2); }
  .cw-lightbox-stage img { width:100%; height:100%; object-fit:contain; }
  .cw-media-lightbox footer { justify-content:center; color:var(--muted); font-size:11px; }
  @keyframes cw-media-arrive { from { opacity:0; transform:translateY(12px) scale(.985); } to { opacity:1; transform:translateY(0) scale(1); } }
  @media(max-width:720px) { .cw-gallery { padding-top:18px; } .cw-gallery-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; } .cw-gallery-copy { padding:10px; flex-wrap:wrap; gap:5px; } .cw-gallery-copy > div { flex-basis:100%; } .cw-gallery-search { width:100%; } .cw-gallery-toggle { min-width:40px; min-height:40px; right:58px; } .cw-chat-media-grid { width:100%; grid-template-columns:repeat(auto-fit,minmax(min(100%,165px),1fr)); gap:12px; } }
  @media(max-width:360px) { .cw-gallery-grid { grid-template-columns:1fr; } }
  @media(prefers-reduced-motion:reduce) { .cw-gallery-tile.is-new,.cw-rich-card.is-new,.cw-media-stack-trigger.is-new .cw-stack-sheet { animation:none; } .cw-gallery-visual > img,.cw-stack-sheet { transition:none; } .cw-gallery-visual:hover > img { transform:none; } }
`;

export const COWORK_GALLERY_JS = String.raw`
  function cwGalleryItems() {
    var cw=cwEnsure(),items=[],known=new Set();
    (cw.artifacts||[]).forEach(function(file){
      var mime=String(file.mime||''),kind=/^image\//i.test(mime)?'images':/^video\//i.test(mime)?'videos':/^audio\//i.test(mime)?'audio':'files';
      items.push({id:'file:'+file.id,file:file,kind:kind,name:file.name,date:file.createdAt||'',size:file.size});
    });
    (cw.msgs||[]).forEach(function(message){cwRichLinks(cwVisibleReply(message.text)).forEach(function(link){
      if(known.has(link.key))return;known.add(link.key);
      items.push({id:'link:'+link.key,link:link,kind:link.kind==='map'?'maps':'videos',name:link.title,date:message.ts||''});
    });});
    return items.sort(function(a,b){return (Date.parse(b.date)||0)-(Date.parse(a.date)||0);});
  }
  function cwGalleryFileHtml(item,index,fresh) {
    var file=item.file,inline='/api/cowork/artifacts/'+encodeURIComponent(file.id)+'?inline=1',visual=cwIcon('file');
    if(item.kind==='images')visual='<img src="'+inline+'" alt="'+esc(file.name)+'" loading="lazy" decoding="async">';
    else if(item.kind==='videos')visual='<video controls preload="metadata" src="'+inline+'"></video>';
    else if(item.kind==='audio')visual=cwIcon('play')+'<audio controls preload="none" src="'+inline+'"></audio>';
    var type=item.kind==='images'?(/screen|capture/i.test(file.name)?'Screenshot':'Image'):item.kind==='videos'?'Video':item.kind==='audio'?'Audio':'File';
    var stage=(item.kind==='images'||item.kind==='files')?'<button class="cw-gallery-visual" data-cwmediapreview="'+esc(file.id)+'" aria-label="Preview '+esc(file.name)+'">'+visual+'<span class="cw-media-kind">'+type+'</span></button>':'<div class="cw-gallery-visual">'+visual+'<span class="cw-media-kind">'+type+'</span></div>';
    var date=Date.parse(item.date),meta=cwBytes(file.size)+(isNaN(date)?'':' · '+new Date(date).toLocaleDateString(undefined,{month:'short',day:'numeric'}));
    return '<article class="cw-gallery-tile'+(fresh?' is-new':'')+'" data-gallery-id="'+esc(item.id)+'" style="--media-delay:'+Math.min(index*35,210)+'ms">'+stage+'<div class="cw-gallery-copy"><div><strong title="'+esc(file.name)+'">'+esc(file.name)+'</strong><small>'+esc(meta)+'</small></div><a class="btn ghost" href="/api/cowork/artifacts/'+encodeURIComponent(file.id)+'" download aria-label="Download '+esc(file.name)+'" title="Download">'+cwIcon('download')+'</a></div></article>';
  }
  function cwOpenGallery(focusId) {
    var cw=cwEnsure(),conv=cwActiveConv();if(!conv)return;
    cwSaveDraft();cwClosePanels();cw.connectionsOpen=false;cw.connectionRevision=(cw.connectionRevision||0)+1;cw.galleryOpen=true;cw.galleryFilter='all';cw.gallerySearch='';cw.gallerySignature=null;cw.gallerySeen=new Set();cwSyncPanels();
    $('cwChat').innerHTML='<main class="cw-gallery"><header class="cw-gallery-head"><button class="cw-gallery-back" id="cwGalleryBack" aria-label="Back to chat" title="Back to chat">'+cwIcon('back')+'</button><div><h1>Media &amp; files</h1><p>'+esc(conv.title)+' · Shared in this conversation</p></div></header><div class="cw-gallery-toolbar"><nav class="cw-gallery-filters" id="cwGalleryFilters" aria-label="Media filters">'+[['all','All'],['images','Images'],['videos','Videos'],['audio','Audio'],['files','Files'],['maps','Maps']].map(function(filter){return '<button type="button" data-gallery-filter="'+filter[0]+'" aria-pressed="'+(filter[0]==='all')+'">'+filter[1]+'</button>';}).join('')+'</nav><input class="cw-gallery-search" id="cwGallerySearch" type="search" aria-label="Search media and files" placeholder="Search media and files"></div><div class="cw-gallery-summary" id="cwGallerySummary" role="status" aria-live="polite"></div><div class="cw-gallery-grid" id="cwGalleryGrid"></div></main>';
    $('cwGalleryBack').onclick=function(){cw.galleryOpen=false;cwRenderChat();};
    $('cwGalleryFilters').querySelectorAll('button').forEach(function(button){button.onclick=function(){cw.galleryFilter=button.getAttribute('data-gallery-filter');cw.gallerySignature=null;cwRenderGallery();};});
    $('cwGallerySearch').oninput=function(){cw.gallerySearch=this.value;cw.gallerySignature=null;cwRenderGallery();};
    cwRenderGallery();if(focusId){var tile=document.querySelector('[data-gallery-id="file:'+focusId+'"]');if(tile)tile.scrollIntoView({block:'center'});}
    $('cwGalleryBack').focus({preventScroll:true});
    if(!cw.timer){cwStartStream(cw.active);cwPoll();cw.timer=setInterval(cwPoll,2000);}
  }
  function cwRenderGallery() {
    var cw=cwEnsure(),grid=$('cwGalleryGrid');if(!cw.galleryOpen||!grid)return;
    var all=cwGalleryItems(),query=String(cw.gallerySearch||'').toLowerCase(),items=all.filter(function(item){return (cw.galleryFilter==='all'||item.kind===cw.galleryFilter)&&item.name.toLowerCase().includes(query);});
    var signature=JSON.stringify(items.map(function(item){return [item.id,item.name,item.size];}));if(cw.gallerySignature===signature)return;cw.gallerySignature=signature;
    var seen=cw.gallerySeen||(cw.gallerySeen=new Set());
    // Keep existing players alive when a new file arrives; only add/remove tiles.
    var previous=new Map();Array.from(grid.children).forEach(function(node){var id=node.getAttribute('data-gallery-id');if(id)previous.set(id,node);else node.remove();});
    var keep=new Set(items.map(function(item){return item.id;}));previous.forEach(function(node,id){if(!keep.has(id))node.remove();});
    items.forEach(function(item,index){var node=previous.get(item.id);if(!node){var fresh=!seen.has(item.id);seen.add(item.id);var holder=document.createElement('div');holder.innerHTML=item.file?cwGalleryFileHtml(item,index,fresh):cwRichCardHtml(item.link,index);node=holder.firstElementChild;node.setAttribute('data-gallery-id',item.id);}if(grid.children[index]!==node)grid.insertBefore(node,grid.children[index]||null);});
    if(!items.length)grid.innerHTML='<div class="cw-gallery-empty">'+cwIcon('image')+'<p>'+(all.length?'No media matches this filter.':'Your shared pictures, screenshots and files will appear here.')+'</p></div>';
    $('cwGallerySummary').textContent=items.length+' '+(items.length===1?'item':'items')+(query?' matching your search':'');
    $('cwGalleryFilters').querySelectorAll('button').forEach(function(button){button.setAttribute('aria-pressed',String(button.getAttribute('data-gallery-filter')===cw.galleryFilter));});
    grid.querySelectorAll('[data-cwmediapreview]').forEach(function(button){button.onclick=function(){var file=cwArtifact(button.getAttribute('data-cwmediapreview'));if(!file)return;if(/^image\//i.test(file.mime||''))cwGalleryLightbox(file.id);else cwPreviewFile(file.id);};});
    cwBindRichCards(grid);
  }
  function cwGalleryLightbox(id) {
    var images=cwGalleryItems().filter(function(item){return item.kind==='images';}),index=images.findIndex(function(item){return item.file.id===id;});if(index<0)return;
    var dialog=document.createElement('dialog');dialog.className='cw-media-lightbox';dialog.setAttribute('aria-label','Image preview');
    dialog.innerHTML='<header><strong></strong><a class="btn ghost" download aria-label="Download image" title="Download">'+cwIcon('download')+'</a><button aria-label="Close image preview" title="Close" autofocus>'+cwIcon('close')+'</button></header><div class="cw-lightbox-stage"><img alt=""></div><footer><button class="btn ghost" data-image-prev aria-label="Previous image">'+cwIcon('back')+'</button><span role="status"></span><button class="btn ghost" data-image-next aria-label="Next image">'+cwIcon('back')+'</button></footer>';
    dialog.querySelector('[data-image-next] svg').style.transform='rotate(180deg)';
    function show(){var file=images[index].file;dialog.querySelector('header strong').textContent=file.name;var image=dialog.querySelector('img');image.src='/api/cowork/artifacts/'+encodeURIComponent(file.id)+'?inline=1';image.alt=file.name;dialog.querySelector('a').href='/api/cowork/artifacts/'+encodeURIComponent(file.id);dialog.querySelector('footer span').textContent=(index+1)+' / '+images.length;dialog.querySelector('[data-image-prev]').disabled=index===0;dialog.querySelector('[data-image-next]').disabled=index===images.length-1;}
    function move(direction){index=Math.max(0,Math.min(images.length-1,index+direction));show();}
    dialog.querySelector('header button').onclick=function(){dialog.close();};dialog.querySelector('[data-image-prev]').onclick=function(){move(-1);};dialog.querySelector('[data-image-next]').onclick=function(){move(1);};
    dialog.onkeydown=function(event){if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}if(event.key==='ArrowRight'){event.preventDefault();move(1);}};dialog.addEventListener('close',function(){dialog.remove();},{once:true});
    document.body.appendChild(dialog);show();dialog.showModal();
  }
`;
