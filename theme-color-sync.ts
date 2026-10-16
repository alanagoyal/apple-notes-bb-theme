// Palette changes should paint together even when individual controls normally
// animate hover colors. Cancel only color transitions at a mode change; movement,
// disclosure, opacity and CSS loading animations keep their normal behavior.
function isPaletteTransition(animation: Animation): animation is CSSTransition {
  if (!(animation instanceof CSSTransition)) return false;
  const property = animation.transitionProperty;
  if (/color$|^(fill|stroke|box-shadow|text-shadow)$|^--tw-gradient-(from|via|to)$/.test(property)) return true;
  // Also cover plugin-registered custom color properties, including future ones.
  const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
  return property.startsWith('--') && target instanceof Element &&
    CSS.supports('color', getComputedStyle(target).getPropertyValue(property).trim());
}

export function installThemeColorSync(): () => void {
  const root = document.documentElement;
  let dark = root.classList.contains('dark');
  let frame = 0;
  const settleColors = () => {
    // getAnimations flushes pending style changes, including pseudo-elements,
    // so transitions can be cancelled in the mutation microtask before paint.
    // Cancelling a parent's inherited color can expose a child transition on
    // the next style flush. Drain those too, before yielding to the renderer.
    for (let pass = 0; pass < 8; pass++) {
      const palette = document.getAnimations().filter(isPaletteTransition);
      if (!palette.length) break;
      for (const animation of palette) animation.cancel();
    }
  };
  const observer = new MutationObserver(() => {
    const nextDark = root.classList.contains('dark');
    if (nextDark === dark) return;
    dark = nextDark;
    cancelAnimationFrame(frame);
    settleColors();
    // Theme subscribers can commit their own styles in the following frame.
    frame = requestAnimationFrame(() => {
      settleColors();
      frame = requestAnimationFrame(() => { settleColors(); frame = 0; });
    });
  });
  observer.observe(root, {attributes:true, attributeFilter:['class']});
  return () => { observer.disconnect(); cancelAnimationFrame(frame); };
}
