const p=await browser.getPage("main");
await p.evaluateOnNewDocument(()=>{
 window.notesFrames=[]; window.notesShifts=[];
 const selectors=['[data-sidebar="sidebar"]','[data-testid="app-nav-rail"]','[data-sidebar="footer"]','.an-search-mount','[data-an-note-row]','[data-sidebar="navigation-loading-row"]','.an-document-heading','[data-timeline-row-list="top-level"]','[aria-label="Loading thread"]','form[data-promptbox]'];
 new PerformanceObserver(l=>window.notesShifts.push(...l.getEntries().map(e=>({t:e.startTime,v:e.value,recent:e.hadRecentInput,s:e.sources?.map(s=>({node:s.node?.outerHTML.slice(0,250),old:s.previousRect,new:s.currentRect}))})))).observe({type:'layout-shift',buffered:true});
 let last='',start=performance.now();
 function tick(){const data=selectors.map(sel=>{const e=document.querySelector(sel); if(!e)return null;const r=e.getBoundingClientRect();return [sel,...['x','y','width','height'].map(k=>Math.round(r[k]*10)/10)]}); const key=JSON.stringify([document.documentElement.className,data]);if(last!==key){window.notesFrames.push({t:Math.round(performance.now()),cls:document.documentElement.className,data});last=key;}if(performance.now()-start<7000)requestAnimationFrame(tick)}
 requestAnimationFrame(tick);
});
await p.reload({waitUntil:"networkidle0"});
console.log(await p.evaluate(()=>({frames:window.notesFrames,shifts:window.notesShifts})));
