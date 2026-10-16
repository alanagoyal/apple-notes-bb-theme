/** Hold the submitted canvas across the new-note -> thread route handoff. */
let cancelHandoff: (() => void) | undefined;

export function cancelNoteHandoff() { cancelHandoff?.(); }

export function beginNoteHandoff() {
  cancelNoteHandoff();
  const source = document.querySelector<HTMLElement>('#root-compose-main-panel');
  const editor = source?.querySelector<HTMLElement>('#root-compose-prompt');
  if (!source || !editor?.textContent?.trim()) return;

  // Freeze presentation only. No duplicate native controls, IDs, or plugin hooks
  // remain in the snapshot, and it is never exposed to keyboard/accessibility.
  const bounds = source.getBoundingClientRect();
  const snapshot = source.cloneNode(true) as HTMLElement;
  const originals = [source, ...Array.from(source.querySelectorAll('*'))];
  const copies = [snapshot, ...Array.from(snapshot.querySelectorAll('*'))];
  originals.forEach((original, i) => {
    const copy = copies[i] as HTMLElement | SVGElement;
    if (copy !== snapshot && !snapshot.contains(copy)) return;
    const style = getComputedStyle(original);
    // Hidden mobile recents and picker menus need no frozen copy.
    if (style.display === 'none') { copy.remove(); return; }
    copy.style.cssText = Array.from(style, key => `${key}:${style.getPropertyValue(key)};`).join('');
    for (const attr of Array.from(copy.attributes)) {
      if (attr.name === 'id' || attr.name === 'class' || attr.name.startsWith('data-') || attr.name.startsWith('aria-') || ['contenteditable','autofocus','tabindex'].includes(attr.name)) copy.removeAttribute(attr.name);
    }
    copy.style.setProperty('animation', 'none', 'important');
    copy.style.setProperty('transition', 'none', 'important');
    copy.style.setProperty('caret-color', 'transparent', 'important');
  });
  const cover = document.createElement('div');
  cover.dataset.anNoteHandoff = '';
  cover.inert = true;
  cover.setAttribute('aria-hidden', 'true');
  Object.assign(cover.style, {
    position:'fixed', left:`${bounds.left}px`, top:`${bounds.top}px`,
    width:`${bounds.width}px`, height:`${bounds.height}px`,
    overflow:'hidden', zIndex:'40', pointerEvents:'none',
    background:getComputedStyle(document.body).getPropertyValue('--background'),
  });
  Object.assign(snapshot.style, {position:'absolute',inset:'0',width:'100%',height:'100%',margin:'0'});
  cover.append(snapshot);
  let frame = 0;
  let finishing = false;
  let attached = false;
  const startPath = location.pathname;
  const clean = () => {
    observer.disconnect(); cancelAnimationFrame(frame); clearTimeout(timeout);
    window.removeEventListener('resize', clean);
    cover.remove();
    if (cancelHandoff === clean) cancelHandoff = undefined;
  };
  cancelHandoff = clean;
  const sync = () => {
    if (finishing) return;
    // Failed/routed submissions leave the original editable canvas intact.
    if (!attached && (!source.isConnected || !editor.textContent?.trim())) {
      attached = true;
      document.body.append(cover);
    }
    if (!attached) return;
    if (location.pathname !== startPath && !location.pathname.includes('/threads/')) { clean(); return; }
    const heading = document.querySelector<HTMLElement>('[data-an-initial-ready] > .an-document-heading');
    if (!source.isConnected && heading?.querySelector('h1') && getComputedStyle(heading).visibility === 'visible') {
      finishing = true;
      observer.disconnect();
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) { clean(); return; }
      cover.animate([{opacity:1},{opacity:0}], {duration:180,easing:'ease-out',fill:'forwards'}).finished.then(clean, clean);
    }
  };
  const observer = new MutationObserver(() => {
    // Attach before the next paint, including the frame the native editor clears.
    sync();
    if (!frame && !finishing) frame = requestAnimationFrame(() => {frame = 0; sync();});
  });
  observer.observe(document.getElementById('root') || document.body, {childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['data-an-initial-ready']});
  const timeout = window.setTimeout(clean, 8000);
  window.addEventListener('resize', clean);
}
