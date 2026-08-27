import React, {useEffect, useState} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, StatusBar, ActivityIndicator,
  Alert, Modal,
} from 'react-native';
import {colors} from '../theme/colors';
import {generateExpenseDraft, getExpenseByTripId} from '../services/expenseService';
import {
  scheduleRideReminder,
  cancelRideReminder,
  requestNotificationPermission,
} from '../services/notificationService';
import {
  getFirestore,
  collection,
  doc,
  deleteDoc,
} from '@react-native-firebase/firestore';
import {getUserTrips, getSharedWithMeTrips, TripPlan} from '../services/tripService';
import {useFocusEffect} from '@react-navigation/native';

const DIFFICULTY_COLORS: Record<string, string> = {
  Easy: colors.success,
  Moderate: colors.warning,
  Challenging: colors.danger,
};

const REMINDER_OPTIONS = [
  {label: '1 hour before', value: 1},
  {label: '3 hours before', value: 3},
  {label: '6 hours before', value: 6},
  {label: '12 hours before', value: 12},
  {label: '1 day before', value: 24},
  {label: '2 days before', value: 48},
];

const TripHistoryScreen = ({navigation}: any) => {
  const [trips, setTrips] = useState<TripPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrip, setSelectedTrip] = useState<TripPlan | null>(null);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminders, setReminders] = useState<Record<string, number>>({});



