// components/SOSModal.tsx
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Modal, ActivityIndicator, Vibration, Alert,
} from 'react-native';
import { colors } from '../theme/colors';
import { sendSOSAlert, SOS_OPTIONS, SOSType } from '../services/fcmService';
import {
  getFirestore, collection, doc, getDoc,
} from '@react-native-firebase/firestore';
import { getAuth } from '@react-native-firebase/auth';

const db = getFirestore();

interface Props {
  visible: boolean;
  onClose: () => void;
  location: { lat: number; lng: number; address?: string } | null;
  tripTitle?: string;
}

export default function SOSModal({ visible, onClose, location, tripTitle }: Props) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [selectedType, setSelectedType] = useState<SOSType | null>(null);

  const handleSend = async (type: SOSType) => {
    if (!location) {
      Alert.alert('Location unavailable', 'Waiting for GPS fix. Please try again.');
      return;
    }
    setSelectedType(type);
    setSending(true);

    // Vibrate SOS pattern: ... --- ...
    Vibration.vibrate([100, 100, 100, 100, 100, 300, 300, 100, 300, 100, 300, 300, 100, 100, 100, 100, 100]);

    try {
      const uid = getAuth().currentUser?.uid;
      if (!uid) return;

      // Get emergency contacts from Firestore
      const snap = await getDoc(doc(collection(db, 'users'), uid));
      const emergencyContacts: any[] = snap.exists()
        ? (snap.data()?.emergencyContacts || [])
        : [];

      if (emergencyContacts.length === 0) {
        setSending(false);
        setSelectedType(null);
        Alert.alert(
          'No Emergency Contacts',
          'Please add emergency contacts in your Profile first.',
          [{ text: 'OK' }]
        );
        onClose();
        return;
      }

      const recipientUids = emergencyContacts.map((c: any) => c.uid);
      await sendSOSAlert(type, location, recipientUids, tripTitle);

      setSent(true);
      setTimeout(() => {
        setSent(false);
        setSelectedType(null);
        onClose();
      }, 2500);
    } catch (e) {
      console.error('SOS send error:', e);
      Alert.alert('Error', 'Could not send SOS. Please try again.');
      setSelectedType(null);
    }
    setSending(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={s.overlay}>
        <View style={s.sheet}>
          {sent ? (
            // Success state
            <View style={s.sentState}>
              <Text style={s.sentEmoji}>✅</Text>
              <Text style={s.sentTitle}>Alert Sent!</Text>
              <Text style={s.sentSubtitle}>
                Your emergency contacts have been notified with your location.
              </Text>
            </View>
          ) : (
            <>
              <View style={s.header}>
                <View style={s.headerLeft}>
                  <Text style={s.title}>🆘 Send Alert</Text>
                  <Text style={s.subtitle}>Choose alert type to notify your emergency contacts</Text>
                </View>
                <TouchableOpacity onPress={onClose} style={s.closeBtn} disabled={sending}>
                  <Text style={s.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Location indicator */}
              {location ? (
                <View style={s.locationRow}>
                  <Text style={s.locationIcon}>📍</Text>
                  <Text style={s.locationText}>
                    {location.address || `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`}
                  </Text>
                </View>
              ) : (
                <View style={s.locationRow}>
                  <Text style={s.locationIcon}>⚠️</Text>
                  <Text style={[s.locationText, { color: colors.danger }]}>GPS location unavailable</Text>
                </View>
              )}

              {/* SOS option grid */}
              <View style={s.grid}>
                {SOS_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.type}
                    style={[
                      s.optionBtn,
                      { borderColor: opt.color + '60', backgroundColor: opt.color + '18' },
                      selectedType === opt.type && { backgroundColor: opt.color + '40', borderColor: opt.color },
                    ]}
                    onPress={() => handleSend(opt.type)}
                    disabled={sending}
                  >
                    {sending && selectedType === opt.type ? (
                      <ActivityIndicator size="small" color={opt.color} />
                    ) : (
                      <Text style={s.optionEmoji}>{opt.emoji}</Text>
                    )}
                    <Text style={[s.optionLabel, { color: opt.color }]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.disclaimer}>
                This will send a push notification with your GPS location to all your emergency contacts, even if their app is closed.
              </Text>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 36,
    borderTopWidth: 1, borderColor: colors.border,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 14,
  },
  headerLeft: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.cardLight,
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },

  locationRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.background, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16,
  },
  locationIcon: { fontSize: 14 },
  locationText: { color: colors.textSecondary, fontSize: 12, flex: 1 },

  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    marginBottom: 16,
  },
  optionBtn: {
    width: '30%', flexGrow: 1,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 14,
    borderWidth: 1.5, gap: 6,
  },
  optionEmoji: { fontSize: 26 },
  optionLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },

  disclaimer: {
    fontSize: 11, color: colors.textMuted,
    textAlign: 'center', lineHeight: 16,
  },

  sentState: { alignItems: 'center', paddingVertical: 24 },
  sentEmoji: { fontSize: 48, marginBottom: 12 },
  sentTitle: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 8 },
  sentSubtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
