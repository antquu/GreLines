import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, MagnifyingGlassPlusIcon, MagnifyingGlassMinusIcon, ArrowDownTrayIcon } from '@heroicons/react/24/solid';
import { LineBadge } from './LineBadge';
import { idbGet, idbSet } from '../services/persistentCache';

interface LineMapViewerProps {
  isOpen: boolean;
  onClose: () => void;
  
  routeId: string | null;
  lineId?: string | null;
  
  lineLabel?: string;
  lineColor?: string;
  isMobile: boolean;
  language: 'fr' | 'en';
}

const PLAN_ENDPOINT = 'https://data.mobilites-m.fr/api/planligne/pdf';

const PLAN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const RASTER_WIDTH = 3400;
const MAX_RASTER_PIXELS = 12e6;

const PREVIEW_WIDTH = 1100;

const MIN_ZOOM = 1;

const MAX_ZOOM = 5;
const ZOOM_STEP = 1.6;
const PAGE_GAP = 16;

type PlanPage = {
  
  blob: Blob;
  
  width: number;
  height: number;
};

type RasterCache = { pages: PlanPage[] };

const getText = (language: 'fr' | 'en') => {
  const fr = language === 'fr';
  return {
    title: fr ? 'Plan de la ligne' : 'Line map',
    close: fr ? 'Fermer' : 'Close',
    zoomIn: fr ? 'Agrandir' : 'Zoom in',
    zoomOut: fr ? 'Réduire' : 'Zoom out',
    reset: fr ? 'Ajuster' : 'Fit',
    download: fr ? 'Télécharger' : 'Download',
    loading: fr ? 'Chargement du plan…' : 'Loading map…',
    failed: fr
      ? 'Le plan n’a pas pu être chargé. Il est peut-être indisponible pour cette ligne.'
      : 'The map could not be loaded. It may be unavailable for this line.',
    hint: fr ? 'Pincez pour zoomer' : 'Pinch to zoom',
  };
};

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise(resolve => {
    canvas.toBlob(
      blob => {
        if (blob && blob.type === 'image/webp') resolve(blob);
        else canvas.toBlob(fallback => resolve(fallback ?? blob), 'image/jpeg', 0.92);
      },
      'image/webp',
      0.92,
    );
  });
}

type PdfDocument = Awaited<ReturnType<typeof import('pdfjs-dist')['getDocument']>['promise']>;

async function openPdf(bytes: ArrayBuffer): Promise<PdfDocument> {
  const [{ getDocument, GlobalWorkerOptions }, workerUrl] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url').then(m => m.default),
  ]);
  GlobalWorkerOptions.workerSrc = workerUrl;

  return getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
}

async function rasterize(doc: PdfDocument, targetWidth: number): Promise<PlanPage[]> {
  const pages: PlanPage[] = [];

  for (let index = 1; index <= doc.numPages; index += 1) {
    const page = await doc.getPage(index);
    const base = page.getViewport({ scale: 1 });

    let scale = targetWidth / base.width;
    const pixels = base.width * scale * base.height * scale;
    if (pixels > MAX_RASTER_PIXELS) scale *= Math.sqrt(MAX_RASTER_PIXELS / pixels);

    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) continue;

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, canvasContext: context, viewport, intent: 'print' }).promise;

    const blob = await canvasToBlob(canvas);
    
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
    if (blob) pages.push({ blob, width: base.width, height: base.height });
  }

  return pages;
}

