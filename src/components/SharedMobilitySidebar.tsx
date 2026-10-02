import { OfflinePanel } from './OfflinePanel';
import { IS_NANCY } from '../site';
import { useIsOffline } from '../hooks/useIsOffline';
import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useMotionValueEvent } from 'framer-motion';
import { MapSheet, useMapSheetCompactProgress } from './MapSheet';
import { MorphAnchor, MorphSlot, MorphStage } from './MorphLayout';
import { getSharedPricing, formatEuro, type SharedPricing } from '../services/sharedPricing';
import { XMarkIcon, MapPinIcon } from '@heroicons/react/24/solid';
import { MdLocalParking, MdPedalBike } from 'react-icons/md';
import { VehicleGlyph } from './VehicleGlyph';
import { MarqueeText } from './MarqueeText';
import { reverseGeocode } from '../services/geocoding';
import {
  formFactorLabel,
  propulsionLabel,
  energyLevelLabel,
  usesFuel,
  rangeComparison,
  type SharedOperator,
  type SharedVehicle,
  type SharedVehiclePoint,
} from '../services/sharedMobility';

interface SharedMobilitySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  operator: SharedOperator;

  points: SharedVehiclePoint[];
  isMobile: boolean;
  language: 'fr' | 'en';
  isLight?: boolean;

  onRouteTo?: (destination: { lat: number; lon: number; label: string }) => void;

  onVehicleFocus?: (vehicleId: string | null) => void;
}

const OPERATOR_SITES: Record<SharedOperator, string> = {
  citiz: IS_NANCY ? 'https://grand-est.citiz.coop/' : 'https://alpes-loire.citiz.coop/',
  voi: 'https://www.voi.com/fr/',
  velostan: 'https://www.velostanlib.fr/',
};

const VELO_GREEN = '#73b74a';

const OPERATOR_BRAND: Record<SharedOperator, string> = {
  citiz: '#4ac2b6',
  voi: '#f46c63',
  velostan: VELO_GREEN,
};

const OPERATORS: Record<SharedOperator, { label: string; color: string; logo: string; logoDark?: string }> = {

  citiz: { label: 'Citiz', color: '#2563eb', logo: '/assets/citiz.png', logoDark: '/assets/citiz_white.png' },
  voi: { label: 'Voi', color: '#ec4899', logo: '/assets/voi.png' },
  velostan: { label: 'vélOstan’lib', color: VELO_GREEN, logo: '/assets/velostanlib-logo.svg' },
};

const getText = (language: 'fr' | 'en') => {
  const fr = language === 'fr';
  return {
    available: fr ? 'Véhicules disponibles' : 'Available vehicles',
    availableCount: (n: number) => (fr
      ? `véhicule${n > 1 ? 's' : ''} disponible${n > 1 ? 's' : ''}`
      : `vehicle${n > 1 ? 's' : ''} available`),
    bikesAvailable: (n: number) => (fr
      ? `vélo${n > 1 ? 's' : ''} disponible${n > 1 ? 's' : ''}`
      : `bike${n > 1 ? 's' : ''} available`),
    docksFree: (n: number) => (fr
      ? `place${n > 1 ? 's' : ''} libre${n > 1 ? 's' : ''}`
      : `free dock${n > 1 ? 's' : ''}`),
    stationHint: fr
      ? 'Prenez un vélo ici et rendez-le à n’importe quelle station vélOstan’lib.'
      : 'Take a bike here and return it to any vélOstan’lib station.',
    stationLabel: fr ? 'Station vélOstan’lib' : 'vélOstan’lib station',
    slots: (n: number) => (fr ? `${n} emplacements` : `${n} docks`),
    fewBikes: fr ? 'Il reste peu de vélos' : 'Few bikes left',
    fewDocks: fr ? 'Station presque pleine' : 'Station almost full',
    routeToStation: fr ? 'Itinéraire jusqu’à la station' : 'Directions to the station',
    operatorSite: fr ? 'Site vélOstan’lib' : 'vélOstan’lib website',
    battery: fr ? 'Batterie' : 'Battery',
    fuel: fr ? 'Carburant' : 'Fuel',
    estimated: fr ? 'estimée' : 'estimated',
    range: fr ? 'Autonomie' : 'Range',
    book: fr ? 'Réserver' : 'Book',
    unlock: fr ? 'Déverrouiller' : 'Unlock',
    tariff: fr ? 'Tarif' : 'Pricing',
    unlockFee: fr ? 'Déverrouillage' : 'Unlock fee',
    perMinute: fr ? 'Par minute' : 'Per minute',
    perMinutes: (n: number) => (fr ? `Par ${n} min` : `Per ${n} min`),
    perKm: fr ? 'Par kilomètre' : 'Per kilometre',
    free: fr ? 'Gratuit' : 'Free',
    plusUnlock: fr ? '+ déverrouillage' : '+ unlock fee',
    unlockNote: fr ? 'Déverrouillage' : 'Unlock fee',
    details: fr ? 'Détails' : 'Details',
    vehicle: fr ? 'Véhicule' : 'Vehicle',
    none: fr ? 'Aucun véhicule disponible ici pour le moment.' : 'No vehicle available here right now.',
    close: fr ? 'Fermer' : 'Close',
    route: fr ? 'Itinéraire' : 'Directions',
    count: (n: number) => (fr
      ? `${n} véhicule${n > 1 ? 's' : ''}`
      : `${n} vehicle${n > 1 ? 's' : ''}`),
    spots: (n: number) => (fr
      ? `${n} emplacement${n > 1 ? 's' : ''}`
      : `${n} location${n > 1 ? 's' : ''}`),
  };
};

