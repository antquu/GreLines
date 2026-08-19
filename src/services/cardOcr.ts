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

  // La ligne qui suit « N° de carte » est la bonne : on la privilégie.
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
    // Les mentions du décor sont en capitales elles aussi.
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
