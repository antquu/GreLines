export interface CardScanResult {
  cardCode?: string;
  firstName?: string;
  lastName?: string;
  photo?: Blob;
  rawText: string;
}

function extractCardCode(text: string): string | undefined {
  const normalized = text
    .replace(/[OoQ]/g, '0')
    .replace(/[IilL|]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8');

  const labelled = normalized.match(/N[°ºo]?\s*de\s*carte\s*:?\s*([\d\s]{10,20})/i);
  const candidates: string[] = [];
  if (labelled) candidates.push(labelled[1]);
  candidates.push(...(normalized.match(/[\d][\d\s]{9,20}/g) ?? []));

  for (const candidate of candidates) {
    const digits = candidate.replace(/\D/g, '');
    if (digits.length >= 10) return digits.slice(0, 10);
  }
  return undefined;
}

function extractName(text: string): { firstName?: string; lastName?: string } {
  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const validityIndex = lines.findIndex(line => /date\s+de\s+fin/i.test(line));
  const before = validityIndex > 0 ? lines.slice(0, validityIndex) : lines;

  const names = before.filter(line => (
    /^[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ'’\- ]{1,28}$/.test(line)
    && !/(REGION|RHONE|ALPES|SMMAG|TAG|MOBILIT|CARTE|VALID)/i.test(line)
  ));

  if (names.length === 0) return {};
  if (names.length === 1) return { lastName: names[0] };
  const [firstName, lastName] = names.slice(-2);
  return { firstName, lastName };
}

async function cropPortrait(source: HTMLCanvasElement): Promise<Blob | undefined> {
  const { width, height } = source;
  const box = {
    x: Math.round(width * 0.085),
    y: Math.round(height * 0.10),
    w: Math.round(width * 0.20),
    h: Math.round(height * 0.38),
  };
  const canvas = document.createElement('canvas');
  canvas.width = box.w;
  canvas.height = box.h;
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  context.drawImage(source, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob ?? undefined), 'image/jpeg', 0.9);
  });
}



const SAMPLE_WIDTH = 48;
const SAMPLE_HEIGHT = 32;

const STILL_THRESHOLD = 3.2;
const MOVED_THRESHOLD = 6;
const CONTENT_THRESHOLD = 9;
const STILL_TICKS = 3;
const SAMPLE_INTERVAL_MS = 100;
const MOTION_GRACE_MS = 2500;

function grayscaleSample(video: HTMLVideoElement, canvas: HTMLCanvasElement): Uint8Array | null {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || !video.videoWidth) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const gray = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < gray.length; i += 1) {
    const offset = i * 4;
    gray[i] = (data[offset] * 77 + data[offset + 1] * 150 + data[offset + 2] * 29) >> 8;
  }
  return gray;
}

function meanAbsoluteDifference(a: Uint8Array, b: Uint8Array): number {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += Math.abs(a[i] - b[i]);
  return total / a.length;
}

function standardDeviation(values: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) sum += values[i];
  const mean = sum / values.length;
  let variance = 0;
  for (let i = 0; i < values.length; i += 1) variance += (values[i] - mean) ** 2;
  return Math.sqrt(variance / values.length);
}

export interface SteadyFrameOptions {
  cancelled?: () => boolean;
  timeoutMs?: number;
  requireMotionFirst?: boolean;
  manualCapture?: () => boolean;
}

export async function waitForSteadyFrame(
  video: HTMLVideoElement,
  options: SteadyFrameOptions = {},
): Promise<boolean> {
  const { cancelled = () => false, timeoutMs = 15000, requireMotionFirst = false, manualCapture = () => false } = options;

  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_WIDTH;
  canvas.height = SAMPLE_HEIGHT;

  const startedAt = Date.now();
  let previous: Uint8Array | null = null;
  let stillTicks = 0;
  let hasMoved = !requireMotionFirst;

  while (!cancelled() && Date.now() - startedAt < timeoutMs) {
    await new Promise(resolve => window.setTimeout(resolve, SAMPLE_INTERVAL_MS));
    if (cancelled()) return false;
    if (manualCapture()) return true;

    const sample = grayscaleSample(video, canvas);
    if (!sample) continue;

    if (previous) {
      const motion = meanAbsoluteDifference(previous, sample);
      if (motion > MOVED_THRESHOLD || Date.now() - startedAt > MOTION_GRACE_MS) hasMoved = true;
      const still = motion < STILL_THRESHOLD;
      const filled = standardDeviation(sample) > CONTENT_THRESHOLD;
      stillTicks = still && filled && hasMoved ? stillTicks + 1 : 0;
      if (stillTicks >= STILL_TICKS) return true;
    }

    previous = sample;
  }

  return false;
}

export function toCanvas(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const maxWidth = 1400;
  const scale = width > maxWidth ? maxWidth / width : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function scanCard(
  canvas: HTMLCanvasElement,
  onProgress?: (ratio: number) => void,
): Promise<CardScanResult> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('fra', 1, {
    logger: message => {
      if (message.status === 'recognizing text' && typeof message.progress === 'number') {
        onProgress?.(message.progress);
      }
    },
  });

  try {
    const { data } = await worker.recognize(canvas);
    const rawText = data.text ?? '';
    return {
      cardCode: extractCardCode(rawText),
      ...extractName(rawText),
      photo: await cropPortrait(canvas),
      rawText,
    };
  } finally {
    await worker.terminate();
  }
}
