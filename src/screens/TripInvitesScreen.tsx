// screens/TripInvitesScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, StatusBar,
} from 'react-native';
import { colors } from '../theme/colors';
import { getMyInvites, respondToInvite, getTripById } from '../services/tripService';

export default function TripInvitesScreen({ navigation }: any) {
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);

  useEffect(() => { loadInvites(); }, []);

  const loadInvites = async () => {
    try {
      const data = await getMyInvites();
      setInvites(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleRespond = async (invite: any, accept: boolean) => {
    setResponding(invite.id);
    try {
      await respondToInvite(invite.id, invite.tripId, accept);
      setInvites(prev => prev.filter(i => i.id !== invite.id));
      Alert.alert(
        accept ? '🎉 Joined!' : 'Declined',
        accept
          ? `You've joined "${invite.tripTitle}". Check your trips to see the route!`
          : `You've declined the invite to "${invite.tripTitle}".`,
      );
    } catch (e) {
      Alert.alert('Error', 'Could not respond to invite.');
    }
    setResponding(null);
  };

  const viewTrip = async (invite: any) => {
    try {
      const trip = await getTripById(invite.tripId);
      if (trip) navigation.navigate('TripPlanner', { loadedTrip: trip });
    } catch {}
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.title}>🏍️ Ride Invites</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : invites.length === 0 ? (
        <View style={s.centered}>
          <Text style={s.emptyIcon}>🏍️</Text>
          <Text style={s.emptyTitle}>No pending invites</Text>
          <Text style={s.emptySubtitle}>When someone invites you to a group ride, it'll appear here.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.list}>
          {invites.map(invite => (
            <View key={invite.id} style={s.card}>
              <View style={s.cardHeader}>
                <Text style={s.inviteIcon}>🏍️</Text>
                <View style={s.cardHeaderText}>
                  <Text style={s.tripTitle} numberOfLines={1}>{invite.tripTitle}</Text>
                  <Text style={s.inviterText}>Invited by {invite.inviterName}</Text>
                </View>
              </View>

              <TouchableOpacity style={s.viewBtn} onPress={() => viewTrip(invite)}>
                <Text style={s.viewBtnText}>👁️ Preview Route</Text>
              </TouchableOpacity>

              <View style={s.actionRow}>
                <TouchableOpacity
                  style={[s.declineBtn, responding === invite.id && s.btnDisabled]}
                  onPress={() => handleRespond(invite, false)}
                  disabled={responding === invite.id}
                >
                  <Text style={s.declineBtnText}>✕ Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.acceptBtn, responding === invite.id && s.btnDisabled]}
                  onPress={() => handleRespond(invite, true)}
                  disabled={responding === invite.id}
                >
                  {responding === invite.id ? (
                    <ActivityIndicator size="small" color={colors.text} />
                  ) : (
                    <Text style={s.acceptBtnText}>✓ Join Ride</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12,
  },
  backBtn: { padding: 8 },
  backArrow: { fontSize: 22, color: colors.text },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: colors.card, borderRadius: 16,
    padding: 16, borderWidth: 0.5, borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  inviteIcon: { fontSize: 32 },
  cardHeaderText: { flex: 1 },
  tripTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  inviterText: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  viewBtn: {
    backgroundColor: colors.background, borderRadius: 10,
    paddingVertical: 8, alignItems: 'center', marginBottom: 12,
    borderWidth: 0.5, borderColor: colors.border,
  },
  viewBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 10 },
  declineBtn: {
    flex: 1, backgroundColor: colors.danger + '22', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
    borderWidth: 0.5, borderColor: colors.danger,
  },
  declineBtnText: { color: colors.danger, fontWeight: '700', fontSize: 14 },
  acceptBtn: {
    flex: 2, backgroundColor: colors.success, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  acceptBtnText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  btnDisabled: { opacity: 0.6 },
});
