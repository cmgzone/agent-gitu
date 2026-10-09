/**
 * Shared output viewers for chat.
 *
 * Skills emit structured results as fenced blocks whose info string starts
 * with "output" followed by a kind:
 *
 *   ```output chart
 *   {"type":"bar","labels":["a","b"],"series":[{"name":"p50","data":[12,9]}]}
 *   ```
 *
 *   ```output table     pipe table text
 *   ```output preview   URL, data:text/html URL, or raw HTML
 *   ```output video     YouTube / Vimeo / direct media URL
 *   ```output audio     URL or {"url","title","mime"}
 *   ```output image     URL or {"url","caption","alt"}
 *   ```output docs      [{"name","url","mime","size"}]
 *   ```output links     [{"title","url","description"}]
 *   ```output gallery   [{"url","caption"}]
 *   ```output map       {"q":"Berlin"} or {"lat","lon","zoom"}
 *   ```output json      any JSON
 *
 * outRenderBlocks rewrites only those fences and returns every other byte of
 * the text untouched, so ordinary code fences keep flowing through the normal
 * code renderer. A block whose closing fence has not arrived yet (mid-stream)
 * is also left alone, so streaming never renders a half-built viewer.
 *
 * Both surfaces (Coding and Cowork) call the same helpers, which is what keeps
 * the two from drifting apart.
 *
 * OUTPUT_JS runs inside the app's main IIFE alongside the existing helpers
 * ($, esc, api, toast, S). It is ES5-style JS with string concatenation, since
 * String.raw cannot carry backticks or template interpolation safely.
 */

export const OUTPUT_CSS = String.raw`
/* ---------- shared output viewers (skills -> structured results) ---------- */
.out-card{margin:10px 0;border:1px solid var(--border2, #2a2f3a);border-radius:10px;background:var(--card, #14161c);overflow:hidden}
.out-head{display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid var(--border2, #2a2f3a);background:var(--card2, #171a21)}
.out-title{font-size:12px;font-weight:600;color:var(--text, #e6e9ef);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.out-kind{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted, #8a93a3);border:1px solid var(--border2, #2a2f3a);border-radius:999px;padding:1px 6px;white-space:nowrap}
.out-sp{flex:1}
.out-btn{font:inherit;font-size:11px;color:var(--muted, #8a93a3);background:transparent;border:1px solid var(--border2, #2a2f3a);border-radius:6px;padding:2px 7px;cursor:pointer}
.out-btn:hover{color:var(--text, #e6e9ef);border-color:var(--accent, #6a8cff)}
.out-btn:focus-visible{outline:2px solid var(--accent, #6a8cff);outline-offset:1px}
.out-body{padding:10px}
.out-pre{margin:0;font-size:12px;overflow:auto;max-height:340px}

/* sortable tables */
.out-tw{overflow-x:auto}
table.out-tbl{border-collapse:collapse;width:100%;font-size:12.5px;font-variant-numeric:tabular-nums}
table.out-tbl th,table.out-tbl td{border:1px solid var(--border2, #2a2f3a);padding:5px 8px;text-align:left}
table.out-tbl thead th{background:var(--card2, #171a21);white-space:nowrap}
table.out-tbl td.num{text-align:right}
.out-sort{font:inherit;font-size:11.5px;font-weight:600;color:var(--text, #e6e9ef);background:none;border:0;padding:0;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
.out-sort[data-dir="1"]::after{content:'\2191';color:var(--accent, #6a8cff)}
.out-sort[data-dir="-1"]::after{content:'\2193';color:var(--accent, #6a8cff)}
.out-sort::after{content:'\2195';opacity:.3;font-size:10px}

/* charts (inline SVG) */
.out-chart{width:100%;overflow-x:auto}
svg.out-svg{display:block;width:100%;min-width:320px;height:auto;max-height:340px}
.out-grid{stroke:var(--border2, #2a2f3a)}
.out-axis{stroke:var(--border2, #2a2f3a)}
.out-tick{fill:var(--muted, #8a93a3);font-size:10px}
.out-lbl{fill:var(--muted, #8a93a3);font-size:10px}
.out-bar:hover{opacity:.78}
.out-legend{display:flex;flex-wrap:wrap;gap:10px;padding:6px 2px 0;font-size:11px;color:var(--muted, #8a93a3)}
.out-legend i{width:9px;height:9px;border-radius:2px;display:inline-block;margin-right:5px}

/* media, docs, maps */
.out-frame{width:100%;aspect-ratio:16/9;border:0;display:block;background:#000}
.out-frame.tall{aspect-ratio:4/3}
.out-note{padding:8px 2px;font-size:12px;color:var(--muted, #8a93a3)}
.out-note a{color:var(--accent, #6a8cff)}
.out-audio{display:block;width:100%;margin:4px 0}
.out-image{margin:0}
.out-image a{display:block}
.out-image img{display:block;width:100%;max-height:520px;object-fit:contain;border-radius:7px;background:var(--card2, #171a21)}
.out-image figcaption{padding:7px 2px 0;font-size:12px;color:var(--muted, #8a93a3);line-height:1.5}
.out-source{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:8px;font-size:11px;color:var(--muted, #8a93a3)}
.out-source a{color:var(--accent, #6a8cff);overflow-wrap:anywhere}
.out-links{display:grid;gap:7px}
.out-link{display:block;padding:10px 12px;border:1px solid var(--border2, #2a2f3a);border-radius:8px;text-decoration:none;color:var(--text, #e6e9ef);background:var(--card2, #171a21)}
.out-link:hover{border-color:var(--accent, #6a8cff)}
.out-link:focus-visible,.out-image a:focus-visible,.out-gal a:focus-visible{outline:2px solid var(--accent, #6a8cff);outline-offset:2px}
.out-link strong{display:block;font-size:12.5px;overflow-wrap:anywhere}
.out-link small{display:block;font-size:11px;color:var(--muted, #8a93a3);padding-top:4px;overflow-wrap:anywhere}
.out-link-heading{display:flex;gap:8px;align-items:center}
.out-link-icon{width:18px;height:18px;flex:none;display:grid;place-items:center;color:var(--muted, #8a93a3)}
.out-link-icon img{display:block;width:18px;height:18px;object-fit:contain;border-radius:3px}
.out-link-icon [hidden]{display:none}
.out-docs{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,190px),1fr));gap:8px}
.out-doc{display:flex;gap:9px;align-items:center;padding:8px;border:1px solid var(--border2, #2a2f3a);border-radius:8px;color:inherit;text-decoration:none;background:var(--card2, #171a21)}
.out-doc:hover{border-color:var(--accent, #6a8cff)}
.out-doc:focus-visible{outline:2px solid var(--accent, #6a8cff)}
.out-doc>span:last-child{min-width:0}
.out-ic{width:28px;height:28px;flex:none;border-radius:6px;display:grid;place-items:center;font-size:10px;font-weight:700;color:#fff}
.out-n{display:block;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.out-m{display:block;font-size:10.5px;color:var(--muted, #8a93a3)}
.out-gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,150px),1fr));gap:6px}
.out-gal figure{margin:0}
.out-gal a{display:block}
.out-gal img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:7px;display:block;cursor:zoom-in;background:var(--card2, #171a21)}
.out-gal figcaption{font-size:10.5px;color:var(--muted, #8a93a3);padding-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* workspace overlay: the "expand to full screen" surface */
.out-ov{position:fixed;inset:0;z-index:9000;background:rgba(6,8,12,.74);display:flex;align-items:center;justify-content:center;padding:24px}
.out-ov[hidden]{display:none}
.out-ov-panel{background:var(--bg, #0e1015);border:1px solid var(--border2, #2a2f3a);border-radius:12px;width:100%;max-width:min(1200px,100%);max-height:100%;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.5)}
.out-ov-head{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--border2, #2a2f3a)}
.out-ov-body{overflow:auto;padding:12px}
@media (max-width:640px){.out-docs{grid-template-columns:1fr}.out-ov{padding:0}.out-ov-panel{border-radius:0}}
`;

