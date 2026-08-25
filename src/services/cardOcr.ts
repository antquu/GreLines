/**
 * Lire une carte OURA en photo.
 *
 * Le navigateur ne sait pas lire du texte imprimé : Tesseract s'en charge, et
 * il est lourd — plusieurs mégaoctets de code et de données de langue. Il n'est
 * donc chargé qu'au moment où quelqu'un scanne vraiment une carte, jamais au
 * démarrage de l'application.
 *
 * Ce qu'on en tire n'est jamais tenu pour acquis : le numéro est confronté à
 * l'API du réseau, et le nom comme le visage sont soumis au voyageur avant
 * d'être enregistrés. Une lecture ratée coûte une correction, pas une carte
 * fausse.
 */

/** Ce qu'une photo de carte a livré. */
export interface CardScanResult {
  /** Numéro à dix chiffres, si l'on en a trouvé un qui y ressemble. */
  cardCode?: string;
  firstName?: string;
  lastName?: string;
  /** Portrait découpé dans la photo, prêt à être envoyé. */
  photo?: Blob;
  /** Texte brut, pour comprendre une lecture qui a échoué. */
  rawText: string;
}

/**
 * Le numéro de carte dans un texte lu de travers.
 *
 * On cherche dix chiffres d'affilée, en tolérant les espaces que l'impression
 * ou la lecture y glissent. Les confusions classiques de l'OCR — O pour zéro,
 * I ou l pour un — sont corrigées avant de compter.
 */
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

/**
 * Le nom du porteur.
 *
 * Il est imprimé en capitales, sur deux lignes, au-dessus de « Date de fin de
 * validité ». On prend donc les deux dernières lignes en capitales qui
 * précèdent cette mention — prénom d'abord, nom ensuite, comme sur le carton.
 */
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

/**
 * Découpe le portrait.
 *
 * Il occupe toujours le même quart de la carte — en haut à gauche, un peu plus
 * haut que large. On le prélève par proportions plutôt que par détection : la
 * carte est cadrée par le guide affiché à l'écran, et une découpe approximative
 * qu'on voit avant d'enregistrer vaut mieux qu'une détection qui se trompe.
 */
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

/** Une image quelconque ramenée à un canevas de largeur raisonnable. */
/* -------------------------------------------------------------------------- */
/*  Savoir quand déclencher                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Attendre le bon moment pour lire, au lieu de lire toutes les deux secondes.
 *
 * La lecture à cadence fixe photographiait n'importe quand : pendant qu'on
 * sortait la carte de son portefeuille, pendant qu'on la retournait, pendant que
 * la main tremblait encore. Trois essais suffisaient à les gâcher tous les
 * trois, et l'on retombait sur la saisie du numéro alors que la carte était là,
 * sous l'objectif.
 *
 * On regarde donc ce que voit la caméra, dix fois par seconde, sur une vignette
 * de 48 × 32 pixels — assez pour mesurer deux choses, et trop peu pour coûter
 * quoi que ce soit :
 *
 *  — le mouvement, en comparant deux vignettes consécutives ;
 *  — la présence de quelque chose, par l'écart-type des gris : un mur, une
 *    table vide ou un objectif couvert donnent une image plate, une carte
 *    posée dans le cadre y met des bords et du texte.
 *
 * Quand l'image cesse de bouger *et* qu'il y a quelque chose à lire, c'est le
 * moment : la carte est présentée et la main s'est arrêtée. C'est exactement
 * l'instant qu'un humain choisirait.
 */

/** Taille de la vignette d'analyse. Assez pour juger, trop peu pour coûter. */
const SAMPLE_WIDTH = 48;
const SAMPLE_HEIGHT = 32;

/** En dessous, l'image est considérée immobile (écart moyen par pixel, sur 255). */
const STILL_THRESHOLD = 3.2;
/** Au-dessus, on considère que le cadre a de nouveau bougé pour de bon. */
const MOVED_THRESHOLD = 6;
/** En dessous, le cadre est vide : mur, table nue, objectif couvert. */
const CONTENT_THRESHOLD = 9;
/** Combien de vignettes immobiles d'affilée avant de déclencher. */
const STILL_TICKS = 3;
/** Le pas d'échantillonnage. */
const SAMPLE_INTERVAL_MS = 100;
/** Passé ce délai sans mouvement, on reprend quand même la main. */
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
  /** Rend vrai quand l'attente n'a plus lieu d'être : l'écran a changé. */
  cancelled?: () => boolean;
  /** Au-delà, on renonce et l'on propose la saisie à la main. */
  timeoutMs?: number;
  /**
   * Attendre d'abord que le cadre bouge.
   *
   * Vrai après une lecture ratée : sans cela, la même image immobile
   * redéclencherait aussitôt la même lecture ratée, en boucle. Il faut que la
   * carte ait bougé — qu'on l'ait retournée, rapprochée, essuyée — pour qu'il
   * y ait une raison d'espérer autre chose.
   *
   * L'exigence se périme d'elle-même au bout de `MOTION_GRACE_MS` : quelqu'un
   * qui tient sa carte parfaitement immobile après un échec ne doit pas
   * attendre indéfiniment devant un écran qui ne fait rien.
   */
  requireMotionFirst?: boolean;
}

/**
 * Rend `true` quand l'image est stable et qu'il y a quelque chose dans le
 * cadre, `false` si l'attente a été annulée ou a duré trop longtemps.
 */
export async function waitForSteadyFrame(
  video: HTMLVideoElement,
  options: SteadyFrameOptions = {},
): Promise<boolean> {
  const { cancelled = () => false, timeoutMs = 15000, requireMotionFirst = false } = options;

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

/**
 * Lit une carte photographiée. L'appel charge Tesseract au premier usage ;
 * `onProgress` permet d'en montrer l'avancement, qui se compte en secondes.
 */
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
