// screens/NotificationsScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, StatusBar,
} from 'react-native';
import { colors } from '../theme/colors';
import { getMyNotifications, markNotificationRead } from '../services/tripService';

export default function NotificationsScreen({ navigation }: any) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadNotifications(); }, []);

  const loadNotifications = async () => {
    try {
      const data = await getMyNotifications();
      // Also fetch trip_started notifications
      const { getFirestore, getDocs, collection, query, where } = require('@react-native-firebase/firestore');
      const { getAuth } = require('@react-native-firebase/auth');
      const uid = getAuth().currentUser?.uid;
      if (uid) {
        const db = getFirestore();
        const tripStartSnap = await getDocs(
          query(collection(db, 'notifications'),
            where('recipientUid', '==', uid),
            where('type', '==', 'trip_started'),
            where('read', '==', false)
          )
        );
        const tripStartNotifs = tripStartSnap.docs.map((d: any) => ({
          id: d.id, ...d.data(), notifType: 'trip_start',
        }));
        const combined = [...data, ...tripStartNotifs].sort((a: any, b: any) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setNotifications(combined);
      } else {
        setNotifications(data);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const openTripStarted = async (notif: any) => {
    await markNotificationRead(notif.id);
    setNotifications(prev => prev.filter(n => n.id !== notif.id));
    try {
      const { getTripById } = require('../services/tripService');
      const trip = await getTripById(notif.tripId);
      if (trip && trip.status === 'active') {
        navigation.navigate('ActiveRide', {
          trip: {
            id: trip.id,
            uid: trip.uid,
            title: trip.title,
            stops: trip.stops,
            riders: trip.riders || [],
          },
        });
      } else {
        navigation.navigate('Main', { screen: 'Plan', params: { loadedTrip: trip } });
      }
    } catch (e) { console.error(e); }
  };

  const openInvite = async (notif: any) => {
    try {
      const { getTripById } = require('../services/tripService');
      const trip = await getTripById(notif.tripId);
      if (trip) {
        navigation.navigate('Main', {
          screen: 'Plan',
          params: {
            loadedTrip: trip,
            inviteId: notif.id,
            isInvited: true,
          },
        });
      }
    } catch (e) { console.error(e); }
  };

  const openResponseNotif = async (notif: any) => {
    // Mark as read
    await markNotificationRead(notif.id);
    setNotifications(prev => prev.filter(n => n.id !== notif.id));
    // Open the trip
    try {
      const { getTripById } = require('../services/tripService');
      const trip = await getTripById(notif.tripId);
      if (trip) {
        navigation.navigate('Main', {
          screen: 'Plan',
          params: { loadedTrip: trip },
        });
      }
    } catch (e) {}
  };

  const renderNotif = (notif: any) => {
    const isInvite = notif.notifType === 'invite';
    const isTripStart = notif.notifType === 'trip_start' || notif.type === 'trip_started';
    const isAccepted = notif.status === 'accepted';

    return (
      <TouchableOpacity
        key={notif.id}
        style={s.card}
        onPress={() => isInvite ? openInvite(notif) : isTripStart ? openTripStarted(notif) : openResponseNotif(notif)}
        activeOpacity={0.85}
      >
        {/* Icon */}
        <View style={[s.iconWrap, {
          backgroundColor: isInvite
            ? colors.primary + '22'
            : isAccepted ? '#05966922' : '#DC262622'
        }]}>
          <Text style={s.icon}>
            {isInvite ? '🏍️' : isTripStart ? '🚦' : isAccepted ? '✅' : '❌'}
          </Text>
        </View>

        {/* Content */}
        <View style={s.cardContent}>
          <Text style={s.cardTitle} numberOfLines={2}>
            {isInvite
              ? `${notif.inviterName} invited you to a ride`
              : notif.message}
          </Text>
          <Text style={s.cardTrip} numberOfLines={1}>📍 {notif.tripTitle}</Text>
          <Text style={s.cardTime}>
            {new Date(notif.createdAt).toLocaleDateString('en-IN', {
              day: 'numeric', month: 'short',
              hour: '2-digit', minute: '2-digit',
            })}
          </Text>
        </View>

        {/* Badge */}
        <View style={s.cardRight}>
          <View style={[s.statusBadge, {
            backgroundColor: isInvite
              ? '#D9770622'
              : isAccepted ? '#05966922' : '#DC262622'
          }]}>
            <Text style={[s.statusText, {
              color: isInvite ? '#D97706' : isAccepted ? '#059669' : '#DC2626'
            }]}>
              {isInvite ? 'Pending' : isAccepted ? 'Joined' : 'Declined'}
            </Text>
          </View>
          <Text style={s.arrow}>→</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.title}>🔔 Notifications</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={s.centered}>
          <Text style={s.emptyIcon}>🔔</Text>
          <Text style={s.emptyTitle}>All caught up!</Text>
          <Text style={s.emptySubtitle}>No pending notifications right now.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.list}>
          {/* Invites section */}
          {notifications.filter(n => n.notifType === 'invite').length > 0 && (
            <>
              <Text style={s.sectionLabel}>RIDE INVITES</Text>
              {notifications.filter(n => n.notifType === 'invite').map(renderNotif)}
            </>
          )}

          {/* Responses section */}
          {notifications.filter(n => n.notifType === 'response').length > 0 && (
            <>
              <Text style={s.sectionLabel}>RESPONSES</Text>
              {notifications.filter(n => n.notifType === 'response').map(renderNotif)}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 14,
    borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  backArrow: { fontSize: 22, color: colors.text },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  list: { padding: 16, gap: 10 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    letterSpacing: 1.5, marginBottom: 8, marginTop: 4,
  },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.card, borderRadius: 14,
    padding: 14, borderWidth: 0.5, borderColor: colors.border,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  icon: { fontSize: 20 },
  cardContent: { flex: 1 },
  cardTitle: { color: colors.text, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  cardTrip: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  cardTime: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: '700' },
  arrow: { color: colors.primary, fontSize: 16 },
});
