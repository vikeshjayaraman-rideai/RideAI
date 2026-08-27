import Geolocation from '@react-native-community/geolocation';
import {PermissionsAndroid, Platform} from 'react-native';
import {RoutePoint} from './directionsService';

export interface LocationPoint {
  lat: number;
  lng: number;
  timestamp: number;
  accuracy?: number;
  speed?: number;
}

export const requestLocationPermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Location Permission',
        message: 'RideAI needs access to your location to track your ride progress.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (e) {
    return false;
  }
};

export const getCurrentLocation = (): Promise<LocationPoint> => {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          timestamp: position.timestamp,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed || 0,
        });
      },
      (error) => reject(error),
      {enableHighAccuracy: true, timeout: 15000, maximumAge: 0},
    );
  });
};

// Watch position — returns a watch ID to clear later
export const watchLocation = (
  onUpdate: (location: LocationPoint) => void,
  onError?: (error: any) => void,
): number => {
  return Geolocation.watchPosition(
    (position) => {
      onUpdate({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        timestamp: position.timestamp,
        accuracy: position.coords.accuracy,
        speed: position.coords.speed || 0,
      });
    },
    (error) => onError?.(error),
    {
      enableHighAccuracy: true,
      distanceFilter: 20, // update every 20 meters
      interval: 10000,    // every 10 seconds
      fastestInterval: 5000,
    },
  );
};

export const clearLocationWatch = (watchId: number) => {
  Geolocation.clearWatch(watchId);
};

// Find the next upcoming stop based on progress along the route
// Find the next upcoming stop based on progress along the route
export const getNextUpcomingStop = (
  current: LocationPoint,
  stops: any[],
): {nextStop: any; nextIndex: number; passedStops: number[]} => {
  const validStops = stops.filter(
    (s) => s.lat && s.lng && s.lat !== 0 && s.lng !== 0,
  );

  if (validStops.length === 0) {
    return {nextStop: null, nextIndex: -1, passedStops: []};
  }

  if (validStops.length === 1) {
    return {nextStop: validStops[0], nextIndex: 0, passedStops: []};
  }

  // For each consecutive pair (A, B), project the current location onto segment AB
  // and find which segment we're "on" based on projection progress (0 to 1)
  // The stop with the highest cumulative "passed" progress wins

  let bestSegmentIndex = 0;
  let bestProjection = -1; // 0 = at A, 1 = at B
  let bestPerpDist = Infinity;

  for (let i = 0; i < validStops.length - 1; i++) {
    const a = validStops[i];
    const b = validStops[i + 1];

    const {projection, perpDist} = projectOntoSegment(
      current.lat, current.lng,
      a.lat, a.lng,
      b.lat, b.lng,
    );

    // Prefer segments we're geometrically closer to
    if (perpDist < bestPerpDist) {
      bestPerpDist = perpDist;
      bestSegmentIndex = i;
      bestProjection = projection;
    }
  }

  // Determine next stop index based on projection along the best segment
  // projection close to 1 means we're near/past point B -> next stop is B+1 (or B if not fully passed)
  let nextIndex: number;
  if (bestProjection >= 0.85) {
    // Close to or past B -> next stop is the one after B
    nextIndex = Math.min(bestSegmentIndex + 2, validStops.length - 1);
  } else {
    // Still heading toward B
    nextIndex = bestSegmentIndex + 1;
  }

  // All stops before nextIndex are considered passed
  const passedStops: number[] = [];
  for (let i = 0; i < nextIndex; i++) {
    passedStops.push(i);
  }

  return {
    nextStop: validStops[nextIndex],
    nextIndex,
    passedStops,
  };
};

