export const COWORK_CARD_REMOVAL_CSS = String.raw`
.cw-request-row{touch-action:pan-y}.cw-request-row>.cw-bubble{position:relative}.cw-card-remove{position:absolute;right:5px;top:3px;width:36px;height:36px;border:0;border-radius:50%;background:transparent;color:var(--muted);font:22px system-ui;cursor:pointer;touch-action:manipulation}.cw-card-remove:hover,.cw-card-remove:focus-visible{background:var(--hover);color:var(--err)}.cw-request-row .cw-meta{padding-right:36px}.cw-request-row[data-removing=true]{opacity:.5;pointer-events:none}@media(pointer:coarse){.cw-card-remove{width:44px;height:44px;top:0}.cw-request-row .cw-meta{padding-right:44px}}
`;

export const COWORK_CARD_REMOVAL_JS = String.raw`
  function cwBindCardRemoval(root){
    root.querySelectorAll('[data-cwrequest-row]').forEach(function(row){
      if(!row.dataset)row.dataset={};
      if(!row.style)row.style={};
      if(row.dataset.cardRemovalBound)return;row.dataset.cardRemovalBound='true';
      var id=row.getAttribute('data-cwrequest-row'),bubble=row.querySelector('.cw-bubble');if(!bubble)return;
      var button=document.createElement('button');button.type='button';button.className='cw-card-remove';button.textContent='×';button.title='Remove card';button.setAttribute('aria-label','Remove this card');bubble.appendChild(button);
      var gesture=null,removing=false;
      async function remove(){
        var cw=cwEnsure(),pending=cw.requestPending||(cw.requestPending={});if(removing||pending[id])return;
        removing=true;pending[id]=true;row.dataset.removing='true';var conversation=cw.active;
        try{
          var data=await api('/api/cowork/requests/'+encodeURIComponent(id),{method:'DELETE'});
          if(cw.reviewDrafts)delete cw.reviewDrafts[id];
          if(cw.active===conversation){cw.requests=(cw.requests||[]).map(function(request){return request.id===id?data.request:request;});cwRenderMsgs();cwRenderInfo();cwPoll();}
        }catch(error){toast(error.message||'Could not remove this card',true);}
        finally{removing=false;delete pending[id];row.dataset.removing='false';row.style.transform='';row.style.opacity='';}
      }
      button.onclick=remove;
      row.addEventListener('pointerdown',function(event){
        if(!event.isPrimary){gesture=null;row.style.transform='';row.style.opacity='';return;}
        if(removing||!['touch','pen'].includes(event.pointerType)||event.target.closest('button,input,textarea,select,a,pre,code,[contenteditable=true],[data-no-card-swipe]'))return;
        gesture={id:event.pointerId,x:event.clientX,y:event.clientY,active:false};
      });
      row.addEventListener('pointermove',function(event){
        if(!gesture||gesture.id!==event.pointerId)return;
        var dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
        if(!gesture.active&&Math.abs(dy)>12){gesture=null;return;}
        if(dx<-12&&Math.abs(dx)>Math.abs(dy)*1.5){gesture.active=true;row.setPointerCapture(event.pointerId);if(event.cancelable)event.preventDefault();row.style.transform='translateX('+Math.max(-130,dx)+'px)';row.style.opacity=String(Math.max(.35,1+dx/200));}
      });
      function end(event){
        if(!gesture||gesture.id!==event.pointerId)return;
        var dx=event.clientX-gesture.x,dy=event.clientY-gesture.y,swipe=event.type==='pointerup'&&gesture.active&&dx<-90&&Math.abs(dx)>Math.abs(dy)*1.5;gesture=null;row.style.transform='';row.style.opacity='';if(row.hasPointerCapture?.(event.pointerId))row.releasePointerCapture(event.pointerId);if(swipe)remove();
      }
      row.addEventListener('pointerup',end);row.addEventListener('pointercancel',end);
    });
  }
`;
