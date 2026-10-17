export function installNewNoteFocus(): () => void {
  if (window.matchMedia('(pointer: coarse)').matches) return () => {};
  let surface: HTMLElement | null = null;
  let frame = 0;
  let pending = false;
  let deadline = 0;
  const root = document.getElementById('root') || document.body;
  const cancel = () => {
    pending = false;
    cancelAnimationFrame(frame);
    frame = 0;
  };
  const focus = () => {
    frame = 0;
    if (!pending || !surface?.isConnected) return;
    if (performance.now() >= deadline) { cancel(); return; }
    const input = surface.querySelector<HTMLElement>('#root-compose-prompt');
    if (input && input.isContentEditable && !input.closest('[inert], [aria-hidden="true"]') && getComputedStyle(input).visibility === 'visible' && input.getBoundingClientRect().width > 0) {
      input.focus({preventScroll:true});
      if (document.activeElement === input) {
        pending = false;
        return;
      }
    }
    frame = requestAnimationFrame(focus);
  };
  const sync = () => {
    const next = Array.from(root.querySelectorAll<HTMLElement>('#root-compose-main-panel')).find(panel => panel.closest('[data-focused="false"], [aria-hidden="true"], [inert]') === null) ?? null;
    if (next !== surface) {
      cancel();
      surface = next;
      if (!surface) return;
      const active = document.activeElement;
      const keepsFocus = active instanceof HTMLElement && active !== document.body && active !== document.documentElement && !surface.contains(active) && active.matches('input,textarea,select,[contenteditable="true"],[role="combobox"]');
      pending = !keepsFocus;
      deadline = performance.now() + 2000;
    }
    if (pending && !frame) frame = requestAnimationFrame(focus);
  };
  const observer = new MutationObserver(sync);
  observer.observe(root, {childList:true, subtree:true, attributes:true, attributeFilter:['data-an-initial-ready','data-focused','aria-hidden','inert','contenteditable']});
  document.addEventListener('pointerdown', cancel, true);
  document.addEventListener('keydown', cancel, true);
  sync();
  return () => {
    observer.disconnect();
    document.removeEventListener('pointerdown', cancel, true);
    document.removeEventListener('keydown', cancel, true);
    cancel();
    surface = null;
  };
}
