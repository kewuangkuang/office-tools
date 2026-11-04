(function(root, factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.ReceiptCardPackZipReader=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  function u16(bytes,offset){return bytes[offset]|(bytes[offset+1]<<8);}
  function u32(bytes,offset){return (bytes[offset]|(bytes[offset+1]<<8)|(bytes[offset+2]<<16)|(bytes[offset+3]<<24))>>>0;}
  function isUnsafePath(name){
    return !name||name.startsWith('/')||name.split('/').includes('..')||name.includes('\\');
  }

  function readStoreZip(input){
    const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
    const files=new Map();
    const decoder=new TextDecoder();
    let offset=0;
    while(offset+4<=bytes.length){
      const signature=u32(bytes,offset);
      if(signature===0x02014b50||signature===0x06054b50)break;
      if(signature!==0x04034b50)throw new Error('卡包不是办公工具箱生成的无压缩 ZIP');
      if(offset+30>bytes.length)throw new Error('卡包文件头不完整');
      const flags=u16(bytes,offset+6);
      const method=u16(bytes,offset+8);
      const compressedSize=u32(bytes,offset+18);
      const nameLength=u16(bytes,offset+26);
      const extraLength=u16(bytes,offset+28);
      const nameStart=offset+30;
      const dataStart=nameStart+nameLength+extraLength;
      const name=decoder.decode(bytes.subarray(nameStart,nameStart+nameLength));
      if(flags&0x0008)throw new Error('卡包使用了暂不支持的数据描述符');
      if(method!==0)throw new Error('卡包使用了暂不支持的压缩方式');
      if(isUnsafePath(name))throw new Error('卡包包含不安全的文件路径');
      const dataEnd=dataStart+compressedSize;
      if(dataEnd>bytes.length)throw new Error('卡包内容不完整');
      if(files.has(name))throw new Error('卡包包含重复文件：'+name);
      files.set(name,bytes.slice(dataStart,dataEnd));
      offset=dataEnd;
    }
    if(!files.size)throw new Error('卡包里没有可读取的文件');
    return files;
  }

  function readCardPackZip(input){
    const files=readStoreZip(input);
    const manifestBytes=files.get('manifest.json');
    if(!manifestBytes)throw new Error('卡包缺少 manifest.json');
    let manifest;
    try{manifest=JSON.parse(new TextDecoder().decode(manifestBytes));}
    catch(error){throw new Error('卡包清单无法读取：'+error.message);}
    return {manifest,files};
  }

  return {readStoreZip,readCardPackZip};
});
