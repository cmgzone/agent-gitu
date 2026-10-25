import type {ConnectionAuth} from './connections.js';

/** Resolve documented API prefixes before storing origin + exact route. */
export function connectionSetupAddress(address:string,route:string):{baseUrl:string;validationPath:string} {
  const url=new URL(address);
  if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('Use an HTTPS API address without credentials or query parameters.');
  const prefix=url.pathname.replace(/\/$/,'');
  if(!route.startsWith('/')||route.startsWith('//')||/[?#\r\n]/.test(route))throw Error('Use a documented authenticated GET route.');
  const path=prefix&&route!==prefix&&!route.startsWith(prefix+'/')?prefix+route:route;
  if(/[:{}]|(?:^|\/)\.\.(?:\/|$)/.test(path))throw Error('Use a complete static API route without unresolved parameters.');
  return {baseUrl:url.origin,validationPath:path};
}

/** Check actual documentation, including its full request URL, before a key card. */
export function documentedConnectionSetup(address:string,route:string,documentation:string,auth?:ConnectionAuth):{baseUrl:string;validationPath:string} {
  const setup=connectionSetupAddress(address,route),origin=setup.baseUrl;
  const documented=new Set<string>();
  for(const value of documentation.match(/https?:\/\/[^\s"'<>`\\]+/g)??[]){
    try{
      const url=new URL(value.replace(/[),;]+$/,''));
      if(url.origin===origin&&!url.username&&!url.password&&(url.pathname===setup.validationPath||url.pathname.endsWith(setup.validationPath))&&!/[:{}]/.test(url.pathname))documented.add(url.pathname);
    }catch{/* Ignore prose that is not a complete URL. */}
  }
  if(documented.has(setup.validationPath)){documented.clear();documented.add(setup.validationPath);}
  if(documented.size>1)throw Error('The documentation contains multiple matching API routes. Research the exact complete test URL before requesting a key.');
  if(documented.size===1)setup.validationPath=[...documented][0]!;
  else{
    // Relative routes are useful only when the documentation also establishes
    // the API address/prefix. A substring of a longer route is not evidence.
    const escaped=route.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const routeMentioned=new RegExp('(^|[\\s"\'`=])'+escaped+'(?=[\\s"\'`,;]|$)').test(documentation);
    if(!documentation.includes(address.replace(/\/$/,''))||!routeMentioned)throw Error('The fetched documentation does not establish this complete API test URL. Read the API base URL and authenticated endpoint, then correct the same request.');
  }
  const schemes=auth?.type==='headers'?auth.fields.map(f=>f.header!):auth?.type==='basic'?['Basic']:auth?.type==='oauth2'?['OAuth',auth.tokenUrl??auth.tokenPath!]:[auth?.type==='header'?auth.header:'Bearer'];
  if(schemes.some(scheme=>!documentation.toLowerCase().includes(scheme.toLowerCase())))throw Error('The fetched documentation does not confirm the selected authentication header/scheme. Research authentication before requesting the credential fields.');
  if(auth?.type==='oauth2'&&auth.tokenUrl){
    const urls=(documentation.match(/https?:\/\/[^\s"'<>`\\]+/g)??[]).map(value=>{try{return new URL(value.replace(/[),;]+$/,'')).href;}catch{return '';}});
    if(!urls.includes(auth.tokenUrl))throw Error('The documentation must establish the exact OAuth token URL before credentials can be sent to that authentication service.');
  }
  return setup;
}