// Project point P onto segment AB. Returns projection (0-1 along AB) and perpendicular distance in km
const projectOntoSegment = (
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): {projection: number; perpDist: number} => {
  const kmPerDegLat = 111;
  const kmPerDegLng = 111 * Math.cos((pLat * Math.PI) / 180);

  const px = pLng * kmPerDegLng;
  const py = pLat * kmPerDegLat;
  const ax = aLng * kmPerDegLng;
  const ay = aLat * kmPerDegLat;
  const bx = bLng * kmPerDegLng;
  const by = bLat * kmPerDegLat;

  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;

  const abLenSq = abx * abx + aby * aby;
  let t = abLenSq === 0 ? 0 : (apx * abx + apy * aby) / abLenSq;

  // Clamp for perpendicular distance calc, but keep raw t for projection info
  const tClamped = Math.max(0, Math.min(1, t));
  const closestX = ax + tClamped * abx;
  const closestY = ay + tClamped * aby;

  const dx = px - closestX;
  const dy = py - closestY;
  const perpDist = Math.sqrt(dx * dx + dy * dy);

  return {projection: t, perpDist};
};
// Haversine distance in km between two lat/lng points
export const calculateDistance = (
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number => {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export interface RouteStatus {
  status: 'on_track' | 'off_route' | 'near_stop' | 'unknown';
  nearestStop?: any;
  distanceToNearestStop: number; // km
  distanceFromRoute: number; // km — min distance to any route segment
}

const OFF_ROUTE_THRESHOLD_KM = 3; // beyond this = off route
const NEAR_STOP_THRESHOLD_KM = 0.3; // within this = near stop

// Check route status against actual road polyline (more accurate than straight lines)
export const checkRouteStatusWithPolyline = (
  current: LocationPoint,
  routePolyline: RoutePoint[],
  stops: any[],
): RouteStatus => {
  if (routePolyline.length < 2) {
    // Fallback to straight-line check
    return checkRouteStatus(current, stops);
  }

  // Find minimum distance to any segment of the actual road polyline
  let minRouteDist = Infinity;
  for (let i = 0; i < routePolyline.length - 1; i++) {
    const segDist = distanceToSegment(
      current.lat, current.lng,
      routePolyline[i].lat, routePolyline[i].lng,
      routePolyline[i + 1].lat, routePolyline[i + 1].lng,
    );
    if (segDist < minRouteDist) minRouteDist = segDist;
  }

  // Find nearest stop for "near stop" detection
  const validStops = stops.filter(
    (s) => s.lat && s.lng && s.lat !== 0 && s.lng !== 0,
  );
  let nearestStop = validStops[0];
  let minStopDist = validStops.length > 0
    ? calculateDistance(current.lat, current.lng, validStops[0].lat, validStops[0].lng)
    : Infinity;

  validStops.forEach((stop) => {
    const dist = calculateDistance(current.lat, current.lng, stop.lat, stop.lng);
    if (dist < minStopDist) {
      minStopDist = dist;
      nearestStop = stop;
    }
  });

  let status: RouteStatus['status'] = 'on_track';
  if (minStopDist <= NEAR_STOP_THRESHOLD_KM) {
    status = 'near_stop';
  } else if (minRouteDist > OFF_ROUTE_THRESHOLD_KM_POLYLINE) {
    status = 'off_route';
  }

  return {
    status,
    nearestStop,
    distanceToNearestStop: minStopDist,
    distanceFromRoute: minRouteDist,
  };
};

// Tighter threshold since polyline follows actual roads
const OFF_ROUTE_THRESHOLD_KM_POLYLINE = 0.5;


// Check current location against planned stops
export const checkRouteStatus = (
  current: LocationPoint,
  stops: any[],
): RouteStatus => {
  const validStops = stops.filter(
    (s) => s.lat && s.lng && s.lat !== 0 && s.lng !== 0,
  );

  if (validStops.length === 0) {
    return {status: 'unknown', distanceToNearestStop: -1, distanceFromRoute: -1};
  }

  // Find nearest stop
  let nearestStop = validStops[0];
  let minDist = calculateDistance(current.lat, current.lng, validStops[0].lat, validStops[0].lng);

  validStops.forEach((stop) => {
    const dist = calculateDistance(current.lat, current.lng, stop.lat, stop.lng);
    if (dist < minDist) {
      minDist = dist;
      nearestStop = stop;
    }
  });

  // Check minimum distance to any line segment between consecutive stops
  let minRouteDist = minDist;
  for (let i = 0; i < validStops.length - 1; i++) {
    const segDist = distanceToSegment(
      current.lat, current.lng,
      validStops[i].lat, validStops[i].lng,
      validStops[i + 1].lat, validStops[i + 1].lng,
    );
    if (segDist < minRouteDist) minRouteDist = segDist;
  }

  let status: RouteStatus['status'] = 'on_track';
  if (minDist <= NEAR_STOP_THRESHOLD_KM) {
    status = 'near_stop';
  } else if (minRouteDist > OFF_ROUTE_THRESHOLD_KM) {
    status = 'off_route';
  }

  return {
    status,
    nearestStop,
    distanceToNearestStop: minDist,
    distanceFromRoute: minRouteDist,
  };
};

// Distance from point P to line segment AB, approximated in km using equirectangular projection
const distanceToSegment = (
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): number => {
  // Convert to approx flat coordinates (km) using simple scaling
  const kmPerDegLat = 111;
  const kmPerDegLng = 111 * Math.cos((pLat * Math.PI) / 180);

  const px = pLng * kmPerDegLng;
  const py = pLat * kmPerDegLat;
  const ax = aLng * kmPerDegLng;
  const ay = aLat * kmPerDegLat;
  const bx = bLng * kmPerDegLng;
  const by = bLat * kmPerDegLat;

  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;

  const abLenSq = abx * abx + aby * aby;
  let t = abLenSq === 0 ? 0 : (apx * abx + apy * aby) / abLenSq;
  t = Math.max(0, Math.min(1, t));

  const closestX = ax + t * abx;
  const closestY = ay + t * aby;

  const dx = px - closestX;
  const dy = py - closestY;
  return Math.sqrt(dx * dx + dy * dy);
};