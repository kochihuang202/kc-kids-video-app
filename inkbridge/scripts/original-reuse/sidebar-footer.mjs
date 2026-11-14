// Native78507 footer/menu contract; account/cloud services are omitted.
// The lamp also carries operation notices (operation-ui.mjs): blue when something waits for a
// decision (program update, version conflict), amber while syncing or preparing an update;
// otherwise green/red for the OneDrive backup. With notices a click opens their actions.
export function createSidebarFooter(React,r){
 const B=r(17015).A,P=r(41278).j,T=r(16938).b,C=r(48933).g,Tip=r(58432).e,Settings=r(38330).default,Trash=r(54129).default,h=React.createElement;
 const time=v=>v?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v)):'尚無備份';
 return function SidebarFooter(){
  const [open,setOpen]=React.useState(false),[lampOpen,setLampOpen]=React.useState(false),[notices,setNotices]=React.useState(()=>window.__inkbridgeLampNotices||[]),[version,setVersion]=React.useState(''),[lamp,setLamp]=React.useState(()=>window.__inkbridgeSaveLamp||{green:false,text:'尚未保存',createdAt:null});
  React.useEffect(()=>{window.inkbridge.info().then(v=>setVersion(v.version)).catch(()=>{});const update=()=>setLamp(window.__inkbridgeSaveLamp);window.addEventListener('inkbridge:save-lamp',update);const updateNotices=()=>setNotices(window.__inkbridgeLampNotices||[]);window.addEventListener('inkbridge:lamp-notices',updateNotices);return()=>{window.removeEventListener('inkbridge:save-lamp',update);window.removeEventListener('inkbridge:lamp-notices',updateNotices);};},[]);
  React.useEffect(()=>{if(!notices.length)setLampOpen(false);},[notices.length]);
  const saveLines=[h('div',{key:'save'},lamp.green?'已保存至 OneDrive 本機交換資料夾':lamp.text),h('div',{key:'time'},'最後備份：'+time(lamp.createdAt))];
  const tip=h('div',{className:'flex flex-col gap-1'},...notices.map(n=>h('div',{key:n.key,className:'font-medium'},n.title)),...saveLines);
  const attention=notices.some(n=>n.kind==='attention'),progress=notices.some(n=>n.kind==='progress'),dot=attention?'#2563eb':progress?'#f59e0b':lamp.green?'#16a34a':'#dc2626';
  const iconButton={isIconOnly:true,size:'sm',variant:'light',className:'w-7 h-7 min-w-0 p-0 hover:bg-default-100 rounded-lg'};
  const lampButton=h(B,{...iconButton,id:'onedrive-save-indicator','data-state':lamp.green?'saved':'unsaved','data-notice':attention?'attention':progress?'progress':'none','aria-label':[...notices.map(n=>n.title),lamp.text+'；最後備份：'+time(lamp.createdAt)].join('；')},h('span',{'aria-hidden':true,style:{width:9,height:9,borderRadius:'50%',background:dot,boxShadow:progress&&!attention?'0 0 0 3px #f59e0b33':undefined}}));
  const panel=h('div',{id:'onedrive-lamp-panel',className:'flex flex-col gap-2 p-1 w-[260px] text-xs'},...notices.map(n=>h('div',{key:n.key,className:'flex flex-col gap-1 pb-2 border-b border-default-100'},h('div',{className:'font-medium text-sm'},n.title),n.detail?h('div',{className:'text-default-500'},n.detail):null,n.actions?.length?h('div',{className:'flex flex-wrap gap-1 pt-1'},n.actions.map(a=>h(B,{key:a.label,size:'sm',variant:'flat',color:n.kind==='attention'?'primary':'default',className:'h-7 text-xs',onPress:()=>{setLampOpen(false);a.run();}},a.label))):null)),h('div',{className:'flex flex-col gap-0.5 text-default-500'},...saveLines));
  const lampControl=notices.length?h(P,{isOpen:lampOpen,onOpenChange:setLampOpen,placement:'top-start'},h(T,null,lampButton),h(C,{className:'p-2'},panel)):h(Tip,{color:'foreground',size:'sm',closeDelay:0,content:tip},lampButton);
  return h('div',{className:'inkbridge-footer-row'},
   h(P,{isOpen:open,onOpenChange:setOpen,placement:'top-start'},h(T,null,h(B,{id:'inkbridge-version-menu',size:'sm',variant:'light',className:'h-7 min-w-0 px-2 text-xs rounded-lg','aria-label':'InkBridge 應用選單'},'InkBridge '+version)),h(C,{className:'p-1.5 min-w-[160px]'},h(B,{id:'footer-trash-action',size:'sm',variant:'light',className:'w-full justify-start h-8 px-2 text-xs rounded-lg gap-2','aria-label':'回收站',onPress:()=>{setOpen(false);document.querySelector('#open-trash').click();}},h(Trash,{className:'w-3.5 h-3.5'}),'回收站'))),
   h('div',{className:'inkbridge-footer-actions'},lampControl,h(Tip,{color:'foreground',size:'sm',closeDelay:0,content:'設定'},h(B,{...iconButton,id:'footer-settings','aria-label':'設定',onPress:()=>document.querySelector('#open-storage-settings').click()},h(Settings,{className:'w-3.5 h-3.5 text-default-600',strokeWidth:1.75})))));
 };
}
