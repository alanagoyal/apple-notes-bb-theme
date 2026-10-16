// Run with bb browser-automation run SESSION --script-file THIS_FILE --script-host HOST.
// Isolated DOM fixtures exercise the live plugin without changing saved BB rows.
const page = await browser.getPage('main');
const result = await page.evaluate(async () => {
  const fixture = document.createElement('div');
  fixture.setAttribute('data-sidebar','content');
  fixture.style.cssText='position:fixed;left:-10000px;top:0;width:300px;opacity:0;pointer-events:none;';
  document.getElementById('root').append(fixture);
  const settle=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  let passed=0;
  const assert=(ok,label)=>{if(!ok)throw new Error(label);passed++;};
  const makeRow=i=>{
    const row=document.createElement('div');
    row.setAttribute('data-sidebar-rename-row','');row.tabIndex=0;
    row.style.cssText='position:relative;height:66px;margin-bottom:2px;';
    row.innerHTML=`<span><a data-sidebar-thread-id="separator-fixture-${i}"></a></span><button data-state="closed"></button>`;
    return row;
  };
  try {
    for(const layout of ['direct','pinned','windowed','mixed']) {
      fixture.replaceChildren();
      const rows=Array.from({length:5},(_,i)=>makeRow(i));
      const wrappers=rows.map((row,i)=>{
        if(layout==='direct')return row;
        const outer=document.createElement('div');
        if(layout==='windowed'||layout==='mixed'&&i%2)outer.setAttribute('data-sidebar-windowed-item','');
        const inner=document.createElement('div');inner.setAttribute('data-sidebar-sticky-group','');
        inner.append(row);outer.append(inner);return outer;
      });
      fixture.append(...wrappers);
      const reset=()=>rows.forEach(row=>{row.classList.remove('bb-sidebar-selected-row');row.removeAttribute('data-state');row.querySelector('button').setAttribute('data-state','closed');row.blur();});
      const check=async(index,label,previous=index-1)=>{
        await settle();
        rows.forEach((row,i)=>assert(getComputedStyle(row,'::after').opacity===(i===index||i===previous?'0':'1'),`${layout}/${label}: row ${i}`));
      };
      for(let index=0;index<rows.length;index++) {
        for(const mode of ['selected','row-menu','button-menu','keyboard']) {
          reset();const row=rows[index];
          if(mode==='selected')row.classList.add('bb-sidebar-selected-row');
          if(mode==='row-menu')row.setAttribute('data-state','open');
          if(mode==='button-menu')row.querySelector('button').setAttribute('data-state','open');
          if(mode==='keyboard'){row.focus({preventScroll:true});assert(row.matches(':focus-visible'),`${layout}: keyboard modality`);}
          await check(index,`${mode}/${index}`);
        }
      }
      reset();await settle();
      rows.forEach(row=>assert(getComputedStyle(row,'::after').opacity==='1',`${layout}: clear state`));
      const heading=document.createElement('div');heading.style.height='32px';
      fixture.insertBefore(heading,wrappers[2]);rows[2].classList.add('bb-sidebar-selected-row');
      await check(2,'section boundary',-1);heading.remove();
      reset();wrappers[1].remove();await settle();
      // Reorder/remount: the last highlighted row now precedes the first.
      fixture.prepend(wrappers[4]);rows[0].classList.add('bb-sidebar-selected-row');await settle();
      assert(getComputedStyle(rows[4],'::after').opacity==='0',`${layout}: reordered predecessor`);
      rows[0].classList.remove('bb-sidebar-selected-row');fixture.insertBefore(wrappers[1],wrappers[2]);
      wrappers[1].style.display='none';rows[2].classList.add('bb-sidebar-selected-row');await settle();
      assert(getComputedStyle(rows[0],'::after').opacity==='0',`${layout}: collapsed predecessor`);
      wrappers[1].style.display='';await settle();
      assert(getComputedStyle(rows[1],'::after').opacity==='0',`${layout}: remounted predecessor`);
      assert(getComputedStyle(rows[0],'::after').opacity==='1',`${layout}: stale predecessor cleared`);
    }
    return {passed};
  } finally { fixture.remove(); }
});
console.log(result);