export const OUTPUT_JS = String.raw`
/* ================= shared output viewers ================= */
var OUT_COLORS = ['#6a8cff','#3fb984','#e0a34a','#c9607f','#8b6ae0','#4aa3c7','#9aa4b8','#d1663f'];
function outEsc(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function outNum(v){
  if(!isFinite(v)) return '0';
  var a = Math.abs(v);
  return String(a >= 100 ? Math.round(v) : a >= 1 ? Math.round(v*10)/10 : Math.round(v*100)/100);
}
function outColor(i){ return OUT_COLORS[((i % OUT_COLORS.length) + OUT_COLORS.length) % OUT_COLORS.length]; }
function outJson(text){
  try { return JSON.parse(String(text == null ? '' : text)); } catch(e){ return null; }
}
/* A URL is validated before it enters an href, src or poster. Root-relative
   artifact URLs stay on the app origin; executable schemes never enter a card. */
function outSafeUrl(value, usage){
  var raw = String(value == null ? '' : value).trim();
  if(!raw || /[\u0000-\u001f\u007f<>"\\]/.test(raw)) return '';
  if(usage === 'image' && /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(raw)) return raw;
  var relative = raw.charAt(0) === '/' && raw.charAt(1) !== '/';
  if(!relative && !/^https?:\/\//i.test(raw)) return '';
  try {
    var base = window.location && window.location.href || 'http://localhost/';
    var url = new URL(raw, base);
    if(!/^https?:$/.test(url.protocol) || url.username || url.password || !url.hostname) return '';
    if(relative && url.origin !== new URL(base).origin) return '';
    return relative ? url.pathname + url.search + url.hash : url.href;
  } catch(e){ return ''; }
}
function outSpec(input){ return typeof input === 'string' ? { url: input } : input && typeof input === 'object' && !Array.isArray(input) ? input : {}; }
function outList(input){ return Array.isArray(input) ? input : input == null ? [] : [input]; }
function outSource(url, caption){
  var safe = outSafeUrl(url);
  return (caption || safe) ? '<div class="out-source">' + (caption ? '<span>' + outEsc(caption) + '</span>' : '<span></span>')
    + (safe ? '<a href="' + outEsc(safe) + '" target="_blank" rel="noopener noreferrer">Open source &#8599;</a>' : '') + '</div>' : '';
}

/* Pipe table -> sortable table. Returns null when the block is not a table. */
function outTableHtml(block){
  var rows = String(block == null ? '' : block).split('\n').map(function(l){ return l.trim(); }).filter(Boolean);
  if(rows.length < 3) return null;
  var divider = function(l){ return /^[|\s:|-]+$/.test(l) && l.indexOf('-') >= 0; };
  if(!divider(rows[1])) return null;
  var cells = function(l){ return l.replace(/^\|+/,'').replace(/\|+$/,'').split('|').map(function(c){ return c.trim(); }); };
  var head = cells(rows[0]);
  var body = rows.slice(2).map(cells);
  var h = '<div class="out-tw"><table class="out-tbl"><thead><tr>';
  for(var i=0;i<head.length;i++){
    h += '<th scope="col"><button type="button" class="out-sort" data-i="' + i + '" data-dir="1" aria-label="Sort by ' + outEsc(head[i]) + '">' + outEsc(head[i]) + '</button></th>';
  }
  h += '</tr></thead><tbody>';
  for(var r=0;r<body.length;r++){
    h += '<tr>';
    for(var c=0;c<head.length;c++){
      var v = body[r][c] == null ? '' : body[r][c];
      var n = Number(String(v).replace(/[,%\s]/g,''));
      h += '<td' + (String(v) !== '' && isFinite(n) ? ' class="num"' : '') + '>' + outEsc(v) + '</td>';
    }
    h += '</tr>';
  }
  return h + '</tbody></table></div>';
}

/* Column sort. Delegated from one document listener, so streamed tables need
   no per-element setup. Toggles ascending/descending. */
function outSortTable(btn){
  var table = btn.closest ? btn.closest('table.out-tbl') : null;
  if(!table || !table.tBodies.length) return;
  var body = table.tBodies[0];
  var idx = Number(btn.getAttribute('data-i')) || 0;
  var dir = btn.getAttribute('data-dir') === '1' ? -1 : 1;
  var all = table.querySelectorAll('.out-sort');
  for(var p=0;p<all.length;p++){ if(all[p] !== btn) all[p].setAttribute('data-dir','0'); }
  btn.setAttribute('data-dir', String(dir));
  var rows = Array.prototype.slice.call(body.rows);
  var val = function(tr){ return tr.cells[idx] ? String(tr.cells[idx].textContent || '').trim() : ''; };
  var numeric = true;
  for(var s=0;s<rows.length;s++){
    var t = val(rows[s]);
    if(t !== '' && !isFinite(Number(t.replace(/[,%\s]/g,'')))) { numeric = false; break; }
  }
  rows.sort(function(a,b){
    var x = val(a), y = val(b);
    if(numeric) return (Number(x.replace(/[,%\s]/g,'')) - Number(y.replace(/[,%\s]/g,''))) * dir;
    return x.localeCompare(y) * dir;
  });
  for(var k=0;k<rows.length;k++){ body.appendChild(rows[k]); }
}

/* JSON spec -> dependency-free inline SVG. bar | line | pie. */
function outChartSvg(spec){
  try {
    if(!spec || typeof spec !== 'object' || Array.isArray(spec)) return null;
    var type = spec.type === 'line' || spec.type === 'pie' ? spec.type : 'bar';
    var labels = Array.isArray(spec.labels) ? spec.labels : [];
    var series = Array.isArray(spec.series) ? spec.series : [];
    if(!labels.length || !series.length) return null;
    var W = 640, H = 320, padL = 52, padR = 16, padT = 14, padB = 42;
    var pw = W - padL - padR, ph = H - padT - padB;
    var flat = [];
    for(var i=0;i<series.length;i++){
      var d = Array.isArray(series[i].data) ? series[i].data : [];
      for(var j=0;j<d.length;j++){ var v = Number(d[j]); if(isFinite(v)) flat.push(v); }
    }
    if(!flat.length) return null;
    var title = spec.title || (type + ' chart');
    var s = '<svg class="out-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + outEsc(title) + '">';

    if(type === 'pie'){
      var vals = Array.isArray(series[0].data) ? series[0].data : [];
      var tot = 0;
      for(var t0=0;t0<vals.length;t0++){ var tv = Number(vals[t0]); if(isFinite(tv) && tv > 0) tot += tv; }
      if(tot <= 0) return null;
      var cx = padL + pw/2, cy = padT + ph/2, rad = Math.min(pw, ph)/2 - 8, ang = -Math.PI/2, drawn = 0;
      for(var t1=0;t1<vals.length && drawn<vals.length;t1++){
        var v1 = Number(vals[t1]);
        if(!isFinite(v1) || v1 <= 0) continue;
        var frac = v1/tot;
        var e2 = ang + frac*Math.PI*2;
        var x1 = cx + rad*Math.cos(ang), y1 = cy + rad*Math.sin(ang);
        var x2 = cx + rad*Math.cos(e2), y2 = cy + rad*Math.sin(e2);
        var large = (e2 - ang) > Math.PI ? 1 : 0;
        s += '<path class="out-bar" d="M' + x1.toFixed(2) + ' ' + y1.toFixed(2) + ' A' + rad + ' ' + rad + ' 0 ' + large + ' 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + ' Z" fill="' + outColor(t1) + '"><title>' + outEsc(String(labels[t1]) + ': ' + outNum(v1)) + '</title></path>';
        var mid = ang + (e2-ang)/2, lr = rad*0.66;
        s += '<text class="out-tick" text-anchor="middle" x="' + (cx + lr*Math.cos(mid)).toFixed(2) + '" y="' + (cy + lr*Math.sin(mid) + 3).toFixed(2) + '">' + outEsc(labels[t1]) + '</text>';
        ang = e2;
      }
      s += '</svg><div class="out-legend">';
      for(var t2=0;t2<vals.length;t2++){
        s += '<span><i style="background:' + outColor(t2) + '"></i>' + outEsc(labels[t2]) + ' &middot; ' + outNum(vals[t2]) + '</span>';
      }
      return s + '</div>';
    }

    var max = Math.max.apply(null, flat), min = Math.min.apply(null, flat);
    if(max === min) max = min + 1;
    if(min > 0) min = 0;
    var y = function(v){ return padT + ph - ((v - min) / (max - min)) * ph; };
    for(var g=0; g<=4; g++){
      var gv = min + (max-min)*(g/4), gy = Math.round(y(gv)) + 0.5;
      s += '<line class="out-grid" x1="' + padL + '" y1="' + gy + '" x2="' + (W-padR) + '" y2="' + gy + '"/>';
      s += '<text class="out-tick" text-anchor="end" x="' + (padL-8) + '" y="' + (gy+4) + '">' + outNum(gv) + '</text>';
    }
    s += '<line class="out-axis" x1="' + padL + '" y1="' + (padT+ph) + '" x2="' + (W-padR) + '" y2="' + (padT+ph) + '"/>';

    var step = Math.max(1, Math.ceil(labels.length / 12));
    if(type === 'line'){
      for(var li=0; li<series.length; li++){
        var ld = Array.isArray(series[li].data) ? series[li].data : [], pts = [];
        for(var lj=0; lj<ld.length; lj++){
          var lv = Number(ld[lj]); if(!isFinite(lv)) continue;
          var lx = labels.length > 1 ? padL + (pw*lj/(labels.length-1)) : padL + pw/2;
          pts.push(lx.toFixed(2) + ',' + y(lv).toFixed(2));
        }
        if(!pts.length) continue;
        s += '<polyline fill="none" stroke="' + outColor(li) + '" stroke-width="2" points="' + pts.join(' ') + '"/>';
        for(var lk=0; lk<pts.length; lk++){
          var pxy = pts[lk].split(',');
          s += '<circle cx="' + pxy[0] + '" cy="' + pxy[1] + '" r="3" fill="' + outColor(li) + '"><title>' + outEsc(String(series[li].name || 'series') + ' ' + labels[lk] + ': ' + outNum(ld[lk])) + '</title></circle>';
        }
      }
    } else {
      var gw = pw / labels.length, inner = Math.max(2, gw*0.72), bw = Math.max(2, inner/series.length);
      for(var bi=0; bi<series.length; bi++){
        var bd = Array.isArray(series[bi].data) ? series[bi].data : [];
        for(var bj=0; bj<labels.length; bj++){
          var bv = Number(bd[bj]); if(!isFinite(bv)) continue;
          var zero = y(0), top = Math.min(zero, y(bv));
          var bx = padL + gw*bj + (gw-inner)/2 + bi*bw;
          s += '<rect class="out-bar" x="' + bx.toFixed(2) + '" y="' + top.toFixed(2) + '" width="' + Math.max(1, bw-1).toFixed(2) + '" height="' + Math.max(1, Math.abs(zero - y(bv))).toFixed(2) + '" rx="2" fill="' + outColor(bi) + '"><title>' + outEsc(String(series[bi].name || 'series') + ' ' + labels[bj] + ': ' + outNum(bv)) + '</title></rect>';
        }
      }
    }
    for(var lx2=0; lx2<labels.length; lx2+=step){
      var tx = padL + (labels.length > 1 ? (pw*lx2/(labels.length-1)) : pw/2);
      s += '<text class="out-lbl" text-anchor="middle" x="' + tx.toFixed(2) + '" y="' + (padT+ph+16) + '">' + outEsc(labels[lx2]) + '</text>';
    }
    s += '</svg>';
    if(series.length > 1){
      s += '<div class="out-legend">';
      for(var sgi=0; sgi<series.length; sgi++){ s += '<span><i style="background:' + outColor(sgi) + '"></i>' + outEsc(series[sgi].name || ('series ' + (sgi+1))) + '</span>'; }
      s += '</div>';
    }
    return s;
  } catch(e){ return null; }
}

/* Exact provider hosts prevent lookalike URLs from becoming trusted players. */
function outVideoUrl(input){
  var safe = outSafeUrl(input);
  if(!safe) return '';
  try {
    var url = new URL(safe, window.location && window.location.href || 'http://localhost/');
    var host = url.hostname.toLowerCase().replace(/^www\./, ''), id = '', match;
    if(host === 'youtu.be') id = url.pathname.slice(1);
    else if(host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com'){
      if(url.pathname === '/watch') id = url.searchParams.get('v') || '';
      else { match = /^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname); if(match) id = match[1]; }
    } else if(host === 'vimeo.com' || host === 'player.vimeo.com'){
      match = /^\/(?:video\/)?(\d+)\/?$/.exec(url.pathname);
      return match ? 'https://player.vimeo.com/video/' + match[1] : '';
    } else return '';
    if(!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return '';
    var start = url.searchParams.get('start') || url.searchParams.get('t') || '';
    var time = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(start);
    var seconds = time && start ? Number(time[1] || 0)*3600 + Number(time[2] || 0)*60 + Number(time[3] || 0) : 0;
    return 'https://www.youtube-nocookie.com/embed/' + id + (seconds > 0 && seconds < 86400 ? '?start=' + seconds : '');
  } catch(e){ return ''; }
}
function outMediaKind(input){
  var spec = outSpec(input), url = outSafeUrl(spec.url || spec.src || spec.href), mime = String(spec.mime || '').toLowerCase();
  if(!url) return '';
  if(/^video\//.test(mime) || /\.(?:mp4|webm|ogv|mov|m4v)(?:[?#]|$)/i.test(url)) return 'video';
  if(/^audio\//.test(mime) || /\.(?:mp3|wav|ogg|oga|m4a|aac|flac|opus)(?:[?#]|$)/i.test(url)) return 'audio';
  return '';
}
function outUrlKind(input){
  var spec = outSpec(input), url = outSafeUrl(spec.url || spec.src || spec.href), mime = String(spec.mime || '').toLowerCase();
  if(!url) return '';
  if(outVideoUrl(url)) return 'video';
  var media = outMediaKind(spec);
  if(media) return media;
  if(/^image\//.test(mime) || /\.(?:png|jpe?g|gif|webp|svg|avif|bmp)(?:[?#]|$)/i.test(url)) return 'image';
  if(mime || /\.(?:pdf|docx?|xlsx?|pptx?|csv|tsv|txt|md|json|zip|tar|gz|7z)(?:[?#]|$)/i.test(url)) return 'file';
  return 'link';
}
function outAudioEmbed(input){
  var spec = outSpec(input), url = outSafeUrl(spec.url || spec.src || spec.href);
  if(!url) return null;
  return '<audio class="out-audio" src="' + outEsc(url) + '" aria-label="' + outEsc(spec.title || 'Audio') + '" controls preload="none">Your browser cannot play this audio.</audio>' + outSource(url, spec.caption);
}
/* YouTube / Vimeo / direct media -> playable embed. An unsupported provider
   keeps an openable source card instead of a frame that may refuse to load. */
function outVideoEmbed(input){
  var spec = outSpec(input), url = outSafeUrl(spec.url || spec.src || spec.href);
  if(!url) return null;
  var embed = outVideoUrl(url), kind = outMediaKind(spec), html;
  if(embed) html = '<iframe class="out-frame" src="' + outEsc(embed) + '" title="' + outEsc(spec.title || (embed.indexOf('youtube') >= 0 ? 'YouTube video' : 'Vimeo video')) + '" loading="lazy" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
  else if(kind === 'audio') return outAudioEmbed(spec);
  else if(kind === 'video'){
    var poster = outSafeUrl(spec.poster, 'image');
    html = '<video class="out-frame" src="' + outEsc(url) + '"' + (poster ? ' poster="' + outEsc(poster) + '"' : '') + ' aria-label="' + outEsc(spec.title || 'Video') + '" controls playsinline preload="metadata">Your browser cannot play this video.</video>';
  } else return outLinksHtml([{ url: url, title: spec.title || 'Open video', description: spec.caption || 'Watch this video at its source.' }]);
  return html + outSource(url, spec.caption);
}

function outImageHtml(input){
  var spec = outSpec(input), url = outSafeUrl(spec.url || spec.src || spec.href, 'image');
  if(!url) return null;
  var cap = spec.caption || '', alt = spec.alt || cap || spec.title || 'Image';
  return '<figure class="out-image"><a href="' + outEsc(url) + '" target="_blank" rel="noopener noreferrer" aria-label="Open image: ' + outEsc(alt) + '"><img src="' + outEsc(url) + '" alt="' + outEsc(alt) + '" loading="lazy" decoding="async"></a>'
    + (cap ? '<figcaption>' + outEsc(cap) + '</figcaption>' : '') + '</figure>';
}

/* Interactive mini-app / live prototype preview. Accepts a URL, a data:text/html
   URL, or raw HTML rendered through a sandboxed srcdoc so the page cannot
   reach agent UI state. */
function outPreviewFrame(input, opts){
  opts = opts || {};
  var spec = typeof input === 'object' ? outSpec(input) : null;
  var raw = String(spec ? spec.html || spec.url || spec.src || '' : input == null ? '' : input).trim();
  if(!raw) return null;
  var title = outEsc(spec && spec.title || opts.title || 'Interactive preview');
  var attrs = ' class="out-frame tall" title="' + title + '" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"';
  var safe = outSafeUrl(raw);
  if(safe) return '<iframe' + attrs + ' src="' + outEsc(safe) + '"></iframe>' + outSource(safe);
  if(/^data:text\/html(?:;charset=[^;,]+)?(?:;base64)?,/i.test(raw)){
    try {
      var comma = raw.indexOf(','), header = raw.slice(0, comma);
      raw = /;base64$/i.test(header) ? decodeURIComponent(Array.prototype.map.call(atob(raw.slice(comma+1)), function(c){ return '%' + ('0' + c.charCodeAt(0).toString(16)).slice(-2); }).join('')) : decodeURIComponent(raw.slice(comma+1));
    } catch(e){ return null; }
  } else if(!/^\s*</.test(raw)) return null;
  return '<iframe' + attrs + ' srcdoc="' + outEsc(raw) + '"></iframe>';
}

function outDocKind(mime, name){
  var m = String(mime || '').toLowerCase(), n = String(name || '').toLowerCase();
  if(m.indexOf('pdf') >= 0 || /\.pdf$/.test(n)) return { t:'PDF', c:'#c9607f' };
  if(m.indexOf('sheet') >= 0 || /\.xlsx?$/.test(n)) return { t:'XLS', c:'#3fb984' };
  if(m.indexOf('word') >= 0 || /\.docx?$/.test(n)) return { t:'DOC', c:'#4aa3c7' };
  if(m.indexOf('zip') >= 0 || /\.(zip|tar|gz|7z)$/.test(n)) return { t:'ZIP', c:'#e0a34a' };
  if(m.indexOf('image') >= 0 || /\.(png|jpe?g|gif|webp|svg|avif)$/.test(n)) return { t:'IMG', c:'#8b6ae0' };
  if(m.indexOf('video') >= 0 || /\.(mp4|webm|ogv|mov|m4v)$/.test(n)) return { t:'VID', c:'#8b6ae0' };
  if(m.indexOf('audio') >= 0 || /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/.test(n)) return { t:'AUD', c:'#e0a34a' };
  if(m.indexOf('presentation') >= 0 || /\.pptx?$/.test(n)) return { t:'PPT', c:'#d1663f' };
  if(m.indexOf('json') >= 0 || /\.json$/.test(n)) return { t:'JSON', c:'#9aa4b8' };
  if(m.indexOf('markdown') >= 0 || /\.md$/.test(n)) return { t:'MD', c:'#6a8cff' };
  if(m.indexOf('text') >= 0) return { t:'TXT', c:'#6a8cff' };
  return { t:'FILE', c:'#4a5163' };
}

function outDocsHtml(list){
  list = outList(list);
  if(!list.length) return null;
  var h = '';
  for(var i=0;i<list.length;i++){
    var d = outSpec(list[i]);
    var url = outSafeUrl(d.url || d.path || d.href);
    if(!url) continue;
    var basename = String(url).split(/[?#]/)[0].split('/').pop();
    try { basename = decodeURIComponent(basename); } catch(e){}
    var name = d.name || d.filename || d.title || basename || ('file-' + (i+1));
    var k = outDocKind(d.mime || d.type, name);
    var size = d.size;
    if(typeof size === 'number' && isFinite(size) && size >= 0){
      var unit = size >= 1048576 ? 'MB' : size >= 1024 ? 'KB' : 'B';
      size = outNum(size / (unit === 'MB' ? 1048576 : unit === 'KB' ? 1024 : 1)) + ' ' + unit;
    }
    h += '<a class="out-doc" href="' + outEsc(url) + '" download="' + outEsc(name) + '" target="_blank" rel="noopener noreferrer">'
      + '<span class="out-ic" style="background:' + k.c + '">' + k.t + '</span>'
      + '<span><span class="out-n" title="' + outEsc(name) + '">' + outEsc(name) + '</span>'
      + '<span class="out-m">' + outEsc(d.mime || k.t.toLowerCase()) + (size != null && size !== '' ? ' &middot; ' + outEsc(size) : '') + '</span></span></a>';
  }
  return h ? '<div class="out-docs">' + h + '</div>' : null;
}

function outGalleryHtml(list){
  list = outList(list);
  if(!list.length) return null;
  var h = '';
  for(var i=0;i<list.length;i++){
    var g = outSpec(list[i]);
    var url = outSafeUrl(g.url || g.src, 'image');
    if(!url) continue;
    var cap = g.caption || g.alt || ('image ' + (i+1));
    h += '<figure><a href="' + outEsc(url) + '" target="_blank" rel="noopener noreferrer" aria-label="Open image: ' + outEsc(cap) + '"><img src="' + outEsc(url) + '" alt="' + outEsc(cap) + '" loading="lazy" decoding="async"></a>' + (g.caption ? '<figcaption>' + outEsc(g.caption) + '</figcaption>' : '') + '</figure>';
  }
  return h ? '<div class="out-gal">' + h + '</div>' : null;
}

function outFaviconHtml(input){
  var safe = outSafeUrl(input), fallback = '<span class="out-link-icon" aria-hidden="true">&#8599;</span>';
  if(!safe) return fallback;
  try {
    var base = window.location && window.location.href || 'http://localhost/', url = new URL(safe, base);
    if(url.origin === new URL(base).origin) return fallback;
    return '<span class="out-link-icon" aria-hidden="true"><img src="' + outEsc(url.origin + '/favicon.ico') + '" alt="" loading="lazy" referrerpolicy="no-referrer" data-out-favicon="1"><span hidden>&#8599;</span></span>';
  } catch(e){ return fallback; }
}
function outLinksHtml(list){
  list = outList(list);
  var html = '';
  for(var i=0;i<list.length;i++){
    var spec = outSpec(list[i]), url = outSafeUrl(spec.url || spec.href || spec.src);
    if(!url) continue;
    var label = spec.title || spec.name || url, host = '';
    try { host = new URL(url, window.location && window.location.href || 'http://localhost/').hostname; } catch(e){}
    html += '<a class="out-link" href="' + outEsc(url) + '" target="_blank" rel="noopener noreferrer"><span class="out-link-heading">' + outFaviconHtml(url) + '<strong>' + outEsc(label) + ' &#8599;</strong></span>'
      + (spec.description || spec.caption ? '<small>' + outEsc(spec.description || spec.caption) + '</small>' : '')
      + (host ? '<small>' + outEsc(host) + '</small>' : '') + '</a>';
  }
  return html ? '<div class="out-links">' + html + '</div>' : null;
}

function outMapHtml(spec){
  if(typeof spec === 'string') spec = outSafeUrl(spec) ? { url: spec } : { q: spec };
  if(!spec || typeof spec !== 'object' || Array.isArray(spec)) return null;
  var source = outSafeUrl(spec.url || spec.href), title = spec.title || 'Map', q = spec.q || spec.query || spec.place;
  var latValue = spec.lat != null ? spec.lat : spec.latitude, lonValue = spec.lon != null ? spec.lon : spec.lng != null ? spec.lng : spec.longitude;
  var lat = latValue == null || String(latValue).trim() === '' ? NaN : Number(latValue), lon = lonValue == null || String(lonValue).trim() === '' ? NaN : Number(lonValue), z = Number(spec.zoom) || 13;
  var embedded = '', parsed;
  if(source){
    try {
      parsed = new URL(source, window.location && window.location.href || 'http://localhost/');
      var host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      var osm = host === 'openstreetmap.org', google = host === 'google.com' && /^\/maps(?:\/|$)/.test(parsed.pathname) || host === 'maps.google.com';
      if(osm || google){
        if(osm && parsed.pathname === '/export/embed.html' || google && (parsed.pathname.indexOf('/maps/embed') === 0 || parsed.searchParams.get('output') === 'embed')) embedded = parsed.href;
        var query = parsed.searchParams.get('q') || parsed.searchParams.get('query') || parsed.searchParams.get('ll') || '';
        var pair = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(query);
        var path = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+)z)?/.exec(parsed.pathname);
        var hash = /#map=(\d+)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/.exec(parsed.hash);
        if(pair || path){ var coords = pair || path; lat = Number(coords[1]); lon = Number(coords[2]); if(path && path[3]) z = Number(path[3]); }
        else if(hash){ z = Number(hash[1]); lat = Number(hash[2]); lon = Number(hash[3]); }
        else if(osm && parsed.searchParams.has('mlat') && parsed.searchParams.has('mlon')){ lat = Number(parsed.searchParams.get('mlat')); lon = Number(parsed.searchParams.get('mlon')); }
        if(!q && query && !pair) q = query;
      }
    } catch(e){}
  }
  if(!embedded && isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 85 && Math.abs(lon) <= 180){
    z = Math.max(1, Math.min(19, z));
    var span = 180 / Math.pow(2, z), clamp = function(n, max){ return Math.max(-max, Math.min(max, n)); };
    var bb = [clamp(lon-span,180), clamp(lat-span*0.6,85), clamp(lon+span,180), clamp(lat+span*0.6,85)].map(function(n){ return n.toFixed(5); }).join(',');
    embedded = 'https://www.openstreetmap.org/export/embed.html?bbox=' + encodeURIComponent(bb) + '&layer=mapnik&marker=' + encodeURIComponent(lat + ',' + lon);
    if(!source) source = 'https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lon + '#map=' + z + '/' + lat + '/' + lon;
  }
  if(!embedded && q){
    embedded = 'https://maps.google.com/maps?q=' + encodeURIComponent(String(q)) + '&output=embed';
    if(!source) source = 'https://www.openstreetmap.org/search?query=' + encodeURIComponent(String(q));
  }
  var image = spec.image || spec.imageUrl || spec.image_url;
  var imageHtml = image ? outImageHtml({ url: typeof image === 'object' ? image.url || image.src : image, alt: title, caption: spec.caption }) : '';
  if(embedded) return '<iframe class="out-frame tall" title="' + outEsc(title) + '" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups" src="' + outEsc(embedded) + '"></iframe>' + (imageHtml || '') + outSource(source, imageHtml ? '' : spec.caption);
  if(imageHtml) return imageHtml + outSource(source);
  return source ? outLinksHtml([{ url: source, title: title, description: spec.caption || 'Open this map at its source.' }]) : null;
}

/* Card chrome shared by every viewer. */
function outCard(kind, title, body){
  return '<div class="out-card' + (kind === 'image' ? ' out-media-image' : '') + '" data-out-card="1">'
    + '<div class="out-head"><span class="out-kind">' + outEsc(kind) + '</span>'
    + (title ? '<span class="out-title">' + outEsc(title) + '</span>' : '')
    + '<span class="out-sp"></span>'
    + '<button type="button" class="out-btn" data-out-open="1" aria-label="' + outEsc('Expand ' + kind + (title ? ': ' + title : '')) + '">Expand</button>'
    + '</div><div class="out-body">' + body + '</div></div>';
}

/* Build one output block. Returns null for unknown or unusable blocks so the
   caller can fall back to the original fenced text. */
function outBlockHtml(kind, payload){
  var text = String(payload == null ? '' : payload).trim();
  if(!text) return null;
  var data = outJson(text), input = data == null ? text : data;
  var title = data && typeof data === 'object' && !Array.isArray(data) ? data.title || data.name : null;
  if(kind === 'chart'){
    var spec = outJson(text);
    var body = spec ? outChartSvg(spec) : null;
    if(!body) body = outTableHtml(text);
    if(!body) return null;
    return outCard('chart', spec && spec.title, '<div class="out-chart">' + body + '</div>');
  }
  if(kind === 'table' || kind === 'sortable'){
    var t = outTableHtml(text);
    return t ? outCard('table', null, t) : null;
  }
  if(kind === 'preview' || kind === 'app' || kind === 'html'){
    var p = outPreviewFrame(input, { title: kind === 'app' ? 'Mini-app preview' : 'Preview' });
    return p ? outCard(kind, title, p) : null;
  }
  if(kind === 'video'){
    var v = outVideoEmbed(input);
    return v ? outCard('video', title, v) : null;
  }
  if(kind === 'audio'){
    var audio = outAudioEmbed(input);
    return audio ? outCard('audio', title, audio) : null;
  }
  if(kind === 'image' || kind === 'map-image' || kind === 'map_image'){
    var image = outImageHtml(input);
    return image ? outCard(kind === 'image' ? 'image' : 'map', title, image) : null;
  }
  if(kind === 'docs' || kind === 'files' || kind === 'file'){
    var d = outDocsHtml(input);
    return d ? outCard('documents', title, d) : null;
  }
  if(kind === 'links' || kind === 'link'){
    var links = outLinksHtml(input);
    return links ? outCard('links', title, links) : null;
  }
  if(kind === 'gallery' || kind === 'images'){
    var gal = outGalleryHtml(input);
    return gal ? outCard('gallery', title, gal) : null;
  }
  if(kind === 'map'){
    var m = outMapHtml(input);
    return m ? outCard('map', title, m) : null;
  }
  if(kind === 'json'){
    var j = outJson(text);
    if(!j) return null;
    return outCard('json', null, '<pre class="out-pre">' + outEsc(JSON.stringify(j, null, 2)) + '</pre>');
  }
  return null;
}
/* Object-friendly entry point for widgets and ordinary chat attachments. */
function outRenderBlock(kind, payload){
  try { return outBlockHtml(String(kind || '').toLowerCase(), typeof payload === 'string' ? payload : JSON.stringify(payload)); }
  catch(e){ return null; }
}

/* Rewrite output fences into viewer cards. Everything else is returned
   byte-for-byte so the normal markdown and code pipeline still owns it. */
function outRenderBlocks(text){
  var src = String(text == null ? '' : text);
  if(!/output/i.test(src)) return src;
  return src.replace(/^([ \t]*)\x60\x60\x60output(?:[ \t]+([a-z][a-z0-9_-]*))?[^\n]*\n([\s\S]*?)^[ \t]*\x60\x60\x60[ \t]*$/gim,
    function(m, indent, kind, payload){
      var html = outBlockHtml(String(kind || 'chart').toLowerCase(), payload);
      return html ? '\n\n' + html + '\n\n' : m;
    });
}

/* Full-screen workspace panel for a card: the "larger output" surface. */
function outOpenPanel(card){
  if(!card) return;
  var ov = document.getElementById('out-overlay');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'out-overlay';
    ov.className = 'out-ov';
    ov.hidden = true;
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'Output viewer');
    ov.innerHTML = '<div class="out-ov-panel"><div class="out-ov-head">'
      + '<span class="out-title"></span><span class="out-sp"></span>'
      + '<button type="button" class="out-btn" data-out-dl="1">Download HTML</button>'
      + '<button type="button" class="out-btn" data-out-close="1">Close</button>'
      + '</div><div class="out-ov-body"></div></div>';
    document.body.appendChild(ov);
  }
  var title = card.querySelector('.out-title');
  var head = ov.querySelector('.out-title');
  if(head) head.textContent = title && title.textContent ? title.textContent : (card.querySelector('.out-kind') || {}).textContent || 'Output';
  var body = ov.querySelector('.out-ov-body');
  var clone = card.cloneNode(true);
  var cardHead = clone.querySelector('.out-head');
  if(cardHead) cardHead.remove();
  while(body.firstChild){ body.removeChild(body.firstChild); }
  body.appendChild(clone);
  ov._outCard = card;
  ov.hidden = false;
  var close = ov.querySelector('[data-out-close]');
  if(close) close.focus();
}
function outClosePanel(){
  var ov = document.getElementById('out-overlay');
  if(!ov) return;
  ov.hidden = true;
  var b = ov.querySelector('.out-ov-body');
  while(b && b.firstChild){ b.removeChild(b.firstChild); }
}
function outDownloadPanel(){
  var ov = document.getElementById('out-overlay');
  if(!ov || !ov._outCard) return;
  var body = ov.querySelector('.out-ov-body');
  var title = (ov.querySelector('.out-title') || {}).textContent || 'output';
  var css = Array.prototype.slice.call(document.querySelectorAll('style')).map(function(s){ return s.textContent || ''; }).join('\n');
  var html = '<!doctype html><meta charset="utf-8"><title>' + outEsc(title) + '</title>'
    + '<style>body{font:14px system-ui;padding:16px;background:#0e1015;color:#e6e9ef}' + css + '</style>'
    + (body ? body.innerHTML : '');
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  a.download = (title || 'output').replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '.html';
  document.body.appendChild(a);
  a.click();
  a.remove();
  if(typeof toast === 'function') toast('Downloaded ' + a.download);
}

/* Delegated wiring: one pair of listeners covers every card, including cards
   appended later by streaming. */
document.addEventListener('error', function(ev){
  var img = ev.target;
  if(!img || !img.getAttribute || img.getAttribute('data-out-favicon') !== '1') return;
  img.hidden = true;
  if(img.nextElementSibling) img.nextElementSibling.hidden = false;
}, true);
document.addEventListener('click', function(ev){
  var t = ev.target;
  if(!t) return;
  if(t.closest){
    var sortBtn = t.closest('.out-sort');
    if(sortBtn){ outSortTable(sortBtn); return; }
    var openBtn = t.closest('[data-out-open]');
    if(openBtn){ outOpenPanel(openBtn.closest('.out-card')); return; }
    if(t.closest('[data-out-close]')){ outClosePanel(); return; }
    if(t.closest('[data-out-dl]')){ outDownloadPanel(); return; }
    var zoom = t.closest('[data-out-zoom]');
    if(zoom && zoom.tagName === 'IMG'){ window.open(zoom.getAttribute('src'), '_blank', 'noopener'); return; }
  }
  if(t.id === 'out-overlay'){ outClosePanel(); }
});
document.addEventListener('keydown', function(ev){
  if(ev.key !== 'Escape') return;
  var ov = document.getElementById('out-overlay');
  if(ov && !ov.hidden) outClosePanel();
});
`;
