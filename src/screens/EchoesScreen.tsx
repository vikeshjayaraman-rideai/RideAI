// screens/EchoesScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Image, StatusBar, ActivityIndicator,
} from 'react-native';
import { colors } from '../theme/colors';
import { getMyEchoTrips } from '../services/echoService';

export default function EchoesScreen({ navigation }: any) {
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadTrips(); }, []);

  const loadTrips = async () => {
    try {
      const data = await getMyEchoTrips();
      console.log('Echo trips loaded:', data.length);
      data.forEach((t, i) => console.log(`Trip ${i}:`, t.id, t.title, 'uid:', t.uid, 'memories:', t.memoryCount));
      setTrips(data);
    } catch (e) {
      console.error('loadTrips error:', e);
    }
    setLoading(false);
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return dateStr; }
  };

  const statusColor = (status: string) => {
    if (status === 'active') return '#059669';
    if (status === 'completed') return colors.textMuted;
    return colors.primary;
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>✨ Echoes</Text>
          <Text style={s.subtitle}>Your ride memories & stories</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : trips.length === 0 ? (
        <View style={s.centered}>
          <Text style={s.emptyIcon}>✨</Text>
          <Text style={s.emptyTitle}>No echoes yet</Text>
          <Text style={s.emptySubtitle}>Start a ride and capture memories along the way</Text>
          <TouchableOpacity style={s.startBtn} onPress={() => navigation.navigate('Plan')}>
            <Text style={s.startBtnText}>🏍️ Plan a Ride</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.tripCard}
              onPress={() => navigation.navigate('EchoDetail', { trip: item })}
              activeOpacity={0.85}
            >
              {/* Thumbnail */}
              <View style={s.thumbnail}>
                {item.thumbnail ? (
                  <Image source={{ uri: item.thumbnail }} style={s.thumbnailImg} />
                ) : (
                  <View style={s.thumbnailPlaceholder}>
                    <Text style={s.thumbnailPlaceholderIcon}>🏍️</Text>
                  </View>
                )}
                {item.memoryCount > 0 && (
                  <View style={s.memoryCountBadge}>
                    <Text style={s.memoryCountText}>📸 {item.memoryCount}</Text>
                  </View>
                )}
                <View style={[s.statusDot, { backgroundColor: statusColor(item.status) }]} />
              </View>

              {/* Info */}
              <View style={s.tripInfo}>
                <Text style={s.tripTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={s.tripRoute} numberOfLines={1}>
                  📍 {item.origin} → {item.destination}
                </Text>
                <Text style={s.tripDate}>{formatDate(item.createdAt)}</Text>
                <View style={s.tripStats}>
                  {item.totalDistance && (
                    <View style={s.statChip}>
                      <Text style={s.statChipText}>🛣️ {item.totalDistance}</Text>
                    </View>
                  )}
                  {item.riders?.length > 0 && (
                    <View style={s.statChip}>
                      <Text style={s.statChipText}>👥 {item.riders.length + 1} riders</Text>
                    </View>
                  )}
                  {item.memoryCount > 0 && (
                    <View style={[s.statChip, { backgroundColor: colors.primary + '22' }]}>
                      <Text style={[s.statChipText, { color: colors.primary }]}>✨ {item.memoryCount} echoes</Text>
                    </View>
                  )}
                  {item.hiddenGemCount > 0 && (
                    <View style={[s.statChip, { backgroundColor: '#DB277722' }]}>
                      <Text style={[s.statChipText, { color: '#DB2777' }]}>💎 {item.hiddenGemCount}</Text>
                    </View>
                  )}
                  {!item.isOwner && (
                    <View style={[s.statChip, { backgroundColor: '#05966922' }]}>
                      <Text style={[s.statChipText, { color: '#059669' }]}>👤 {item.myMemoryCount} mine</Text>
                    </View>
                  )}
                </View>
              </View>
              <Text style={s.arrow}>→</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: 24 },
  startBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14 },
  startBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  list: { padding: 16, gap: 12 },
  tripCard: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden', borderWidth: 0.5, borderColor: colors.border },
  thumbnail: { width: 100, height: 110, position: 'relative' },
  thumbnailImg: { width: 100, height: 110 },
  thumbnailPlaceholder: { width: 100, height: 110, backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' },
  thumbnailPlaceholderIcon: { fontSize: 32 },
  memoryCountBadge: { position: 'absolute', bottom: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  memoryCountText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  statusDot: { position: 'absolute', top: 8, right: 8, width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: colors.background },
  tripInfo: { flex: 1, padding: 12, justifyContent: 'center' },
  tripTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 4 },
  tripRoute: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
  tripDate: { fontSize: 11, color: colors.textMuted, marginBottom: 8 },
  tripStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  statChip: { backgroundColor: colors.background, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  statChipText: { fontSize: 10, color: colors.textSecondary, fontWeight: '600' },
  arrow: { color: colors.textMuted, fontSize: 18, alignSelf: 'center', paddingRight: 12 },
});