function OperatorLogo({ operator, small = false }: { operator: SharedOperator; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  const { label, color, logo, logoDark } = OPERATORS[operator];
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const source = isDark && logoDark ? logoDark : logo;

  if (failed) {
    return (
      <span
        className="inline-flex items-center rounded-xl px-3 py-1.5 text-[1.375rem] font-extrabold tracking-tight text-white"
        style={{ backgroundColor: color }}
      >
        {label}
      </span>
    );
  }

  return (
    <img
      src={source}
      alt={label}
      onError={() => setFailed(true)}
      className={`block w-auto ${small ? 'h-5' : 'h-9'}`}
    />
  );
}

function shortVehicleNumber(id: string): string {
  if (/^\d+$/.test(id)) return `n° ${id}`;
  const compact = id.replace(/-/g, '');
  return `n° ${compact.slice(-4).toUpperCase()}`;
}

function PricingSummary({
  operator,
  formFactor,
  text,
  language,
}: {
  operator: SharedOperator;
  formFactor: string;
  text: ReturnType<typeof getText>;
  language: 'fr' | 'en';
}) {
  const [pricing, setPricing] = useState<SharedPricing | null>(null);

  useEffect(() => {
    let active = true;
    void getSharedPricing(operator, formFactor).then(result => {
      if (active) setPricing(result);
    });
    return () => { active = false; };
  }, [operator, formFactor]);

  if (!pricing) return null;

  const parts: string[] = [];
  if (pricing.perKmRate !== null) parts.push(`${formatEuro(pricing.perKmRate, language)} / km`);
  if (pricing.usageRate !== null) {
    const unit = pricing.usageIntervalMinutes === 1 ? 'min' : `${pricing.usageIntervalMinutes} min`;
    parts.push(`${formatEuro(pricing.usageRate, language)} / ${unit}`);
  }
  if (parts.length === 0 && pricing.unlockPrice === null) return null;

  return (
    <div className="px-4 pb-3">
      <p className="tabular text-[0.8125rem] font-semibold text-white">
        {parts.join(' · ')}
        {pricing.unlockPrice !== null && (
          <span className="font-normal text-slate-400"> {text.plusUnlock}</span>
        )}
      </p>
      {pricing.unlockPrice !== null && (
        <p className="tabular mt-0.5 text-[0.6875rem] text-slate-500">
          *{text.unlockNote} : {formatEuro(pricing.unlockPrice, language)}
        </p>
      )}
    </div>
  );
}

function VehicleRow({
  vehicle,
  text,
  language,
  isExpanded,
  onToggle,
  onRoute,
}: {
  vehicle: SharedVehicle;
  text: ReturnType<typeof getText>;
  language: 'fr' | 'en';
  isExpanded: boolean;
  onToggle: () => void;
  onRoute: () => void;
}) {
  const kind = formFactorLabel(vehicle.formFactor, language);
  const propulsion = propulsionLabel(vehicle.propulsion, language);
  const bookingUrl = vehicle.rentalUrl ?? OPERATOR_SITES[vehicle.operator];

  const details = [
    shortVehicleNumber(vehicle.id),
    vehicle.model ? kind : null,
    propulsion,
    typeof vehicle.rangeMeters === 'number' ? `${Math.round(vehicle.rangeMeters / 1000)} km` : null,
  ].filter(Boolean).join(' · ');
  const percent = vehicle.batteryPercent;

  return (
    <div
      className={`mb-3 overflow-hidden rounded-[22px] bg-black transition ${
        isExpanded ? 'ring-2 ring-slate-600' : 'ring-1 ring-white/10'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="flex w-full items-center gap-3.5 px-4 py-4 text-left"
      >
        <span className="flex-shrink-0 text-white">
          <VehicleGlyph formFactor={vehicle.formFactor} size={36} color="currentColor" />
        </span>

        <span className="min-w-0 flex-1">
          <MarqueeText
            text={vehicle.model || kind || text.vehicle}
            className="text-[1.0625rem] font-bold leading-tight text-white"
          />
          <span className="tabular mt-0.5 block truncate text-[0.8125rem] text-slate-400">{details}</span>
        </span>

        {typeof percent === 'number' ? (
          <span className="flex flex-shrink-0 flex-col items-end gap-1.5">
            <span className="tabular text-[1.0625rem] font-bold leading-none text-white">{energyLevelLabel(vehicle)}</span>
            <span className="block h-1.5 w-14 overflow-hidden rounded-full bg-slate-700">
              <span className="block h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: batteryColor(percent) }} />
            </span>
          </span>
        ) : (
          <span className="text-xs text-slate-500">—</span>
        )}
      </button>

      <motion.div
        initial={false}
        animate={{ height: isExpanded ? 'auto' : 0, opacity: isExpanded ? 1 : 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="overflow-hidden"
      >
        <PricingSummary
          operator={vehicle.operator}
          formFactor={vehicle.formFactor}
          text={text}
          language={language}
        />

        <div className="flex gap-2 px-4 pb-4">
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
            style={{ backgroundColor: OPERATOR_BRAND[vehicle.operator] }}
          >
            {text.unlock}
          </a>
          <button
            type="button"
            onClick={onRoute}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <MapPinIcon className="h-4 w-4" />
            {text.route}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function PricingBlock({
  operator,
  formFactor,
  text,
  language,
}: {
  operator: SharedOperator;
  formFactor: string;
  text: ReturnType<typeof getText>;
  language: 'fr' | 'en';
}) {
  const [pricing, setPricing] = useState<SharedPricing | null>(null);

  useEffect(() => {
    let active = true;
    void getSharedPricing(operator, formFactor).then(result => {
      if (active) setPricing(result);
    });
    return () => { active = false; };
  }, [operator, formFactor]);

  if (!pricing) return null;

  const rows: Array<{ label: string; value: string }> = [];
  if (pricing.unlockPrice !== null) {
    rows.push({ label: text.unlockFee, value: formatEuro(pricing.unlockPrice, language) });
  }
  if (pricing.usageRate !== null) {
    rows.push({
      label: pricing.usageIntervalMinutes === 1 ? text.perMinute : text.perMinutes(pricing.usageIntervalMinutes),
      value: formatEuro(pricing.usageRate, language),
    });
  }
  if (pricing.perKmRate !== null) {
    rows.push({ label: text.perKm, value: formatEuro(pricing.perKmRate, language) });
  }
  if (rows.length === 0) return null;

  return (
    <div className="mt-6 border-t border-slate-800 pt-4">
      <p className="text-[0.8125rem] font-bold text-slate-300">{text.tariff}</p>
      <div className="mt-2.5 flex flex-col gap-1.5">
        {rows.map(row => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-slate-400">{row.label}</span>
            <span className="tabular text-[0.9375rem] font-bold text-white">{row.value}</span>
          </div>
        ))}
      </div>
      {pricing.planName && (
        <p className="mt-2.5 text-[0.6875rem] leading-relaxed text-slate-500">{pricing.planName}</p>
      )}
    </div>
  );
}

function SingleVehicleView({
  vehicle,
  text,
  language,
}: {
  vehicle: SharedVehicle;
  text: ReturnType<typeof getText>;
  language: 'fr' | 'en';
}) {
  const kind = formFactorLabel(vehicle.formFactor, language);
  const singlePropulsion = propulsionLabel(vehicle.propulsion, language);
  const comparison = typeof vehicle.rangeMeters === 'number'
    ? rangeComparison(vehicle.rangeMeters, language)
    : null;

  return (
    <div className="mt-7">
      <div className="flex items-center gap-4">
        <MorphSlot id="icon" className="flex-shrink-0 text-white">
          <VehicleGlyph formFactor={vehicle.formFactor} size={54} color="currentColor" />
        </MorphSlot>
        <div className="min-w-0 flex-1">
          <MorphSlot id="title">
            <MarqueeText
              text={vehicle.model || kind || text.vehicle}
              className="text-[1.375rem] font-extrabold leading-tight tracking-tight text-white"
            />
          </MorphSlot>
          <div className="mt-0.5 flex items-baseline gap-2 text-sm text-slate-500">
            {singlePropulsion && <span className="text-slate-400">{singlePropulsion}</span>}
            <MorphSlot id="number" className="tabular whitespace-nowrap">{shortVehicleNumber(vehicle.id)}</MorphSlot>
          </div>
        </div>
      </div>

      {typeof vehicle.batteryPercent === 'number' && (
        <div className="mt-6 border-t border-slate-800 pt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[0.8125rem] font-bold text-slate-300">{usesFuel(vehicle) ? text.fuel : text.battery}</span>
            <MorphSlot id="percent" className="tabular whitespace-nowrap text-[1.375rem] font-bold text-white">{energyLevelLabel(vehicle)}</MorphSlot>
          </div>
          <div className="mt-2">
          <MorphSlot id="battery" mode="stretch" className="h-2">
            <span className="block h-full w-full overflow-hidden rounded-full bg-slate-700">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${vehicle.batteryPercent}%`,
                  backgroundColor: batteryColor(vehicle.batteryPercent),
                }}
              />
            </span>
          </MorphSlot>
          </div>
          {vehicle.batteryEstimated && (
            <p className="mt-1.5 text-[0.6875rem] text-slate-500">{usesFuel(vehicle) ? text.fuel : text.battery} {text.estimated}</p>
          )}
        </div>
      )}

      {typeof vehicle.rangeMeters === 'number' && (
        <div className="mt-6 border-t border-slate-800 pt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[0.8125rem] font-bold text-slate-300">{text.range}</span>
            <span className="tabular text-[1.375rem] font-bold text-white">
              {Math.round(vehicle.rangeMeters / 1000)} km
            </span>
          </div>
          {comparison && (
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{comparison}</p>
          )}
        </div>
      )}

      <PricingBlock
        operator={vehicle.operator}
        formFactor={vehicle.formFactor}
        text={text}
        language={language}
      />
    </div>
  );
}

