import React, {useState} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import {colors} from '../theme/colors';
import {searchUsers, shareTripWithUser, revokeShareAccess, TripPlan, SharePermission} from '../services/tripService';

const ShareTripScreen = ({route, navigation}: any) => {
  const trip: TripPlan = route.params?.trip;
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);
  const [sharedWith, setSharedWith] = useState<SharePermission[]>(
    trip.sharedWith || [],
  );

  const handleSearch = async (text: string) => {
    setSearchQuery(text);
    if (text.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await searchUsers(text);
      setSearchResults(results);
    } catch (e) {
      console.error('Search error:', e);
    }
    setSearching(false);
  };

  const handleShare = async (user: any, permission: 'view' | 'edit') => {
    setSharing(user.uid);
    try {
      await shareTripWithUser(trip.id, user, permission);
      const newShare: SharePermission = {
        uid: user.uid,
        email: user.email,
        name: user.name,
        permission,
        sharedAt: new Date().toISOString(),
      };
      setSharedWith(prev => {
        const existing = prev.findIndex(s => s.uid === user.uid);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = newShare;
          return updated;
        }
        return [...prev, newShare];
      });
      setSearchResults([]);
      setSearchQuery('');
      Alert.alert(
        '✅ Shared!',
        `${user.name} can now ${permission === 'edit' ? 'view and edit' : 'view'} this trip.`,
      );
    } catch (e) {
      Alert.alert('Error', 'Could not share trip.');
    }
    setSharing(null);
  };

  const handleRevoke = (userId: string, userName: string) => {
    Alert.alert(
      'Remove Access',
      `Remove ${userName}'s access to this trip?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await revokeShareAccess(trip.id, userId);
              setSharedWith(prev => prev.filter(s => s.uid !== userId));
            } catch (e) {
              Alert.alert('Error', 'Could not revoke access.');
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Share Trip</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{trip.title}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Search */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🔍 Find RideAI Users</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name or email..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={handleSearch}
              autoCapitalize="none"
            />
            {searching && <ActivityIndicator color={colors.primary} size="small" style={{marginLeft: 8}} />}
          </View>

          {/* Search Results */}
          {searchResults.map(user => (
            <View key={user.uid} style={styles.userCard}>
              <View style={styles.userAvatar}>
                <Text style={styles.userAvatarText}>
                  {user.name?.charAt(0).toUpperCase() || '?'}
                </Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{user.name}</Text>
                <Text style={styles.userEmail}>{user.email}</Text>
                {user.bikeBrand && (
                  <Text style={styles.userBike}>🏍️ {user.bikeBrand} {user.bikeModel}</Text>
                )}
              </View>
              <View style={styles.shareButtons}>
                <TouchableOpacity
                  style={styles.viewBtn}
                  disabled={sharing === user.uid}
                  onPress={() => handleShare(user, 'view')}>
                  {sharing === user.uid ? (
                    <ActivityIndicator size="small" color={colors.text} />
                  ) : (
                    <Text style={styles.viewBtnText}>👁️ View</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.editBtn}
                  disabled={sharing === user.uid}
                  onPress={() => handleShare(user, 'edit')}>
                  <Text style={styles.editBtnText}>✏️ Edit</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {searchQuery.length >= 2 && searchResults.length === 0 && !searching && (
            <Text style={styles.noResults}>No RideAI users found for "{searchQuery}"</Text>
          )}
        </View>

        {/* Already shared with */}
        {sharedWith.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>👥 Shared With ({sharedWith.length})</Text>
            {sharedWith.map(share => (
              <View key={share.uid} style={styles.sharedUserCard}>
                <View style={styles.userAvatar}>
                  <Text style={styles.userAvatarText}>
                    {share.name?.charAt(0).toUpperCase() || '?'}
                  </Text>
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{share.name}</Text>
                  <Text style={styles.userEmail}>{share.email}</Text>
                </View>
                <View style={styles.permissionTag}>
                  <View style={[
                    styles.permBadge,
                    {backgroundColor: share.permission === 'edit' ? colors.primary + '33' : colors.success + '33'},
                  ]}>
                    <Text style={[
                      styles.permText,
                      {color: share.permission === 'edit' ? colors.primary : colors.success},
                    ]}>
                      {share.permission === 'edit' ? '✏️ Can Edit' : '👁️ View Only'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.revokeBtn}
                    onPress={() => handleRevoke(share.uid, share.name)}>
                    <Text style={styles.revokeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Info box */}
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            👁️ <Text style={{fontWeight: '700', color: colors.text}}>View Only</Text>
            {' '}— Friend can see the itinerary and map but cannot make changes.{'\n\n'}
            ✏️ <Text style={{fontWeight: '700', color: colors.text}}>Can Edit</Text>
            {' '}— Friend can add/remove stops and modify the plan.
          </Text>
        </View>

        <View style={{height: 40}} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  header: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, paddingTop: 20, gap: 12,
  },
  backBtn: {padding: 8},
  backArrow: {fontSize: 22, color: colors.text},
  headerText: {flex: 1},
  headerTitle: {fontSize: 18, fontWeight: '700', color: colors.text},
  headerSubtitle: {fontSize: 13, color: colors.textSecondary, marginTop: 2},
  card: {
    backgroundColor: colors.card, borderRadius: 16, padding: 16,
    marginHorizontal: 16, marginBottom: 14,
    borderWidth: 0.5, borderColor: colors.border,
  },
  cardTitle: {fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 14},
  searchRow: {flexDirection: 'row', alignItems: 'center'},
  searchInput: {
    flex: 1, backgroundColor: colors.background, borderRadius: 10,
    padding: 12, color: colors.text, fontSize: 15,
    borderWidth: 0.5, borderColor: colors.border,
  },
  userCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderTopWidth: 0.5,
    borderTopColor: colors.border, gap: 10,
  },
  sharedUserCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderTopWidth: 0.5,
    borderTopColor: colors.border, gap: 10,
  },
  userAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary, alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {fontSize: 16, fontWeight: '700', color: colors.text},
  userInfo: {flex: 1},
  userName: {fontSize: 14, fontWeight: '700', color: colors.text},
  userEmail: {fontSize: 12, color: colors.textSecondary, marginTop: 1},
  userBike: {fontSize: 11, color: colors.textMuted, marginTop: 2},
  shareButtons: {flexDirection: 'row', gap: 6},
  viewBtn: {
    backgroundColor: colors.success + '33', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 0.5, borderColor: colors.success,
  },
  viewBtnText: {fontSize: 11, fontWeight: '700', color: colors.success},
  editBtn: {
    backgroundColor: colors.primary + '33', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 0.5, borderColor: colors.primary,
  },
  editBtnText: {fontSize: 11, fontWeight: '700', color: colors.primary},
  noResults: {
    fontSize: 13, color: colors.textMuted,
    textAlign: 'center', marginTop: 12, paddingBottom: 8,
  },
  permissionTag: {flexDirection: 'row', alignItems: 'center', gap: 6},
  permBadge: {paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8},
  permText: {fontSize: 11, fontWeight: '700'},
  revokeBtn: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.danger + '33', alignItems: 'center',
    justifyContent: 'center',
  },
  revokeBtnText: {fontSize: 12, fontWeight: '700', color: colors.danger},
  infoCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16,
    marginHorizontal: 16, borderWidth: 0.5, borderColor: colors.border,
  },
  infoText: {fontSize: 13, color: colors.textSecondary, lineHeight: 22},
});

export default ShareTripScreen;