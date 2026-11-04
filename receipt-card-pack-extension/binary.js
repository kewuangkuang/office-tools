(function(root, factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.ReceiptCardPackBinary=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  function toBytes(data){
    if(data instanceof Uint8Array)return data;
    if(data instanceof ArrayBuffer)return new Uint8Array(data);
    if(ArrayBuffer.isView(data))return new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
    if(Array.isArray(data))return new Uint8Array(data);
    throw new Error('附件数据格式错误');
  }

  function bytesToBase64(data){
    const bytes=toBytes(data);
    if(typeof btoa==='function'){
      let binary='';
      for(let offset=0;offset<bytes.length;offset+=0x8000){
        binary+=String.fromCharCode.apply(null,bytes.subarray(offset,offset+0x8000));
      }
      return btoa(binary);
    }
    if(typeof Buffer!=='undefined')return Buffer.from(bytes).toString('base64');
    throw new Error('当前环境不支持 Base64 编码');
  }

  function base64ToBytes(value){
    if(typeof value!=='string')throw new Error('附件 Base64 数据格式错误');
    if(typeof atob==='function'){
      const binary=atob(value);
      const bytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      return bytes;
    }
    if(typeof Buffer!=='undefined')return new Uint8Array(Buffer.from(value,'base64'));
    throw new Error('当前环境不支持 Base64 解码');
  }

  return {bytesToBase64,base64ToBytes};
});
