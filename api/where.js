function header(request, name) {
  const value = request.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

export default function handler(request, response) {
  const lat = Number(header(request, 'x-vercel-ip-latitude'));
  const lon = Number(header(request, 'x-vercel-ip-longitude'));
  const rawCity = header(request, 'x-vercel-ip-city');
  const known = Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0);

  response.statusCode = 200;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'private, no-store');
  response.end(
    JSON.stringify(
      known
        ? { lat, lon, city: rawCity ? decodeURIComponent(rawCity) : null }
        : { lat: null, lon: null, city: null },
    ),
  );
}
