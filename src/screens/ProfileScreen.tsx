// screens/ProfileScreen.tsx
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, StatusBar, Alert, Image,
} from 'react-native';
import { colors } from '../theme/colors';
import { getUserProfile, signOut } from '../services/authService';
import { getAuth } from '@react-native-firebase/auth';
import EmergencyContactsSection, { EmergencyContact } from '../components/EmergencyContactsSection';

const ProfileScreen = ({ navigation }: any) => {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    try {
      const currentUser = getAuth().currentUser;
      if (currentUser) {
        const p = await getUserProfile(currentUser.uid);
        setProfile(p);
        setEmergencyContacts((p as any)?.emergencyContacts || []);
      }
    } catch (e) {}
    setLoading(false);
  };

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => { await signOut(); navigation.replace('Login'); },
      },
    ]);
  };

  const InfoRow = ({ icon, label, value }: any) => (
    <View style={styles.infoRow}>
      <Text style={styles.infoIcon}>{icon}</Text>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value || 'Not set'}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Profile</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Onboarding', {
              uid: getAuth().currentUser?.uid,
              email: profile?.email, name: profile?.name,
              photoURL: profile?.photoURL, existingProfile: profile,
            })}>
            <Text style={styles.editText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          {profile?.photoURL ? (
            <Image source={{ uri: profile.photoURL }} style={styles.avatarLargePhoto} />
          ) : (
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarLargeText}>
                {profile?.name ? profile.name.charAt(0).toUpperCase() : 'R'}
              </Text>
            </View>
          )}
          <Text style={styles.profileName}>{profile?.name || 'Rider'}</Text>
          <Text style={styles.profileEmail}>{profile?.email}</Text>
          {profile?.ridingStyle && (
            <View style={styles.styleBadge}>
              <Text style={styles.styleBadgeText}>{profile.ridingStyle} Rider</Text>
            </View>
          )}
          {profile?.bikePhotoURL && (
            <Image source={{ uri: profile.bikePhotoURL }} style={styles.bikePhotoPreview} />
          )}
        </View>

        {/* Personal Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Info</Text>
          <InfoRow icon="👤" label="Full Name" value={profile?.name} />
          <InfoRow icon="📧" label="Email" value={profile?.email} />
          <InfoRow icon="📱" label="Phone" value={profile?.phone} />
          <InfoRow icon="⚧" label="Gender" value={profile?.gender} />
        </View>

        {/* Vehicle Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Ride 🏍️</Text>
          <InfoRow icon="🏷️" label="Brand" value={profile?.bikeBrand} />
          <InfoRow icon="🔧" label="Model" value={profile?.bikeModel} />
          <InfoRow icon="📅" label="Year" value={profile?.bikeYear} />
          <InfoRow icon="🎨" label="Color" value={profile?.bikeColor} />
          <InfoRow icon="🔢" label="Vehicle No." value={profile?.vehicleNumber} />
        </View>

        {/* Riding Style */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Riding Style ⚡</Text>
          <InfoRow icon="🛣️" label="Style" value={profile?.ridingStyle} />
          <InfoRow icon="🏆" label="Experience" value={profile?.experienceLevel} />
        </View>

        {/* ── Emergency Contacts ── */}
        <EmergencyContactsSection
          contacts={emergencyContacts}
          onContactsChange={setEmergencyContacts}
        />

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>🚪 Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', padding: 16, paddingTop: 20,
  },
  backBtn: { padding: 8 },
  backArrow: { fontSize: 22, color: colors.text },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  editText: { fontSize: 15, color: colors.primary, fontWeight: '600' },
  avatarSection: { alignItems: 'center', paddingVertical: 24 },
  avatarLarge: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.primary, alignItems: 'center',
    justifyContent: 'center', marginBottom: 12,
  },
  avatarLargeText: { fontSize: 32, fontWeight: '700', color: colors.text },
  avatarLargePhoto: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 2, borderColor: colors.primary, marginBottom: 12,
  },
  profileName: { fontSize: 22, fontWeight: '700', color: colors.text },
  profileEmail: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  styleBadge: {
    backgroundColor: colors.cardLight, paddingHorizontal: 12,
    paddingVertical: 4, borderRadius: 12, marginTop: 8,
  },
  styleBadgeText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  bikePhotoPreview: {
    width: 300, height: 150, borderRadius: 12,
    marginTop: 12, borderWidth: 0.5, borderColor: colors.border,
  },
  section: {
    backgroundColor: colors.card, borderRadius: 16,
    marginHorizontal: 16, marginBottom: 14, padding: 16,
    borderWidth: 0.5, borderColor: colors.border,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 12 },
  infoRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  infoIcon: { fontSize: 18, marginRight: 12 },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 11, color: colors.textMuted, marginBottom: 2 },
  infoValue: { fontSize: 14, color: colors.text, fontWeight: '500' },
  signOutBtn: {
    backgroundColor: colors.card, marginHorizontal: 16,
    borderRadius: 14, padding: 16, alignItems: 'center',
    borderWidth: 0.5, borderColor: colors.danger, marginTop: 8,
  },
  signOutText: { fontSize: 15, fontWeight: '700', color: colors.danger },
});

export default ProfileScreen;
