// Native78507 footer/menu contract; account/cloud services are omitted.
export function createSidebarFooter(React,r){
 const B=r(17015).A,P=r(41278).j,T=r(16938).b,C=r(48933).g,Tip=r(58432).e,Settings=r(38330).default,Trash=r(54129).default,h=React.createElement;
 const time=v=>v?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v)):'尚無備份';
 return function SidebarFooter(){
  const [open,setOpen]=React.useState(false),[version,setVersion]=React.useState(''),[lamp,setLamp]=React.useState(()=>window.__inkbridgeSaveLamp||{green:false,text:'尚未保存',createdAt:null});
  React.useEffect(()=>{window.inkbridge.info().then(v=>setVersion(v.version)).catch(()=>{});const update=()=>setLamp(window.__inkbridgeSaveLamp);window.addEventListener('inkbridge:save-lamp',update);return()=>window.removeEventListener('inkbridge:save-lamp',update);},[]);
  const tip=h('div',{className:'flex flex-col gap-1'},h('div',null,lamp.green?'已保存至 OneDrive 本機交換資料夾':lamp.text),h('div',null,'最後備份：'+time(lamp.createdAt)));
  const iconButton={isIconOnly:true,size:'sm',variant:'light',className:'w-7 h-7 min-w-0 p-0 hover:bg-default-100 rounded-lg'};
  return h('div',{className:'inkbridge-footer-row'},
   h(P,{isOpen:open,onOpenChange:setOpen,placement:'top-start'},h(T,null,h(B,{id:'inkbridge-version-menu',size:'sm',variant:'light',className:'h-7 min-w-0 px-2 text-xs rounded-lg','aria-label':'InkBridge 應用選單'},'InkBridge '+version)),h(C,{className:'p-1.5 min-w-[160px]'},h(B,{id:'footer-trash-action',size:'sm',variant:'light',className:'w-full justify-start h-8 px-2 text-xs rounded-lg gap-2','aria-label':'回收站',onPress:()=>{setOpen(false);document.querySelector('#open-trash').click();}},h(Trash,{className:'w-3.5 h-3.5'}),'回收站'))),
   h('div',{className:'inkbridge-footer-actions'},h(Tip,{color:'foreground',size:'sm',closeDelay:0,content:tip},h(B,{...iconButton,id:'onedrive-save-indicator','data-state':lamp.green?'saved':'unsaved','aria-label':lamp.text+'；最後備份：'+time(lamp.createdAt)},h('span',{'aria-hidden':true,style:{width:9,height:9,borderRadius:'50%',background:lamp.green?'#16a34a':'#dc2626'}}))),h(Tip,{color:'foreground',size:'sm',closeDelay:0,content:'設定'},h(B,{...iconButton,id:'footer-settings','aria-label':'設定',onPress:()=>document.querySelector('#open-storage-settings').click()},h(Settings,{className:'w-3.5 h-3.5 text-default-600',strokeWidth:1.75})))));
 };
}
