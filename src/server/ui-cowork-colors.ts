export const COWORK_COLORS_CSS = String.raw`
  .cw-chat[data-character-color] { background:color-mix(in srgb,var(--character-color) 4%,var(--bg)); }
  .cw-info[data-character-color] { background:color-mix(in srgb,var(--character-color) 2%,var(--bg)); }
  .cw-chat[data-character-color] .cw-bubble a { color:var(--accent); }
  .cw-character-color { display:flex; align-items:center; flex-wrap:wrap; gap:10px; margin-top:14px; }
  .cw-character-color label { margin:0; letter-spacing:0; text-transform:none; color:var(--muted); font-size:12px; }
  .cw-character-color input[type=color] { width:32px; height:32px; padding:2px; border-radius:50%; cursor:pointer; }
  .cw-character-color .cw-colors { margin:0; gap:8px; }
  .cw-character-color .cw-colors button { width:24px; height:24px; padding:0; border:2px solid var(--card); box-shadow:0 0 0 1px var(--border); }
  .cw-character-color .cw-colors button[aria-pressed=true] { box-shadow:0 0 0 2px var(--accent); }
`;

export const COWORK_COLORS_JS = String.raw`
  var CW_CHARACTER_PALETTE=[['Blue','#5ba8ff'],['Mint','#3fd68f'],['Orange','#f39b52'],['Purple','#8f80ff'],['Rose','#e66ca9'],['Teal','#29b7ad']];
  function cwCharacterColor(avatar) {
    var shape=cwAvatarShape(avatar&&avatar.shape,avatar&&avatar.color),color=avatar&&avatar.color;
    return /^#[0-9a-f]{6}$/i.test(color||'')?color.toLowerCase():CW_DOT_COLORS[shape];
  }
  function cwColorRgb(color){return [1,3,5].map(function(index){return parseInt(color.slice(index,index+2),16);});}
  function cwColorHue(color){var rgb=cwColorRgb(color).map(function(channel){return channel/255;}),max=Math.max.apply(Math,rgb),min=Math.min.apply(Math,rgb),delta=max-min;if(!delta)return 0;var hue=max===rgb[0]?(rgb[1]-rgb[2])/delta:max===rgb[1]?(rgb[2]-rgb[0])/delta+2:(rgb[0]-rgb[1])/delta+4;return (hue*60+360)%360;}
  function cwCharacterFilter(avatar,shape){var color=cwCharacterColor(avatar),base=CW_DOT_COLORS[shape];if(color===base)return '';var rgb=cwColorRgb(color),source=cwColorRgb(base),high=Math.max.apply(Math,rgb),low=Math.min.apply(Math,rgb),sourceHigh=Math.max.apply(Math,source),sourceLow=Math.min.apply(Math,source),saturation=high?(high-low)/high:0,sourceSaturation=(sourceHigh-sourceLow)/sourceHigh;return 'hue-rotate('+Math.round(cwColorHue(color)-cwColorHue(base))+'deg) saturate('+Math.min(2,saturation/sourceSaturation).toFixed(2)+') brightness('+Math.max(.25,Math.min(1.8,high/sourceHigh)).toFixed(2)+')';}
  function cwColorLuminance(rgb){return rgb.map(function(channel){var n=channel/255;return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4);}).reduce(function(sum,n,index){return sum+n*[.2126,.7152,.0722][index];},0);}
  function cwReadableAccent(color,light){var rgb=cwColorRgb(color),background=cwColorLuminance(light?[250,250,249]:[17,17,17]),target=light?0:255;for(var i=0;i<25;i++){var luminance=cwColorLuminance(rgb),contrast=(Math.max(luminance,background)+.05)/(Math.min(luminance,background)+.05);if(contrast>=4.5)break;rgb=rgb.map(function(channel){return Math.round(channel*.88+target*.12);});}return '#'+rgb.map(function(channel){return channel.toString(16).padStart(2,'0');}).join('');}
  function cwApplyCharacterTheme() {
    var chat=$('cwChat'),panel=$('cwInfoPanel');if(!chat&&!panel)return;
    var conv=cwActiveConv(),agent=conv&&conv.kind==='dm'?cwConvMembers(conv)[0]:null,light=document.documentElement&&document.documentElement.getAttribute('data-theme')==='light';
    [chat,panel].forEach(function(node){if(!node)return;if(!agent){node.removeAttribute('data-character-color');['--character-color','--accent','--selected'].forEach(function(key){node.style.removeProperty(key);});return;}var color=cwCharacterColor(agent.avatar);node.setAttribute('data-character-color',color);node.style.setProperty('--character-color',color);node.style.setProperty('--accent',cwReadableAccent(color,light));node.style.setProperty('--selected','color-mix(in srgb,'+color+' 12%,var(--card))');});
  }
`;
