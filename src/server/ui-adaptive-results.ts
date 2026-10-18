/** A composable, agent-directed visual vocabulary shared by every chat. */
export const ADAPTIVE_RESULT_CSS = String.raw`
:root{--out-blue:#a8caff;--out-teal:#8dd6cd;--out-green:#a3d2af;--out-amber:#ead092;--out-rose:#f0a8ba;--out-violet:#c8b7f2}
:root[data-theme=light]{--out-blue:#285da8;--out-teal:#1d6b65;--out-green:#316747;--out-amber:#7b5c16;--out-rose:#a1405f;--out-violet:#6747a0}
[data-out-tone=blue]{--out-tone:var(--out-blue);--out-wash:var(--out-blue)}
[data-out-tone=teal]{--out-tone:var(--out-teal);--out-wash:var(--out-teal)}
[data-out-tone=green]{--out-tone:var(--out-green);--out-wash:var(--out-green)}
[data-out-tone=amber]{--out-tone:var(--out-amber);--out-wash:var(--out-amber)}
[data-out-tone=rose]{--out-tone:var(--out-rose);--out-wash:var(--out-rose)}
[data-out-tone=violet]{--out-tone:var(--out-violet);--out-wash:var(--out-violet)}
[data-out-tone=neutral]{--out-tone:var(--text);--out-wash:var(--muted)}
.out-card[data-out-tone]{background:color-mix(in srgb,var(--out-wash) 14%,color-mix(in srgb,var(--card) 80%,transparent))}
:root[data-theme=light] .out-card[data-out-tone]{background:color-mix(in srgb,var(--out-wash) 13%,rgba(245,250,255,.86))}
.out-card[data-out-density=compact]{--out-gap:10px}.out-card[data-out-density=comfortable]{--out-gap:20px}
.out-card[data-out-kind=ui]{container-type:inline-size}
.out-card[data-out-heading=sans]>.out-head .out-title{font-family:var(--sans);font-size:18px;font-weight:500;letter-spacing:-.02em}
.out-card[data-out-width=wide]{width:100%}.cw .cw-row:not(.me):not(.cw-request-row):has(.out-card[data-out-width=wide]){max-width:min(100%,620px)}
.out-composition{display:grid;gap:var(--out-gap,16px);min-width:0}
.out-composition[data-layout=columns],.out-composition[data-layout=comparison]{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:22px}
.out-composition[data-layout=comparison]>.out-block>.out-block-title{font-size:18px;font-family:Georgia,'Times New Roman',serif;font-weight:500}
.out-block{min-width:0;color:var(--text);overflow-wrap:anywhere}
.out-block[data-out-tone]{border:0;border-radius:16px;padding:12px;background:color-mix(in srgb,var(--out-wash) 7%,transparent)}
.out-block-title{margin:0 0 7px;font-size:12px;font-weight:600;line-height:1.5}
.out-block p{font-size:13px;line-height:1.65;white-space:pre-wrap;margin:0;overflow-wrap:anywhere}
.out-block small{font-size:10px;line-height:1.6;color:var(--muted)}
.out-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,100px),1fr));gap:16px;margin:0}
.out-metric{min-width:0}.out-metric dt{font-size:11px;line-height:1.5;color:var(--muted);margin:0 0 4px}
.out-metric dd{margin:0;font-size:clamp(23px,5vw,30px);line-height:1.2;font-weight:500;letter-spacing:-.04em;font-variant-numeric:tabular-nums;color:var(--text)}
.out-metric small{display:block;margin-top:5px;color:var(--out-tone,var(--muted))}
.out-visual-list{margin:0;padding:0;list-style:none;display:grid;gap:10px}
.out-visual-list li{min-width:0}.out-visual-list strong{font-size:13px;font-weight:500;line-height:1.6}
.out-visual-list .out-item-label{font-size:10px;line-height:1.4;color:var(--out-tone,var(--muted));display:inline-block;margin:0 0 3px}
.out-visual-list details{margin-top:4px}.out-visual-list summary{cursor:pointer;min-height:28px;color:var(--muted);font-size:11px;line-height:1.6;padding:4px 0}
.out-visual-list details p{font-size:12px;color:var(--muted)}
.out-flow{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.out-flow li{position:relative;display:grid;grid-template-columns:9px 1fr;gap:10px;padding:0 0 3px}
.out-flow-dot{width:5px;height:5px;border-radius:50%;background:var(--out-tone,var(--accent));margin-top:7px}
.out-flow li:not(:last-child)::after{content:'';position:absolute;width:1px;left:2px;top:17px;bottom:-5px;background:color-mix(in srgb,var(--out-tone,var(--accent)) 18%,transparent)}
.out-flow time{display:block;font-size:10px;color:var(--muted);margin-bottom:3px}.out-flow strong{font-size:13px;font-weight:500}
.out-flow p{color:var(--muted);font-size:12px;margin-top:3px}
.out-callout{display:flex;align-items:flex-start;gap:9px;padding:2px 0}
.out-callout-dot{width:6px;height:6px;flex:none;border-radius:50%;background:var(--out-tone,var(--accent));margin-top:7px}
.out-callout strong{display:block;font-size:12px;font-weight:600;margin-bottom:3px}
.out-quote{margin:0;padding:0}.out-quote blockquote{margin:0}.out-quote p{font-family:Georgia,'Times New Roman',serif;font-size:19px;line-height:1.55;letter-spacing:-.015em}.out-quote figcaption{font-size:11px;color:var(--muted);margin-top:8px}
.out-meter-label{display:flex;gap:10px;justify-content:space-between;font-size:11px;margin-bottom:8px}.out-meter-label span:last-child{color:var(--muted);font-variant-numeric:tabular-nums}
.out-actions{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin-top:14px}
.out-action{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;max-width:100%;border:0;border-radius:99px;padding:7px 12px;background:color-mix(in srgb,var(--out-tone,var(--accent)) 9%,transparent);color:var(--text);font:inherit;font-size:11px;line-height:1.5;text-decoration:none;cursor:pointer;overflow-wrap:anywhere;transition:background-color .16s ease}
.out-action:hover{background:color-mix(in srgb,var(--out-tone,var(--accent)) 16%,transparent)}
.out-action:focus-visible,.out-visual-list summary:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.out-actions-note{width:100%;margin:0;color:var(--muted);font-size:10px;line-height:1.5}
.out-block .out-progress{margin:0}.out-block .out-docs,.out-block .out-links{margin:0}
.out-adaptive-table{max-width:100%;overflow-x:auto}.out-adaptive-table table{width:100%;border-collapse:collapse;font-size:12px;text-align:left}.out-adaptive-table th{font-weight:600;color:var(--muted);font-size:10px}.out-adaptive-table th,.out-adaptive-table td{border:0;padding:6px 12px 6px 0;vertical-align:top;overflow-wrap:anywhere}
@media(max-width:520px){.out-composition[data-layout=columns],.out-composition[data-layout=comparison]{grid-template-columns:minmax(0,1fr)}.out-actions{gap:8px}.out-action{min-height:40px}}
@container(max-width:400px){.out-composition[data-layout=columns],.out-composition[data-layout=comparison]{grid-template-columns:minmax(0,1fr)}}
@media(prefers-reduced-motion:reduce){.out-action{transition:none}}
`;

