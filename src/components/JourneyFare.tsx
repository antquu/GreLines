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
import { tx } from '../i18n';

function TransitFareBlock({
  fare,
  language,
}: {
  fare: TransitFareEstimate;
  language: 'fr' | 'en';
}) {
  const isFr = language === 'fr';
  const ticketLabel = tx(isFr).journeyFare.ticketsTicketValueSingle(fare.tickets, fare.tickets > 1 ? 's' : '');

  return (
    <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-3">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
        {tx(isFr).journeyFare.fare}
      </p>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="text-sm text-slate-400">{ticketLabel}</span>
        <span className="text-lg font-bold text-white">{formatEuro(fare.total, language)}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="text-xs text-slate-500">
          {tx(isFr).journeyFare.withA10Ride}
        </span>
        <span className="text-xs font-semibold text-slate-300">
          {formatEuro(fare.carnetTotal, language)}
        </span>
      </div>
      {fare.dayPassPrice !== null && (
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <span className="text-xs text-slate-500">{tx(isFr).journeyFare.dayPass}</span>
          <span className="text-xs font-semibold text-emerald-400">
            {formatEuro(fare.dayPassPrice, language)}
          </span>
        </div>
      )}
      {fare.uncoveredNetworks.length > 0 && (
        <p className="mt-2 text-[0.6875rem] leading-snug text-amber-400">
          {tx(isFr).journeyFare.excludes}
          {fare.uncoveredNetworks.map(networkLabel).join(', ')}
          {tx(isFr).journeyFare.separateTicketRequired}
        </p>
      )}

      <button
        type="button"
        onClick={() => openExternal(PASS_SHOP_URL)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-500"
      >
        <TicketIcon className="h-4 w-4" />
        {tx(isFr).journeyFare.buyATravelPass}
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
      label: tx(isFr).journeyFare.unlock,
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
      label: `${formatEuro(price.perKmRate, language)} / km × ${km.toFixed(1).replace('.', tx(isFr).journeyFare.text)} km`,
      value: formatEuro(Math.round(price.perKmRate * km * 100) / 100, language),
    });
  }

  return (
    <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-3">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
        {tx(isFr).journeyFare.estimatedRide} · {SHARED_OPERATOR_LABELS[shared.operator]}
      </p>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="text-sm text-slate-400">{tx(isFr).journeyFare.total}</span>
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
      <p className="mt-2 text-[0.6875rem] leading-snug text-slate-500">
        {tx(isFr).journeyFare.basedOnTheComputed}
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
        {tx(isFr).journeyFare.ride}
        {uber.productName ? ` · ${uber.productName}` : ''}
      </p>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="text-sm text-slate-400">{tx(isFr).journeyFare.uberEstimate}</span>
        <span className="text-lg font-bold text-white">{label}</span>
      </div>
      <p className="mt-2 text-[0.6875rem] leading-snug text-slate-500">
        {tx(isFr).journeyFare.rangeQuotedByUber}
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
        {tx(isFr).journeyFare.estimatedRide} · {taxi.company}
      </p>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="text-sm text-slate-400">
          {taxi.nightRate
            ? tx(isFr).journeyFare.nightSundayRate
            : tx(isFr).journeyFare.dayRate}
        </span>
        <span className="text-lg font-bold text-white">
          {taxi.lowEstimate}–{taxi.highEstimate} €
        </span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="text-xs text-slate-500">
          {tx(isFr).journeyFare.pickup}
        </span>
        <span className="text-xs font-semibold text-slate-300">
          ~{taxi.pickupDelayMinutes} min
        </span>
      </div>
      <p className="mt-2 text-[0.6875rem] leading-snug text-slate-500">
        {tx(isFr).journeyFare.estimatedFromThePublished}
      </p>
      <div className="mt-3 flex gap-2">
        <a
          href={`tel:${taxi.phone}`}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold transition hover:brightness-110"
          style={{ color: '#0f172a' }}
        >
          <PhoneIcon className="h-4 w-4" />
          {tx(isFr).journeyFare.call}
        </a>
        <button
          type="button"
          onClick={() => openExternal(taxi.bookingUrl)}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500"
        >
          {tx(isFr).journeyFare.book}
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
