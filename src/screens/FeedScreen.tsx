// screens/FeedScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, FlatList, StyleSheet, Text, TouchableOpacity,
  ActivityIndicator, RefreshControl, StatusBar, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getFeedMemories, getFollowing } from '../services/memoryService';
import MemoryCard, { Memory } from '../components/MemoryCard';

export default function FeedScreen() {
  const navigation = useNavigation<any>();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMemories = useCallback(async () => {
    try {
      const following = await getFollowing();
      const data = await getFeedMemories(following);
      setMemories(data as Memory[]);
    } catch (err) {
      console.error('FeedScreen fetchMemories:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchMemories(); }, [fetchMemories]);

  const onRefresh = () => { setRefreshing(true); fetchMemories(); };
  const handleCardPress = (memory: Memory) => navigation.navigate('PostDetail', { memory });
  const handleMapPress = (memory: Memory) => navigation.navigate('MapView', { memory });

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#FF4500" />
        <Text style={styles.loadingText}>Loading rides...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1A1A2E" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>🏍️  Ride Feed</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerIcon}>
            <Text style={{ fontSize: 20 }}>🔔</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addMemoryBtn}
            onPress={() => navigation.navigate('CreateMemory')}>
            <Text style={styles.addMemoryText}>+ Memory</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon} onPress={() => navigation.navigate('TripInvites')}>
  <Text style={{ fontSize: 20 }}>🔔</Text>
</TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={memories}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MemoryCard memory={item} onPress={handleCardPress} onMapPress={handleMapPress} />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF4500" colors={['#FF4500']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🏍️</Text>
            <Text style={styles.emptyTitle}>No memories yet</Text>
            <Text style={styles.emptySubtitle}>Be the first to add a memory from your ride!</Text>
            <TouchableOpacity
              style={styles.emptyAction}
              onPress={() => navigation.navigate('CreateMemory')}>
              <Text style={styles.emptyActionText}>+ Add Memory</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D1A' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0D0D1A' },
  loadingText: { color: '#888', marginTop: 12, fontSize: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 52 : 16, paddingBottom: 12, backgroundColor: '#1A1A2E', borderBottomWidth: 1, borderBottomColor: '#FFFFFF0A' },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: { padding: 4 },
  addMemoryBtn: { backgroundColor: '#FF4500', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  addMemoryText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  list: { paddingBottom: 20 },
  separator: { height: 8, backgroundColor: '#0D0D1A' },
  emptyState: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: '#FFF', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptySubtitle: { color: '#777', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyAction: { marginTop: 24, backgroundColor: '#FF4500', borderRadius: 24, paddingHorizontal: 24, paddingVertical: 12 },
  emptyActionText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
});
