// components/GroupRidersSection.tsx
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Image, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import {
  getFirestore, collection, doc, updateDoc,
  getDoc, getDocs, setDoc,
} from '@react-native-firebase/firestore';
import { getAuth } from '@react-native-firebase/auth';
import { colors } from '../theme/colors';

const db = getFirestore();

export type RiderStatus = 'invited' | 'accepted' | 'declined';

export interface GroupRider {
  uid: string;
  name: string;
  photoURL?: string;
  phone?: string;
  bikeBrand?: string;
  bikeModel?: string;
  status: RiderStatus;
  invitedAt: string;
}

interface Props {
  tripId: string;
  tripTitle: string;
  tripCreatorUid: string;
  tripCreatorName: string;
  tripCreatorPhoto?: string;
  riders: GroupRider[];
  onRidersChange: (riders: GroupRider[]) => void;
  disabled?: boolean;
}

const STATUS_CONFIG: Record<RiderStatus, { label: string; color: string; bg: string }> = {
  invited:  { label: 'Invited',  color: '#D97706', bg: '#D9770622' },
  accepted: { label: 'Joined',   color: '#059669', bg: '#05966922' },
  declined: { label: 'Declined', color: '#DC2626', bg: '#DC262622' },
};


// ── RiderAvatar ──────────────────────────────────────────────────────────────
function RiderAvatar({ photoUrl, name, size = 40 }: { photoUrl?: string; name: string; size?: number }) {
  const [failed, setFailed] = React.useState(false);
  const validUrl = photoUrl && photoUrl.startsWith('https') && !failed;
  if (validUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#333' }}
        onError={() => { console.log('Photo failed:', photoUrl); setFailed(true); }}
        onLoad={() => console.log('Photo loaded:', name)}
      />
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#FFF', fontSize: size * 0.4, fontWeight: '700' }}>
        {name?.charAt(0)?.toUpperCase() || '?'}
      </Text>
    </View>
  );
}


export default function GroupRidersSection({ tripId, tripTitle, tripCreatorUid, tripCreatorName, tripCreatorPhoto, riders, onRidersChange, disabled }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);

  const currentUid = getAuth().currentUser?.uid;
  const [riderPhotos, setRiderPhotos] = useState<Record<string, string>>({});

  const riderUids = riders.map(r => r.uid).join(',');

  // Fetch fresh profile photos for all riders from Firestore
