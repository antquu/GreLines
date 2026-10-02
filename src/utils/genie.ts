export interface GenieTarget {
  x: number;
  y: number;
  width: number;
}

const STRIPS = 56;
const DURATION_MS = 700;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeIn = (t: number) => t * t * t;
const funnel = (s: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01((s - 0.08) / 0.62));

export function playGenie(source: HTMLElement, target: GenieTarget, zIndex = 49): Promise<void> {
  const rect = source.getBoundingClientRect();
  const W = source.offsetWidth || rect.width;
  const H = source.offsetHeight || rect.height;
  const L = rect.left + (rect.width - W) / 2;
  const T = rect.top + (rect.height - H) / 2;
  if (W < 1 || H < 1) return Promise.resolve();

  const scrolled = [...source.querySelectorAll<HTMLElement>('*')]
    .map((node, index) => ({ index, top: node.scrollTop, left: node.scrollLeft }))
    .filter(entry => entry.top || entry.left);

  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:${zIndex};overflow:hidden;contain:strict;`;

  const stripHeight = H / STRIPS;
  const strips: HTMLElement[] = [];
  for (let i = 0; i < STRIPS; i++) {
    const strip = document.createElement('div');
    strip.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${stripHeight + 1}px;overflow:hidden;transform-origin:0 0;will-change:transform;`;
    const copy = source.cloneNode(true) as HTMLElement;
    copy.removeAttribute('id');
    copy.style.cssText += `;position:absolute;left:0;top:${-i * stripHeight}px;width:${W}px;height:${H}px;margin:0;transform:none;opacity:1;transition:none;`;
    strip.appendChild(copy);
    layer.appendChild(strip);
    strips.push(strip);
  }
  document.body.appendChild(layer);

  for (const strip of strips) {
    const nodes = strip.firstElementChild?.querySelectorAll<HTMLElement>('*');
    if (!nodes) continue;
    for (const entry of scrolled) {
      const node = nodes[entry.index];
      if (node) {
        node.scrollTop = entry.top;
        node.scrollLeft = entry.left;
      }
    }
  }

  const span = Math.max(1, target.y - T);
  const dockLeft = target.x - target.width / 2;
  const dockRight = target.x + target.width / 2;

  const draw = (t: number) => {
    const bend = easeInOut(clamp01(t / 0.5));
    const slide = easeIn(clamp01((t - 0.22) / 0.78));
    const travel = slide * (target.y - T + 4);

    for (let i = 0; i < STRIPS; i++) {
      const strip = strips[i];
      const y = T + i * stripHeight + travel;
      if (y >= target.y) {
        strip.style.visibility = 'hidden';
        continue;
      }
      const edges = (yy: number) => {
        const shape = funnel((yy - T) / span) * bend;
        return [L + (dockLeft - L) * shape, L + W + (dockRight - (L + W)) * shape];
      };
      const [topLeft, topRight] = edges(y);
      const [left, right] = edges(y + stripHeight / 2);
      const [bottomLeft, bottomRight] = edges(y + stripHeight);
      const scaleX = Math.max(0.001, (right - left) / W);
      const local = (x: number) => ((x - left) / scaleX).toFixed(2);
      strip.style.clipPath = `polygon(${local(topLeft)}px 0, ${local(topRight)}px 0, ${local(bottomRight)}px ${stripHeight + 1}px, ${local(bottomLeft)}px ${stripHeight + 1}px)`;
      strip.style.visibility = 'visible';
      strip.style.transform = `translate(${left}px, ${y}px) scaleX(${scaleX})`;
    }
  };

  draw(0);

  return new Promise(resolve => {
    const start = performance.now();
    const step = (now: number) => {
      const t = clamp01((now - start) / DURATION_MS);
      draw(t);
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        layer.remove();
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}
