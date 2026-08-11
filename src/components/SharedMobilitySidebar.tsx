import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sheet } from 'react-modal-sheet';
import { getSharedPricing, formatEuro, type SharedPricing } from '../services/sharedPricing';
import { XMarkIcon, BoltIcon, MapPinIcon } from '@heroicons/react/24/solid';
import { VehicleGlyph } from './VehicleGlyph';
import { MarqueeText } from './MarqueeText';
import { reverseGeocode } from '../services/geocoding';
import {
  formFactorLabel,
  propulsionLabel,
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
  
  onRouteTo?: (destination: { lat: number; lon: number; label: string }) => void;
  
  onVehicleFocus?: (vehicleId: string | null) => void;
}


const OPERATOR_SITES: Record<SharedOperator, string> = {
  citiz: 'https://alpes-loire.citiz.coop/',
  voi: 'https://www.voi.com/fr/',
};







const OPERATOR_BRAND: Record<SharedOperator, string> = {
  citiz: '#4ac2b6',
  voi: '#f46c63',
};

const OPERATORS: Record<SharedOperator, { label: string; color: string; logo: string; logoDark?: string }> = {
  
  
  citiz: { label: 'Citiz', color: '#2563eb', logo: '/assets/citiz.png', logoDark: '/assets/citiz_white.png' },
  voi: { label: 'Voi', color: '#ec4899', logo: '/assets/voi.png' },
};

