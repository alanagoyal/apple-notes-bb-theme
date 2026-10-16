// Run on an already-loaded BB surface:
// bb browser-automation run SESSION --script-file ABSOLUTE_PATH --script-host HOST --json
// Uses the installed fix; injects no stylesheet, observer, or animation patch.
const page = await browser.getPage('main');
const result = await page.evaluate(async () => {
  const isPalette = a => a instanceof CSSTransition &&
    (/color$|^(fill|stroke|box-shadow|text-shadow)$|^--tw-gradient-(from|via|to)$/.test(a.transitionProperty) ||
      (a.transitionProperty.startsWith('--') && a.effect?.target instanceof Element &&
        CSS.supports('color', getComputedStyle(a.effect.target).getPropertyValue(a.transitionProperty).trim())));
  const frame = () => new Promise(requestAnimationFrame);
  const setMode = mode => {
    const oldValue = localStorage.getItem('bb.theme');
    localStorage.setItem('bb.theme', mode);
    window.dispatchEvent(new StorageEvent('storage', {key:'bb.theme', oldValue, newValue:mode, storageArea:localStorage}));
  };
  const all = [...document.querySelectorAll('*')];
  const targets = all.filter(e => {
    const c = getComputedStyle(e);
    return c.transitionDuration.split(',').some(t => parseFloat(t) > 0) ||
      e.matches('body,[data-sidebar],form,button,input,[data-markdown-preview],[role=menu],[role=dialog]');
  });
  const properties = ['color','backgroundColor','borderTopColor','borderRightColor','borderBottomColor','borderLeftColor','outlineColor','fill','stroke','boxShadow','textShadow'];
  const colors = () => targets.map(e => [null,'::before','::after'].map(p => {
    const c = getComputedStyle(e,p);
    return properties.map(k => c[k]).join('|');
  }).join(';'));
  const results = [];
  for (const mode of ['dark','light','dark','light']) {
    setMode(mode);
    await Promise.resolve();
    const microtaskTransitions = document.getAnimations().filter(isPalette).length;
    await frame();
    const first = colors();
    let transitions = document.getAnimations().filter(isPalette).length;
    const start = performance.now();
    let frames = 1;
    while (performance.now() - start < 230) {
      await frame(); frames++;
      transitions += document.getAnimations().filter(isPalette).length;
    }
    const final = colors();
    const drift = targets.filter((e,i) => e.isConnected && first[i] !== final[i]);
    results.push({mode,frames,microtaskTransitions,transitions,drift:drift.map(e => ({tag:e.tagName,text:e.textContent.slice(0,50)}))});
  }
  for (let i=0; i<8; i++) { setMode(i%2 ? 'light':'dark'); await Promise.resolve(); }
  await frame();
  const rapidTransitions = document.getAnimations().filter(isPalette).length;
  return {url:location.href,elements:all.length,audited:targets.length,pseudoElements:targets.length*2,results,rapidTransitions};
});
console.log(JSON.stringify(result));
if (result.rapidTransitions || result.results.some(r => r.microtaskTransitions || r.transitions || r.drift.length)) {
  throw new Error('Theme color synchronization regression');
}
