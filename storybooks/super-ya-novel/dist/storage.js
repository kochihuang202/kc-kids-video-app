export const preview=document.querySelector('meta[name="reading-preview"]')!==null||new URLSearchParams(location.search).get('preview')==='1';
// Drafts cannot read or overwrite a child's saved preferences or progress.
export const storage={getItem:key=>localStorage.getItem((preview?'draft:':'')+key),setItem:(key,value)=>localStorage.setItem((preview?'draft:':'')+key,value)};
export function draftURL(url){if(!preview)return url;const u=new URL(url,location.href);u.searchParams.set('preview','1');return u.pathname+u.search;}
if(preview)document.addEventListener('click',e=>{const link=e.target.closest('a[href]');if(link&&link.origin===location.origin)link.href=draftURL(link.href);},true);
