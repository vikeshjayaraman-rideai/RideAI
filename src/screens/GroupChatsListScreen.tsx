// screens/GroupChatsListScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator, StatusBar, Image,
} from 'react-native';
import { colors } from '../theme/colors';
import { getAuth } from '@react-native-firebase/auth';
import {
  getFirestore, collection, getDocs, query,
  orderBy, limit, getDoc, doc,
} from '@react-native-firebase/firestore';

interface TripChat {
  tripId: string;
  tripTitle: string;
  tripStatus: string;
  lastMessage?: string;
  lastSender?: string;
  lastTime?: string;
  unread: number;
}

export default function GroupChatsListScreen({ navigation }: any) {
  const [chats, setChats] = useState<TripChat[]>([]);
  const [loading, setLoading] = useState(true);
  const uid = getAuth().currentUser?.uid;

  useEffect(() => { loadChats(); }, []);

  const loadChats = async () => {
    try {
      const db = getFirestore();
      // Get all trips where user is creator or accepted rider
      const tripsSnap = await getDocs(collection(db, 'trips'));
      const myTrips = tripsSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(t =>
          t.uid === uid ||
          t.riders?.some((r: any) => r.uid === uid && r.status === 'accepted')
        );

      const chatList: TripChat[] = [];
      for (const trip of myTrips) {
        try {
          const chatSnap = await getDocs(
            query(collection(db, `trips/${trip.id}/rideChat`), orderBy('createdAt', 'desc'), limit(1))
          );
          const lastMsg = chatSnap.docs[0]?.data();
          chatList.push({
            tripId: trip.id,
            tripTitle: trip.title || 'Untitled Trip',
            tripStatus: trip.status || 'planned',
            lastMessage: lastMsg?.message || 'No messages yet',
            lastSender: lastMsg?.senderName || '',
            lastTime: lastMsg?.createdAt || '',
            unread: 0,
          });
        } catch {}
      }

      // Sort by last message time
      chatList.sort((a, b) => {
        if (!a.lastTime) return 1;
        if (!b.lastTime) return -1;
        return new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime();
      });

      setChats(chatList);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const formatTime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    if (diffDays === 1) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const statusColor = (status: string) => {
    if (status === 'active') return '#059669';
    if (status === 'completed') return colors.textMuted;
    return colors.primary;
  };

  const statusLabel = (status: string) => {
    if (status === 'active') return '🔴 Live';
    if (status === 'completed') return '✅ Done';
    return '📅 Planned';
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.title}>💬 Group Chats</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : chats.length === 0 ? (
        <View style={s.centered}>
          <Text style={s.emptyIcon}>💬</Text>
          <Text style={s.emptyTitle}>No group chats yet</Text>
          <Text style={s.emptySubtitle}>Chats appear when you plan or join a group ride</Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={item => item.tripId}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.chatCard}
              onPress={() => navigation.navigate('GroupChat', { tripId: item.tripId, tripTitle: item.tripTitle })}
            >
              <View style={s.chatIcon}>
                <Text style={s.chatIconText}>🏍️</Text>
              </View>
              <View style={s.chatInfo}>
                <View style={s.chatTopRow}>
                  <Text style={s.chatTitle} numberOfLines={1}>{item.tripTitle}</Text>
                  <Text style={s.chatTime}>{formatTime(item.lastTime || '')}</Text>
                </View>
                <View style={s.chatBottomRow}>
                  <View style={[s.statusPill, { backgroundColor: statusColor(item.tripStatus) + '22' }]}>
                    <Text style={[s.statusPillText, { color: statusColor(item.tripStatus) }]}>
                      {statusLabel(item.tripStatus)}
                    </Text>
                  </View>
                  <Text style={s.lastMsg} numberOfLines={1}>
                    {item.lastSender ? `${item.lastSender}: ` : ''}{item.lastMessage}
                  </Text>
                </View>
              </View>
              {item.unread > 0 && (
                <View style={s.unreadBadge}>
                  <Text style={s.unreadText}>{item.unread}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  backArrow: { fontSize: 22, color: colors.text },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  list: { padding: 16, gap: 10 },
  chatCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, padding: 12, borderWidth: 0.5, borderColor: colors.border },
  chatIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' },
  chatIconText: { fontSize: 22 },
  chatInfo: { flex: 1, minWidth: 0 },
  chatTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  chatTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text, marginRight: 8 },
  chatTime: { fontSize: 11, color: colors.textMuted },
  chatBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusPill: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  lastMsg: { flex: 1, fontSize: 12, color: colors.textSecondary },
  unreadBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  unreadText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
});
