/** Fit schematic to the frame using real pixel bounds (reliable on mobile Safari). */

import { SCHEMATIC_VIEW_BOX, VIEW_H, VIEW_W } from './plumbing-graph.js';

export function applySchematicViewBox() {
  const svg = document.getElementById('schematic-svg');
  if (!svg) return;
  const { x, y, width, height } = SCHEMATIC_VIEW_BOX;
  svg.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
}

export function fitSchematic() {
  const frame = document.querySelector('.schematic-frame');
  const svg = document.getElementById('schematic-svg');
  if (!frame || !svg) return false;

  applySchematicViewBox();

  const { width, height } = frame.getBoundingClientRect();
  if (width < 1 || height < 1) return false;

  const scale = Math.min(width / VIEW_W, height / VIEW_H);
  const w = Math.round(VIEW_W * scale);
  const h = Math.round(VIEW_H * scale);

  svg.style.width = `${w}px`;
  svg.style.height = `${h}px`;
  svg.style.maxWidth = '100%';
  svg.style.maxHeight = '100%';
  return true;
}

function scheduleFit() {
  requestAnimationFrame(() => {
    if (!fitSchematic()) retryFit(16);
  });
}

let retryTimer = null;

function retryFit(attemptsLeft) {
  if (attemptsLeft <= 0) return;
  if (fitSchematic()) return;
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => retryFit(attemptsLeft - 1), 50);
}

export function bindSchematicFit() {
  const frame = document.querySelector('.schematic-frame');
  const panel = document.querySelector('.viewport-panel');
  if (!frame) return;

  const onResize = () => scheduleFit();

  scheduleFit();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 150));
  window.addEventListener('load', onResize, { once: true });
  window.visualViewport?.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('scroll', onResize);
  document.fonts?.ready?.then(onResize);

  const ro = new ResizeObserver(onResize);
  ro.observe(frame);
  if (panel) ro.observe(panel);

  if (document.readyState === 'complete') onResize();
}
