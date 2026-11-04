(function(){
  'use strict';
  if(globalThis.__receiptCardPackInjected)return;
  globalThis.__receiptCardPackInjected=true;

  const core=globalThis.ReceiptCardPackCore;
  const reader=globalThis.ReceiptCardPackZipReader;
  const binary=globalThis.ReceiptCardPackBinary;
  if(!core||!reader||!binary)return;

  const host=document.createElement('div');
  host.id='receipt-card-pack-host';
  host.style.cssText='position:fixed;right:18px;top:32%;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;';
  const shadow=host.attachShadow?host.attachShadow({mode:'open'}):host;
  shadow.innerHTML=`
    <style>
      :host{all:initial}
      *{box-sizing:border-box}
      .launch{border:0;border-radius:999px;padding:10px 14px;background:#2563eb;color:#fff;box-shadow:0 4px 18px rgba(37,99,235,.3);font:600 13px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;cursor:grab;touch-action:none}
      .launch:active{cursor:grabbing}
      .panel{width:330px;max-height:570px;margin-top:8px;border:1px solid #dbe3ef;border-radius:13px;background:#fff;color:#1f2937;box-shadow:0 12px 40px rgba(15,23,42,.22);overflow:hidden;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}
      .panel[hidden]{display:none}
      .head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #e5e7eb;background:#f8fafc;cursor:move;touch-action:none}
      .head strong{flex:1;font-size:14px}
      .close{border:0;background:transparent;color:#64748b;font-size:18px;line-height:1;cursor:pointer}
      .body{padding:12px;max-height:510px;overflow:auto}
      .hint{padding:8px 9px;border-radius:8px;background:#eff6ff;color:#1d4ed8;font-size:12px;line-height:1.5}
      .pick{width:100%;margin-top:9px;border:1px solid #93c5fd;border-radius:8px;padding:8px 10px;background:#fff;color:#2563eb;font-size:12px;cursor:pointer}
      .pick.active{background:#dbeafe;border-color:#2563eb}
      .query{margin-top:10px;color:#64748b;font-size:12px}
      .result-title{margin:10px 0 6px;color:#475569;font-size:12px;font-weight:600}
      .empty{padding:16px 4px;color:#94a3b8;text-align:center;font-size:12px}
      .result{display:flex;gap:8px;align-items:center;padding:8px 0;border-top:1px solid #eef2f7}
      .thumbs{display:flex;gap:4px;flex:none;max-width:100px}
      .thumb{width:48px;height:58px;border:1px solid #dbe3ef;border-radius:5px;background:#f8fafc;object-fit:contain;cursor:pointer;flex:none}
      .thumbs .thumb{width:46px;height:56px}
      .meta{min-width:0;flex:1}
      .amount{font-weight:700;color:#111827}
      .detail{margin-top:2px;color:#64748b;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .actions{display:flex;flex-direction:column;gap:5px;flex:none}
      .actions button{border:0;border-radius:6px;padding:5px 7px;background:#2563eb;color:#fff;font-size:11px;cursor:pointer}
      .actions button.preview{background:#eff6ff;color:#2563eb}
      .preview-modal{position:fixed;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(15,23,42,.48)}
      .preview-modal[hidden]{display:none}
      .preview-dialog{width:min(900px,calc(100vw - 32px));height:min(90vh,900px);max-height:900px;display:flex;flex-direction:column;overflow:hidden;border:1px solid #dbe3ef;border-radius:14px;background:#fff;color:#1f2937;box-shadow:0 20px 70px rgba(15,23,42,.35)}
      .preview-head{display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid #e5e7eb;background:#fff}
      .preview-head strong{flex:1;font-size:16px;line-height:1.3}
      .preview-close{width:30px;height:30px;border:0;border-radius:7px;background:transparent;color:#64748b;font-size:25px;line-height:1;cursor:pointer}
      .preview-close:hover{background:#f1f5f9;color:#1e293b}
      .preview-body{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:18px;background:#f8fafc;overflow:auto}
      .preview-body img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;background:#fff;box-shadow:0 4px 18px rgba(15,23,42,.12)}
      .preview-name{padding:9px 12px;border-top:1px solid #e5e7eb;color:#64748b;font-size:12px;line-height:1.4;word-break:break-all}
    </style>
    <button id="rcp-launch" class="launch" type="button" title="点击展开；按住拖动位置">📦 回单卡包</button>
    <section id="rcp-panel" class="panel" hidden>
      <div id="rcp-head" class="head" title="按住标题栏拖动卡包"><strong>回单卡包</strong><button id="rcp-close" class="close" type="button" aria-label="收起">×</button></div>
      <div class="body">
        <div id="rcp-hint" class="hint">先导入卡包；也可以直接点击网页中的“补充回执单”，自动按报销金额合计查找。</div>
        <button id="rcp-pick" class="pick" type="button">🎯 手动点击网页金额查找</button>
        <div id="rcp-query" class="query"></div>
        <div id="rcp-results"></div>
      </div>
  </section>
    <div id="rcp-preview-modal" class="preview-modal" hidden>
      <div id="rcp-preview-dialog" class="preview-dialog" role="dialog" aria-modal="true" aria-labelledby="rcp-preview-title">
        <div class="preview-head"><strong id="rcp-preview-title">回单预览</strong><button id="rcp-preview-close" class="preview-close" type="button" aria-label="关闭预览">×</button></div>
        <div class="preview-body"><img id="rcp-preview-image" alt="回单预览"></div>
        <div id="rcp-preview-name" class="preview-name"></div>
      </div>
    </div>`;
  (document.documentElement||document.body).appendChild(host);

  const launch=shadow.getElementById('rcp-launch');
  const panel=shadow.getElementById('rcp-panel');
  const head=shadow.getElementById('rcp-head');
  const close=shadow.getElementById('rcp-close');
  const hint=shadow.getElementById('rcp-hint');
  const pick=shadow.getElementById('rcp-pick');
  const queryEl=shadow.getElementById('rcp-query');
  const resultsEl=shadow.getElementById('rcp-results');
  const preview=shadow.getElementById('rcp-preview-modal');
  const previewClose=shadow.getElementById('rcp-preview-close');
  const previewImage=shadow.getElementById('rcp-preview-image');
  const previewName=shadow.getElementById('rcp-preview-name');
  let picking=false;
  let currentCards=[];
  let previewUrl='';
  let previewRequest=0;
  const positionKey='receipt-card-pack-position';
  let dragState=null;
  let suppressLaunchClickUntil=0;
  let suppressPageClickUntil=0;

  function viewportPosition(left,top){
    const rect=host.getBoundingClientRect();
    const margin=8;
    const maxLeft=Math.max(margin,window.innerWidth-rect.width-margin);
    const maxTop=Math.max(margin,window.innerHeight-rect.height-margin);
    return {
      left:Math.min(Math.max(margin,left),maxLeft),
      top:Math.min(Math.max(margin,top),maxTop)
    };
  }
  function applyHostPosition(left,top,persist){
    const position=viewportPosition(left,top);
    host.style.left=position.left+'px';
    host.style.top=position.top+'px';
    host.style.right='auto';
    host.style.bottom='auto';
    if(persist){
      try{
        if(chrome.storage&&chrome.storage.local)chrome.storage.local.set({[positionKey]:position});
      }catch(_error){}
    }
  }
  function restoreHostPosition(){
    try{
      if(!(chrome.storage&&chrome.storage.local))return;
      chrome.storage.local.get(positionKey,function(data){
        const saved=data&&data[positionKey];
        const left=Number(saved&&saved.left);
        const top=Number(saved&&saved.top);
        if(Number.isFinite(left)&&Number.isFinite(top))applyHostPosition(left,top,false);
      });
    }catch(_error){}
  }
  function saveHostPosition(){
    const rect=host.getBoundingClientRect();
    applyHostPosition(rect.left,rect.top,true);
  }
  function openPanel(){
    panel.hidden=false;
    if(host.style.left)saveHostPosition();
  }
  function startHostDrag(event){
    if(event.button!==undefined&&event.button!==0)return;
    if(event.target===close)return;
    const rect=host.getBoundingClientRect();
    dragState={
      handle:event.currentTarget,
      pointerId:event.pointerId,
      startX:event.clientX,
      startY:event.clientY,
      left:rect.left,
      top:rect.top,
      moved:false
    };
    if(dragState.handle.setPointerCapture&&event.pointerId!==undefined){
      try{dragState.handle.setPointerCapture(event.pointerId);}catch(_error){}
    }
    event.preventDefault();
  }
  function moveHostDrag(event){
    if(!dragState||event.pointerId!==dragState.pointerId)return;
    const dx=event.clientX-dragState.startX;
    const dy=event.clientY-dragState.startY;
    if(!dragState.moved&&(Math.abs(dx)<4&&Math.abs(dy)<4))return;
    dragState.moved=true;
    applyHostPosition(dragState.left+dx,dragState.top+dy,false);
    event.preventDefault();
  }
  function endHostDrag(event){
    if(!dragState||event.pointerId!==dragState.pointerId)return;
    const state=dragState;
    dragState=null;
    if(state.handle.releasePointerCapture&&event.pointerId!==undefined){
      try{state.handle.releasePointerCapture(event.pointerId);}catch(_error){}
    }
    if(state.moved){
      saveHostPosition();
      suppressLaunchClickUntil=Date.now()+500;
      suppressPageClickUntil=Date.now()+500;
    }
  }
  function bindDragHandle(handle){handle.addEventListener('pointerdown',startHostDrag);}
  function setHint(text,error){
    hint.textContent=text||'';
    hint.style.background=error?'#fff1f2':'#eff6ff';
    hint.style.color=error?'#be123c':'#1d4ed8';
  }
  function send(message,callback){
    chrome.runtime.sendMessage(message,function(response){
      const runtimeError=chrome.runtime.lastError;
      if(runtimeError){callback({ok:false,error:runtimeError.message});return;}
      callback(response||{ok:false,error:'插件没有返回结果'});
    });
  }
  function sendAsync(message){
    return new Promise(function(resolve){send(message,resolve);});
  }
  function bytesToBase64(data){
    return binary.bytesToBase64(data);
  }
  function expectedPackPaths(manifest){
    const paths=new Set();
    (manifest.cards||[]).forEach(function(card){
      Object.keys(card.files||{}).forEach(function(format){
        if(card.files[format])paths.add(card.files[format]);
      });
    });
    return paths;
  }
  function missingPackFiles(manifest,files){
    const missing=[];
    expectedPackPaths(manifest).forEach(function(path){if(!files.has(path))missing.push(path);});
    return missing;
  }
  function postPageExportResult(requestId,extra){
    window.postMessage(Object.assign({
      source:'receipt-card-pack-extension',
      type:'receipt-card-pack.page-export-result',
      requestId:requestId
    },extra||{}),'*');
  }
  async function syncPageExport(message){
    let started=false;
    try{
      if(!(message.zip instanceof Blob))throw new Error('网页没有提供有效的卡包文件');
      const parsed=reader.readCardPackZip(new Uint8Array(await message.zip.arrayBuffer()));
      if(!core.validateManifest(parsed.manifest))throw new Error('这不是有效的回单卡包');
      if(message.manifest?.packId&&message.manifest.packId!==parsed.manifest.packId)throw new Error('网页卡包清单与文件不一致');
      const missing=missingPackFiles(parsed.manifest,parsed.files);
      if(missing.length)throw new Error('卡包缺少 '+missing.length+' 个回单文件');
      const start=await sendAsync({type:'receipt-card-pack.importStart',manifest:parsed.manifest});
      if(!start?.ok)throw new Error(start?.error||'插件无法开始同步卡包');
      started=true;
      const expected=expectedPackPaths(parsed.manifest);
      for(const [name,data] of parsed.files){
        if(!expected.has(name))continue;
        const response=await sendAsync({
          type:'receipt-card-pack.importFile',
          packId:parsed.manifest.packId,
          path:name,
          data:bytesToBase64(data)
        });
        if(!response?.ok)throw new Error(response?.error||'插件无法保存卡包文件');
      }
      const complete=await sendAsync({type:'receipt-card-pack.importComplete',packId:parsed.manifest.packId});
      if(!complete?.ok)throw new Error(complete?.error||'插件无法完成卡包同步');
      postPageExportResult(message.requestId,{ok:true,pack:complete.pack||{packId:parsed.manifest.packId,name:parsed.manifest.name},cards:parsed.manifest.cards.length});
    }catch(error){
      if(started){
        try{await sendAsync({type:'receipt-card-pack.importAbort',packId:message.manifest?.packId});}catch(_error){}
      }
      postPageExportResult(message.requestId,{ok:false,reason:'sync-failed',error:error.message||String(error)});
    }
  }
  function bytesFrom(data){
    if(typeof data==='string')return binary.base64ToBytes(data).buffer;
    if(data instanceof ArrayBuffer)return data;
    if(ArrayBuffer.isView(data))return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
    if(Array.isArray(data))return new Uint8Array(data).buffer;
    return data;
  }
  function closePreview(){
    previewRequest++;
    preview.hidden=true;
    if(previewUrl)URL.revokeObjectURL(previewUrl);
    previewUrl='';
    previewImage.removeAttribute('src');
    previewName.textContent='';
  }
  function showPreview(card){
    const requestId=++previewRequest;
    if(previewUrl)URL.revokeObjectURL(previewUrl);
    previewUrl='';
    previewImage.removeAttribute('src');
    previewName.textContent='正在加载预览…';
    preview.hidden=false;
    send({type:'receipt-card-pack.getAsset',packId:card.packId,cardId:card.id,format:'jpg'},function(response){
      if(requestId!==previewRequest)return;
      if(!response?.ok){setHint(response?.error||'预览失败',true);return;}
      const blob=new Blob([bytesFrom(response.dataBase64)],{type:response.mime||'image/jpeg'});
      previewUrl=URL.createObjectURL(blob);
      previewImage.src=previewUrl;
      previewName.textContent=response.fileName||card.displayName||card.name||'';
      preview.hidden=false;
    });
  }
  function findUploadInput(){
    const inputs=Array.from(document.querySelectorAll('input[type="file"]')).filter(function(input){return !input.disabled;});
    return inputs.find(function(input){return input.getClientRects&&input.getClientRects().length;})||inputs[0]||null;
  }
  const receiptRowSelector='tr,[role="row"],.el-table__row,.ant-table-row,li';
  const receiptCellSelector='th,td,[role="columnheader"],[role="gridcell"]';
  const tableRootSelector='.el-table,.ant-table-wrapper,[role="grid"],[role="treegrid"]';
  function compactPageText(value){return String(value==null?'':value).replace(/\s+/g,'').trim();}
  function pageMatches(element,selector){return !!(element&&element.matches&&element.matches(selector));}
  function pageAncestor(element,selector){
    let node=element;
    while(node){
      if(pageMatches(node,selector))return node;
      node=node.parentElement;
    }
    return null;
  }
  function uniquePageNodes(nodes){
    const seen=new Set();
    return nodes.filter(function(node){
      if(!node||seen.has(node))return false;
      seen.add(node);
      return true;
    });
  }
  function pageRowCells(row){
    return row&&row.querySelectorAll?Array.from(row.querySelectorAll(receiptCellSelector)):[];
  }
  function pageRows(root){
    if(!root||!root.querySelectorAll)return [];
    const rows=Array.from(root.querySelectorAll('tbody tr,.el-table__row,.ant-table-row,[role="row"],li'));
    return uniquePageNodes(rows).filter(function(row){
      const cells=pageRowCells(row);
      return cells.length&&!cells.some(function(cell){return pageMatches(cell,'th,[role="columnheader"]');});
    });
  }
  function receiptTableRoot(row){
    let node=row;
    let table=null;
    while(node){
      if(pageMatches(node,tableRootSelector))return node;
      if(!table&&pageMatches(node,'table'))table=node;
      node=node.parentElement;
    }
    return table||document;
  }
  function receiptHeaderInfos(root){
    if(!root||!root.querySelectorAll)return [];
    const rows=uniquePageNodes(Array.from(root.querySelectorAll('thead tr,[role="row"]')));
    return rows.map(function(row){
      const cells=pageRowCells(row);
      const amountIndex=cells.findIndex(function(cell){return /报销金额合计/.test(compactPageText(cell.textContent));});
      if(amountIndex<0)return null;
      return {headers:cells.map(function(cell){return String(cell.textContent||'').trim();}),amountIndex};
    }).filter(Boolean);
  }
  function receiptSectionRows(row){
    const section=pageAncestor(row,'tbody,.el-table__body-wrapper,.ant-table-tbody');
    return section?pageRows(section):[row];
  }
  function receiptRowKey(row){
    const attrs=['data-row-key','data-row-index','data-index','data-key','data-id'];
    for(const attr of attrs){
      const value=row&&row.getAttribute?row.getAttribute(attr):'';
      if(value!==null&&value!==undefined&&String(value)!=='')return attr+':'+String(value);
    }
    return '';
  }
  function extractQueryFromReceiptAction(element){
    const row=pageAncestor(element,receiptRowSelector);
    const rowText=String(row&&row.textContent||'').trim();
    const clickedText=String(element&&element.textContent||'').trim();
    if(!row)return {amount:'',clickedText,rowText,source:'receipt-action'};

    const root=receiptTableRoot(row);
    const sectionRows=receiptSectionRows(row);
    const rowIndex=sectionRows.indexOf(row);
    const key=receiptRowKey(row);
    const candidates=pageRows(root);
    for(const info of receiptHeaderInfos(root)){
      const directCells=pageRowCells(row);
      const directAmount=directCells.length>info.amountIndex
        ? core.extractReceiptAmountFromTable(info.headers,directCells.map(function(cell){return cell.textContent||'';}),'')
        : '';
      if(directAmount)return {amount:directAmount,clickedText,rowText,source:'receipt-action'};

      const amountRows=candidates.map(function(candidate){
        const cells=pageRowCells(candidate);
        if(cells.length<=info.amountIndex)return null;
        const amount=core.extractReceiptAmountFromTable(info.headers,cells.map(function(cell){return cell.textContent||'';}),'');
        return amount?{row:candidate,amount}:null;
      }).filter(Boolean);
      if(key){
        const matched=amountRows.find(function(item){return receiptRowKey(item.row)===key;});
        if(matched)return {amount:matched.amount,clickedText,rowText,source:'receipt-action'};
      }
      if(rowIndex>=0&&amountRows[rowIndex])return {amount:amountRows[rowIndex].amount,clickedText,rowText,source:'receipt-action'};
    }

    const fallback=core.extractReceiptAmountFromTable([],[],rowText);
    return {amount:fallback,clickedText,rowText,source:'receipt-action'};
  }
  function findReceiptActionElement(target){
    let node=target;
    for(let i=0;i<10&&node;i++,node=node.parentElement){
      if(node===host||host.contains(node))return null;
      const text=compactPageText(node.textContent);
      if(text.length<=20&&/补充(?:回执|回单)单?/.test(text))return node;
    }
    return null;
  }
  function resetPicking(){
    picking=false;
    pick.classList.remove('active');
    pick.textContent='🎯 手动点击网页金额查找';
  }
  function selectionCards(card){
    return Array.isArray(card?.cards)&&card.cards.length?card.cards:[card];
  }
  function selectionLabel(card){
    const cards=selectionCards(card);
    if(cards.length<2)return card.displayName||card.name||'这张回单';
    return '合计 '+(card.amount||'未识别')+'（'+cards.map(function(item){return item.displayName||item.name||item.amount||'回单';}).join('、')+'）';
  }
  function chooseCard(card){
    const selectedCards=selectionCards(card);
    const input=findUploadInput();
    if(!input){
      setHint('已选中 '+selectionLabel(card)+'；请先打开网页上传窗口，再点击“选择此回单”。');
      return;
    }
    const format=/pdf/i.test(input.accept||'')?'pdf':'jpg';
    Promise.all(selectedCards.map(function(selectedCard){
      return sendAsync({type:'receipt-card-pack.getAsset',packId:selectedCard.packId||card.packId,cardId:selectedCard.id,format});
    })).then(function(responses){
      const failed=responses.find(function(response){return !response?.ok;});
      if(failed){setHint(failed.error||'读取回单文件失败',true);return;}
      try{
        const files=responses.map(function(response,index){
          const selectedCard=selectedCards[index];
          return new File([bytesFrom(response.dataBase64)],response.fileName||((selectedCard.displayName||selectedCard.id)+'.'+format),{type:response.mime||'application/octet-stream'});
        });
        const dataTransfer=new DataTransfer();
        files.forEach(function(file){dataTransfer.items.add(file);});
        input.files=dataTransfer.files;
        input.dispatchEvent(new Event('input',{bubbles:true}));
        input.dispatchEvent(new Event('change',{bubbles:true}));
        const notice=files.length>1&&!input.multiple?'网页上传框未声明多选，已尝试填入多张；如只显示一张，请分别上传。':'请继续确认网页上的上传/提交按钮。';
        setHint('已选择 '+files.length+' 张回单（'+selectionLabel(card)+'），'+notice,files.length>1&&!input.multiple);
      }catch(error){setHint('网页上传控件拒绝自动填入：'+error.message,true);}
    }).catch(function(error){setHint('读取回单文件失败：'+(error.message||String(error)),true);});
  }
  function renderResults(response,amount,source){
    const packId=response.pack?.packId||'';
    currentCards=(response.cards||[]).map(function(card){
      const normalized=Object.assign({},card,{packId});
      if(Array.isArray(card.cards))normalized.cards=card.cards.map(function(item){return Object.assign({},item,{packId});});
      return normalized;
    });
    resultsEl.replaceChildren();
    queryEl.textContent=(source==='receipt-action'?'已锁定报销金额合计：':'正在查找金额：')+amount+(response.pack?' · '+response.pack.name:'');
    if(!response.pack){
      const empty=document.createElement('div');empty.className='empty';empty.textContent='还没有导入卡包，请点击浏览器工具栏中的插件图标导入。';resultsEl.appendChild(empty);return;
    }
    const combinedCount=currentCards.filter(function(card){return card.matchType==='combined-amount';}).length;
    const title=document.createElement('div');title.className='result-title';title.textContent=currentCards.length?'找到 '+currentCards.length+' 个候选'+(combinedCount?'（含 '+combinedCount+' 个合计组合）':''):'未找到对应回单';resultsEl.appendChild(title);
    if(!currentCards.length)return;
    currentCards.forEach(function(card){
      const selectedCards=selectionCards(card);
      const combined=selectedCards.length>1||card.matchType==='combined-amount';
      const row=document.createElement('div');row.className='result';
      const thumbs=document.createElement('div');thumbs.className='thumbs';
      selectedCards.forEach(function(selectedCard){
        const image=document.createElement('img');image.className='thumb';image.alt=selectedCard.displayName||'回单';image.title='点击预览';image.addEventListener('click',function(){showPreview(selectedCard);});
        thumbs.appendChild(image);
        showPreviewImage(selectedCard,image);
      });
      const meta=document.createElement('div');meta.className='meta';
      const amountEl=document.createElement('div');amountEl.className='amount';amountEl.textContent=(combined?'合计 ':'')+'¥ '+(card.amount||'未识别');
      const detail=document.createElement('div');detail.className='detail';detail.textContent=combined
        ? selectedCards.map(function(item){return (item.amount||'未识别')+' · '+(item.displayName||item.name||item.originalName||'回单');}).join(' + ')
        : [card.date,card.payee||card.payer,card.displayName].filter(Boolean).join(' · ')||card.originalName||'';
      meta.append(amountEl,detail);
      const actions=document.createElement('div');actions.className='actions';
      const previewBtn=document.createElement('button');previewBtn.type='button';previewBtn.className='preview';previewBtn.textContent='预览';previewBtn.addEventListener('click',function(){showPreview(selectedCards[0]);});
      const chooseBtn=document.createElement('button');chooseBtn.type='button';chooseBtn.textContent=combined?'选择这'+selectedCards.length+'张':'选择';chooseBtn.addEventListener('click',function(){chooseCard(card);});
      actions.append(previewBtn,chooseBtn);row.append(thumbs,meta,actions);resultsEl.appendChild(row);
    });
  }
  function showPreviewImage(card,image){
    send({type:'receipt-card-pack.getAsset',packId:card.packId,cardId:card.id,format:'jpg'},function(response){
      if(!response?.ok)return;
      const url=URL.createObjectURL(new Blob([bytesFrom(response.dataBase64)],{type:response.mime||'image/jpeg'}));
      image.src=url;
      image.addEventListener('load',function(){URL.revokeObjectURL(url);},{once:true});
    });
  }
  function lookup(query){
    openPanel();
    setHint(query.source==='receipt-action'?'已锁定报销金额合计，正在查找回单…':'正在查找金额…');
    send({type:'receipt-card-pack.lookup',query},function(response){
      if(!response?.ok){setHint(response?.error||'查找失败',true);return;}
      renderResults(response,query.amount,query.source);
      setHint(response.cards?.length
        ? (query.source==='receipt-action'?'已按报销金额合计找到候选回单，请预览并选择。':'请预览并选择正确的回单。')
        : '未找到对应回单',!response.cards?.length);
    });
  }

  window.addEventListener('message',function(event){
    if(event.source!==window)return;
    const message=event.data;
    if(!message||message.source!=='receipt-card-pack-web')return;
    if(message.type==='receipt-card-pack.page-ping'){
      postPageExportResult(message.requestId,{ok:true,reason:'extension-ready'});
      return;
    }
    if(message.type==='receipt-card-pack.page-export')syncPageExport(message);
  });

  bindDragHandle(launch);
  bindDragHandle(head);
  document.addEventListener('pointermove',moveHostDrag,true);
  document.addEventListener('pointerup',endHostDrag,true);
  document.addEventListener('pointercancel',endHostDrag,true);
  window.addEventListener('resize',function(){if(host.style.left)saveHostPosition();});
  restoreHostPosition();

  launch.addEventListener('click',function(){
    if(Date.now()<suppressLaunchClickUntil){suppressLaunchClickUntil=0;return;}
    suppressLaunchClickUntil=0;
    if(panel.hidden)openPanel();
    else panel.hidden=true;
  });
  close.addEventListener('click',function(){panel.hidden=true;resetPicking();closePreview();});
  previewClose.addEventListener('click',closePreview);
  preview.addEventListener('click',function(event){if(event.target===preview)closePreview();});
  document.addEventListener('keydown',function(event){if(event.key==='Escape'&&!preview.hidden)closePreview();});
  pick.addEventListener('click',function(){
    openPanel();
    picking=!picking;
    pick.classList.toggle('active',picking);
    pick.textContent=picking?'请点击网页中的金额…':'🎯 手动点击网页金额查找';
    setHint(picking?'现在点击网页里要匹配的金额；也可以直接点击“补充回执单”。':'已退出取值模式。');
  });
  document.addEventListener('click',function(event){
    if(Date.now()<suppressPageClickUntil){suppressPageClickUntil=0;return;}
    suppressPageClickUntil=0;
    if(host.contains(event.target))return;
    const action=findReceiptActionElement(event.target);
    if(action){
      const query=extractQueryFromReceiptAction(action);
      resetPicking();
      if(!query.amount){
        openPanel();
        setHint('没有找到“报销金额合计”金额，请确认按钮和报销记录在同一行。',true);
        return;
      }
      lookup(query);
      return;
    }
    if(!picking)return;
    const query=core.extractQueryFromElement(event.target);
    if(!query.amount){openPanel();setHint('没有从这里识别出金额，请点击金额数字本身。',true);return;}
    event.preventDefault();
    event.stopPropagation();
    resetPicking();
    lookup(query);
  },true);
})();
