import {
  View, Text, StyleSheet, TouchableOpacity,
  StatusBar, ScrollView, Image,
} from 'react-native';
import { colors } from '../theme/colors';
import React, { useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import JayFMPlayer from '../components/JayFMPlayer';
import { useColorScheme } from 'react-native';

const HomeScreen = ({ navigation, route }: any) => {
  const [userName, setUserName] = useState('');
  const [userProfile, setUserProfile] = useState<any>(null);
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [pendingInvites, setPendingInvites] = useState(0);
  const [quickStats, setQuickStats] = useState([
    { label: 'Trips Planned', value: '0' },
    { label: 'Km Planned', value: '0' },
    { label: 'Hidden Gems', value: '0' },
  ]);
  const [showFM, setShowFM] = useState(false);



  useFocusEffect(
    React.useCallback(() => {
      loadProfile();
    }, []),
  );

  const loadProfile = async () => {
    try {
      const { getAuth } = require('@react-native-firebase/auth');
      const { getUserProfile } = require('../services/authService');
      const { getUserTrips } = require('../services/tripService');
      const { getMyInvites } = require('../services/tripService');
      const currentUser = getAuth().currentUser;
      if (currentUser) {
        const [profile, trips, invites] = await Promise.all([
          getUserProfile(currentUser.uid),
          getUserTrips(),
          getMyInvites(),
        ]);
        if (profile) {
          setUserProfile(profile);
          setUserName(profile.name || currentUser.displayName || 'Rider');
        }
        setPendingInvites(invites.length);
        const totalKm = trips.reduce((acc: number, t: any) =>
          acc + (parseFloat(t.totalDistance?.replace(/[^0-9.]/g, '') || '0')), 0);
        const active = trips.find((t: any) => t.status === 'active');
        if (active) {
          setActiveTrip(active);
        } else {
          // Check if rider joined a group trip that's active
          try {
            const { getSharedWithMeTrips } = require('../services/tripService');
            const sharedTrips = await getSharedWithMeTrips();
            const activeShared = sharedTrips.find((t: any) => t.status === 'active');
            setActiveTrip(activeShared || null);
          } catch {}
        }
        setQuickStats([
          { label: 'Trips Planned', value: trips.length.toString() },
          { label: 'Km Planned', value: Math.round(totalKm).toString() },
          { label: 'Hidden Gems', value: trips.reduce((acc: number, t: any) =>
            acc + (t.stops?.filter((s: any) => s.type === 'hidden_gem').length || 0), 0).toString() },
        ]);
      }
    } catch (e) {}
  };

  const features = [
  { icon: '🗺️', title: 'Plan a Ride', subtitle: 'AI-powered trip planning', screen: 'Main', highlight: true },
  { icon: '📻', title: "Jay's FM", subtitle: 'Tamil radio on the go', screen: null, highlight: true, onPress: () => setShowFM(true) },
  { icon: '👥', title: 'Group Ride', subtitle: 'Ride with your crew', screen: 'GroupRide', highlight: false },
  { icon: '📸', title: 'Memories', subtitle: 'Capture ride moments', screen: 'CreateMemory', highlight: false },
  { icon: '🗺️', title: 'Discovery', subtitle: 'Explore hidden gems', screen: 'DiscoveryMap', highlight: false },
  { icon: '💰', title: 'Expenses', subtitle: 'Split group costs', screen: 'Expenses', highlight: false },
  { icon: '🌦️', title: 'Weather', subtitle: 'Live ride conditions', screen: 'Weather', highlight: false },
];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Good Morning, {userName || 'Rider'} 👋</Text>
            <Text style={styles.subtitle}>
              {userProfile?.bikeBrand
                ? `${userProfile.bikeBrand} ${userProfile.bikeModel}`
                : 'Where are you riding today?'}
            </Text>
          </View>

          {/* Chat icon */}
          <TouchableOpacity
            style={styles.bellBtn}
            onPress={() => navigation.navigate('GroupChatsList')}>
            <Text style={styles.bellIcon}>💬</Text>
          </TouchableOpacity>

          {/* Bell icon with badge */}
          <TouchableOpacity
            style={styles.bellBtn}
            onPress={() => navigation.navigate('Notifications')}>
            <Text style={styles.bellIcon}>🔔</Text>
            {pendingInvites > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {pendingInvites > 9 ? '9+' : pendingInvites}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Profile avatar */}
          <TouchableOpacity
            style={styles.avatar}
            onPress={() => navigation.navigate('Profile')}>
            {userProfile?.photoURL ? (
              <Image source={{ uri: userProfile.photoURL }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>
                {userName ? userName.charAt(0).toUpperCase() : 'R'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Hero CTA */}
        <TouchableOpacity style={styles.heroCta} onPress={() => navigation.navigate('Plan')}>
          <Text style={styles.heroEmoji}>🏍️</Text>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Plan Your Next Adventure</Text>
            <Text style={styles.heroSubtitle}>Let AI craft the perfect route for you</Text>
          </View>
          <Text style={styles.heroArrow}>→</Text>
        </TouchableOpacity>

        {/* Stats */}
        <View style={styles.statsRow}>
          {quickStats.map((stat, i) => (
            <View key={i} style={styles.statCard}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Active ride banner */}
        {activeTrip && (
          <TouchableOpacity
            style={styles.activeRideBanner}
            onPress={() => navigation.navigate('ActiveRide', { trip: activeTrip })}>
            <View style={styles.activeRideLeft}>
              <View style={styles.liveDot} />
              <View>
                <Text style={styles.activeRideTitle}>🔴 Trip In Progress</Text>
                <Text style={styles.activeRideSubtitle} numberOfLines={1}>{activeTrip.title}</Text>
              </View>
            </View>
            <Text style={styles.activeRideArrow}>→</Text>
          </TouchableOpacity>
        )}

        {/* Pending invites banner */}
        {pendingInvites > 0 && (
          <TouchableOpacity
            style={styles.inviteBanner}
            onPress={() => navigation.navigate('Notifications')}>
            <Text style={styles.inviteBannerIcon}>🏍️</Text>
            <Text style={styles.inviteBannerText}>
              You have {pendingInvites} pending ride invite{pendingInvites > 1 ? 's' : ''}
            </Text>
            <Text style={styles.inviteBannerArrow}>→</Text>
          </TouchableOpacity>
        )}

        {/* Feature Grid */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.featureGrid}>
          {features.map((f, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.featureCard, f.highlight && styles.featureCardHighlight]}
              onPress={() => {
                if (f.onPress) { f.onPress(); return; } 
               if (f.screen === 'Main') navigation.navigate('Plan');
else if (f.screen === 'CreateMemory') navigation.navigate('CreateMemory');
else if (f.screen === 'DiscoveryMap') navigation.navigate('DiscoveryMap');
else if (f.screen === 'GroupRide') navigation.navigate('Group');
else if (f.screen === 'Expenses') navigation.navigate('Expenses');
else if (f.screen === 'FM') { console.log('FM button pressed'); setShowFM(true); }
else if (f.screen) navigation.navigate(f.screen);

              }}>
              <Text style={styles.featureIcon}>{f.icon}</Text>
              <Text style={[styles.featureTitle, f.highlight && styles.featureTitleHighlight]}>
                {f.title}
              </Text>
              <Text style={styles.featureSubtitle}>{f.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>


        {/* Tip */}
        <View style={styles.tipCard}>
          <Text style={styles.tipBadge}>🔥 Rider Tip</Text>
          <Text style={styles.tipText}>
            Always check weather 2 hours before your ride — mountain conditions change fast!
          </Text>
        </View>

        <View style={styles.bottomPad} />
        
       
      </ScrollView>
        {/* Jay's FM */}
       <JayFMPlayer
  visible={showFM}
onClose={() => setShowFM(false)}
   currentLocation={null}
   language="ta-IN"
 />

    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10, gap: 10,
  },
  greeting: { fontSize: 22, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },

  // Bell
  bellBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  bellIcon: { fontSize: 22 },
  badge: {
    position: 'absolute', top: 0, right: 0,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.background,
  },
  badgeText: { fontSize: 9, fontWeight: '800', color: '#FFF' },

  // Avatar
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: colors.text },
  avatarImage: { width: 44, height: 44, borderRadius: 22 },

  // Hero
  heroCta: {
    margin: 20, backgroundColor: colors.card, borderRadius: 16, padding: 20,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: colors.primary,
  },
  heroEmoji: { fontSize: 36 },
  heroText: { flex: 1, marginLeft: 14 },
  heroTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  heroSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 3 },
  heroArrow: { fontSize: 22, color: colors.primary, fontWeight: '700' },

  // Stats
  statsRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1, backgroundColor: colors.card, borderRadius: 12,
    padding: 14, alignItems: 'center', borderWidth: 0.5, borderColor: colors.border,
  },
  statValue: { fontSize: 22, fontWeight: '700', color: colors.primary },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },

  // Active ride banner
  activeRideBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.danger + '22', borderRadius: 14,
    padding: 14, marginHorizontal: 16, marginBottom: 10,
    borderWidth: 1, borderColor: colors.danger,
  },
  activeRideLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  activeRideTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  activeRideSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2, maxWidth: 200 },
  activeRideArrow: { fontSize: 20, color: colors.danger },

  // Invite banner
  inviteBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.primary + '18', borderRadius: 14,
    padding: 14, marginHorizontal: 16, marginBottom: 16,
    borderWidth: 1, borderColor: colors.primary + '40',
  },
  inviteBannerIcon: { fontSize: 20 },
  inviteBannerText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600' },
  inviteBannerArrow: { color: colors.primary, fontSize: 16 },

  // Feature grid
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, paddingHorizontal: 20, marginBottom: 12 },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 10, marginBottom: 24 },
  featureCard: {
    width: '47%', backgroundColor: colors.card, borderRadius: 14,
    padding: 16, borderWidth: 0.5, borderColor: colors.border,
  },
  featureCardHighlight: { borderColor: colors.primary, backgroundColor: colors.cardLight },
  featureIcon: { fontSize: 28, marginBottom: 8 },
  featureTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  featureTitleHighlight: { color: colors.primary },
  featureSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },

  // Tip
  tipCard: {
    marginHorizontal: 20, backgroundColor: colors.cardLight, borderRadius: 14,
    padding: 16, borderLeftWidth: 3, borderLeftColor: colors.warning,
  },
  tipBadge: { fontSize: 13, fontWeight: '700', color: colors.warning, marginBottom: 6 },
  tipText: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  bottomPad: { height: 30 },
});

export default HomeScreen;
