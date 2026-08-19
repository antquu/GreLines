/**
 * Détail du prix d'un itinéraire : titre M réso pour les trajets en transport
 * en commun, décomposition de la course pour les véhicules partagés.
 *
 * Le résumé d'une ligne, affiché sur les cartes de résultats, vit ailleurs :
 * `utils/journeyFare`.
 */

import { PhoneIcon, TicketIcon } from '@heroicons/react/24/solid';
import type { RouteItinerary } from '../services/api';
import { formatEuro } from '../services/sharedPricing';
import {
  estimateTransitFare,
  networkLabel,
  type TransitFareEstimate,
} from '../services/tagFares';
import { SHARED_OPERATOR_LABELS } from '../services/sharedMobility';
import { openExternal } from '../utils/openExternal';
import { PASS_SHOP_URL } from '../services/config';

function TransitFareBlock({
  fare,
  language,
}: {
  fare: TransitFareEstimate;
  language: 'fr' | 'en';
}) {
  const isFr = language === 'fr';
  const ticketLabel = isFr
    ? `${fare.tickets} titre${fare.tickets > 1 ? 's' : ''} · ticket 1 voyage`
    : `${fare.tickets} ticket${fare.tickets > 1 ? 's' : ''} · single ride`;

  return (
    <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-3">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
        {isFr ? 'Tarif' : 'Fare'}
      </p>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="text-sm text-slate-400">{ticketLabel}</span>
        <span className="text-lg font-bold text-white">{formatEuro(fare.total, language)}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="text-xs text-slate-500">
          {isFr ? 'Avec un carnet 10 voyages' : 'With a 10-ride carnet'}
        </span>
        <span className="text-xs font-semibold text-slate-300">
          {formatEuro(fare.carnetTotal, language)}
        </span>
      </div>
      {fare.dayPassPrice !== null && (
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <span className="text-xs text-slate-500">{isFr ? 'Pass 1 jour' : 'Day pass'}</span>
          <span className="text-xs font-semibold text-emerald-400">
            {formatEuro(fare.dayPassPrice, language)}
          </span>
        </div>
      )}
      {/* Le titre M réso ne couvre pas tout : mieux vaut le dire que d'annoncer
          un prix que le voyageur ne paiera pas. */}
      {fare.uncoveredNetworks.length > 0 && (
        <p className="mt-2 text-[11px] leading-snug text-amber-400">
          {isFr ? 'Hors ' : 'Excludes '}
          {fare.uncoveredNetworks.map(networkLabel).join(', ')}
          {isFr ? ' : titre à acheter séparément.' : ': separate ticket required.'}
        </p>
      )}

      {/* Le prix appelle l'achat : la boutique s'ouvre à côté, sans faire perdre
          l'itinéraire en cours. */}
      <button
        type="button"
        onClick={() => openExternal(PASS_SHOP_URL)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-500"
      >
        <TicketIcon className="h-4 w-4" />
        {isFr ? 'Acheter mon titre de transport' : 'Buy a travel pass'}
      </button>
    </div>
  );
}

function SharedFareBlock({ journey, language }: { journey: RouteItinerary; language: 'fr' | 'en' }) {
  const isFr = language === 'fr';
  const shared = journey.shared!;
  const price = shared.price;
  if (!price) return null;

  const rows: Array<{ label: string; value: string }> = [];
  if (price.unlock !== null) {
    rows.push({
      label: isFr ? 'Déverrouillage' : 'Unlock',
      value: formatEuro(price.unlock, language),
    });
  }
  if (price.usageRate !== null) {
    const unit =
      price.usageIntervalMinutes === 1 ? 'min' : `${price.usageIntervalMinutes} min`;
    rows.push({
      label: `${formatEuro(price.usageRate, language)} / ${unit} × ${shared.rideMinutes} min`,
      value: formatEuro(
        Math.round(price.usageRate * Math.ceil(shared.rideMinutes / price.usageIntervalMinutes) * 100) / 100,
        language,
      ),
    });
  }
  if (price.perKmRate !== null) {
    const km = shared.rideMeters / 1000;
    rows.push({
      label: `${formatEuro(price.perKmRate, language)} / km × ${km.toFixed(1).replace('.', isFr ? ',' : '.')} km`,
      value: formatEuro(Math.round(price.perKmRate * km * 100) / 100, language),
    });
  }

  return (
    <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-3">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
        {isFr ? 'Course estimée' : 'Estimated ride'} · {SHARED_OPERATOR_LABELS[shared.operator]}
      </p>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="text-sm text-slate-400">{isFr ? 'Total' : 'Total'}</span>
        <span className="text-lg font-bold text-white">{formatEuro(price.total, language)}</span>
      </div>
      <div className="mt-2 flex flex-col gap-1">
        {rows.map(row => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-slate-500">{row.label}</span>
            <span className="text-xs font-semibold text-slate-300">{row.value}</span>
          </div>
        ))}
      </div>
      {/* Le temps facturé dépend du trafic et du chemin réellement pris : la
          somme annoncée est un ordre de grandeur, pas un devis. */}
      <p className="mt-2 text-[11px] leading-snug text-slate-500">
        {isFr
          ? 'Estimation sur la durée du trajet calculé, hors abonnement et hors stationnement.'
          : 'Based on the computed ride time, excluding passes and parking.'}
      </p>
    </div>
  );
}

