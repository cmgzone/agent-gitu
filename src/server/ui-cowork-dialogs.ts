/** Keyboard and focus behavior for Cowork form dialogs. */
export const COWORK_DIALOGS_JS = String.raw`
  function cwBindDialog(modal, initialSelector) {
    var opener=document.activeElement,closed=false,focusTimer=null;
    function controls() {
      return Array.from(modal.querySelectorAll('button,input,textarea,select,a[href],[tabindex]')).filter(function(control){
        if(control.disabled||control.hidden||control.type==='hidden'||typeof control.tabIndex==='number'&&control.tabIndex<0)return false;
        if(control.matches&&control.matches(':disabled'))return false;
        if(control.closest&&control.closest('[hidden],[inert],[aria-hidden="true"]'))return false;
        if(control.getClientRects&&!control.getClientRects().length)return false;
        return typeof getComputedStyle!=='function'||getComputedStyle(control).visibility!=='hidden';
      });
    }
    function close() {
      if(closed)return;
      closed=true;
      if(focusTimer!==null&&typeof clearTimeout==='function')clearTimeout(focusTimer);
      modal.onkeydown=null;modal.remove();
      var target=opener&&opener.isConnected?opener:$('cwInput');
      if(target&&target.isConnected!==false&&target.focus)target.focus({preventScroll:true});
    }
    modal.onkeydown=function(event){
      if(closed)return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
      if(event.key!=='Tab')return;
      var items=controls(),first=items[0],last=items[items.length-1];
      if(!first){event.preventDefault();return;}
      if(items.indexOf(document.activeElement)<0){event.preventDefault();(event.shiftKey?last:first).focus();}
      else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    function focusInitial() {
      if(closed||modal.isConnected===false)return;
      var items=controls(),initial=initialSelector&&modal.querySelector(initialSelector);
      var target=items.indexOf(initial)>=0?initial:items[0];
      if(target&&target.focus)target.focus({preventScroll:true});
    }
    if(typeof setTimeout==='function')focusTimer=setTimeout(focusInitial,0);else focusInitial();
    return close;
  }
`;
