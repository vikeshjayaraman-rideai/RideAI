import React, {useState, useEffect} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  StatusBar, ActivityIndicator, ScrollView, Modal,
} from 'react-native';
import MapView, {Marker, PROVIDER_GOOGLE} from 'react-native-maps';
import {colors} from '../theme/colors';
import {RideMemory, MEMORY_TYPES, getHiddenGems, getFeedMemories, getFollowing} from '../services/memoryService';

const darkMapStyle = [
  {elementType: 'geometry', stylers: [{color: '#1d2c4d'}]},
  {elementType: 'labels.text.fill', stylers: [{color: '#8ec3b9'}]},
  {elementType: 'labels.text.stroke', stylers: [{color: '#1a3646'}]},
  {featureType: 'road', elementType: 'geometry', stylers: [{color: '#304a7d'}]},
  {featureType: 'water', elementType: 'geometry', stylers: [{color: '#0e1626'}]},
];

const DiscoveryMapScreen = ({navigation}: any) => {
  const [memories, setMemories] = useState<RideMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMemory, setSelectedMemory] = useState<RideMemory | null>(null);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    loadMemories();
  }, []);

  const loadMemories = async () => {
    try {
      const following = await getFollowing();
      const feed = await getFeedMemories(following);
      setMemories(feed.filter(m => m.location?.lat && m.location?.lng));
    } catch (e) {
      console.error('Discovery map error:', e);
    }
    setLoading(false);
  };

  const getTypeInfo = (type: string) =>
    MEMORY_TYPES.find(t => t.value === type) || MEMORY_TYPES[5];

  const filtered = filter === 'all'
    ? memories
    : memories.filter(m => m.type === filter);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={{
            latitude: memories[0]?.location?.lat || 12.9716,
            longitude: memories[0]?.location?.lng || 77.5946,
            latitudeDelta: 5,
            longitudeDelta: 5,
          }}
          customMapStyle={darkMapStyle}>
          {filtered.map(memory => {
            const typeInfo = getTypeInfo(memory.type);
            return (
              <Marker
                key={memory.id}
                coordinate={{latitude: memory.location.lat, longitude: memory.location.lng}}
                onPress={() => setSelectedMemory(memory)}>
                <View style={[styles.markerPin, {backgroundColor: typeInfo.color}]}>
                  <Text style={styles.markerIcon}>{typeInfo.icon}</Text>
                </View>
              </Marker>
            );
          })}
        </MapView>
      )}

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>🗺️ Discovery Map</Text>
        <Text style={styles.countBadge}>{filtered.length}</Text>
      </View>

      {/* Filter chips */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <TouchableOpacity
            style={[styles.filterChip, filter === 'all' && styles.filterChipActive]}
            onPress={() => setFilter('all')}>
            <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>All</Text>
          </TouchableOpacity>
          {MEMORY_TYPES.map(t => (
            <TouchableOpacity
              key={t.value}
              style={[styles.filterChip, filter === t.value && {backgroundColor: t.color, borderColor: t.color}]}
              onPress={() => setFilter(t.value)}>
              <Text style={styles.filterText}>{t.icon} {t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Memory detail modal */}
      {selectedMemory && (
        <View style={styles.detailCard}>
          <TouchableOpacity style={styles.closeDetail} onPress={() => setSelectedMemory(null)}>
            <Text style={styles.closeDetailText}>✕</Text>
          </TouchableOpacity>
          {selectedMemory.photos?.[0] && (
            <Image source={{uri: selectedMemory.photos[0]}} style={styles.detailPhoto} />
          )}
          <View style={styles.detailContent}>
            <View style={styles.detailHeader}>
              <View style={[
                styles.detailTypeBadge,
                {backgroundColor: getTypeInfo(selectedMemory.type).color + '33'},
              ]}>
                <Text style={styles.detailTypeText}>
                  {getTypeInfo(selectedMemory.type).icon} {getTypeInfo(selectedMemory.type).label}
                </Text>
              </View>
              <Text style={styles.detailLikes}>❤️ {selectedMemory.likes.length}</Text>
            </View>
            <Text style={styles.detailTitle}>{selectedMemory.title}</Text>
            <Text style={styles.detailAuthor}>by {selectedMemory.userName}</Text>
            {selectedMemory.location?.placeName ? (
              <Text style={styles.detailLocation}>📍 {selectedMemory.location.placeName}</Text>
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  map: {flex: 1},
  loadingContainer: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 44, paddingHorizontal: 12, paddingBottom: 12,
    backgroundColor: 'rgba(15,15,26,0.85)',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center',
  },
  backArrow: {fontSize: 20, color: colors.text},
  topBarTitle: {flex: 1, fontSize: 17, fontWeight: '700', color: colors.text},
  countBadge: {
    backgroundColor: colors.primary, borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
    fontSize: 13, fontWeight: '700', color: colors.text,
    overflow: 'hidden',
  },
  filterContainer: {
    position: 'absolute', top: 100, left: 0, right: 0,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: 'rgba(22,33,62,0.9)', borderWidth: 0.5,
    borderColor: colors.border, marginRight: 8,
  },
  filterChipActive: {backgroundColor: colors.primary, borderColor: colors.primary},
  filterText: {fontSize: 12, color: colors.text, fontWeight: '600'},
  filterTextActive: {color: colors.text},
  markerPin: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFF',
  },
  markerIcon: {fontSize: 16},
  detailCard: {
    position: 'absolute', bottom: 24, left: 16, right: 16,
    backgroundColor: colors.card, borderRadius: 20,
    overflow: 'hidden', borderWidth: 0.5, borderColor: colors.border,
  },
  closeDetail: {
    position: 'absolute', top: 10, right: 10, zIndex: 10,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  closeDetailText: {fontSize: 14, color: '#FFF', fontWeight: '700'},
  detailPhoto: {width: '100%', height: 150},
  detailContent: {padding: 14},
  detailHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8},
  detailTypeBadge: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8},
  detailTypeText: {fontSize: 12, fontWeight: '700', color: colors.text},
  detailLikes: {fontSize: 13, color: colors.text},
  detailTitle: {fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4},
  detailAuthor: {fontSize: 12, color: colors.textMuted, marginBottom: 4},
  detailLocation: {fontSize: 12, color: colors.textSecondary},
});

export default DiscoveryMapScreen;