export const ADAPTIVE_RESULT_JS = String.raw`
function outVisualAttrs(spec){
  spec=spec&&typeof spec==='object'&&!Array.isArray(spec)?spec:{};
  var tone=typeof spec.tone==='string'?spec.tone.toLowerCase():'',attrs='';
  if(['blue','teal','green','amber','rose','violet','neutral'].indexOf(tone)>=0)attrs+=' data-out-tone="'+tone+'" style="--out-tone:'+ (tone==='neutral'?'var(--text)':'var(--out-'+tone+')')+';--out-wash:'+(tone==='neutral'?'var(--muted)':'var(--out-'+tone+')')+'"';
  else if(/^#[a-f0-9]{6}$/.test(tone))attrs+=' data-out-tone="custom" style="--out-wash:'+tone+';--out-tone:var(--text)"';
  if(['compact','comfortable'].indexOf(spec.density)>=0)attrs+=' data-out-density="'+spec.density+'"';
  if(spec.width==='wide')attrs+=' data-out-width="wide"';
  if(spec.heading==='sans')attrs+=' data-out-heading="sans"';
  return attrs;
}
function outAdaptiveLayout(spec){
  if(['columns','comparison','stack'].indexOf(spec.layout)>=0)return spec.layout;
  return Array.isArray(spec.blocks)&&spec.blocks.length===2&&spec.blocks.every(function(b){return b&&b.type==='section';})?'columns':'stack';
}
function outAdaptivePresentation(spec){
  var result=Object.assign({},spec);
  if(!result.width&&(outAdaptiveLayout(spec)==='columns'||outAdaptiveLayout(spec)==='comparison'||spec.blocks.some(function(b){return b.type==='table'||b.type==='chart';})))result.width='wide';
  return result;
}
function outActionHtml(actions){
  if(!Array.isArray(actions))return '';
  var staged=false,html=actions.slice(0,6).map(function(action){
    if(!action||typeof action!=='object'||typeof action.label!=='string'||!action.label.trim())return '';
    var label=outEsc(action.label.slice(0,100));
    if(typeof action.prompt==='string'&&action.prompt.trim()&&action.prompt.length<=4000){staged=true;return '<button type="button" class="out-action" data-out-prompt="'+outEsc(action.prompt)+'" title="Prepare a message to your agent">'+label+' <span aria-hidden="true">&#8594;</span></button>';}
    var url=outSafeUrl(action.url);return url?'<a class="out-action" href="'+outEsc(url)+'" target="_blank" rel="noopener noreferrer">'+label+' <span aria-hidden="true">&#8599;</span></a>':'';
  }).join('');
  return html?'<div class="out-actions">'+html+(staged?'<p class="out-actions-note">Review the prepared message before sending.</p>':'')+'</div>':'';
}
function outStagePrompt(button){
  var prompt=button.getAttribute('data-out-prompt');if(!prompt||prompt.length>4000)return false;
  var source=button,overlay=button.closest('.out-ov');
  if(overlay)source=overlay._outCard;
  if(!source||!source.isConnected){if(typeof toast==='function')toast('Open the original chat to use this action.',true);return false;}
  var root=source.closest('.company-chat')||source.closest('#cw')||source.closest('.run-chat'),input=null;
  if(root)input=root.querySelector(root.classList.contains('company-chat')?'#companyChatText':root.id==='cw'?'#cwInput':'#follow');
  if(!input||input.disabled||input.readOnly){if(typeof toast==='function')toast('Open this result in its chat to prepare the request.',true);return false;}
  if(input.value.trim()!==prompt.trim()&&!input.value.endsWith('\n\n'+prompt))input.value=(input.value.trim()?input.value+'\n\n':'')+prompt;
  if(overlay&&typeof outClosePanel==='function')outClosePanel();
  input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();
  if(typeof toast==='function')toast('Request added to your message. Review and send.');
  return true;
}
function outAdaptiveBlocks(blocks,depth,budget){
  if(!Array.isArray(blocks)||depth>4||!blocks.length||blocks.length>30)return null;
  var html='';
  for(var i=0;i<blocks.length;i++){
    if(--budget.left<0)return null;
    var block=blocks[i];if(!block||typeof block!=='object'||Array.isArray(block)||typeof block.type!=='string')return null;
    var type=block.type,body='',text=outResultText(block.text),title=outResultText(block.title);
    if(type==='text'){if(!text)return null;body='<p>'+outEsc(text)+'</p>';}
    else if(type==='section'){body=outAdaptiveBlocks(block.blocks,depth+1,budget);if(!body)return null;body='<div class="out-composition" data-layout="'+outAdaptiveLayout(block)+'">'+body+'</div>';}
    else if(type==='metrics'){
      if(!Array.isArray(block.items)||!block.items.length||block.items.length>12)return null;
      for(var m=0;m<block.items.length;m++){var metric=block.items[m];if(!metric||!outResultText(metric.label)||!outResultText(metric.value))return null;
        body+='<div class="out-metric"'+outVisualAttrs(metric)+'><dt>'+outEsc(outResultText(metric.label))+'</dt><dd>'+outEsc(outResultText(metric.value))+'</dd>'+(metric.detail?'<small>'+outEsc(outResultText(metric.detail))+'</small>':'')+'</div>';}
      body='<dl class="out-metrics">'+body+'</dl>';
    }
    else if(type==='list'||type==='timeline'){
      if(!Array.isArray(block.items)||!block.items.length||block.items.length>100)return null;
      for(var n=0;n<block.items.length;n++){var item=block.items[n];if(typeof item==='string')item={text:item};if(!item||!outResultText(item.text))return null;
        var content=(item.label?'<span class="out-item-label">'+outEsc(outResultText(item.label))+'</span><br>':'')+'<strong>'+outEsc(outResultText(item.text))+'</strong>';
        if(type==='timeline')content=(item.time?'<time>'+outEsc(outResultText(item.time))+'</time>':'')+content;
        if(item.detail)content+='<details><summary>Read more</summary><p>'+outEsc(outResultText(item.detail))+'</p></details>';
        var link=outSafeUrl(item.url);if(link)content+='<a class="out-result-link" href="'+outEsc(link)+'" target="_blank" rel="noopener noreferrer">Open source &#8599;</a>';
        body+='<li'+outVisualAttrs(item)+'>'+(type==='timeline'?'<span class="out-flow-dot" aria-hidden="true"></span><div>'+content+'</div>':content)+'</li>';
      }
      body='<ol class="'+(type==='timeline'?'out-flow':'out-visual-list')+'">'+body+'</ol>';
    }
    else if(type==='progress'){
      if(typeof block.value!=='number'||!isFinite(block.value)||typeof block.max!=='number'||!isFinite(block.max)||block.max<=0||block.value<0||block.value>block.max)return null;
      var percent=block.value/block.max*100,label=outResultText(block.label)||'Progress';
      body='<div class="out-meter-label"><span>'+outEsc(label)+'</span><span>'+outEsc(block.value)+' / '+outEsc(block.max)+'</span></div><div class="out-progress" role="progressbar" aria-label="'+outEsc(label)+'" aria-valuemin="0" aria-valuemax="'+block.max+'" aria-valuenow="'+block.value+'"><span style="width:'+percent+'%"></span></div>';
    }
    else if(type==='callout'){
      if(!text)return null;body='<div class="out-callout"><span class="out-callout-dot" aria-hidden="true"></span><div>'+(title?'<strong>'+outEsc(title)+'</strong>':'')+'<p>'+outEsc(text)+'</p></div></div>';title='';
    }
    else if(type==='quote'){
      if(!text)return null;body='<figure class="out-quote"><blockquote><p>'+outEsc(text)+'</p></blockquote>'+(block.author?'<figcaption>'+outEsc(outResultText(block.author))+'</figcaption>':'')+'</figure>';
    }
    else if(type==='table'){
      if(!Array.isArray(block.columns)||!block.columns.length||block.columns.length>20||!Array.isArray(block.rows)||block.rows.length>100)return null;
      if(block.columns.some(function(c){return !outResultText(c);})||block.rows.some(function(row){return !Array.isArray(row)||row.length!==block.columns.length||row.some(function(cell){return typeof cell!=='string'&&typeof cell!=='number';});}))return null;
      body='<div class="out-adaptive-table"><table><thead><tr>'+block.columns.map(function(c){return '<th scope="col">'+outEsc(c)+'</th>';}).join('')+'</tr></thead><tbody>'+block.rows.map(function(row){return '<tr>'+row.map(function(cell){return '<td>'+outEsc(cell)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';
    }
    else if(type==='email')body=outEmailHtml(block);
    else if(type==='tasks')body=outTasksHtml(block);
    else if(type==='brief')body=outBriefHtml(block);
    else if(type==='image')body=outImageHtml(block);
    else if(type==='chart')body=outChartSvg(block);
    else if(type==='links')body=outLinksHtml(block.items);
    else if(type==='files')body=outDocsHtml(block.items);
    else return null;
    if(!body)return null;
    html+='<section class="out-block" data-out-block="'+outEsc(type)+'"'+outVisualAttrs(block)+'>'+(title?'<h4 class="out-block-title">'+outEsc(title)+'</h4>':'')+body+outActionHtml(block.actions)+'</section>';
  }
  return html;
}
function outAdaptiveHtml(data){
  if(!data||typeof data!=='object'||Array.isArray(data))return null;
  var html=outAdaptiveBlocks(data.blocks,0,{left:80});if(!html)return null;
  var layout=outAdaptiveLayout(data);
  return (data.summary?'<p class="out-lead">'+outEsc(outResultText(data.summary))+'</p>':'')+'<div class="out-composition" data-layout="'+layout+'">'+html+'</div>';
}
document.addEventListener('click',function(event){var button=event.target&&event.target.closest&&event.target.closest('[data-out-prompt]');if(button){event.preventDefault();outStagePrompt(button);}});
`;