function UberFareBlock({ journey, language }: { journey: RouteItinerary; language: 'fr' | 'en' }) {
  const isFr = language === 'fr';
  const uber = journey.uber!;
  const label =
    uber.priceLabel ??
    (typeof uber.lowEstimate === 'number' ? formatEuro(uber.lowEstimate, language) : null);
  if (!label) return null;

  return (
    <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-3">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
        {isFr ? 'Course' : 'Ride'}
        {uber.productName ? ` · ${uber.productName}` : ''}
      </p>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="text-sm text-slate-400">{isFr ? 'Estimation Uber' : 'Uber estimate'}</span>
        <span className="text-lg font-bold text-white">{label}</span>
      </div>
      {/* Uber annonce une fourchette, pas un prix : le tarif définitif dépend du
          trafic et de la demande au moment de la commande. */}
      <p className="mt-2 text-[11px] leading-snug text-slate-500">
        {isFr
          ? 'Fourchette annoncée par Uber, hors majoration au moment de la commande.'
          : 'Range quoted by Uber, before surge pricing at booking time.'}
      </p>
    </div>
  );
}

function TaxiFareBlock({ journey, language }: { journey: RouteItinerary; language: 'fr' | 'en' }) {
  const isFr = language === 'fr';
  const taxi = journey.taxi!;

  return (
    <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-3">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
        {isFr ? 'Course estimée' : 'Estimated ride'} · {taxi.company}
      </p>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="text-sm text-slate-400">
          {taxi.nightRate
            ? isFr ? 'Tarif de nuit / dimanche' : 'Night / Sunday rate'
            : isFr ? 'Tarif de jour' : 'Day rate'}
        </span>
        <span className="text-lg font-bold text-white">
          {taxi.lowEstimate}–{taxi.highEstimate} €
        </span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="text-xs text-slate-500">
          {isFr ? 'Approche' : 'Pickup'}
        </span>
        <span className="text-xs font-semibold text-slate-300">
          ~{taxi.pickupDelayMinutes} min
        </span>
      </div>
      {/* Le prix d'un taxi se lit au compteur : la fourchette vient d'un modèle
          calé sur la grille publiée, elle n'engage pas la compagnie. */}
      <p className="mt-2 text-[11px] leading-snug text-slate-500">
        {isFr
          ? 'Estimation d’après la grille tarifaire publiée ; le montant dû reste celui du compteur.'
          : 'Estimated from the published rate card; the meter sets the final fare.'}
      </p>
      <div className="mt-3 flex gap-2">
        <a
          href={`tel:${taxi.phone}`}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold transition hover:brightness-110"
          style={{ color: '#0f172a' }}
        >
          <PhoneIcon className="h-4 w-4" />
          {isFr ? 'Appeler' : 'Call'}
        </a>
        <button
          type="button"
          onClick={() => openExternal(taxi.bookingUrl)}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500"
        >
          {isFr ? 'Réserver' : 'Book'}
        </button>
      </div>
    </div>
  );
}

export function JourneyFareBlock({
  journey,
  language,
}: {
  journey: RouteItinerary;
  language: 'fr' | 'en';
}) {
  if (journey.taxi) return <TaxiFareBlock journey={journey} language={language} />;
  if (journey.uber) return <UberFareBlock journey={journey} language={language} />;
  if (journey.shared) return <SharedFareBlock journey={journey} language={language} />;
  const fare = estimateTransitFare(journey.allLegs);
  if (!fare) return null;
  return <TransitFareBlock fare={fare} language={language} />;
}
