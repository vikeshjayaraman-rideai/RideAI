import React, {useEffect, useRef, useState} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Dimensions,
} from 'react-native';
import MapView, {
  Marker, Polyline, Callout, PROVIDER_GOOGLE,
} from 'react-native-maps';
import {colors} from '../theme/colors';
import {geocodeAllStops} from '../services/geocodeService';

const {width} = Dimensions.get('window');

const STOP_COLORS: Record<string, string> = {
  meeting: '#7C3AED',
  checkpoint: '#2563EB',
  tea: '#D97706',
  lunch: '#DC2626',
  fuel: '#059669',
  hidden_gem: '#DB2777',
  destination: '#FF6B35',
};

const STOP_ICONS: Record<string, string> = {
  meeting: '🚩',
  checkpoint: '📍',
  tea: '☕',
  lunch: '🍽️',
  fuel: '⛽',
  hidden_gem: '💎',
  destination: '🏁',
};

interface TripMapViewProps {
  stops: any[];
  origin: string;
  destination: string;
}

const TripMapView: React.FC<TripMapViewProps> = ({stops, origin, destination}) => {
  const mapRef = useRef<MapView>(null);
  const [geocodedStops, setGeocodedStops] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStop, setSelectedStop] = useState<any>(null);

  useEffect(() => {
    loadCoordinates();
  }, [stops]);

  const loadCoordinates = async () => {
    setLoading(true);
    try {
      const geocoded = await geocodeAllStops(stops);
      setGeocodedStops(geocoded);

      // Fit map to show all stops
      const validStops = geocoded.filter(s => s.lat && s.lat !== 0);
      if (validStops.length > 0 && mapRef.current) {
        setTimeout(() => {
          mapRef.current?.fitToCoordinates(
            validStops.map(s => ({latitude: s.lat, longitude: s.lng})),
            {
              edgePadding: {top: 60, right: 40, bottom: 60, left: 40},
              animated: true,
            },
          );
        }, 500);
      }
    } catch (e) {
      console.error('Geocoding error:', e);
    }
    setLoading(false);
  };

  const validStops = geocodedStops.filter(s => s.lat && s.lat !== 0);
  const polylineCoords = validStops.map(s => ({
    latitude: s.lat,
    longitude: s.lng,
  }));

  const initialRegion = validStops.length > 0 ? {
    latitude: validStops[0].lat,
    longitude: validStops[0].lng,
    latitudeDelta: 2,
    longitudeDelta: 2,
  } : {
    latitude: 12.9716,
    longitude: 77.5946,
    latitudeDelta: 5,
    longitudeDelta: 5,
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Loading map...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        showsTraffic={false}
        customMapStyle={darkMapStyle}>

        {/* Route polyline */}
        {polylineCoords.length > 1 && (
          <Polyline
            coordinates={polylineCoords}
            strokeColor={colors.primary}
            strokeWidth={3}
            lineDashPattern={[1]}
          />
        )}

        {/* Stop markers */}
        {validStops.map((stop, index) => (
          <Marker
            key={stop.id}
            coordinate={{latitude: stop.lat, longitude: stop.lng}}
            onPress={() => setSelectedStop(stop)}>
            <View style={[
              styles.markerContainer,
              {backgroundColor: STOP_COLORS[stop.type]},
            ]}>
              <Text style={styles.markerIcon}>{STOP_ICONS[stop.type]}</Text>
            </View>
            <Callout tooltip>
              <View style={styles.callout}>
                <Text style={styles.calloutTime}>{stop.time}</Text>
                <Text style={styles.calloutName}>{stop.name}</Text>
                <Text style={styles.calloutDesc} numberOfLines={2}>
                  {stop.description}
                </Text>
                {stop.duration && (
                  <Text style={styles.calloutMeta}>⏱ {stop.duration}</Text>
                )}
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* Stop count badge */}
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{validStops.length} stops on map</Text>
      </View>

     {/* Legend */}
<View style={styles.legend}>
  <View style={styles.legendRow}>
    {Object.entries(STOP_ICONS).map(([type, icon]) => (
      <View key={type} style={styles.legendItem}>
        <View style={[styles.legendDot, {backgroundColor: STOP_COLORS[type]}]}>
          <Text style={styles.legendIcon}>{icon}</Text>
        </View>
        <Text style={styles.legendLabel}>{type.replace('_', ' ')}</Text>
      </View>
    ))}
  </View>
</View>
    </View>
  );
};



const darkMapStyle = [
  {elementType: 'geometry', stylers: [{color: '#1d2c4d'}]},
  {elementType: 'labels.text.fill', stylers: [{color: '#8ec3b9'}]},
  {elementType: 'labels.text.stroke', stylers: [{color: '#1a3646'}]},
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{color: '#304a7d'}],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{color: '#2c6675'}],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{color: '#0e1626'}],
  },
];

const styles = StyleSheet.create({
  container: {height: 380, borderRadius: 16, overflow: 'hidden', marginBottom: 8},
  map: {flex: 1},
  loadingContainer: {
    height: 380, backgroundColor: colors.card,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, gap: 12,
  },
  loadingText: {fontSize: 14, color: colors.textSecondary},
  markerContainer: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFFFFF',
  },
  markerIcon: {fontSize: 16},
  callout: {
    backgroundColor: colors.card, borderRadius: 12,
    padding: 12, minWidth: 180, maxWidth: 220,
    borderWidth: 0.5, borderColor: colors.border,
  },
  calloutTime: {fontSize: 12, color: colors.primary, fontWeight: '700', marginBottom: 3},
  calloutName: {fontSize: 14, fontWeight: '700', color: '#1A1A2E', marginBottom: 3},
  calloutDesc: {fontSize: 12, color: '#4A5568', lineHeight: 16},
  calloutMeta: {fontSize: 11, color: '#718096', marginTop: 4},
  badge: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: colors.card + 'EE', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 0.5, borderColor: colors.border,
  },
  badgeText: {fontSize: 12, color: colors.text, fontWeight: '600'},
  legend: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.card + 'EE', padding: 8,
  },
  legendRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center'},
  legendItem: {flexDirection: 'row', alignItems: 'center', gap: 4},
  legendDot: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  legendIcon: {fontSize: 10},
  legendLabel: {fontSize: 10, color: colors.textSecondary, textTransform: 'capitalize'},
});

export default TripMapView;