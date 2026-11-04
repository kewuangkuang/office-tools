(function(root, factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.ReceiptCardPackCore=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  function cleanText(value){
    return String(value==null?'':value)
      .replace(/[０-９]/g,function(ch){return String.fromCharCode(ch.charCodeAt(0)-0xfee0);})
      .replace(/[，,]/g,'')
      .replace(/[￥¥]/g,'¥')
      .replace(/\u00a0/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function normalizeToken(token){
    let value=cleanText(token).replace(/^¥/,'').replace(/元$/,'').trim();
    if(!/^\d+(?:\.\d+)?$/.test(value))return '';
    const parts=value.split('.');
    let integer=parts[0].replace(/^0+(?=\d)/,'')||'0';
    let fraction=parts[1]||'';
    if(fraction.length>2){
      const rounded=Number(value);
      if(!Number.isFinite(rounded))return '';
      return rounded.toFixed(2);
    }
    fraction=(fraction+'00').slice(0,2);
    return integer+'.'+fraction;
  }

  function amountCandidates(text){
    const source=cleanText(text);
    const candidates=[];
    const dateRanges=[];
    const dateRe=/(?:\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{4}年\d{1,2}月\d{1,2}日?)/g;
    let dateMatch;
    while((dateMatch=dateRe.exec(source)))dateRanges.push({start:dateMatch.index,end:dateRe.lastIndex});
    const re=/(¥\s*)?(\d+(?:\.\d{1,4})?)/g;
    let match;
    while((match=re.exec(source))){
      const start=match.index;
      const end=re.lastIndex;
      if(dateRanges.some(function(range){return start>=range.start&&end<=range.end;}))continue;
      const raw=match[0];
      const before=source.slice(Math.max(0,start-16),start);
      const after=source.slice(end,end+4);
      if(/[年月日号页%]/.test(after))continue;
      const normalized=normalizeToken(raw);
      if(!normalized)continue;
      let score=0;
      if(match[1])score+=8;
      if(/金额|合计|报销|应付|实付|付款|支付/.test(before))score+=5;
      if(/\./.test(raw))score+=4;
      if(/,/.test(raw))score+=2;
      if(/元/.test(after))score+=2;
      if(/^\d{1,2}$/.test(raw)&&score===0)score-=3;
      candidates.push({normalized,score,start});
    }
    return candidates.sort(function(a,b){return b.score-a.score||a.start-b.start;});
  }

  function normalizeAmount(value){
    const candidates=amountCandidates(value);
    return candidates.length?candidates[0].normalized:'';
  }

  function extractAmountFromText(value){
    const candidates=amountCandidates(value);
    if(!candidates.length)return '';
    const best=candidates[0];
    return best.score>=0?best.normalized:'';
  }

  function isReceiptAmountHeader(value){
    return /报销金额合计/.test(cleanText(value).replace(/\s+/g,''));
  }

  function extractReceiptAmountFromTable(headers,cells,rowText){
    const headerList=Array.isArray(headers)?headers:[];
    const cellList=Array.isArray(cells)?cells:[];
    const amountIndex=headerList.findIndex(isReceiptAmountHeader);
    if(amountIndex>=0){
      const amount=extractAmountFromText(cellList[amountIndex]||'');
      if(amount)return amount;
    }
    return extractAmountFromText(rowText);
  }

  function amountToCents(value){
    const normalized=normalizeAmount(value);
    if(!normalized)return null;
    const parts=normalized.split('.');
    const cents=Number(parts[0])*100+Number(parts[1]||0);
    return Number.isSafeInteger(cents)?cents:null;
  }

  function combinedAmountMatches(cards,targetAmount){
    const targetCents=amountToCents(targetAmount);
    if(targetCents===null)return [];
    const matches=[];
    for(let leftIndex=0;leftIndex<cards.length;leftIndex++){
      const leftCents=amountToCents(cards[leftIndex]&&cards[leftIndex].amount);
      if(leftCents===null)continue;
      for(let rightIndex=leftIndex+1;rightIndex<cards.length;rightIndex++){
        const rightCents=amountToCents(cards[rightIndex]&&cards[rightIndex].amount);
        if(rightCents===null||leftCents+rightCents!==targetCents)continue;
        const pair=[cards[leftIndex],cards[rightIndex]];
        const cardIds=pair.map(function(card){return card&&card.id;});
        const amounts=pair.map(function(card){return normalizeAmount(card&&card.amount)||'未识别';}).join(' + ');
        matches.push({
          id:'combined:'+cardIds.join('+'),
          amount:normalizeAmount(targetAmount),
          matchType:'combined-amount',
          cardIds,
          cards:pair.map(function(card){return Object.assign({},card);}),
          displayName:'合计 '+normalizeAmount(targetAmount)+'（'+amounts+'）',
          name:'合计 '+normalizeAmount(targetAmount)
        });
      }
    }
    return matches;
  }

  function cardSearchText(card){
    return [card.name,card.fileName,card.amount,card.date,card.payer,card.payee,card.serial]
      .filter(Boolean).join(' ').toLocaleLowerCase();
  }

  function searchCards(cards, query){
    const list=Array.isArray(cards)?cards:[];
    const rawQuery=typeof query==='object'&&query!==null?(query.amount||query.text||''):query;
    const amount=normalizeAmount(rawQuery);
    if(amount){
      const exactMatches=list.filter(function(card){
        return normalizeAmount(card&&card.amount)===amount;
      }).map(function(card){
        return Object.assign({},card,{matchType:'exact-amount'});
      });
      return exactMatches.concat(combinedAmountMatches(list,amount));
    }

    const text=cleanText(rawQuery).toLocaleLowerCase();
    if(!text)return [];
    return list.filter(function(card){return cardSearchText(card).includes(text);})
      .map(function(card){return Object.assign({},card,{matchType:'text'});});
  }

  function extractQueryFromElement(element){
    const ownText=element&&element.textContent?String(element.textContent).trim():'';
    let row=element;
    let rowText=ownText;
    for(let i=0;i<6&&row;i++,row=row.parentElement){
      if(row.matches&&row.matches('tr,[role="row"],.el-table__row,.ant-table-row,li')){
        rowText=String(row.textContent||'').trim();
        break;
      }
    }
    const amount=extractAmountFromText(ownText)||extractAmountFromText(rowText);
    return {amount,clickedText:ownText,rowText};
  }

  function validateManifest(manifest){
    return !!(manifest&&manifest.schema==='receipt-card-pack'&&manifest.version===1&&Array.isArray(manifest.cards));
  }

  return {
    normalizeAmount,
    extractAmountFromText,
    extractReceiptAmountFromTable,
    extractQueryFromElement,
    searchCards,
    validateManifest
  };
});