useEffect(() => {
  const allUids = [...riders.map(r => r.uid), tripCreatorUid].filter(Boolean);
  console.log('Photo fetch - riders:', riders.length, 'allUids:', allUids);
    if (allUids.length === 0) return;
    (async () => {
      const photos: Record<string, string> = {};
      for (const uid of allUids) {
  try {
    console.log('Fetching photo for uid:', uid);
    const snap = await getDoc(doc(collection(db, 'users'), uid));
    console.log('Snap exists for', uid, ':', snap.exists());
    if (snap.exists()) {
      const data = snap.data();
      console.log('User data keys:', Object.keys(data));
      const photo = data.photoURL || data.profilePhoto || data.photo || '';
      console.log('Photo value:', photo?.substring(0, 50));
           if (photo && (photo.startsWith('http://') || photo.startsWith('https://'))) {
              photos[uid] = photo;
            }
          }
        } catch {}
      }
      console.log('Loaded rider photos:', JSON.stringify(photos));
      setRiderPhotos(photos);
    })();
  }, [riderUids, tripCreatorUid]);

  // ── Search users ────────────────────────────────────────────────────────────
  const searchUsers = async (q: string) => {
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      // Fetch all users and filter client-side — handles case-insensitive
      // and mid-name search (same approach as tripService.searchUsers)
      const snap = await getDocs(collection(db, 'users'));
      const lower = q.toLowerCase();
      const results = snap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .filter((u: any) =>
          u.uid !== currentUid &&
          !riders.find(r => r.uid === u.uid) &&
          (
            u.name?.toLowerCase().includes(lower) ||
            u.email?.toLowerCase().includes(lower) ||
            u.phone?.includes(q)
          )
        )
        .slice(0, 10);
      setSearchResults(results);
    } catch (e) { console.error('Search error:', e); }
    setSearching(false);
  };

  // ── Invite rider ────────────────────────────────────────────────────────────
  const inviteRider = async (user: any) => {
    setInviting(user.uid);
    try {
      const rawPhoto = user.photoURL || user.profilePhoto || user.photo || '';
      const newRider: GroupRider = {
        uid: user.uid,
        name: user.name,
        photoURL: (rawPhoto && !rawPhoto.startsWith('file://')) ? rawPhoto : '',
        phone: user.phone || '',
        bikeBrand: user.bikeBrand || '',
        bikeModel: user.bikeModel || '',
        status: 'invited',
        invitedAt: new Date().toISOString(),
      };

      const newRiders = [...riders, newRider];
      onRidersChange(newRiders);

      // Save to Firestore trip document
      await updateDoc(doc(collection(db, 'trips'), tripId), {
        riders: newRiders,
      });

      // Write invite notification to Firestore (Cloud Function sends FCM)
      const inviterSnap = await getDoc(doc(collection(db, 'users'), currentUid!));
      const inviterName = inviterSnap.exists() ? inviterSnap.data()?.name : 'A rider';

      await setDoc(doc(collection(db, 'trip_invites'), `${tripId}_${user.uid}`), {
        tripId,
        tripTitle,
        inviterUid: currentUid,
        inviterName,
        inviteeUid: user.uid,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });

      setShowSearch(false);
      setSearchQuery('');
      setSearchResults([]);
      Alert.alert('Invited!', `${user.name} has been invited to join the ride.`);
    } catch (e) {
      console.error('Invite error:', e);
      Alert.alert('Error', 'Could not send invite. Please try again.');
    }
    setInviting(null);
  };

  // ── Remove rider ────────────────────────────────────────────────────────────
  const removeRider = (rider: GroupRider) => {
    Alert.alert(
      'Remove Rider',
      `Remove ${rider.name} from this group ride?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            const newRiders = riders.filter(r => r.uid !== rider.uid);
            onRidersChange(newRiders);
            await updateDoc(doc(collection(db, 'trips'), tripId), { riders: newRiders });
          },
        },
      ]
    );
  };

  const totalRiders = riders.length + 1; // +1 for trip creator

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>👥 Group Riders</Text>
          <Text style={s.subtitle}>
            {totalRiders === 1 ? 'Solo ride' : `${totalRiders} riders total`}
          </Text>
        </View>
        {!disabled && (
          <TouchableOpacity style={s.addBtn} onPress={() => setShowSearch(!showSearch)}>
            <Text style={s.addBtnText}>+ Invite</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Creator row — always shows actual trip creator */}
      <View style={s.creatorRow}>
        <RiderAvatar photoUrl={riderPhotos[tripCreatorUid]} name={tripCreatorName || '?'} />
        <View style={s.riderInfo}>
          <Text style={s.riderName}>
            {tripCreatorName}
            {tripCreatorUid === currentUid ? ' (You)' : ''}
          </Text>
          <Text style={s.riderBike}>Trip Leader</Text>
        </View>
        <View style={[s.statusBadge, { backgroundColor: '#05966922' }]}>
          <Text style={[s.statusText, { color: '#059669' }]}>Leader</Text>
        </View>
      </View>

      {/* Rider list */}
      {riders.map(rider => {
        const status = STATUS_CONFIG[rider.status];
        return (
          <View key={rider.uid} style={s.riderRow}>
            <RiderAvatar photoUrl={riderPhotos[rider.uid]} name={rider.name} />
            <View style={s.riderInfo}>
              <Text style={s.riderName}>{rider.name}</Text>
              {rider.bikeBrand ? (
                <Text style={s.riderBike}>🏍️ {rider.bikeBrand} {rider.bikeModel}</Text>
              ) : null}
            </View>
            <View style={[s.statusBadge, { backgroundColor: status.bg }]}>
              <Text style={[s.statusText, { color: status.color }]}>{status.label}</Text>
            </View>
            {!disabled && (
              <TouchableOpacity onPress={() => removeRider(rider)} style={s.removeBtn}>
                <Text style={s.removeBtnText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      {/* Status summary */}
      {riders.length > 0 && (
        <View style={s.summary}>
          <Text style={s.summaryText}>
            ✅ {riders.filter(r => r.status === 'accepted').length} joined  ·  
            ⏳ {riders.filter(r => r.status === 'invited').length} pending  ·  
            ❌ {riders.filter(r => r.status === 'declined').length} declined
          </Text>
        </View>
      )}

      {/* Search panel */}
      {showSearch && (
        <View style={s.searchPanel}>
          <TextInput
            style={s.searchInput}
            placeholder="Search rider by name..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={q => { setSearchQuery(q); searchUsers(q); }}
            autoFocus
          />
          {searching && <ActivityIndicator size="small" color={colors.primary} style={{ margin: 8 }} />}

          {searchResults.map(user => (
            <TouchableOpacity
              key={user.uid}
              style={s.resultRow}
              onPress={() => inviteRider(user)}
              disabled={inviting === user.uid}
            >
              <Image
                source={{ uri: (user.photoURL && !user.photoURL.startsWith('file://')) ? user.photoURL : (user.profilePhoto && !user.profilePhoto.startsWith('file://')) ? user.profilePhoto : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=333&color=fff&size=128` }}
                style={s.resultPhoto}
              />
              <View style={{ flex: 1 }}>
                <Text style={s.resultName}>{user.name}</Text>
                {user.bikeBrand ? (
                  <Text style={s.resultBike}>🏍️ {user.bikeBrand} {user.bikeModel}</Text>
                ) : null}
              </View>
              {inviting === user.uid ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={s.inviteText}>Invite →</Text>
              )}
            </TouchableOpacity>
          ))}

          {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
            <Text style={s.noResults}>No riders found for "{searchQuery}"</Text>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    backgroundColor: colors.card, borderRadius: 16,
    marginHorizontal: 16, marginBottom: 14, padding: 16,
    borderWidth: 0.5, borderColor: colors.border,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 14,
  },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  addBtn: {
    backgroundColor: colors.primary + '22', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 0.5, borderColor: colors.primary,
  },
  addBtnText: { color: colors.primary, fontWeight: '700', fontSize: 13 },

  creatorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  riderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  riderAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary + '33',
    alignItems: 'center', justifyContent: 'center',
  },
  riderAvatarText: { fontSize: 18 },
  riderPhoto: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#333' },
  riderPhotoFallback: {
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  riderPhotoInitial: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  riderInfo: { flex: 1 },
  riderName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  riderBike: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  statusBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  removeBtn: { padding: 4, marginLeft: 4 },
  removeBtnText: { color: colors.danger, fontSize: 14, fontWeight: '700' },

  summary: {
    marginTop: 10, paddingTop: 10,
    borderTopWidth: 0.5, borderTopColor: colors.border,
  },
  summaryText: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },

  searchPanel: {
    marginTop: 12, backgroundColor: colors.background,
    borderRadius: 10, padding: 10,
    borderWidth: 0.5, borderColor: colors.border,
  },
  searchInput: {
    backgroundColor: colors.card, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    color: colors.text, fontSize: 14, marginBottom: 8,
    borderWidth: 0.5, borderColor: colors.border,
  },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  resultPhoto: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#333' },
  resultName: { color: colors.text, fontSize: 13, fontWeight: '600' },
  resultBike: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  inviteText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  noResults: { color: colors.textMuted, fontSize: 12, textAlign: 'center', padding: 8 },
});