useFocusEffect(
  React.useCallback(() => {
    loadTrips();
  }, []),
);
 const loadTrips = async () => {
  try {
    const [myTrips, sharedTrips] = await Promise.all([
      getUserTrips(),
      getSharedWithMeTrips(),
    ]);
    const allTrips = [
      ...myTrips.map(t => ({...t, isOwner: true})),
      ...sharedTrips.map(t => ({...t, isOwner: false})),
    ];
    allTrips.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    setTrips(allTrips);
  } catch (e) {
    console.error('Error loading trips:', e);
  } finally {
    setLoading(false);
  }
};
  const handleDeleteTrip = (trip: TripPlan) => {
    Alert.alert(
      'Delete Trip',
      `Are you sure you want to delete "${trip.title}"?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const db = getFirestore();
              await deleteDoc(doc(collection(db, 'trips'), trip.id));
              await cancelRideReminder(trip.id);
              setTrips(prev => prev.filter(t => t.id !== trip.id));
            } catch (e) {
              Alert.alert('Error', 'Could not delete trip.');
            }
          },
        },
      ],
    );
  };

  const handleSetReminder = async (hours: number) => {
    if (!selectedTrip) return;
    setShowReminderModal(false);
    try {
      await cancelRideReminder(selectedTrip.id);
      if (hours > 0) {
        await scheduleRideReminder(
          selectedTrip.id,
          selectedTrip.title,
          selectedTrip.date,
          hours,
        );
        setReminders(prev => ({...prev, [selectedTrip.id]: hours}));
        const label = REMINDER_OPTIONS.find(o => o.value === hours)?.label;
        Alert.alert('✅ Reminder Set', `You'll be notified ${label} for "${selectedTrip.title}"`);
      } else {
        setReminders(prev => {
          const updated = {...prev};
          delete updated[selectedTrip.id];
          return updated;
        });
        Alert.alert('Reminder Removed', 'Reminder has been cancelled.');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not set reminder.');
    }
  };

  const getTripStatus = (trip: TripPlan): {label: string; color: string} => {
    const tripDate = new Date(trip.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    tripDate.setHours(0, 0, 0, 0);
    if (tripDate < today) return {label: 'Completed', color: colors.success};
    if (tripDate.getTime() === today.getTime()) return {label: 'Today!', color: colors.primary};
    return {label: 'Upcoming', color: colors.teal || '#0891B2'};
  };

  const totalKm = trips.reduce((acc, t) => {
    const km = parseFloat(t.totalDistance?.replace(/[^0-9.]/g, '') || '0');
    return acc + km;
  }, 0);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🗺️ My Trips</Text>
        <Text style={styles.headerSubtitle}>Your saved ride plans</Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{trips.length}</Text>
          <Text style={styles.statLabel}>Trips Planned</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{Math.round(totalKm)}</Text>
          <Text style={styles.statLabel}>Total KM</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {trips.filter(t => {
              const d = new Date(t.date);
              d.setHours(0,0,0,0);
              return d >= new Date(new Date().setHours(0,0,0,0));
            }).length}
          </Text>
          <Text style={styles.statLabel}>Upcoming</Text>
        </View>
      </View>

     {loading ? (
  <View style={styles.loadingContainer}>
    <ActivityIndicator color={colors.primary} size="large" />
    <Text style={styles.loadingText}>Loading your trips... ({trips.length} found)</Text>
    <TouchableOpacity 
      style={{backgroundColor: colors.primary, padding: 12, borderRadius: 10, marginTop: 12}}
      onPress={() => setLoading(false)}>
      <Text style={{color: colors.text}}>Force Show Trips</Text>
    </TouchableOpacity>
  </View>
      ) : trips.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>🏍️</Text>
          <Text style={styles.emptyTitle}>No trips yet!</Text>
          <Text style={styles.emptySubtitle}>Plan your first ride and save it to see it here.</Text>
          <TouchableOpacity
            style={styles.planBtn}
            onPress={() => navigation.navigate('Plan')}>
            <Text style={styles.planBtnText}>+ Plan a Ride</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} style={styles.list}>
          {trips.map(trip => {
            const status = getTripStatus(trip);
            const hasReminder = reminders[trip.id];
            return (
              <View key={trip.id} style={styles.tripCard}>
                {/* Status badge */}
                <View style={styles.tripCardHeader}>
                  <View style={[styles.statusBadge, {backgroundColor: status.color + '33'}]}>
                    <Text style={[styles.statusText, {color: status.color}]}>{status.label}</Text>
                  </View>
                  {!trip.isOwner && (
  <View style={[styles.statusBadge, {backgroundColor: '#0891B233'}]}>
    <Text style={[styles.statusText, {color: '#0891B2'}]}>👥 Shared</Text>
  </View>
)}
<TouchableOpacity
  style={[styles.actionBtn, {borderColor: '#0891B2'}]}
  onPress={() => navigation.navigate('ShareTrip', {trip})}>
  <Text style={[styles.actionBtnText, {color: '#0891B2'}]}>👥 Share</Text>
</TouchableOpacity>
                  {hasReminder && (
                    <View style={styles.reminderBadge}>
                      <Text style={styles.reminderBadgeText}>
                        🔔 {REMINDER_OPTIONS.find(o => o.value === hasReminder)?.label}
                      </Text>
                    </View>
                  )}
                  <View style={[styles.diffBadge, {backgroundColor: (DIFFICULTY_COLORS[trip.difficulty] || colors.primary) + '33'}]}>
                    <Text style={[styles.diffText, {color: DIFFICULTY_COLORS[trip.difficulty] || colors.primary}]}>
                      {trip.difficulty}
                    </Text>
                  </View>
                </View>

                {/* Trip info */}
                <Text style={styles.tripTitle} numberOfLines={1}>{trip.title}</Text>
                <Text style={styles.tripRoute}>
                  📍 {trip.origin} → {trip.destination}
                </Text>

                <View style={styles.tripMeta}>
                  <Text style={styles.tripMetaText}>📅 {trip.date}</Text>
                  <Text style={styles.tripMetaText}>⏰ {trip.startTime}</Text>
                  <Text style={styles.tripMetaText}>👥 {trip.riderCount} rider{trip.riderCount > 1 ? 's' : ''}</Text>
                </View>

                <View style={styles.tripStats}>
                  <View style={styles.tripStatItem}>
                    <Text style={styles.tripStatValue}>{trip.totalDistance}</Text>
                    <Text style={styles.tripStatLabel}>Distance</Text>
                  </View>
                  <View style={styles.tripStatItem}>
                    <Text style={styles.tripStatValue}>{trip.totalDuration}</Text>
                    <Text style={styles.tripStatLabel}>Duration</Text>
                  </View>
                  <View style={styles.tripStatItem}>
                    <Text style={styles.tripStatValue}>{trip.stops?.length || 0}</Text>
                    <Text style={styles.tripStatLabel}>Stops</Text>
                  </View>
                </View>

                {/* Actions */}
<View style={styles.tripActions}>
  <TouchableOpacity
    style={[styles.actionBtn, {borderColor: colors.primary}]}
    onPress={() => navigation.navigate('Main', {
      screen: 'Plan',
      params: {loadedTrip: trip, timestamp: Date.now()},
    })}>
    <Text style={[styles.actionBtnText, {color: colors.primary}]}>👁️ View</Text>
  </TouchableOpacity>
  <TouchableOpacity
    style={[styles.actionBtn, {borderColor: '#0891B2'}]}
    onPress={() => navigation.navigate('ShareTrip', {trip})}>
    <Text style={[styles.actionBtnText, {color: '#0891B2'}]}>👥 Share</Text>
  </TouchableOpacity>
  <TouchableOpacity
    style={[styles.actionBtn, {borderColor: colors.warning}]}
   onPress={async () => {
  
  const existing = await getExpenseByTripId(trip.id);
  const draft = existing || generateExpenseDraft(
    trip.id, trip.title, trip.stops || [],
    trip.riderCount || 1, trip.totalDistance || '0',
  );
  navigation.navigate('ExpenseDraft', {trip, expense: draft});
}}>
    <Text style={[styles.actionBtnText, {color: colors.warning}]}>💰 Expenses</Text>
  </TouchableOpacity>
</View>
<View style={styles.tripActions}>
  <TouchableOpacity
    style={styles.actionBtn}
    onPress={() => {
      setSelectedTrip(trip);
      setShowReminderModal(true);
    }}>
    <Text style={styles.actionBtnText}>
      {reminders[trip.id] ? '🔔 Edit Reminder' : '🔔 Set Reminder'}
    </Text>
  </TouchableOpacity>
  <TouchableOpacity
    style={[styles.actionBtn, styles.deleteBtn]}
    onPress={() => handleDeleteTrip(trip)}>
    <Text style={styles.deleteBtnText}>🗑️ Delete</Text>
  </TouchableOpacity>
</View>
              </View>
            );
          })}
          <View style={{height: 30}} />
        </ScrollView>
      )}

      {/* Reminder Modal */}
      <Modal
        visible={showReminderModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowReminderModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>🔔 Set Reminder</Text>
            <Text style={styles.modalSubtitle}>{selectedTrip?.title}</Text>
            <ScrollView>
              {REMINDER_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.reminderOption,
                    reminders[selectedTrip?.id || ''] === opt.value && styles.reminderOptionActive,
                  ]}
                  onPress={() => handleSetReminder(opt.value)}>
                  <Text style={[
                    styles.reminderOptionText,
                    reminders[selectedTrip?.id || ''] === opt.value && styles.reminderOptionTextActive,
                  ]}>
                    {opt.label}
                  </Text>
                  {reminders[selectedTrip?.id || ''] === opt.value && (
                    <Text style={styles.reminderCheck}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.reminderOption, {borderColor: colors.danger}]}
                onPress={() => handleSetReminder(0)}>
                <Text style={[styles.reminderOptionText, {color: colors.danger}]}>
                  🚫 Remove Reminder
                </Text>
              </TouchableOpacity>
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowReminderModal(false)}>
              <Text style={styles.modalCloseBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  header: {padding: 20, paddingBottom: 8},
  headerTitle: {fontSize: 22, fontWeight: '700', color: colors.text},
  headerSubtitle: {fontSize: 13, color: colors.textSecondary, marginTop: 2},
  statsRow: {
    flexDirection: 'row', paddingHorizontal: 16,
    gap: 10, marginBottom: 16,
  },
  statCard: {
    flex: 1, backgroundColor: colors.card, borderRadius: 12,
    padding: 14, alignItems: 'center',
    borderWidth: 0.5, borderColor: colors.border,
  },
  statValue: {fontSize: 22, fontWeight: '700', color: colors.primary},
  statLabel: {fontSize: 11, color: colors.textSecondary, marginTop: 2, textAlign: 'center'},
  loadingContainer: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12},
  loadingText: {fontSize: 14, color: colors.textSecondary},
  emptyContainer: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40},
  emptyEmoji: {fontSize: 60, marginBottom: 16},
  emptyTitle: {fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8},
  emptySubtitle: {fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24},
  planBtn: {backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14},
  planBtnText: {fontSize: 15, fontWeight: '700', color: colors.text},
  list: {flex: 1, paddingHorizontal: 16},
  tripCard: {
    backgroundColor: colors.card, borderRadius: 16,
    padding: 16, marginBottom: 14,
    borderWidth: 0.5, borderColor: colors.border,
  },
  tripCardHeader: {flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap'},
  statusBadge: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8},
  statusText: {fontSize: 11, fontWeight: '700'},
  reminderBadge: {
    backgroundColor: colors.warning + '22', paddingHorizontal: 8,
    paddingVertical: 4, borderRadius: 8,
  },
  reminderBadgeText: {fontSize: 10, color: colors.warning, fontWeight: '600'},
  diffBadge: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8},
  diffText: {fontSize: 11, fontWeight: '700'},
  tripTitle: {fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4},
  tripRoute: {fontSize: 13, color: colors.textSecondary, marginBottom: 8},
  tripMeta: {flexDirection: 'row', gap: 12, marginBottom: 12, flexWrap: 'wrap'},
  tripMetaText: {fontSize: 12, color: colors.textMuted},
  tripStats: {
    flexDirection: 'row', backgroundColor: colors.background,
    borderRadius: 10, padding: 10, marginBottom: 12, gap: 8,
  },
  tripStatItem: {flex: 1, alignItems: 'center'},
  tripStatValue: {fontSize: 14, fontWeight: '700', color: colors.primary},
  tripStatLabel: {fontSize: 10, color: colors.textMuted, marginTop: 2},
  tripActions: {flexDirection: 'row', gap: 10},
  actionBtn: {
    flex: 1, backgroundColor: colors.cardLight || colors.card,
    borderRadius: 10, padding: 10, alignItems: 'center',
    borderWidth: 0.5, borderColor: colors.border,
  },
  tripActions: {flexDirection: 'row', gap: 10, marginTop: 8},
  actionBtnText: {fontSize: 12, fontWeight: '600', color: colors.text},
  deleteBtn: {borderColor: colors.danger, backgroundColor: colors.danger + '11'},
  deleteBtnText: {fontSize: 12, fontWeight: '600', color: colors.danger},
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: colors.card, borderTopLeftRadius: 24,
    borderTopRightRadius: 24, padding: 24,
    maxHeight: '70%',
  },
  modalTitle: {fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 4},
  modalSubtitle: {fontSize: 13, color: colors.textSecondary, marginBottom: 16},
  reminderOption: {
    padding: 14, borderRadius: 12, marginBottom: 8,
    backgroundColor: colors.background,
    borderWidth: 0.5, borderColor: colors.border,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  reminderOptionActive: {borderColor: colors.primary, backgroundColor: colors.primary + '22'},
  reminderOptionText: {fontSize: 14, color: colors.text},
  reminderOptionTextActive: {color: colors.primary, fontWeight: '700'},
  reminderCheck: {fontSize: 16, color: colors.primary},
  modalCloseBtn: {
    backgroundColor: colors.card, borderRadius: 14,
    padding: 14, alignItems: 'center', marginTop: 8,
    borderWidth: 0.5, borderColor: colors.border,
  },
  modalCloseBtnText: {fontSize: 15, color: colors.textSecondary, fontWeight: '600'},
});

export default TripHistoryScreen;