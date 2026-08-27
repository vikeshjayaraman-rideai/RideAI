import axios from 'axios';
import {GOOGLE_MAPS_API_KEY} from '@env';

export const geocodePlace = async (
  placeName: string,
  region: string = 'IN',
): Promise<{lat: number; lng: number} | null> => {
  try {
    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/geocode/json',
      {
        params: {
          address: placeName,
          region,
          key: GOOGLE_MAPS_API_KEY,
        },
      },
    );
    if (response.data.results.length > 0) {
      const {lat, lng} = response.data.results[0].geometry.location;
      return {lat, lng};
    }
    return null;
  } catch (e) {
    return null;
  }
};

export const geocodeAllStops = async (stops: any[]): Promise<any[]> => {
  const geocoded = await Promise.all(
    stops.map(async stop => {
      if (stop.lat && stop.lat !== 0 && stop.lng && stop.lng !== 0) {
        return stop;
      }
      const coords = await geocodePlace(stop.name);
      return coords ? {...stop, lat: coords.lat, lng: coords.lng} : stop;
    }),
  );
  return geocoded;
};