const getText = (language: 'fr' | 'en') => {
  const fr = language === 'fr';
  return {
    available: fr ? 'Véhicules disponibles' : 'Available vehicles',
    availableCount: (n: number) => (fr
      ? `véhicule${n > 1 ? 's' : ''} disponible${n > 1 ? 's' : ''}`
      : `vehicle${n > 1 ? 's' : ''} available`),
    battery: fr ? 'Batterie' : 'Battery',
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

/**
 * Logo de l'opérateur, avec repli sur le nom en toutes lettres si le fichier
 * venait à manquer — mieux vaut une plaque à la marque qu'une image cassée.
 */
function OperatorLogo({ operator }: { operator: SharedOperator }) {
  const [failed, setFailed] = useState(false);
  const { label, color, logo, logoDark } = OPERATORS[operator];
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const source = isDark && logoDark ? logoDark : logo;

  if (failed) {
    return (
      <span
        className="inline-flex items-center rounded-xl px-3 py-1.5 text-[22px] font-extrabold tracking-tight text-white"
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
      className="block h-9 w-auto"
    />
  );
}

/**
 * Numéro lisible d'un véhicule.
 *
 * Citiz numérote ses voitures (« 1943 »). Voi identifie les siennes par un
 * UUID : on n'en garde que les derniers caractères, la partie qui distingue
 * deux engins côte à côte.
 */
function shortVehicleNumber(id: string): string {
  if (/^\d+$/.test(id)) return `n° ${id}`;
  const compact = id.replace(/-/g, '');
  return `n° ${compact.slice(-4).toUpperCase()}`;
}

/** Jauge de batterie : verte au-dessus de 50 %, ambre puis rouge en dessous. */
function BatteryGauge({ percent }: { percent: number }) {
  const color = percent > 50 ? '#4ade80' : percent > 20 ? '#fbbf24' : '#f87171';
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-700">
        <span className="block h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: color }} />
      </span>
      <span className="tabular text-[13px] font-semibold" style={{ color }}>{percent} %</span>
    </span>
  );
}

/**
 * Tarif en une ligne, pour la ligne dépliée d'une liste.
 *
 * On annonce le tarif d'usage — celui qui décide — suivi de « + déverrouillage »
 * quand il y en a un, et le montant exact passe en note en dessous : mêler les
 * deux sur la même ligne donnait un prix qu'on croyait comprendre et qui était
 * faux.
 */
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
    <div className="px-3 pb-2.5">
      <p className="tabular text-[13px] font-semibold text-white">
        {parts.join(' · ')}
        {pricing.unlockPrice !== null && (
          <span className="font-normal text-slate-400"> {text.plusUnlock}</span>
        )}
      </p>
      {pricing.unlockPrice !== null && (
        <p className="tabular mt-0.5 text-[11px] text-slate-500">
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

  return (
    // Un seul bloc arrondi : replié il fait la hauteur du titre, déplié il
    // englobe les boutons. Les angles restent arrondis dans les deux états.
    <div
      className={`mb-2 overflow-hidden rounded-2xl transition-colors ${
        isExpanded ? 'bg-slate-800/70 ring-1 ring-slate-700' : 'hover:bg-slate-800/40'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="flex w-full items-center gap-3 px-3 py-3 text-left"
      >
        {/* L'icône occupe la hauteur des deux lignes : on repère le type de
            véhicule avant même de lire. Elle hérite de la couleur du texte
            (`text-white`, que le thème clair repeint en sombre) : une couleur
            en dur resterait blanche sur fond blanc. */}
        <span className="flex-shrink-0 text-white">
          <VehicleGlyph formFactor={vehicle.formFactor} size={34} color="currentColor" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2 text-[15px] font-semibold text-white">
            {/* « Smart Fo… » ne dit pas quelle voiture on déverrouille : plutôt
                que de couper, le titre défile, comme le bandeau d'infotrafic.
                Il ne bouge que s'il déborde vraiment. */}
            <span className="min-w-0 flex-1">
              <MarqueeText
                text={vehicle.model || kind || text.vehicle}
                className="text-[15px] font-semibold text-white"
              />
            </span>
            {/* Numéro de flotte : celui qu'on lit sur le véhicule pour vérifier
                qu'on déverrouille le bon. */}
            <span className="tabular flex-shrink-0 font-normal text-slate-500">
              {shortVehicleNumber(vehicle.id)}
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
            {vehicle.model && kind && <span>{kind}</span>}
            {/* Thermique ou électrique : sur une voiture partagée, ça décide du
                carburant à remettre et de l'accès aux zones à faibles
                émissions. */}
            {propulsion && <span>{propulsion}</span>}
            {typeof vehicle.rangeMeters === 'number' && (
              <span className="tabular">
                {text.range} {Math.round(vehicle.rangeMeters / 1000)} km
              </span>
            )}
            {!propulsion && vehicle.propulsion === 'electric' && (
              <BoltIcon className="h-3.5 w-3.5 text-amber-300" />
            )}
          </span>
        </span>

        <span className="flex flex-shrink-0 flex-col items-end gap-1">
          {typeof vehicle.batteryPercent === 'number' ? (
            <>
              <BatteryGauge percent={vehicle.batteryPercent} />
              {vehicle.batteryEstimated && (
                <span className="text-[10px] text-slate-500">{text.battery} {text.estimated}</span>
              )}
            </>
          ) : (
            <span className="text-xs text-slate-500">—</span>
          )}
        </span>
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

        <div className="flex gap-2 px-3 pb-3">
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


/**
 * Tarifs de la course.
 *
 * Rien n'est écrit en dur : les montants viennent du flux GBFS de l'opérateur.
 * Tant qu'il n'a pas répondu, le bloc n'existe pas — mieux vaut ne rien
 * annoncer qu'annoncer un prix périmé.
 */
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
      <p className="signal-label text-slate-400">{text.tariff}</p>
      <div className="mt-2.5 flex flex-col gap-1.5">
        {rows.map(row => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-slate-400">{row.label}</span>
            <span className="tabular text-[15px] font-bold text-white">{row.value}</span>
          </div>
        ))}
      </div>
      {pricing.planName && (
        <p className="mt-2.5 text-[11px] leading-relaxed text-slate-500">{pricing.planName}</p>
      )}
    </div>
  );
}

/**
 * Fiche d'un véhicule isolé.
 *
 * Quand la carte est assez zoomée pour ne montrer qu'une trottinette, une liste
 * d'un seul élément n'a pas de sens : on donne l'essentiel — le véhicule, sa
 * charge, son autonomie, son tarif — en lecture verticale, alignée à gauche
 * comme le reste de l'application. Pas de cadre : ce contenu occupe toute la
 * fiche, l'encadrer reviendrait à dessiner une boîte autour d'une boîte. Les
 * actions vivent en pied de panneau, où le pouce les trouve.
 */
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
      {/* Identité du véhicule : l'icône ouvre la ligne, le type se lit à côté,
          le numéro en gris juste après — c'est ce qui distingue cette
          trottinette de sa voisine. */}
      <div className="flex items-center gap-4">
        <span className="flex-shrink-0 text-white">
          <VehicleGlyph formFactor={vehicle.formFactor} size={54} color="currentColor" />
        </span>
        <div className="min-w-0 flex-1">
          <MarqueeText
            text={vehicle.model || kind || text.vehicle}
            className="text-[22px] font-extrabold leading-tight tracking-tight text-white"
          />
          <p className="mt-0.5 flex items-baseline gap-2 text-sm text-slate-500">
            {singlePropulsion && <span className="text-slate-400">{singlePropulsion}</span>}
            <span className="tabular">{shortVehicleNumber(vehicle.id)}</span>
          </p>
        </div>
      </div>

      {typeof vehicle.batteryPercent === 'number' && (
        <div className="mt-6 border-t border-slate-800 pt-4">
          <div className="flex items-baseline justify-between">
            <span className="signal-label text-slate-400">{text.battery}</span>
            <span className="tabular text-[22px] font-bold text-white">{vehicle.batteryPercent} %</span>
          </div>
          <span className="mt-2 block h-2 w-full overflow-hidden rounded-full bg-slate-700">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${vehicle.batteryPercent}%`,
                backgroundColor: vehicle.batteryPercent > 50 ? '#4ade80' : vehicle.batteryPercent > 20 ? '#fbbf24' : '#f87171',
              }}
            />
          </span>
          {vehicle.batteryEstimated && (
            <p className="mt-1.5 text-[11px] text-slate-500">{text.battery} {text.estimated}</p>
          )}
        </div>
      )}

      {typeof vehicle.rangeMeters === 'number' && (
        <div className="mt-6 border-t border-slate-800 pt-4">
          <div className="flex items-baseline justify-between">
            <span className="signal-label text-slate-400">{text.range}</span>
            <span className="tabular text-[22px] font-bold text-white">
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

/**
 * Actions de la fiche, ancrées en pied de panneau.
 *
 * Déverrouiller au-dessus : c'est ce qu'on vient chercher. Le fond opaque et le
 * filet supérieur détachent le pied du contenu qui défile dessous.
 */
function VehicleActions({
  vehicle,
  text,
  onRoute,
}: {
  vehicle: SharedVehicle;
  text: ReturnType<typeof getText>;
  onRoute: () => void;
}) {
  const bookingUrl = vehicle.rentalUrl ?? OPERATOR_SITES[vehicle.operator];

  return (
    <div className="flex flex-col gap-2 border-t border-slate-800 bg-slate-900 px-6 py-4">
      <a
        href={bookingUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center rounded-2xl px-4 py-3.5 text-[15px] font-bold text-white transition hover:brightness-110"
        style={{ backgroundColor: OPERATOR_BRAND[vehicle.operator] }}
      >
        {text.unlock}
      </a>
      <button
        type="button"
        onClick={onRoute}
        className="flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3.5 text-[15px] font-bold text-white transition hover:bg-slate-700"
      >
        <MapPinIcon className="h-4 w-4" />
        {text.route}
      </button>
    </div>
  );
}

/**
 * Fiche des véhicules d'une pastille de mobilité partagée.
 *
 * Même structure que la fiche d'arrêt — bandeau, compteur, liste — à ceci près
 * que le titre est remplacé par le logo de l'opérateur : c'est lui qui
 * identifie le service, pas un nom de lieu.
 */
export function SharedMobilitySidebar({
  isOpen,
  onClose,
  operator,
  points,
  isMobile,
  language,
  onRouteTo,
  onVehicleFocus,
}: SharedMobilitySidebarProps) {
  const text = getText(language);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const vehicles = points.flatMap(point => point.vehicles);

  useEffect(() => {
    onVehicleFocus?.(expandedId);
  }, [expandedId, onVehicleFocus]);

  // Une station Citiz porte un nom ; en flotte libre il n'y a rien à nommer.
  // Le nom de rue prend la place du titre : « 14 Rue de la Montat » dit où
  // aller se garer, là où « Grüner [Station électrique] » suppose de connaître
  // déjà le lieu. Le nom d'enseigne reste juste en dessous, pour ceux qui le
  // reconnaissent.
  const stationNames = points
    .map(point => point.address || point.name)
    .filter(Boolean) as string[];

  // Une trottinette en flotte libre n'a ni station ni adresse : personne ne l'a
  // nommée, elle est simplement posée quelque part. On demande donc à la Base
  // Adresse Nationale où est ce « quelque part », pour offrir le même repère
  // qu'une station Citiz — un nom de rue.
  const anchorPoint = points[0];
  const needsStreet = Boolean(isOpen && anchorPoint && !anchorPoint.address && !anchorPoint.name);
  // La rue est mémorisée avec le point auquel elle appartient : sans cette
  // étiquette, la rue de la trottinette précédente s'afficherait un instant
  // au-dessus de la suivante. Remettre l'état à zéro dans l'effet provoquerait
  // un rendu en cascade — la comparaison au rendu coûte moins.
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

  // Un seul véhicule : on montre sa fiche détaillée plutôt qu'une liste d'un
  // élément. C'est le cas dès qu'on a assez zoomé pour isoler une trottinette.
  const single = vehicles.length === 1 ? vehicles[0] : null;

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        {/* L'écart est posé en style en ligne, pas en classe utilitaire : c'est
            la seule forme qu'aucune purge de feuille de style ni aucune règle
            plus spécifique ne peut annuler. Le logo est une image de marque, il
            a besoin d'air avant le texte. */}
        <div style={{ marginBottom: 24 }}>
          <OperatorLogo operator={operator} />
        </div>
        {/* Une station Citiz porte un nom de lieu : il prend la place du titre,
            à la taille d'un nom d'arrêt, et le décompte passe en dessous. */}
        {title ? (
          <>
            <h2 className="text-[26px] font-extrabold leading-[1.1] tracking-tight text-white">
              {title}
            </h2>
            {stationSubtitle && (
              <p className="mt-1 text-sm text-slate-400">{stationSubtitle}</p>
            )}
            <p className="mt-2.5 flex items-baseline gap-2">
              <span className="tabular text-[15px] font-bold text-white">{vehicles.length}</span>
              <span className="text-sm text-slate-400">{text.availableCount(vehicles.length)}</span>
            </p>
          </>
        ) : (
          <p className="flex items-baseline gap-2">
            <span className="tabular text-[26px] font-extrabold leading-none tracking-tight text-white">
              {vehicles.length}
            </span>
            <span className="text-sm text-slate-400">{text.availableCount(vehicles.length)}</span>
          </p>
        )}
        {stationNames.length > 1 && (
          <p className="mt-1.5 truncate text-sm text-slate-400">{text.spots(stationNames.length)}</p>
        )}
      </div>
      <button
        onClick={onClose}
        aria-label={text.close}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 transition hover:bg-slate-700"
      >
        <XMarkIcon className="h-4 w-4 text-white" />
      </button>
    </div>
  );

  const body = single ? (
    <>
      {header}
      <SingleVehicleView vehicle={single} text={text} language={language} />
    </>
  ) : (
    <>
      {header}

      <div className="mt-6 border-b border-slate-800 pb-2">
        <p className="signal-label text-slate-400">{text.available}</p>
      </div>

      {vehicles.length === 0 ? (
        <p className="py-8 text-sm text-slate-500">{text.none}</p>
      ) : (
        <div className="mt-2">
          {vehicles.map(vehicle => {
            // Le point qui porte ce véhicule : c'est vers lui qu'on guide.
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

  const footer = single ? (
    <VehicleActions
      vehicle={single}
      text={text}
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
        className="fixed left-0 top-0 z-60 flex h-screen w-96 flex-col border-r border-slate-800 bg-slate-900 shadow-2xl"
      >
        {/* Le contenu défile, les actions restent : on ne cherche pas un bouton
            en bas d'une liste. */}
        <div className="flex-1 overflow-y-auto p-6 pb-8">{body}</div>
        {footer}
      </motion.div>
    );
  }

  return (
    <Sheet
      style={{ zIndex: 100 }}
      isOpen={isOpen}
      onClose={onClose}
      snapPoints={[0, 0.6, 1]}
      initialSnap={1}
    >
      <Sheet.Container style={{ borderRadius: '24px 24px 0 0', backgroundColor: 'var(--gl-sheet-bg)', zIndex: 100 }}>
        <Sheet.Header>
          <div className="flex justify-center pt-3 pb-1">
            <div className="h-1.5 w-16 rounded-full bg-slate-400/50" />
          </div>
        </Sheet.Header>
        <Sheet.Content disableDrag={state => state.scrollPosition !== 'top'}>
          <div className="flex-1 overflow-y-auto px-5 pb-6 pt-2">{body}</div>
          {/* Sur mobile, le pied prend la marge du bas : sur un écran sans
              bouton physique, un bouton collé au bord est intouchable. */}
          {footer && <div className="pb-[env(safe-area-inset-bottom)]">{footer}</div>}
        </Sheet.Content>
      </Sheet.Container>
      <Sheet.Backdrop onTap={onClose} style={{ zIndex: 99 }} />
    </Sheet>
  );
}
