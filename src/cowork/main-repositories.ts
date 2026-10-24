import {realpathSync,statSync} from 'node:fs';import path from 'node:path';
import{ProjectGuard}from'../guard/project-guard.js';
/** The owner-selected main workspace and known, already-locked repositories only. */
export function mainRepositories(candidates:string[],selected:string[],excluded:string[]):{path:string;name:string}[]{
  const within=(root:string,file:string)=>{const relative=path.relative(root,file);return relative===''||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};
  const canonical=(value:string)=>{try{return realpathSync(value);}catch{return undefined;}};
  const explicit=new Set(selected.flatMap(value=>canonical(value)??[])),blocked=excluded.flatMap(value=>canonical(value)??[]),seen=new Set<string>();
  return candidates.flatMap(candidate=>{
    const root=canonical(candidate);if(!root||root===path.parse(root).root||root.split(path.sep).some(part=>['.git','.hermes'].includes(part.toLowerCase()))||blocked.some(folder=>within(folder,root)||within(root,folder)))return [];
    try{if(!statSync(root).isDirectory())return [];const lock=ProjectGuard.load(root);if(!explicit.has(root)&&(!lock||canonical(lock.activeWritableRoot)!==root))return [];}catch{return [];}
    const key=process.platform==='win32'?root.toLowerCase():root;if(seen.has(key))return [];seen.add(key);return[{path:root,name:path.basename(root)}];
  });
}
