import { useMemo } from 'react';
import MapLibreMap, { Source, Layer, Marker } from 'react-map-gl/maplibre';
import { MinimalScreen } from './MinimalScreen';
import { isRoundLine } from './LineBadge';
import type { AccountTrip } from '../services/account';

/**
 * Noir ou blanc sur un aplat de ligne.
 *
 * Le réseau va du bleu nuit au jaune : écrire en blanc par défaut rendrait le
 * bloc illisible sur les lignes claires. La luminance perçue pondère le vert plus
 * que le rouge, et le bleu à peine — l'œil n'y est pas également sensible.
 */
function readableOn(background: string): string {
  const hex = background.replace('#', '');
  if (hex.length !== 6) return '#ffffff';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#0f172a' : '#ffffff';
}

/**
 * Un trajet de l'historique, redessiné.
 *
 * Le tracé vient de l'enregistrement, pas d'un nouveau calcul : un itinéraire
 * recalculé six mois plus tard ne suit pas forcément le même chemin — les lignes
 * sont déviées, les arrêts déplacés. L'historique doit montrer le trajet qu'on a
 * fait, pas celui qu'on ferait aujourd'hui.
 */

const DARK_MAP_STYLE_URL =
  'https://api.maptiler.com/maps/019f7c73-0431-726f-ae5d-598a16a06771/style.json?key=7TQErbyvEqFlis3QMmSl';
const LIGHT_MAP_STYLE_URL =
  'https://api.maptiler.com/maps/019f7c76-a3f8-751b-bedb-d7fe9d83d122/style.json?key=7TQErbyvEqFlis3QMmSl';

