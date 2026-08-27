// screens/MemoryMapScreen.tsx
import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Platform, Image, ScrollView,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Memory } from '../components/MemoryCard';

interface Props {
  route: { params: { memory: Memory } };
  navigation: any;
}

export default function MemoryMapScreen({ route, navigation }: Props) {
  const { memory } = route.params;
  const { lat, lng, placeName, address } = memory.location;

  const region = {
    latitude: lat,
    longitude: lng,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

  return (
    <View style={s.root}>
      {/* Nav */}
      <View style={s.nav}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={s.navTitle} numberOfLines={1}>
          📍 {placeName || address || 'Memory Location'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Map */}
      <MapView
        style={s.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton
      >
        <Marker coordinate={{ latitude: lat, longitude: lng }}>
          <View style={s.markerWrap}>
            <Image
              source={{ uri: memory.photos?.[0] || `https://ui-avatars.com/api/?name=${encodeURIComponent(memory.userName)}&background=FF4500&color=fff&size=128` }}
              style={s.markerPhoto}
            />
            <View style={s.markerPin} />
          </View>
        </Marker>
      </MapView>

      {/* Info card at bottom */}
      <View style={s.infoCard}>
        <View style={s.infoRow}>
          {memory.photos?.[0] ? (
            <Image source={{ uri: memory.photos[0] }} style={s.thumb} />
          ) : null}
          <View style={s.infoText}>
            <Text style={s.infoTitle} numberOfLines={1}>{memory.title}</Text>
            <Text style={s.infoPlace} numberOfLines={1}>
              📍 {placeName || address}
            </Text>
            <Text style={s.infoMeta}>
              by {memory.userName}  ·  {memory.type.replace('_', ' ')}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={s.viewPostBtn}
          onPress={() => navigation.navigate('PostDetail', { memory })}>
          <Text style={s.viewPostBtnText}>View Post →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D1A' },
  nav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
    paddingBottom: 12,
    backgroundColor: '#16162A',
    borderBottomWidth: 1, borderBottomColor: '#FFFFFF0A',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  backIcon: { color: '#FF4500', fontSize: 24 },
  navTitle: { color: '#FFF', fontSize: 15, fontWeight: '700', flex: 1, textAlign: 'center' },

  map: { flex: 1 },

  markerWrap: { alignItems: 'center' },
  markerPhoto: {
    width: 48, height: 48, borderRadius: 24,
    borderWidth: 3, borderColor: '#FF4500',
    backgroundColor: '#222',
  },
  markerPin: {
    width: 3, height: 10,
    backgroundColor: '#FF4500',
    marginTop: -2,
  },

  infoCard: {
    backgroundColor: '#16162A',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#FFFFFF0A',
  },
  infoRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#222' },
  infoText: { flex: 1, justifyContent: 'center' },
  infoTitle: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  infoPlace: { color: '#888', fontSize: 12, marginTop: 3 },
  infoMeta: { color: '#555', fontSize: 11, marginTop: 3 },
  viewPostBtn: {
    backgroundColor: '#FF4500',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  viewPostBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
});
