import {GOOGLE_MAPS_API_KEY} from '@env';

export interface RoutePoint {
  lat: number;
  lng: number;
}

const decodePolyline = (encoded: string): RoutePoint[] => {
  const points: RoutePoint[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    points.push({lat: lat / 1e5, lng: lng / 1e5});
  }
  return points;
};

export const getDirectionsPolyline = async (
  origin: RoutePoint,
  destination: RoutePoint,
  waypoints: RoutePoint[] = [],
): Promise<RoutePoint[]> => {
  try {
    let url = 'https://maps.googleapis.com/maps/api/directions/json'
      + '?origin=' + origin.lat + ',' + origin.lng
      + '&destination=' + destination.lat + ',' + destination.lng
      + '&mode=driving'
      + '&key=' + GOOGLE_MAPS_API_KEY;

    if (waypoints.length > 0) {
      url += '&waypoints=' + waypoints.map(w => w.lat + ',' + w.lng).join('|');
    }

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK' || !data.routes?.length) {
      console.warn('Directions API:', data.status);
      return [];
    }

    let allPoints: RoutePoint[] = [];
    data.routes[0].legs.forEach((leg: any) => {
      leg.steps.forEach((step: any) => {
        allPoints = allPoints.concat(decodePolyline(step.polyline.points));
      });
    });
    return allPoints;
  } catch (e: any) {
    console.error('Directions error:', e?.message || e);
    return [];
  }
};

export const getFullRoutePolyline = async (stops: any[]): Promise<RoutePoint[]> => {
  const valid = stops.filter(
    (s: any) => s.lat && s.lng && s.lat !== 0 && s.lng !== 0,
  );
  if (valid.length < 2) return [];

  const origin = {lat: valid[0].lat, lng: valid[0].lng};
  const dest = {lat: valid[valid.length - 1].lat, lng: valid[valid.length - 1].lng};
  const waypoints = valid.slice(1, -1).map((s: any) => ({lat: s.lat, lng: s.lng}));

  if (waypoints.length <= 23) {
    return getDirectionsPolyline(origin, dest, waypoints);
  }

  let allPoints: RoutePoint[] = [];
  for (let i = 0; i < valid.length - 1; i += 23) {
    const chunk = valid.slice(i, Math.min(i + 25, valid.length));
    if (chunk.length < 2) continue;
    const pts = await getDirectionsPolyline(
      {lat: chunk[0].lat, lng: chunk[0].lng},
      {lat: chunk[chunk.length - 1].lat, lng: chunk[chunk.length - 1].lng},
      chunk.slice(1, -1).map((s: any) => ({lat: s.lat, lng: s.lng})),
    );
    allPoints = allPoints.concat(pts);
  }
  return allPoints;
};