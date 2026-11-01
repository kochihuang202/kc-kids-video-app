// Real Electron animation regression: sample the actual native overlays per frame.
const {_electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {WorkspaceDatabase}=require('../../src/main/database.cjs');
(async()=>{
  const data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-original-modules-overlay-'));
  const {noteDocument}=await import('../../src/core/rich-document.mjs');
  const db=new WorkspaceDatabase(path.join(data,'Workspace/inkbridge.sqlite3'));
  db.commit({requestId:crypto.randomUUID(),baseRevision:0,operations:[
    {type:'putBoard',data:{id:'board-main',title:'Overlay regression',view:{x:0,y:0,zoom:1}}},
    {type:'putContent',data:{id:'note',title:'Overlay',body:'',kind:'text',tone:'sage',document:noteDocument({title:'Overlay',body:'Text\n'.repeat(18)})}},
    {type:'putInstance',data:{id:'placement',contentId:'note',boardId:'board-main',x:160,y:340,width:400,height:200,z:0}},
    {type:'putCatalog',kind:'instance',data:{id:'placement',isAutoHeight:false}},
    {type:'putCatalog',kind:'whiteboard-instance',data:{id:'ref',whiteboardId:'board-main',containerType:'folder',containerId:'folder'}},
    {type:'putCatalog',kind:'folder',data:{id:'folder',name:'Overlay group',whiteboardInstanceIds:['ref']}}
  ]});db.close();
  const env={...process.env,INKBRIDGE_ORIGINAL_PROBE_DATA:data,INKBRIDGE_ORIGINAL_VIEW:'board'};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({args:[path.join(__dirname,'host.cjs')],executablePath:require('electron'),env,timeout:15000});
  let page;const captures={};
  try{
    page=await app.firstWindow();page.setDefaultTimeout(7000);await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);
    await app.evaluate(({app})=>app.focus({steal:true}));await page.bringToFront();
    await page.evaluate(()=>{
      const ids=new WeakMap();let nextId=0;
      window.__startOverlaySample=(selector,index)=>{
        window.__overlaySample=new Promise(resolve=>{const rows=[];let frame=0;
          const sample=()=>{const element=document.querySelectorAll(selector)[index];
            if(element){if(!ids.has(element))ids.set(element,++nextId);const rect=element.getBoundingClientRect(),style=getComputedStyle(element);rows.push({frame,id:ids.get(element),x:rect.x,y:rect.y,width:rect.width,height:rect.height,opacity:Number(style.opacity)});}
            if(++frame<70)requestAnimationFrame(sample);else resolve(rows);
          };requestAnimationFrame(sample);
        });
      };
    });
    const sample=async(name,selector,index,action)=>{
      await page.evaluate(([selector,index])=>window.__startOverlaySample(selector,index),[selector,index]);await action();
      const rows=await page.evaluate(()=>window.__overlaySample);captures[name]=rows;
      assert(rows.length>2,`${name}: no native overlay frames`);
      assert(rows.at(-1).opacity>=0.99&&rows.at(-1).width>0,`${name}: overlay did not finish visible`);
      for(let i=1;i<rows.length;i++){
        assert.equal(rows[i].id,rows[0].id,`${name}: unexpectedly remounted`);
        assert(rows[i].opacity>=rows[i-1].opacity-0.2,`${name}: opacity reset at frame ${rows[i].frame}: ${rows[i-1].opacity} -> ${rows[i].opacity}`);
        assert(rows[i].width>=rows[i-1].width-1,`${name}: scale reset at frame ${rows[i].frame}: ${rows[i-1].width} -> ${rows[i].width}`);
      }
    };
    const point=await page.evaluate(()=>{const box=document.querySelector('#board').getBoundingClientRect(),state=window.__originalRequire(23).gt.getState(),node=state.nodes[0];return{x:box.x+state.view.translateX+(node.position.x+80)*state.view.scale,y:box.y+state.view.translateY+(node.position.y+40)*state.view.scale};});
    await page.mouse.click(point.x,point.y);await expect(page.locator('.selection-toolbar-container')).toBeVisible();
    await sample('card-tooltip','[role=tooltip]',0,()=>page.locator('.selection-toolbar-container').getByRole('button').nth(1).hover());
    await page.mouse.move(1100,850);await expect(page.getByRole('tooltip')).toBeHidden();
    await sample('auto-height-tooltip','[role=tooltip]',0,()=>page.locator('.selection-toolbar-container').getByRole('button').nth(6).hover());
    await page.mouse.move(30,750);await expect(page.getByRole('tooltip')).toBeHidden();
    await page.locator('#original-board-list').getByText('Overlay group',{exact:true}).hover();
    const editLabel=await page.evaluate(()=>window.__originalRequire(1643).ag.t('editGroup',{ns:'common'}));const editGroup=page.locator('#original-board-list').getByRole('button',{name:editLabel,exact:true});
    await sample('sidebar-tooltip','[role=tooltip]',0,()=>editGroup.hover());
    await page.mouse.move(1100,850);await expect(page.getByRole('tooltip')).toBeHidden();
    await sample('main-menu','.context-menu-root',0,()=>page.locator('[aria-label="More options"]').click());
    await sample('export-submenu','.context-menu-root',1,()=>page.locator('.context-menu-root [data-key=export]').hover());
    assert.deepEqual(await page.evaluate(()=>window.__inkbridgeIntegrated.errors),[]);
    console.log(JSON.stringify({nativeTooltip:true,nativeMainMenu:true,nativeExportSubmenu:true,nativeAutoHeightTooltip:true,nativeSidebarTooltip:true,noAnimationRollback:true}));
  }catch(error){if(page&&!page.isClosed()){console.log(JSON.stringify(await page.evaluate(()=>({errors:window.__inkbridgeIntegrated.errors,auto:window.__originalRequire(23).gt.getState().nodes[0]?.data.isAutoHeight}))));await page.screenshot({path:path.resolve(__dirname,'../../private-original-editor/overlay-failure.png')});}await app.evaluate(({app})=>app.exit(1)).catch(()=>{});throw error;}
  finally{await fs.writeFile(path.resolve(__dirname,'../../private-original-editor/overlay-stability-samples.json'),JSON.stringify(captures));await app.close().catch(()=>{});}
})().catch(error=>{console.error(error);process.exitCode=1;});