function clock(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function TripHistoryScreen({
  trip,
  language,
  isLight,
  onBack,
}: {
  trip: AccountTrip | null;
  language: 'fr' | 'en';
  isLight: boolean;
  onBack: () => void;
}) {
  const isFr = language === 'fr';
  const ink = isLight ? 'text-slate-900' : 'text-white';
  const muted = isLight ? 'text-slate-500' : 'text-slate-400';
  const tile = isLight ? 'bg-slate-200/70' : 'bg-slate-800';

  const path = trip?.path ?? [];

  /**
   * Le cadrage, calculé du tracé.
   *
   * On ne peut pas se contenter d'un centre et d'un zoom fixes : un trajet de
   * deux arrêts et une traversée de l'agglomération ne se regardent pas de la
   * même hauteur. Les bornes du tracé donnent les deux.
   */
  const view = useMemo(() => {
    if (path.length === 0) return { longitude: 5.7245, latitude: 45.1885, zoom: 12 };
    let minLon = path[0][0];
    let maxLon = path[0][0];
    let minLat = path[0][1];
    let maxLat = path[0][1];
    for (const [lon, lat] of path) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    const span = Math.max(maxLon - minLon, maxLat - minLat);
    // Un palier par ordre de grandeur : plus simple à relire qu'un logarithme, et
    // suffisant pour que le trajet tienne dans le cadre.
    const zoom = span > 0.2 ? 10.5 : span > 0.1 ? 11.5 : span > 0.05 ? 12.5 : span > 0.02 ? 13.5 : 14.5;
    return {
      longitude: (minLon + maxLon) / 2,
      latitude: (minLat + maxLat) / 2,
      zoom,
    };
  }, [trip?.id]);

  const line = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: path },
      },
    ],
  };

  return (
    <MinimalScreen
      isOpen={trip !== null}
      title={trip?.destination || (isFr ? 'Trajet' : 'Trip')}
      isLight={isLight}
      onBack={onBack}
    >
      {trip && (
        <div className="px-4 pb-6">
          <div className="h-64 overflow-hidden rounded-2xl">
            {path.length > 1 ? (
              <MapLibreMap
                initialViewState={view}
                mapStyle={isLight ? LIGHT_MAP_STYLE_URL : DARK_MAP_STYLE_URL}
                style={{ width: '100%', height: '100%' }}
                attributionControl={false}
                interactive={false}
              >
                <Source id="history-trip" type="geojson" data={line}>
                  <Layer
                    id="history-trip-line"
                    type="line"
                    paint={{ 'line-color': '#3b82f6', 'line-width': 6, 'line-opacity': 0.95 }}
                    layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  />
                </Source>
                <Marker longitude={path[0][0]} latitude={path[0][1]}>
                  <span className="block h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-500 shadow" />
                </Marker>
                <Marker longitude={path[path.length - 1][0]} latitude={path[path.length - 1][1]}>
                  <span className="block h-4 w-4 rounded-full border-2 border-white bg-emerald-500 shadow" />
                </Marker>
              </MapLibreMap>
            ) : (
              <div className={`flex h-full items-center justify-center text-sm ${tile} ${muted}`}>
                {isFr ? 'Tracé non enregistré' : 'No route recorded'}
              </div>
            )}
          </div>

          <div className={`mt-4 rounded-2xl px-4 py-3 ${tile}`}>
            <div className="flex items-baseline justify-between gap-3">
              <span className={`text-sm ${muted}`}>{isFr ? 'Départ' : 'Departure'}</span>
              <span className={`tabular text-sm font-bold ${ink}`}>{clock(trip.startedAt)}</span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-3">
              <span className={`text-sm ${muted}`}>{isFr ? 'Arrivée' : 'Arrival'}</span>
              <span className={`tabular text-sm font-bold ${ink}`}>{clock(trip.endedAt)}</span>
            </div>
            {trip.travellersHelped > 0 && (
              <div className="mt-1.5 flex items-baseline justify-between gap-3">
                <span className={`text-sm ${muted}`}>
                  {isFr ? 'Voyageurs renseignés' : 'Travellers informed'}
                </span>
                <span className="tabular text-sm font-bold text-emerald-400">
                  {trip.travellersHelped}
                </span>
              </div>
            )}
          </div>

          {/* La timeline du trajet, comme celle d'un itinéraire qu'on vient de
              choisir : rail à la couleur de la ligne, badge dans la forme du
              réseau, deux quais et leurs heures. L'historique doit se lire comme
              le trajet se lisait, sinon on ne reconnaît pas ce qu'on a fait. */}
          {trip.legs.length > 0 && (
            <div className="mt-4">
              {trip.legs.map((leg, index) => (
                <div key={index}>
                  {/* Les points gris de la correspondance, entre deux véhicules. */}
                  {index > 0 && (
                    <div className="flex items-center gap-3 py-2 pl-3">
                      <span className="flex w-7 flex-col items-center gap-1.5">
                        {[0, 1, 2, 3].map((dot) => (
                          <span
                            key={dot}
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: isLight ? '#94a3b8' : '#475569' }}
                          />
                        ))}
                      </span>
                    </div>
                  )}

                  <div
                    className="rounded-2xl px-3 py-3"
                    style={{
                      backgroundColor: leg.color ?? '#3b82f6',
                      color: readableOn(leg.color ?? '#3b82f6'),
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-7 min-w-[1.75rem] flex-shrink-0 items-center justify-center px-2 text-sm font-black ${
                          isRoundLine(leg.line) ? 'rounded-full' : 'rounded-lg'
                        }`}
                        style={{
                          backgroundColor: readableOn(leg.color ?? '#3b82f6'),
                          color: leg.color ?? '#3b82f6',
                        }}
                      >
                        {leg.line}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-base font-black">
                        {leg.to}
                      </span>
                    </div>

                    <div className="mt-3 flex gap-3">
                      {/* Le rail, avec ses deux quais posés dedans. */}
                      <div className="flex w-7 flex-col items-center justify-between self-stretch rounded-full bg-black/20 py-1.5">
                        <span className="h-3 w-3 rounded-full bg-current" />
                        <span className="h-3 w-3 rounded-full bg-current" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-sm font-semibold">{leg.from}</span>
                          <span className="tabular flex-shrink-0 text-sm font-bold">
                            {clock(leg.departure)}
                          </span>
                        </div>
                        <div className="h-8" />
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-sm font-semibold">{leg.to}</span>
                          <span className="tabular flex-shrink-0 text-sm font-bold">
                            {clock(leg.arrival)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </MinimalScreen>
  );
}
