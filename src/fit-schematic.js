/** Size the schematic from the real panel box (CSS alone is unreliable on iOS). */

const VIEW_W = 900;
const VIEW_H = 680;
const ASPECT = VIEW_W / VIEW_H;

/** Portrait: target fraction of panel height; max scale vs width-fit baseline. */
const PORTRAIT_HEIGHT_GOAL = 0.78;
const PORTRAIT_MAX_SCALE = 1.42;

export function fitSchematic() {
  const panel = document.querySelector('.viewport-panel');
  const svg = document.getElementById('schematic-svg');
  if (!panel || !svg) return;

  const availW = panel.clientWidth;
  const availH = panel.clientHeight;
  if (availW < 1 || availH < 1) return;

  let w = availW;
  let h = w / ASPECT;
  const portrait = availH > availW;

  if (portrait) {
    const scale = Math.min(PORTRAIT_MAX_SCALE, (availH * PORTRAIT_HEIGHT_GOAL) / h);
    w *= scale;
    h *= scale;
    if (h > availH) {
      h = availH;
      w = h * ASPECT;
    }
    const scrollX = w > availW + 2;
    panel.style.overflowX = scrollX ? 'auto' : 'hidden';
    panel.style.justifyContent = scrollX ? 'flex-start' : 'center';
  } else {
    if (h > availH) {
      h = availH;
      w = h * ASPECT;
    }
    const cap = Math.min(VIEW_W, availW);
    if (w > cap) {
      w = cap;
      h = w / ASPECT;
    }
    panel.style.overflowX = 'hidden';
    panel.style.justifyContent = 'center';
  }

  svg.style.width = `${Math.round(w)}px`;
  svg.style.height = `${Math.round(h)}px`;
}

export function bindSchematicFit() {
  const panel = document.querySelector('.viewport-panel');
  if (!panel) return;

  const run = () => requestAnimationFrame(fitSchematic);
  run();
  window.addEventListener('resize', run);
  window.addEventListener('orientationchange', () => setTimeout(run, 100));
  window.visualViewport?.addEventListener('resize', run);
  new ResizeObserver(run).observe(panel);
}