const batteryColor = (percent: number) => (percent > 50 ? '#4ade80' : percent > 20 ? '#fbbf24' : '#f87171');

const COMPACT_CHIPS = 3;

function CompactBand({
  operator,
  vehicle,
  vehicles = [],
  text,
  language,
}: {
  operator: SharedOperator;
  vehicle: SharedVehicle | null;
  vehicles?: SharedVehicle[];
  text: ReturnType<typeof getText>;
  language: 'fr' | 'en';
}) {
  const percent = vehicle?.batteryPercent;
  return (
    <div>
      <MorphAnchor id="logo" className="inline-block">
        <OperatorLogo operator={operator} small />
      </MorphAnchor>
      {!vehicle && vehicles.length > 0 && (
        <div className="mt-3 flex items-center gap-3">
          <p className="flex-shrink-0 text-[0.9375rem] text-slate-300">
            <span className="tabular text-[1.0625rem] font-bold text-white">{vehicles.length}</span>{' '}
            {text.availableCount(vehicles.length)}
          </p>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 overflow-hidden">
            {vehicles.slice(0, COMPACT_CHIPS).map(entry => (
              <span key={entry.id} className="flex flex-shrink-0 items-center gap-1 rounded-full bg-white/10 py-1 pl-1.5 pr-2.5 text-white">
                <VehicleGlyph formFactor={entry.formFactor} size={18} color="currentColor" />
                {typeof entry.batteryPercent === 'number' && (
                  <span className="tabular text-[0.75rem] font-bold" style={{ color: batteryColor(entry.batteryPercent) }}>
                    {energyLevelLabel(entry)}
                  </span>
                )}
              </span>
            ))}
            {vehicles.length > COMPACT_CHIPS && (
              <span className="tabular flex-shrink-0 rounded-full bg-white/10 px-2 py-1 text-[0.75rem] font-bold text-slate-300">
                +{vehicles.length - COMPACT_CHIPS}
              </span>
            )}
          </div>
        </div>
      )}
      {vehicle && (
        <div className="mt-3 flex items-center gap-3">
          <MorphAnchor id="icon" className="flex-shrink-0 text-white">
            <VehicleGlyph formFactor={vehicle.formFactor} size={36} color="currentColor" />
          </MorphAnchor>
          <div className="min-w-0 flex-1">
            <MorphAnchor id="title">
              <p className="truncate text-[1rem] font-bold leading-tight text-white">
                {vehicle.model || formFactorLabel(vehicle.formFactor, language) || text.vehicle}
              </p>
            </MorphAnchor>
            <MorphAnchor id="number" className="mt-0.5">
              <p className="tabular whitespace-nowrap text-[0.8125rem] leading-tight text-slate-500">
                {shortVehicleNumber(vehicle.id)}
              </p>
            </MorphAnchor>
          </div>
          {typeof percent === 'number' && (
            <div className="flex flex-shrink-0 items-center gap-2.5">
              <MorphAnchor id="battery" className="w-16">
                <span className="block h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
                  <span className="block h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: batteryColor(percent) }} />
                </span>
              </MorphAnchor>
              <MorphAnchor id="percent">
                <span className="tabular whitespace-nowrap text-[1rem] font-bold leading-tight text-white">{vehicle ? energyLevelLabel(vehicle) : `${percent} %`}</span>
              </MorphAnchor>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MobileSheetContent({
  full,
  hasFooter,
  band,
}: {
  full: React.ReactNode;
  hasFooter: boolean;
  band: React.ReactNode;
}) {
  const progress = useMapSheetCompactProgress();
  const unfolded = useMotionValue(1);
  const contentRef = useRef<HTMLDivElement | null>(null);
  useMotionValueEvent(progress ?? unfolded, 'change', value => {
    if (value >= 0.98) return;
    let scroller = contentRef.current?.parentElement ?? null;
    while (scroller && scroller.scrollHeight <= scroller.clientHeight) scroller = scroller.parentElement;
    if (scroller && scroller.scrollTop > 0) scroller.scrollTop = 0;
  });
  const bottomRoom = hasFooter ? 'pb-32' : 'pb-6';
  if (!progress) {
    return <div className={`px-5 pt-2 ${bottomRoom}`}>{full}</div>;
  }
  return (
    <div ref={contentRef} className={`px-5 pt-2 ${bottomRoom}`}>
      <MorphStage progress={progress} compact={band}>
        {full}
      </MorphStage>
    </div>
  );
}

function VehicleActions({
  vehicle,
  text,
  onRoute,
  frosted = false,
}: {
  vehicle: SharedVehicle;
  text: ReturnType<typeof getText>;
  onRoute: () => void;
  frosted?: boolean;
}) {
  const bookingUrl = vehicle.rentalUrl ?? OPERATOR_SITES[vehicle.operator];

  return (
    <div
      className={`flex gap-2 px-6 py-4 ${frosted ? 'flex-row' : 'flex-col border-t border-slate-800 bg-slate-900'}`}
      style={frosted ? { backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' } : undefined}
    >
      <a
        href={bookingUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center justify-center rounded-2xl px-4 py-3.5 text-[0.9375rem] font-bold text-white transition hover:brightness-110 ${frosted ? 'flex-1' : ''}`}
        style={{ backgroundColor: OPERATOR_BRAND[vehicle.operator] }}
      >
        {text.unlock}
      </a>
      <button
        type="button"
        onClick={onRoute}
        aria-label={frosted ? text.route : undefined}
        title={frosted ? text.route : undefined}
        className={`flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 py-3.5 text-[0.9375rem] font-bold text-white transition hover:bg-slate-700 ${frosted ? 'w-14 flex-shrink-0 px-0' : 'px-4'}`}
      >
        <MapPinIcon className={frosted ? 'h-5 w-5' : 'h-4 w-4'} />
        {!frosted && text.route}
      </button>
    </div>
  );
}

export function SharedMobilitySidebar({
  isOpen,
  onClose,
  operator,
  points,
  isMobile,
  language,
  isLight = false,
  onRouteTo,
  onVehicleFocus,
}: SharedMobilitySidebarProps) {
  const text = getText(language);
  const offline = useIsOffline();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const vehicles = points.flatMap(point => point.vehicles);

  useEffect(() => {
    onVehicleFocus?.(expandedId);
  }, [expandedId, onVehicleFocus]);

  const stationNames = points
    .map(point => point.address || point.name)
    .filter(Boolean) as string[];

  const anchorPoint = points[0];
  const needsStreet = Boolean(isOpen && anchorPoint && !anchorPoint.address && !anchorPoint.name);
  const [resolvedStreet, setResolvedStreet] = useState<{ key: string; street: string } | null>(null);
  const anchorKey = anchorPoint ? `${anchorPoint.operator}:${anchorPoint.id}` : '';

  useEffect(() => {
    if (!needsStreet || !anchorPoint) return;
    let active = true;
    void reverseGeocode(anchorPoint.lat, anchorPoint.lon).then(result => {
      if (active && result?.name) setResolvedStreet({ key: anchorKey, street: result.name });
    });
    return () => { active = false; };
  }, [needsStreet, anchorKey, anchorPoint]);

  const street = resolvedStreet?.key === anchorKey ? resolvedStreet.street : null;
  const title = stationNames.length === 1 ? stationNames[0] : (points.length === 1 ? street : null);
  const stationSubtitle = points.length === 1 && points[0].address ? points[0].name : null;

  const isBikeStation = operator === 'velostan';
  const single = !isBikeStation && vehicles.length === 1 ? vehicles[0] : null;
  const countLabel = (n: number) => (isBikeStation ? text.bikesAvailable(n) : text.availableCount(n));
  const docksFree = [...new Map(points.map(point => [point.name || point.id, point.docksAvailable ?? 0])).values()]
    .reduce((sum, docks) => sum + docks, 0);

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div style={{ marginBottom: 24 }}>
          <MorphSlot id="logo" className="inline-block">
            <OperatorLogo operator={operator} />
          </MorphSlot>
        </div>
        {title ? (
          <>
            <h2 className="text-[1.625rem] font-extrabold leading-[1.1] tracking-tight text-white">
              {title}
            </h2>
            {stationSubtitle && (
              <p className="mt-1 text-sm text-slate-400">{stationSubtitle}</p>
            )}
            {!isBikeStation && (
              <p className="mt-2.5 flex items-baseline gap-2">
                <span className="tabular text-[0.9375rem] font-bold text-white">{vehicles.length}</span>
                <span className="text-sm text-slate-400">{countLabel(vehicles.length)}</span>
              </p>
            )}
          </>
        ) : (
          <p className="flex items-baseline gap-2">
            <span className="tabular text-[1.625rem] font-extrabold leading-none tracking-tight text-white">
              {vehicles.length}
            </span>
            <span className="text-sm text-slate-400">{countLabel(vehicles.length)}</span>
          </p>
        )}
        {stationNames.length > 1 && (
          <p className="mt-1.5 truncate text-sm text-slate-400">{text.spots(stationNames.length)}</p>
        )}
      </div>
      {!isMobile && (
        <button
          onClick={onClose}
          aria-label={text.close}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 transition hover:bg-slate-700"
        >
          <XMarkIcon className="h-4 w-4 text-white" />
        </button>
      )}
    </div>
  );

  const offlineBody = (
    <>
      <div className="flex items-start justify-between gap-3">
        <OperatorLogo operator={operator} />
        {!isMobile && (
          <button
            onClick={onClose}
            aria-label={text.close}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 transition hover:bg-slate-700"
          >
            <XMarkIcon className="h-4 w-4 text-white" />
          </button>
        )}
      </div>
      <OfflinePanel
        language={language}
        isLight={isLight}
        detail={language === 'fr'
          ? 'Les véhicules disponibles se voient en direct. Ils reviendront avec le réseau.'
          : 'Available vehicles are shown live. They will be back with the network.'}
      />
    </>
  );

  const bikeTotal = vehicles.length + docksFree;
  const bikeShare = bikeTotal > 0 ? vehicles.length / bikeTotal : 0;
  const bikeWarning = vehicles.length <= 2
    ? text.fewBikes
    : docksFree <= 2
      ? text.fewDocks
      : null;

  const bikeStationBody = (
    <>
      <div className="flex items-start justify-between gap-3">
        <MorphSlot id="logo" className="inline-block">
          <img src="/assets/velostanlib-logo.svg" alt="vélOstan’lib" className="block h-12 w-auto rounded-md" />
        </MorphSlot>
        {!isMobile && (
          <button
            onClick={onClose}
            aria-label={text.close}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 transition hover:bg-slate-700"
          >
            <XMarkIcon className="h-4 w-4 text-white" />
          </button>
        )}
      </div>

      <h2 className="mt-5 text-[1.625rem] font-extrabold leading-[1.1] tracking-tight text-white">
        {points[0]?.name ?? OPERATORS[operator].label}
      </h2>
      <p className="mt-1.5 text-sm text-slate-400">
        {text.stationLabel}
        {bikeTotal > 0 && ` · ${text.slots(bikeTotal)}`}
      </p>

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <MdPedalBike className="h-5 w-5" style={{ color: VELO_GREEN }} aria-hidden="true" />
              <span className="tabular text-[2.25rem] font-extrabold leading-none text-white">{vehicles.length}</span>
            </div>
            <p className="mt-1.5 text-sm text-slate-400">{text.bikesAvailable(vehicles.length)}</p>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <MdLocalParking className="h-5 w-5 text-slate-400" aria-hidden="true" />
              <span className="tabular text-[2.25rem] font-extrabold leading-none text-white">{docksFree}</span>
            </div>
            <p className="mt-1.5 text-sm text-slate-400">{text.docksFree(docksFree)}</p>
          </div>
        </div>

        <div
          className="mt-5 h-2.5 overflow-hidden rounded-full bg-white/10"
          role="img"
          aria-label={`${vehicles.length} / ${bikeTotal}`}
        >
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${Math.round(bikeShare * 100)}%`, backgroundColor: VELO_GREEN }}
          />
        </div>

        {bikeWarning && (
          <p className="mt-4 flex items-center gap-2 text-sm font-medium text-amber-400">
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
            {bikeWarning}
          </p>
        )}
      </div>

      <p className="mt-4 px-1 text-sm leading-snug text-slate-400">{text.stationHint}</p>

      {onRouteTo && points[0] && (
        <button
          type="button"
          onClick={() => onRouteTo({ lat: points[0].lat, lon: points[0].lon, label: points[0].name || OPERATORS[operator].label })}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-[0.9375rem] font-semibold text-black transition active:scale-[0.98]"
        >
          <MapPinIcon className="h-4 w-4" aria-hidden="true" />
          {text.routeToStation}
        </button>
      )}
      <a
        href={OPERATOR_SITES[operator]}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 block w-full rounded-2xl border border-white/10 py-3 text-center text-[0.9375rem] font-semibold text-white transition active:scale-[0.98]"
      >
        {text.operatorSite}
      </a>
    </>
  );

  const body = offline ? offlineBody : isBikeStation ? bikeStationBody : single ? (
    <>
      {header}
      <SingleVehicleView vehicle={single} text={text} language={language} />
    </>
  ) : (
    <>
      {header}

      {vehicles.length === 0 ? (
        <p className="py-8 text-sm text-slate-500">{text.none}</p>
      ) : (
        <div className="mt-6">
          {vehicles.map(vehicle => {
            const host = points.find(point => point.vehicles.includes(vehicle)) ?? points[0];
            return (
              <VehicleRow
                key={vehicle.id}
                vehicle={vehicle}
                text={text}
                language={language}
                isExpanded={expandedId === vehicle.id}
                onToggle={() => setExpandedId(current => current === vehicle.id ? null : vehicle.id)}
                onRoute={() => onRouteTo?.({
                  lat: host.lat,
                  lon: host.lon,
                  label: host.name || `${OPERATORS[operator].label} · ${formFactorLabel(vehicle.formFactor, language) || text.vehicle}`,
                })}
              />
            );
          })}
        </div>
      )}
    </>
  );

  const zoneLegend = operator === 'voi' && !offline ? (
    <div className="mt-8">
      <p className="text-[0.8125rem] font-bold text-slate-300">{language === 'fr' ? 'Zones sur la carte' : 'Zones on the map'}</p>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        {[
          { color: '#ef4444', fr: 'Circulation interdite', en: 'No riding' },
          { color: '#f59e0b', fr: 'Stationnement interdit', en: 'No parking' },
          { color: '#3b82f6', fr: 'Stationnement', en: 'Parking' },
        ].map(zone => (
          <li key={zone.color} className="flex items-center gap-2 text-[0.8125rem] text-slate-400">
            <span
              className="h-3.5 w-3.5 flex-shrink-0 rounded-[4px] border-2"
              style={{ borderColor: zone.color, backgroundColor: `${zone.color}40` }}
              aria-hidden="true"
            />
            {language === 'fr' ? zone.fr : zone.en}
          </li>
        ))}
        <li className="flex items-center gap-2 text-[0.8125rem] text-slate-400">
          <span className="w-3.5 flex-shrink-0 border-t-2 border-dashed" style={{ borderColor: '#ef4444' }} aria-hidden="true" />
          {language === 'fr' ? 'Limite de la zone' : 'Area boundary'}
        </li>
      </ul>
    </div>
  ) : null;

  const footer = single && !offline ? (
    <VehicleActions
      vehicle={single}
      text={text}
      frosted={isMobile}
      onRoute={() => onRouteTo?.({
        lat: points[0].lat,
        lon: points[0].lon,
        label: points[0].name || `${OPERATORS[operator].label} · ${formFactorLabel(single.formFactor, language) || text.vehicle}`,
      })}
    />
  ) : null;

  if (!isMobile) {
    return (
      <motion.div
        initial={{ x: -420, opacity: 0 }}
        animate={{ x: isOpen ? 0 : -420, opacity: isOpen ? 1 : 0 }}
        exit={{ x: -420, opacity: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className={`fixed left-0 top-0 z-60 flex h-screen w-96 flex-col shadow-2xl ${
          isLight ? 'border-r border-slate-200 bg-white' : 'border-r border-slate-800 bg-slate-900'
        }`}
      >
        <div className="flex-1 overflow-y-auto p-6 pb-8">{body}{zoneLegend}</div>
        {footer}
      </motion.div>
    );
  }

  return (
    <MapSheet initialSnap={2} compactSnap footer={footer} isOpen={isOpen} onClose={onClose} isLight={isLight} zIndex={100}>
      <MobileSheetContent
        full={<>{body}{zoneLegend}</>}
        hasFooter={Boolean(footer)}
        band={(
          <CompactBand
            operator={operator}
            vehicle={offline ? null : single}
            vehicles={offline ? [] : vehicles}
            text={text}
            language={language}
          />
        )}
      />
    </MapSheet>
  );
}
