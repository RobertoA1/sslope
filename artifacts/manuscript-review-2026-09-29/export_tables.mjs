import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';
const dir=path.dirname(fileURLToPath(import.meta.url));
const data=JSON.parse(await fs.readFile(path.join(dir,'tables-export.json'),'utf8'));
const wb=Workbook.create();
const previews=path.join(dir,'excel-qa');await fs.mkdir(previews,{recursive:true});
const out=path.join(dir,'outputs','manuscript-review-2026-09-29');await fs.mkdir(out,{recursive:true});
function typed(v){
 if(/^[-+]?\d+[.,]\d+(?:e[-+]?\d+)?$/i.test(v))return Number(v.replace(',','.'));
 if(/^\d+$/.test(v))return Number(v);
 return v;
}
for(const item of data){
 const sh=wb.worksheets.add(`Tabla ${item.number}`);sh.showGridLines=false;
 const rows=item.rows.map((r,i)=>r.map(v=>i?typed(v):v));
 const n=rows.length,m=rows[0].length;
 sh.getRangeByIndexes(1,0,1,1).values=[[`Tabla ${item.number} ${item.title}`]];
 sh.getRangeByIndexes(1,0,1,m).format.font={name:'Arial',size:14,bold:true};
 const range=sh.getRangeByIndexes(4,0,n,m);range.values=rows;
 range.format.font={name:'Arial',size:11};range.format.wrapText=true;range.format.verticalAlignment='center';
 range.format.rowHeight=40;
 for(let c=0;c<m;c++){
  const col=sh.getRangeByIndexes(4,c,n,1);
  const numeric=rows.slice(1).every(r=>typeof r[c]==='number');
  col.format.columnWidth=numeric?18:(item.number<=2?38:27);
  if(numeric){col.format.horizontalAlignment='right';col.setNumberFormat(rows.slice(1).some(r=>r[c]>0&&r[c]<.001)?'0.00000000':'0');}
 }
 if(item.number<=2)range.format.rowHeight=item.number===2?96:72;
 if(item.number===5)range.format.rowHeight=64;
 const header=sh.getRangeByIndexes(4,0,1,m);header.format.fill='#EAEAEA';header.format.font={name:'Arial',size:11,bold:true,color:'#000000'};header.format.horizontalAlignment='center';header.format.rowHeight=42;
 header.format.borders={bottom:{style:'thin',color:'#888888'}};
 sh.getRangeByIndexes(2,0,1,m).format.font={name:'Arial',size:10,italic:true};
 sh.getRangeByIndexes(2,0,1,1).values=[['TA-01 semisintético. Valores archivados, no datos de mina ni cálculos nuevos.']];
 const sr=6+n;sh.getRangeByIndexes(sr,0,1,1).values=[['Fuente: '+item.source]];sh.getRangeByIndexes(sr,0,1,m).format.font={name:'Arial',size:10};
 sh.getRangeByIndexes(sr,0,1,m).merge();sh.getRangeByIndexes(sr,0,1,m).format.wrapText=true;sh.getRangeByIndexes(sr,0,1,m).format.rowHeight=35;
 sh.freezePanes.freezeRows(5);
}
wb.recalculate();
for(let i=0;i<data.length;i++){
 const name=`Tabla ${i+1}`;
 const inspect=await wb.inspect({kind:'table',range:`'${name}'!A5:F10`,include:'values,formulas',tableMaxRows:6,tableMaxCols:6,maxChars:2000});
 await fs.writeFile(path.join(previews,`Tabla_${i+1}.json`),inspect.ndjson);
 const render=await wb.render({sheetName:name,autoCrop:'all',scale:1.3,format:'png'});
 await fs.writeFile(path.join(previews,`Tabla_${i+1}.png`),new Uint8Array(await render.arrayBuffer()));
}
const errors=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!',options:{useRegex:true,maxResults:50},maxChars:1500});
console.log(errors.ndjson);
const xlsx=await SpreadsheetFile.exportXlsx(wb);await xlsx.save(path.join(out,'Tablas_articulo_TA01.xlsx'));
console.log('Excel exportado con seis tablas y valores tipados.');