export function LineMapViewer({
  isOpen,
  onClose,
  routeId,
  lineLabel,
  lineColor = '#3b82f6',
  lineId = null,
  isMobile,
  language,
}: LineMapViewerProps) {
  const text = getText(language);
  const [pageUrls, setPageUrls] = useState<{ url: string; width: number; height: number }[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [zoomLabel, setZoomLabel] = useState(100);

  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  
  const view = useRef({ x: 0, y: 0, zoom: 1 });
  
  const fit = useRef(1);
  
  const natural = useRef({ width: 0, height: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number; mid: { x: number; y: number } } | null>(null);
  const labelFrame = useRef(0);

  useEffect(() => {
    if (!isOpen || !routeId) return;
    let active = true;
    const controller = new AbortController();
    const created: string[] = [];

    setStatus('loading');
    setPageUrls([]);
    setPdfUrl(null);
    
    natural.current = { width: 0, height: 0 };

    const bytesKey = `linePlan_v1_${routeId}`;
    const rasterKey = `linePlanRaster_v1_${routeId}_${RASTER_WIDTH}`;

    const publish = async (pages: PlanPage[]) => {
      if (!active || pages.length === 0) return false;
      const urls = pages.map(page => {
        const url = URL.createObjectURL(page.blob);
        created.push(url);
        return { url, width: page.width, height: page.height };
      });
      await Promise.all(
        urls.map(page => {
          const image = new Image();
          image.src = page.url;
          return image.decode().catch(() => undefined);
        }),
      );
      if (!active) return false;
      setPageUrls(urls);
      setStatus('ready');
      return true;
    };

    const loadBytes = async (): Promise<ArrayBuffer> => {
      const cached = await idbGet<ArrayBuffer>(bytesKey);
      if (cached?.value) return cached.value;

      const response = await fetch(`${PLAN_ENDPOINT}?route=${encodeURIComponent(routeId)}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(String(response.status));
      const buffer = await response.arrayBuffer();
      void idbSet(bytesKey, buffer, PLAN_TTL_MS);
      return buffer;
    };

    const attachDownload = (bytes: ArrayBuffer) => {
      if (!active) return;
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      created.push(url);
      setPdfUrl(url);
    };

    (async () => {
      try {
        const raster = await idbGet<RasterCache>(rasterKey);
        if (raster?.value?.pages?.length && (await publish(raster.value.pages))) {
          void loadBytes().then(attachDownload).catch(() => {});
          return;
        }

        const bytes = await loadBytes();
        if (!active) return;
        attachDownload(bytes);

        const doc = await openPdf(bytes);
        try {
          const preview = await rasterize(doc, PREVIEW_WIDTH);
          if (!active) return;
          if (!(await publish(preview))) throw new Error('empty');

          const full = await rasterize(doc, RASTER_WIDTH);
          if (!active || full.length === 0) return;
          await publish(full);
          void idbSet(rasterKey, { pages: full }, PLAN_TTL_MS);
        } finally {
          void doc.destroy();
        }
      } catch {
        if (active) setStatus('error');
      }
    })();

    return () => {
      active = false;
      controller.abort();
      created.forEach(url => URL.revokeObjectURL(url));
      setPageUrls([]);
      setPdfUrl(null);
    };
  }, [isOpen, routeId]);

  /* ------------------------------------------------------------ transformation */

  const applyTransform = useCallback(() => {
    const element = contentRef.current;
    const viewport = viewportRef.current;
    if (!element || !viewport) return;

    const scale = fit.current * view.current.zoom;
    const width = natural.current.width * scale;
    const height = natural.current.height * scale;
    view.current.x =
      width <= viewport.clientWidth
        ? (viewport.clientWidth - width) / 2
        : Math.min(0, Math.max(viewport.clientWidth - width, view.current.x));
    view.current.y =
      height <= viewport.clientHeight
        ? (viewport.clientHeight - height) / 2
        : Math.min(0, Math.max(viewport.clientHeight - height, view.current.y));

    const { x, y } = view.current;
    element.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;

    if (!labelFrame.current) {
      labelFrame.current = requestAnimationFrame(() => {
        labelFrame.current = 0;
        setZoomLabel(Math.round(view.current.zoom * 100));
      });
    }
  }, []);

  const fitToViewport = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || !natural.current.width) return;
    const { clientWidth, clientHeight } = viewport;
    const scale = Math.min(clientWidth / natural.current.width, clientHeight / natural.current.height) * 0.96;
    fit.current = scale || 1;
    view.current = {
      zoom: 1,
      x: (clientWidth - natural.current.width * fit.current) / 2,
      y: (clientHeight - natural.current.height * fit.current) / 2,
    };
    applyTransform();
  }, [applyTransform]);

  /** Zoome autour d'un point de la fenêtre, qui reste donc immobile. */
  const zoomAt = useCallback(
    (nextZoom: number, cx: number, cy: number) => {
      const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
      const previous = view.current.zoom;
      if (clamped === previous) return;
      const ratio = clamped / previous;
      view.current.x = cx - (cx - view.current.x) * ratio;
      view.current.y = cy - (cy - view.current.y) * ratio;
      view.current.zoom = clamped;
      applyTransform();
    },
    [applyTransform],
  );

  const zoomCentered = useCallback(
    (factor: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      zoomAt(view.current.zoom * factor, viewport.clientWidth / 2, viewport.clientHeight / 2);
    },
    [zoomAt],
  );

  const layout = useMemo(
    () => ({
      width: pageUrls.length ? Math.max(...pageUrls.map(page => page.width)) : 0,
      height:
        pageUrls.reduce((total, page) => total + page.height, 0) +
        PAGE_GAP * Math.max(0, pageUrls.length - 1),
    }),
    [pageUrls],
  );

  useEffect(() => {
    if (!layout.width) return;
    const unchanged = natural.current.width === layout.width && natural.current.height === layout.height;
    natural.current = layout;
    if (unchanged) applyTransform();
    else fitToViewport();
  }, [layout, applyTransform, fitToViewport]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') return;
    let last = { width: viewport.clientWidth, height: viewport.clientHeight };
    const observer = new ResizeObserver(() => {
      if (viewport.clientWidth === last.width && viewport.clientHeight === last.height) return;
      last = { width: viewport.clientWidth, height: viewport.clientHeight };
      fitToViewport();
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fitToViewport]);

  /* -------------------------------------------------------------------- gestes */

  const localPoint = (event: { clientX: number; clientY: number }) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    if (status !== 'ready') return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, localPoint(event));
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        zoom: view.current.zoom,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
    }
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const current = localPoint(event);
    pointers.current.set(event.pointerId, current);

    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      view.current.x += mid.x - pinch.current.mid.x;
      view.current.y += mid.y - pinch.current.mid.y;
      pinch.current.mid = mid;
      zoomAt((pinch.current.zoom * distance) / pinch.current.distance, mid.x, mid.y);
      applyTransform();
      return;
    }

    view.current.x += current.x - previous.x;
    view.current.y += current.y - previous.y;
    applyTransform();
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const handleDoubleClick = (event: React.MouseEvent) => {
    const point = localPoint(event);
    if (view.current.zoom > 1.05) fitToViewport();
    else zoomAt(2.5, point.x, point.y);
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || status !== 'ready') return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015));
      zoomAt(view.current.zoom * factor, event.clientX - rect.left, event.clientY - rect.top);
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [status, zoomAt]);

  useEffect(() => () => { if (labelFrame.current) cancelAnimationFrame(labelFrame.current); }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[10005] flex flex-col bg-slate-950"
        >
          {/* Bandeau : identité de la ligne à gauche, commandes à droite. */}
          <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              {lineId || routeId || lineLabel ? (
                <LineBadge
                  line={{ id: lineId ?? routeId ?? '', shortName: (lineLabel ?? '').replace(/^(Ligne|Line)\s+/i, ''), color: lineColor, textColor: undefined, routeId: lineId ?? routeId ?? undefined }}
                  size="sm"
                />
              ) : (
                <div className="h-[3px] w-8 flex-shrink-0 rounded-full" style={{ backgroundColor: lineColor }} />
              )}
              <div className="min-w-0">
                {lineLabel && (
                  <p className="truncate text-[15px] font-bold text-white">{lineLabel}</p>
                )}
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center gap-2">
              <button
                onClick={() => zoomCentered(1 / ZOOM_STEP)}
                aria-label={text.zoomOut}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-white transition hover:bg-slate-800"
              >
                <MagnifyingGlassMinusIcon className="h-4 w-4" />
              </button>
              <button
                onClick={fitToViewport}
                aria-label={text.reset}
                className="tabular rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
              >
                {zoomLabel} %
              </button>
              <button
                onClick={() => zoomCentered(ZOOM_STEP)}
                aria-label={text.zoomIn}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-white transition hover:bg-slate-800"
              >
                <MagnifyingGlassPlusIcon className="h-4 w-4" />
              </button>
              {pdfUrl && (
                <a
                  href={pdfUrl}
                  download={`plan-${routeId?.replace(':', '-') ?? 'ligne'}.pdf`}
                  aria-label={text.download}
                  className="hidden h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-white transition hover:bg-slate-800 sm:flex"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                </a>
              )}
              <button
                onClick={onClose}
                aria-label={text.close}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-white transition hover:bg-slate-700"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div
            ref={viewportRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onDoubleClick={handleDoubleClick}
            className="relative flex-1 touch-none overflow-hidden overscroll-contain"
            style={{ cursor: status === 'ready' ? 'grab' : 'default' }}
          >
            {status === 'loading' && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                {text.loading}
              </p>
            )}
            {status === 'error' && (
              <p className="absolute inset-0 flex items-center justify-center px-8 text-center text-sm leading-relaxed text-slate-500">
                {text.failed}
              </p>
            )}
            {status === 'ready' && (
              <div
                ref={contentRef}
                className="absolute left-0 top-0 origin-top-left will-change-transform"
                style={{ width: layout.width, height: layout.height }}
              >
                {pageUrls.map((page, index) => (
                  <img
                    key={page.url}
                    src={page.url}
                    alt={index === 0 ? text.title : ''}
                    draggable={false}
                    decoding="sync"
                    className="block select-none bg-white"
                    style={{
                      width: page.width,
                      height: page.height,
                      marginTop: index === 0 ? 0 : PAGE_GAP,
                    }}
                  />
                ))}
              </div>
            )}

            {isMobile && status === 'ready' && (
              <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/90 px-3 py-1.5 text-[11px] text-slate-300">
                {text.hint}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
