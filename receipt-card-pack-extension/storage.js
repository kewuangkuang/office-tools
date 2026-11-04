(function(root, factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.ReceiptCardPackStorage=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const DB_NAME='receipt-card-pack-db';
  const DB_VERSION=1;

  function openDb(){
    return new Promise(function(resolve,reject){
      const request=indexedDB.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded=function(){
        const db=request.result;
        if(!db.objectStoreNames.contains('packs'))db.createObjectStore('packs',{keyPath:'packId'});
        if(!db.objectStoreNames.contains('assets'))db.createObjectStore('assets',{keyPath:'key'});
      };
      request.onsuccess=function(){resolve(request.result);};
      request.onerror=function(){reject(request.error||new Error('无法打开回单卡包存储'));};
    });
  }

  function requestResult(request){
    return new Promise(function(resolve,reject){
      request.onsuccess=function(){resolve(request.result);};
      request.onerror=function(){reject(request.error||new Error('回单卡包存储操作失败'));};
    });
  }

  function toArrayBuffer(data){
    if(data instanceof ArrayBuffer)return data.slice(0);
    if(ArrayBuffer.isView(data))return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
    throw new Error('回单卡包文件数据格式错误');
  }

  async function putPack(manifest,files){
    const db=await openDb();
    await new Promise(function(resolve,reject){
      const tx=db.transaction(['packs','assets'],'readwrite');
      const packs=tx.objectStore('packs');
      const assets=tx.objectStore('assets');
      packs.put(Object.assign({},manifest,{syncStatus:'ready'}));
      files.forEach(function(data,name){
        assets.put({
          key:manifest.packId+'::'+name,
          packId:manifest.packId,
          path:name,
          data:toArrayBuffer(data)
        });
      });
      tx.oncomplete=function(){resolve();};
      tx.onerror=function(){reject(tx.error||new Error('保存回单卡包失败'));};
      tx.onabort=function(){reject(tx.error||new Error('保存回单卡包失败'));};
    });
    db.close();
  }

  async function putPackManifest(manifest,status){
    const record=Object.assign({},manifest,{syncStatus:status||'syncing'});
    const db=await openDb();
    await new Promise(function(resolve,reject){
      const tx=db.transaction('packs','readwrite');
      tx.objectStore('packs').put(record);
      tx.oncomplete=function(){resolve();};
      tx.onerror=function(){reject(tx.error||new Error('保存回单卡包清单失败'));};
      tx.onabort=function(){reject(tx.error||new Error('保存回单卡包清单失败'));};
    });
    db.close();
  }

  async function putPackAsset(packId,path,data){
    if(!packId||!path)throw new Error('回单卡包文件缺少标识');
    const db=await openDb();
    await new Promise(function(resolve,reject){
      const tx=db.transaction('assets','readwrite');
      tx.objectStore('assets').put({
        key:packId+'::'+path,
        packId:packId,
        path:path,
        data:toArrayBuffer(data)
      });
      tx.oncomplete=function(){resolve();};
      tx.onerror=function(){reject(tx.error||new Error('保存回单卡包文件失败'));};
      tx.onabort=function(){reject(tx.error||new Error('保存回单卡包文件失败'));};
    });
    db.close();
  }

  async function listPackAssetPaths(packId){
    const db=await openDb();
    const assets=await requestResult(db.transaction('assets','readonly').objectStore('assets').getAll());
    db.close();
    return (assets||[]).filter(function(asset){return asset.packId===packId;}).map(function(asset){return asset.path;});
  }

  async function completePackImport(packId){
    const pack=await getPack(packId);
    if(!pack)throw new Error('找不到正在同步的回单卡包');
    const expected=[];
    (pack.cards||[]).forEach(function(card){
      Object.keys(card.files||{}).forEach(function(format){
        if(card.files[format])expected.push(card.files[format]);
      });
    });
    const available=new Set(await listPackAssetPaths(packId));
    const missing=expected.filter(function(path){return !available.has(path);});
    if(missing.length)throw new Error('卡包缺少 '+missing.length+' 个回单文件');
    const ready=Object.assign({},pack,{syncStatus:'ready'});
    const db=await openDb();
    await new Promise(function(resolve,reject){
      const tx=db.transaction('packs','readwrite');
      tx.objectStore('packs').put(ready);
      tx.oncomplete=function(){resolve();};
      tx.onerror=function(){reject(tx.error||new Error('完成回单卡包同步失败'));};
      tx.onabort=function(){reject(tx.error||new Error('完成回单卡包同步失败'));};
    });
    db.close();
    return ready;
  }

  async function listPacks(){
    const db=await openDb();
    const result=await requestResult(db.transaction('packs','readonly').objectStore('packs').getAll());
    db.close();
    return (result||[])
      .filter(function(pack){return pack.syncStatus!=='syncing';})
      .sort(function(a,b){return String(b.createdAt||'').localeCompare(String(a.createdAt||''));});
  }

  async function getPack(packId){
    const db=await openDb();
    const result=await requestResult(db.transaction('packs','readonly').objectStore('packs').get(packId));
    db.close();
    return result||null;
  }

  async function getActivePack(){
    const stored=await chrome.storage.local.get({receiptCardPackActiveId:''});
    if(stored.receiptCardPackActiveId){
      const selected=await getPack(stored.receiptCardPackActiveId);
      if(selected&&selected.syncStatus!=='syncing')return selected;
    }
    const packs=await listPacks();
    return packs[0]||null;
  }

  async function setActivePack(packId){
    await chrome.storage.local.set({receiptCardPackActiveId:packId||''});
  }

  async function getCardAsset(packId,cardId,format){
    const pack=await getPack(packId);
    if(!pack)throw new Error('找不到当前回单卡包');
    const card=(pack.cards||[]).find(function(item){return item.id===cardId;});
    if(!card)throw new Error('找不到这张回单卡');
    const path=card.files&&card.files[format];
    if(!path)throw new Error('这张回单没有可用的'+String(format||'附件')+'文件');
    const db=await openDb();
    const asset=await requestResult(db.transaction('assets','readonly').objectStore('assets').get(packId+'::'+path));
    db.close();
    if(!asset)throw new Error('回单文件内容不存在：'+path);
    const mime=format==='pdf'?'application/pdf':'image/jpeg';
    return {data:asset.data,mime,fileName:(card.displayName||card.originalName||card.id)+'.'+format};
  }

  async function deletePack(packId){
    const db=await openDb();
    await new Promise(function(resolve,reject){
      const tx=db.transaction(['packs','assets'],'readwrite');
      tx.objectStore('packs').delete(packId);
      const cursorRequest=tx.objectStore('assets').openCursor();
      cursorRequest.onsuccess=function(event){
        const cursor=event.target.result;
        if(!cursor)return;
        if(String(cursor.key).startsWith(packId+'::'))cursor.delete();
        cursor.continue();
      };
      tx.oncomplete=function(){resolve();};
      tx.onerror=function(){reject(tx.error||new Error('删除回单卡包失败'));};
    });
    db.close();
    const stored=await chrome.storage.local.get({receiptCardPackActiveId:''});
    if(stored.receiptCardPackActiveId===packId)await setActivePack('');
  }

  return {putPack,putPackManifest,putPackAsset,completePackImport,listPacks,getPack,getActivePack,setActivePack,getCardAsset,deletePack};
});
