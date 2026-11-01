import { COLS, ROWS, type CmdTerminal } from './cmdTerminal';

export const SCREEN_WIDTH = 1024;
export const SCREEN_HEIGHT = 738;

const BACKGROUND = '#0c0d0c';
const INK = '#d9e6d4';
const PAD_X = 40;
const PAD_Y = 44;

export function drawScreen(canvas: HTMLCanvasElement, terminal: CmdTerminal, blink: boolean) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const cellWidth = (SCREEN_WIDTH - PAD_X * 2) / COLS;
  const lineHeight = (SCREEN_HEIGHT - PAD_Y * 2) / ROWS;

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

  ctx.font = `${Math.floor(cellWidth / 0.6)}px Consolas, "DejaVu Sans Mono", Menlo, monospace`;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(190, 255, 190, 0.35)';
  ctx.shadowBlur = 6;

  terminal.lines(blink).forEach((line, index) => {
    const y = PAD_Y + index * lineHeight;
    if (line.inverse) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = INK;
      ctx.fillRect(PAD_X, y + 2, SCREEN_WIDTH - PAD_X * 2, lineHeight - 4);
      ctx.fillStyle = BACKGROUND;
    } else {
      ctx.shadowBlur = 6;
      ctx.fillStyle = INK;
    }
    // draw char by char so box lines stay on the grid whatever the font
    [...line.text].forEach((char, column) => {
      if (char !== ' ') ctx.fillText(char, PAD_X + column * cellWidth, y + lineHeight / 2);
    });
  });

  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  for (let y = 0; y < SCREEN_HEIGHT; y += 4) ctx.fillRect(0, y, SCREEN_WIDTH, 2);

  const glow = ctx.createRadialGradient(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2, SCREEN_HEIGHT * 0.2, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2, SCREEN_WIDTH * 0.7);
  glow.addColorStop(0, 'rgba(0, 0, 0, 0)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
}
