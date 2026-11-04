(function(){
  'use strict';
  const core=globalThis.ReceiptCardPackCore;
  const reader=globalThis.ReceiptCardPackZipReader;
  const storage=globalThis.ReceiptCardPackStorage;
  const input=document.getElementById('packInput');
  const status=document.getElementById('status');
  const list=document.getElementById('packList');
  const cleanupButton=document.getElementById('cleanupButton');
  const cleanupModal=document.getElementById('cleanupModal');
  const cleanupClose=document.getElementById('cleanupClose');
  const cleanupSummary=document.getElementById('cleanupSummary');
  const cleanupSelectOld=document.getElementById('cleanupSelectOld');
  const cleanupClear=document.getElementById('cleanupClear');
  const cleanupList=document.getElementById('cleanupList');
  const cleanupSelection=document.getElementById('cleanupSelection');
  const cleanupDelete=document.getElementById('cleanupDelete');
  let cleanupPacks=[];
  let cleanupCurrentId='';
  let cleanupSelected=new Set();

  function setStatus(message,isError){
    status.textContent=message||'';
    status.style.color=isError?'#be123c':'#64748b';
  }

  function packTitle(pack){
    return pack.name||pack.title||pack.source?.pdfName||'未命名回单卡包';
  }

  function packDate(pack){
    const value=String(pack.createdAt||'');
    if(!value)return '时间未知';
    const date=new Date(value);
    return Number.isNaN(date.getTime())?value.slice(0,10):date.toLocaleDateString('zh-CN');
  }

  async function activeId(){
    const value=await chrome.storage.local.get({receiptCardPackActiveId:''});
    return value.receiptCardPackActiveId||'';
  }

  function updateCleanupSelection(){
    const count=cleanupSelected.size;
    cleanupSelection.textContent=count?'已选择 '+count+' 个卡包':'未选择卡包';
    cleanupDelete.disabled=!count;
    cleanupSelectOld.disabled=!cleanupPacks.some(function(pack){return pack.packId!==cleanupCurrentId;});
  }

  function renderCleanup(packs,currentId){
    cleanupPacks=packs||[];
    cleanupCurrentId=currentId||'';
    const available=new Set(cleanupPacks.filter(function(pack){return pack.packId!==cleanupCurrentId;}).map(function(pack){return pack.packId;}));
    cleanupSelected=new Set(Array.from(cleanupSelected).filter(function(packId){return available.has(packId);}));
    const cardCount=cleanupPacks.reduce(function(total,pack){return total+(pack.cards||[]).length;},0);
    cleanupSummary.textContent=cleanupPacks.length+' 个卡包 · '+cardCount+' 张回单；当前使用的卡包已保护。';
    cleanupList.replaceChildren();
    if(!cleanupPacks.length){
      const empty=document.createElement('div');
      empty.className='cleanup-empty';
      empty.textContent='目前没有可清理的卡包。';
      cleanupList.appendChild(empty);
      updateCleanupSelection();
      return;
    }
    cleanupPacks.forEach(function(pack){
      const isCurrent=pack.packId===cleanupCurrentId;
      const row=document.createElement('label');
      row.className='cleanup-row'+(isCurrent?' current':'');
      const checkbox=document.createElement('input');
      checkbox.type='checkbox';
      checkbox.disabled=isCurrent;
      checkbox.checked=!isCurrent&&cleanupSelected.has(pack.packId);
      checkbox.setAttribute('aria-label',(isCurrent?'当前使用的卡包不可清理：':'选择清理：')+packTitle(pack));
      checkbox.addEventListener('change',function(){
        if(checkbox.checked)cleanupSelected.add(pack.packId);
        else cleanupSelected.delete(pack.packId);
        updateCleanupSelection();
      });
      const info=document.createElement('span');
      info.className='cleanup-info';
      const name=document.createElement('span');
      name.className='cleanup-name';
      const title=document.createElement('span');
      title.textContent=packTitle(pack);
      name.appendChild(title);
      if(isCurrent){
        const current=document.createElement('span');
        current.className='cleanup-current';
        current.textContent='当前使用';
        name.appendChild(current);
      }
      const meta=document.createElement('span');
      meta.className='cleanup-meta';
      meta.textContent=(pack.cards||[]).length+' 张回单 · '+packDate(pack);
      info.append(name,meta);
      row.append(checkbox,info);
      cleanupList.appendChild(row);
    });
    updateCleanupSelection();
  }

  function renderPacks(packs,currentId){
    list.replaceChildren();
    if(!packs.length){
      const empty=document.createElement('div');
      empty.className='empty';
      empty.textContent='还没有卡包，请先从 PDF 拆分结果导出一个卡包。';
      list.appendChild(empty);
      return;
    }
    packs.forEach(function(pack){
      const row=document.createElement('div');
      row.className='pack'+(pack.packId===currentId?' active':'');
      const main=document.createElement('div');
      main.className='pack-main';
      const name=document.createElement('div');
      name.className='pack-name';
      name.textContent=packTitle(pack);
      const meta=document.createElement('div');
      meta.className='pack-meta';
      meta.textContent=(pack.cards||[]).length+' 张回单'+(pack.packId===currentId?' · 当前使用':'');
      main.append(name,meta);
      row.appendChild(main);
      if(pack.packId!==currentId){
        const use=document.createElement('button');
        use.className='secondary';
        use.textContent='使用';
        use.onclick=async function(){
          await storage.setActivePack(pack.packId);
          await refresh();
        };
        row.appendChild(use);
      }
      const remove=document.createElement('button');
      remove.className='danger';
      remove.textContent='删除';
      remove.onclick=async function(){
        if(!confirm('只删除插件里的这份卡包，不会删除电脑上的原始文件。继续吗？'))return;
        await storage.deletePack(pack.packId);
        await refresh();
      };
      row.appendChild(remove);
      list.appendChild(row);
    });
  }

  async function refresh(){
    try{
      const [packs,currentId]=await Promise.all([storage.listPacks(),activeId()]);
      renderPacks(packs,currentId);
      if(!cleanupModal.hidden)renderCleanup(packs,currentId);
      if(packs.length)setStatus('当前卡包已准备好，可直接点击网页中的“补充回执单”自动查找。');
    }catch(error){
      setStatus(error.message||String(error),true);
      if(!cleanupModal.hidden)cleanupSummary.textContent='读取卡包失败：'+(error.message||String(error));
    }
  }

  async function openCleanup(){
    cleanupModal.hidden=false;
    cleanupButton.setAttribute('aria-expanded','true');
    cleanupSelected.clear();
    cleanupSummary.textContent='正在读取卡包…';
    cleanupList.replaceChildren();
    await refresh();
  }

  function closeCleanup(){
    cleanupModal.hidden=true;
    cleanupButton.setAttribute('aria-expanded','false');
    cleanupSelected.clear();
    cleanupButton.focus();
  }

  async function deleteSelectedCleanup(){
    const selected=cleanupPacks.filter(function(pack){return pack.packId!==cleanupCurrentId&&cleanupSelected.has(pack.packId);});
    if(!selected.length){updateCleanupSelection();return;}
    const names=selected.slice(0,2).map(packTitle).join('、');
    const suffix=selected.length>2?' 等 '+selected.length+' 个卡包':'';
    if(!confirm('确定删除 '+names+suffix+' 吗？这会同时删除插件里保存的回单文件，但不会删除电脑上的原始文件。'))return;
    cleanupDelete.disabled=true;
    setStatus('正在清理卡包…');
    try{
      for(const pack of selected)await storage.deletePack(pack.packId);
      cleanupSelected.clear();
      closeCleanup();
      await refresh();
      setStatus('已清理 '+selected.length+' 个卡包。');
    }catch(error){
      setStatus('清理失败：'+(error.message||String(error)),true);
      await refresh();
    }
  }

  function validatePackFiles(manifest,files){
    const missing=[];
    (manifest.cards||[]).forEach(function(card){
      ['jpg','pdf'].forEach(function(format){
        const name=card.files&&card.files[format];
        if(name&&!files.has(name))missing.push(name);
      });
    });
    return missing;
  }

  input.addEventListener('change',async function(){
    const file=input.files&&input.files[0];
    input.value='';
    if(!file)return;
    setStatus('正在读取卡包…');
    try{
      const parsed=reader.readCardPackZip(await file.arrayBuffer());
      if(!core.validateManifest(parsed.manifest))throw new Error('这不是有效的回单卡包');
      const missing=validatePackFiles(parsed.manifest,parsed.files);
      if(missing.length)throw new Error('卡包缺少 '+missing.length+' 个回单文件');
      await storage.putPack(parsed.manifest,parsed.files);
      await storage.setActivePack(parsed.manifest.packId);
      setStatus('已导入 '+packTitle(parsed.manifest)+'，共 '+parsed.manifest.cards.length+' 张回单。');
      await refresh();
    }catch(error){setStatus('导入失败：'+(error.message||String(error)),true);}
  });

  cleanupButton.addEventListener('click',openCleanup);
  cleanupClose.addEventListener('click',closeCleanup);
  cleanupModal.addEventListener('click',function(event){if(event.target===cleanupModal)closeCleanup();});
  cleanupSelectOld.addEventListener('click',function(){
    cleanupSelected=new Set(cleanupPacks.filter(function(pack){return pack.packId!==cleanupCurrentId;}).map(function(pack){return pack.packId;}));
    renderCleanup(cleanupPacks,cleanupCurrentId);
  });
  cleanupClear.addEventListener('click',function(){
    cleanupSelected.clear();
    renderCleanup(cleanupPacks,cleanupCurrentId);
  });
  cleanupDelete.addEventListener('click',deleteSelectedCleanup);
  document.addEventListener('keydown',function(event){if(event.key==='Escape'&&!cleanupModal.hidden)closeCleanup();});

  refresh();
})();
