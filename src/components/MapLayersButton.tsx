import { motion, type MotionValue } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { Square3Stack3DIcon } from '@heroicons/react/24/solid';
import { SHARED_OPERATORS, SHARED_OPERATOR_LABELS, type SharedOperator } from '../services/sharedMobility';

interface MapLayersButtonProps {
  language: 'fr' | 'en';
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  hidden: Set<SharedOperator>;
  onToggleLayer: (operator: SharedOperator) => void;
  operators: SharedOperator[];
  bottom: MotionValue<string>;
  opacity: MotionValue<number>;
  scale: MotionValue<number>;
  pointerEvents?: MotionValue<string>;
}

const LOGOS: Record<SharedOperator, { file: string; x0: number; x1: number; y0: number; y1: number }> = {
  citiz: { file: 'citiz', x0: 0.113, x1: 0.883, y0: 0.3, y1: 0.694 },
  voi: { file: 'voi', x0: 0.141, x1: 0.855, y0: 0.253, y1: 0.741 },
  velostan: { file: 'velostanlib', x0: 0.303, x1: 0.697, y0: 0.147, y1: 0.853 },
};

const WIDTH = 48;
const LOGO_WIDTH = 32;
const SLOT_HEIGHT = 42;

function OperatorLogo({ operator }: { operator: SharedOperator }) {
  const box = LOGOS[operator];
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  const drawn = LOGO_WIDTH / ((width / height) * (1414 / 849));

  return (
    <span
      className="relative block overflow-hidden"
      style={{ width: LOGO_WIDTH, height: drawn }}
    >
      <img
        src={`/assets/homepage/svg/${box.file}.svg`}
        alt=""
        className="absolute max-w-none"
        style={{
          width: `${100 / width}%`,
          left: `${(-box.x0 / width) * 100}%`,
          top: `${(-box.y0 / height) * 100}%`,
        }}
      />
    </span>
  );
}

export function MapLayersButton({
  language,
  isOpen,
  onToggle,
  onClose,
  hidden,
  onToggleLayer,
  operators,
  bottom,
  opacity,
  scale,
  pointerEvents,
}: MapLayersButtonProps) {
  const isFr = language === 'fr';
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen, onClose]);

  const available = SHARED_OPERATORS.filter(operator => operators.includes(operator));
  const inView = available.length > 0;

  useEffect(() => {
    if (!inView && isOpen) onClose();
  }, [inView, isOpen, onClose]);

  return (
    <motion.div
      ref={rootRef}
      style={{ zIndex: 5, bottom, opacity, scale, width: WIDTH, pointerEvents }}
      initial={false}
      className="fixed right-4"
    >
      <div
        style={{
          opacity: inView ? 1 : 0,
          transition: 'opacity 300ms ease',
          pointerEvents: inView ? 'auto' : 'none',
        }}
        aria-hidden={!inView}
      >
      <motion.div
        animate={{
          height: isOpen ? SLOT_HEIGHT * available.length + WIDTH : WIDTH,
          borderRadius: isOpen ? 24 : 999,
        }}
        transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
        initial={false}
        className="flex w-full flex-col items-center justify-end overflow-hidden border-2 border-gray-700 bg-slate-900/85 shadow-lg backdrop-blur"
      >
        {available.map(operator => {
          const isVisible = !hidden.has(operator);
          return (
            <button
              key={operator}
              type="button"
              onClick={() => onToggleLayer(operator)}
              aria-pressed={isVisible}
              aria-label={`${SHARED_OPERATOR_LABELS[operator]} · ${
                isVisible ? (isFr ? 'affiché' : 'shown') : isFr ? 'masqué' : 'hidden'
              }`}
              tabIndex={isOpen ? 0 : -1}
              className="flex w-full flex-shrink-0 items-center justify-center transition active:bg-slate-800"
              style={{ height: SLOT_HEIGHT }}
            >
              <span
                className="transition-all duration-200"
                style={{
                  filter: isVisible ? 'none' : 'grayscale(1)',
                  opacity: isVisible ? 1 : 0.35,
                }}
              >
                <OperatorLogo operator={operator} />
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-label={isFr ? 'Calques de la carte' : 'Map layers'}
          className="relative flex flex-shrink-0 items-center justify-center transition active:bg-slate-800"
          style={{ width: WIDTH - 4, height: WIDTH - 4 }}
        >
          <Square3Stack3DIcon className="h-5 w-5 text-white" />
          {hidden.size > 0 && !isOpen && (
            <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-slate-900 bg-blue-500" />
          )}
        </button>
      </motion.div>
      </div>
    </motion.div>
  );
}
