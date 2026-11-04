importScripts('core.js','storage.js','binary.js');

const core=globalThis.ReceiptCardPackCore;
const storage=globalThis.ReceiptCardPackStorage;
const binary=globalThis.ReceiptCardPackBinary;

function expectedPackPaths(pack){
  const paths=new Set();
  (pack?.cards||[]).forEach(function(card){
    Object.keys(card.files||{}).forEach(function(format){
      if(card.files[format])paths.add(card.files[format]);
    });
  });
  return paths;
}

async function handleReceiptCardPackMessage(message){
  if(message.type==='receipt-card-pack.lookup'){
    const pack=await storage.getActivePack();
    if(!pack)return {ok:true,pack:null,cards:[]};
    return {
      ok:true,
      pack:{packId:pack.packId,name:pack.name||pack.source?.pdfName||'回单卡包'},
      cards:core.searchCards(pack.cards||[],message.query||'')
    };
  }
  if(message.type==='receipt-card-pack.getAsset'){
    const pack=message.packId?await storage.getPack(message.packId):await storage.getActivePack();
    if(!pack)throw new Error('还没有导入回单卡包');
    const asset=await storage.getCardAsset(pack.packId,message.cardId,message.format||'jpg');
    return {ok:true,mime:asset.mime,fileName:asset.fileName,dataBase64:binary.bytesToBase64(asset.data)};
  }
  if(message.type==='receipt-card-pack.listPacks'){
    return {ok:true,packs:await storage.listPacks()};
  }
  if(message.type==='receipt-card-pack.setActivePack'){
    await storage.setActivePack(message.packId);
    return {ok:true};
  }
  if(message.type==='receipt-card-pack.importStart'){
    if(!core.validateManifest(message.manifest))throw new Error('这不是有效的回单卡包');
    await storage.putPackManifest(message.manifest,'syncing');
    return {ok:true,packId:message.manifest.packId};
  }
  if(message.type==='receipt-card-pack.importFile'){
    const pack=await storage.getPack(message.packId);
    if(!pack)throw new Error('找不到正在同步的回单卡包');
    if(!expectedPackPaths(pack).has(message.path))throw new Error('回单卡包文件不在清单中');
    await storage.putPackAsset(message.packId,message.path,binary.base64ToBytes(message.data));
    return {ok:true};
  }
  if(message.type==='receipt-card-pack.importComplete'){
    const ready=await storage.completePackImport(message.packId);
    await storage.setActivePack(ready.packId);
    return {ok:true,pack:{packId:ready.packId,name:ready.name||ready.source?.pdfName||'回单卡包'}};
  }
  if(message.type==='receipt-card-pack.importAbort'){
    await storage.deletePack(message.packId);
    return {ok:true};
  }
  return {ok:false,error:'未知的回单卡包操作'};
}

chrome.runtime.onMessage.addListener(function(message,sender,sendResponse){
  if(!message||typeof message.type!=='string'||!message.type.startsWith('receipt-card-pack.'))return;
  handleReceiptCardPackMessage(message)
    .then(sendResponse)
    .catch(function(error){sendResponse({ok:false,error:error.message||String(error)});});
  return true;
});
