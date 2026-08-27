import React, {useState, useEffect, useRef} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Alert, Dimensions, ScrollView, Image, TextInput,
  KeyboardAvoidingView, Platform, FlatList,
} from 'react-native';
import MapView, {Marker, Polyline, PROVIDER_GOOGLE} from 'react-native-maps';
import {colors} from '../theme/colors';
import {
  requestLocationPermission, getCurrentLocation, watchLocation,
  clearLocationWatch, checkRouteStatus, getNextUpcomingStop,
} from '../services/locationService';
import {endTrip} from '../services/tripService';
import SOSModal from '../components/SOSModal';
import {
  subscribeToRiderLocations, updateRiderLocation,
  markRiderInactive, RiderLocation, getDistanceKm,
} from '../services/riderTrackingService';
import {
  sendRideMessage, subscribeToRideChat, sendOffRouteAlert,
  QUICK_MESSAGES, EMOJI_LIST, RideMessage,
} from '../services/rideChatService';
import {getAuth} from '@react-native-firebase/auth';
import VoiceCompanionPanel from '../components/VoiceCompanionPanel';
import CaptureMemoryModal from '../components/CaptureMemoryModal';
import JayFMPlayer from '../components/JayFMPlayer';
import GroupVoiceMeet from '../components/GroupVoiceMeet';

const {width, height} = Dimensions.get('window');

const STOP_ICONS: Record<string, string> = {
  meeting: '🚩', checkpoint: '📍', tea: '☕', lunch: '🍽️',
  fuel: '⛽', hidden_gem: '💎', destination: '🏁',
  stay: '🏨', food_stop: '🍽️',
};
const STOP_COLORS: Record<string, string> = {
  meeting: '#7C3AED', checkpoint: '#2563EB', tea: '#D97706',
  lunch: '#DC2626', fuel: '#059669', hidden_gem: '#DB2777',
  destination: '#FF6B35', stay: '#0891B2', food_stop: '#DC2626',
};
const darkMapStyle = [
  {elementType: 'geometry', stylers: [{color: '#1d2c4d'}]},
  {elementType: 'labels.text.fill', stylers: [{color: '#8ec3b9'}]},
  {elementType: 'labels.text.stroke', stylers: [{color: '#1a3646'}]},
  {featureType: 'road', elementType: 'geometry', stylers: [{color: '#304a7d'}]},
  {featureType: 'road.highway', elementType: 'geometry', stylers: [{color: '#2c6675'}]},
  {featureType: 'water', elementType: 'geometry', stylers: [{color: '#0e1626'}]},
];

const decodePolyline = (encoded: string) => {
  const points: {lat: number; lng: number}[] = [];
  let idx = 0, lat = 0, lng = 0;
  while (idx < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    points.push({lat: lat / 1e5, lng: lng / 1e5});
  }
  return points;
};

const ActiveRideScreen = ({route, navigation}: any) => {
  const trip = route.params?.trip;

  // ── Refs ──────────────────────────────────────────────────────────────────
  const mapRef = useRef<MapView>(null);
  const roadPolylineRef = useRef<any[]>([]);
  const watchIdRef = useRef<number | null>(null);
  const unsubscribeRidersRef = useRef<(() => void) | null>(null);
  const unsubscribeChatRef = useRef<(() => void) | null>(null);
  const chatListRef = useRef<FlatList>(null);
  const currentUid = useRef(getAuth().currentUser?.uid || '').current;

  // ── State ─────────────────────────────────────────────────────────────────
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const [routeStatus, setRouteStatus] = useState<any>(null);
  const [nextStopInfo, setNextStopInfo] = useState<any>(null);
  const [showStopList, setShowStopList] = useState(false);
  const [roadPolyline, setRoadPolyline] = useState<any[]>([]);
  const [loadingRoute, setLoadingRoute] = useState(true);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [traveledPolyline, setTraveledPolyline] = useState<any[]>([]);
  const [showSOS, setShowSOS] = useState(false);
  const [currentAddress, setCurrentAddress] = useState('');
  const [groupRiders, setGroupRiders] = useState<RiderLocation[]>([]);
  const [isLeader] = useState(() => trip?.uid === getAuth().currentUser?.uid);

  // Panel state
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'riders' | 'chat'>('riders');
  const [unreadChat, setUnreadChat] = useState(0);

  // Chat state
  const [messages, setMessages] = useState<RideMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [taggedRider, setTaggedRider] = useState<{uid: string; name: string} | null>(null);
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<RideMessage | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionList, setShowMentionList] = useState(false);

  // Off-route alert state
  const [showJay, setShowJay] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [showFM, setShowFM] = useState(false);
  const [showVoiceMeet, setShowVoiceMeet] = useState(false);
  const [voiceMeetActive, setVoiceMeetActive] = useState(false);
  const [voiceMeetMinimized, setVoiceMeetMinimized] = useState(false);
  const [voiceMeetMuted, setVoiceMeetMuted] = useState(false);
  const [nearbyPlace, setNearbyPlace] = useState<{lat: number; lng: number; name: string} | null>(null);
  const [offRouteAlertActive, setOffRouteAlertActive] = useState(false);
  const [offRouteRiderName, setOffRouteRiderName] = useState('');
  const [alertDismissed, setAlertDismissed] = useState(false);
  const offRouteTimerRef = useRef<any>(null);

  const validStops = (trip?.stops || []).filter(
    (s: any) => s.lat && s.lng && s.lat !== 0 && s.lng !== 0,
  );
  const otherRiders = groupRiders.filter(r => r.uid !== currentUid);
  const offRouteCount = otherRiders.filter(r => r.status === 'off_route').length;

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    loadRoadRoute();
    startTracking();
    loadProfile();

    if (trip?.id) {
      // Subscribe to rider locations
      if (trip?.riders?.length > 0) {
        unsubscribeRidersRef.current = subscribeToRiderLocations(
          trip.id, (riders) => setGroupRiders(riders),
        );
      }
      // Subscribe to chat
      unsubscribeChatRef.current = subscribeToRideChat(trip.id, (msgs) => {
        setMessages(msgs);
        if (!panelExpanded || activeTab !== 'chat') {
          setUnreadChat(prev => prev + 1);
        }
        setTimeout(() => chatListRef.current?.scrollToEnd({animated: true}), 100);
      });
    }

    return () => {
      if (watchIdRef.current !== null) clearLocationWatch(watchIdRef.current);
      if (unsubscribeRidersRef.current) unsubscribeRidersRef.current();
      if (unsubscribeChatRef.current) unsubscribeChatRef.current();
      if (trip?.id) markRiderInactive(trip.id);
      if (offRouteTimerRef.current) clearInterval(offRouteTimerRef.current);
    };
  }, []);

  // Clear unread when chat tab opened
  useEffect(() => {
    if (panelExpanded && activeTab === 'chat') setUnreadChat(0);
  }, [panelExpanded, activeTab]);

  // ── Functions ─────────────────────────────────────────────────────────────
  const loadProfile = async () => {
    try {
      const {getFirestore, doc, getDoc, collection} = require('@react-native-firebase/firestore');
      const uid = getAuth().currentUser?.uid;
      if (!uid) return;
      const user = getAuth().currentUser;
      if (user?.photoURL?.startsWith('https')) { setProfilePhoto(user.photoURL); return; }
      const snap = await getDoc(doc(collection(getFirestore(), 'users'), uid));
      if (snap.exists()) {
        const d = snap.data();
        const p = d.photoURL || d.profilePhoto || '';
        if (p.startsWith('https')) setProfilePhoto(p);
      }
    } catch {}
  };

  const updateTraveledPath = (location: any) => {
    const fullRoute = roadPolylineRef.current;
    if (!location || !fullRoute.length) return;
    let closestIdx = 0, minDist = Infinity;
    fullRoute.forEach((pt: any, i: number) => {
      const d = Math.sqrt(Math.pow(pt.lat - location.lat, 2) + Math.pow(pt.lng - location.lng, 2));
      if (d < minDist) { minDist = d; closestIdx = i; }
    });
    setTraveledPolyline([...fullRoute.slice(0, closestIdx + 1), {lat: location.lat, lng: location.lng}]);
  };

  const loadRoadRoute = async () => {
    setLoadingRoute(true);
    try {
      const valid = (trip?.stops || []).filter((s: any) => s.lat && s.lng && s.lat !== 0 && s.lng !== 0);
      if (valid.length < 2) { setLoadingRoute(false); return; }
      const origin = valid[0];
      const dest = valid[valid.length - 1];
      const middle = valid.slice(1, -1);
      let wps = middle.length > 8
        ? middle.filter((_: any, i: number) => i % Math.floor(middle.length / 8) === 0).slice(0, 8)
        : middle;
      let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${dest.lat},${dest.lng}&mode=driving&key=AIzaSyAmINnlsVMmBideXP9MeFwVaBxYSH5ijEI`;
      if (wps.length) url += '&waypoints=' + wps.map((w: any) => `${w.lat},${w.lng}`).join('|');
      const data = await (await fetch(url)).json();
      if (data.status === 'OK' && data.routes?.length) {
        let pts: any[] = [];
        data.routes[0].legs.forEach((leg: any) =>
          leg.steps.forEach((step: any) => { pts = pts.concat(decodePolyline(step.polyline.points)); })
        );
        const sampled = pts.filter((_: any, i: number) => i % 5 === 0);
        setRoadPolyline(sampled);
        roadPolylineRef.current = sampled;
      }
    } catch (e) { console.error('Route error:', e); }
    setLoadingRoute(false);
  };

  const startTracking = async () => {
    const granted = await requestLocationPermission();
    if (!granted) { Alert.alert('Permission Denied', 'Location permission required.'); return; }
    try {
      const initial = await getCurrentLocation();
      setCurrentLocation(initial);
      setRouteStatus(checkRouteStatus(initial, trip.stops));
      setNextStopInfo(getNextUpcomingStop(initial, trip.stops));
      updateTraveledPath(initial);
      centerMap(initial);
      if (trip?.id) updateRiderLocation(trip.id, initial, checkRouteStatus(initial, trip.stops).status, isLeader);
    } catch {}
    const id = watchLocation(
      (location) => {
        setCurrentLocation(location);
        const st = checkRouteStatus(location, trip.stops);
        setRouteStatus(st);
        setNextStopInfo(getNextUpcomingStop(location, trip.stops));
        updateTraveledPath(location);
        reverseGeocode(location.lat, location.lng);
        if (trip?.id) updateRiderLocation(trip.id, location, st.status, isLeader);

        // Off-route alert logic
        if (st.status === 'off_route' && !alertDismissed) {
          if (!offRouteAlertActive) {
            setOffRouteAlertActive(true);
            const myName = getAuth().currentUser?.displayName || 'A rider';
            setOffRouteRiderName(myName);
            // Send first alert immediately
            sendOffRouteAlert(trip.id, myName, {lat: location.lat, lng: location.lng});
            // Start recurring 30s alerts
            offRouteTimerRef.current = setInterval(async () => {
              if (!alertDismissed) {
                await sendOffRouteAlert(trip.id, myName, {lat: location.lat, lng: location.lng});
              }
            }, 30000);
          }
        } else if (st.status !== 'off_route') {
          // Back on route — stop alerts
          if (offRouteAlertActive) {
            setOffRouteAlertActive(false);
            setAlertDismissed(false);
            if (offRouteTimerRef.current) { clearInterval(offRouteTimerRef.current); offRouteTimerRef.current = null; }
          }
        }
      },
      (error) => console.error('Location error:', error),
    );
    watchIdRef.current = id;
  };

  const centerMap = (loc: any) => mapRef.current?.animateToRegion({latitude: loc.lat, longitude: loc.lng, latitudeDelta: 0.05, longitudeDelta: 0.05}, 1000);
  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const data = await (await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=AIzaSyAmINnlsVMmBideXP9MeFwVaBxYSH5ijEI`)).json();
      if (data.results?.[0]) setCurrentAddress(data.results[0].formatted_address);
    } catch {}
  };

  const handleEndTrip = () => {
    Alert.alert('🏁 End Trip?', 'Stop GPS tracking and mark trip complete.', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'End Trip', style: 'destructive', onPress: async () => {
        try {
          await endTrip(trip.id);
          if (watchIdRef.current !== null) clearLocationWatch(watchIdRef.current);
          if (unsubscribeRidersRef.current) unsubscribeRidersRef.current();
          if (unsubscribeChatRef.current) unsubscribeChatRef.current();
          await markRiderInactive(trip.id);
          Alert.alert('🎉 Trip Completed!', 'Great ride!');
          navigation.goBack();
        } catch { Alert.alert('Error', 'Could not end trip.'); }
      }},
    ]);
  };

  // ── Chat functions ─────────────────────────────────────────────────────────
  const handleSendQuick = async (text: string) => {
    if (!trip?.id) return;
    setSending(true);
    try {
      await sendRideMessage(trip.id, text, true, taggedRider?.uid, taggedRider?.name,
        replyTo ? { id: replyTo.id, senderName: replyTo.senderName, message: replyTo.message } : undefined);
      setTaggedRider(null);
      setReplyTo(null);
    } catch { Alert.alert('Error', 'Could not send message.'); }
    setSending(false);
  };

  const handleSendCustom = async () => {
    if (!chatInput.trim() || !trip?.id) return;
    setSending(true);
    try {
      await sendRideMessage(trip.id, chatInput.trim(), false, taggedRider?.uid, taggedRider?.name,
        replyTo ? { id: replyTo.id, senderName: replyTo.senderName, message: replyTo.message } : undefined);
      setChatInput('');
      setTaggedRider(null);
      setReplyTo(null);
      setShowEmoji(false);
    } catch { Alert.alert('Error', 'Could not send message.'); }
    setSending(false);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-IN', {hour: '2-digit', minute: '2-digit', hour12: true});
  };

  const statusConfig: any = {
    on_track: {label: '✅ On Track', color: colors.success},
    off_route: {label: '⚠️ Off Route', color: colors.danger},
    near_stop: {label: '📍 At Checkpoint', color: colors.primary},
    unknown: {label: '🛰️ Locating...', color: colors.textMuted},
  };
  const currentStatus = statusConfig[routeStatus?.status] || statusConfig.unknown;
  const initialRegion = currentLocation
    ? {latitude: currentLocation.lat, longitude: currentLocation.lng, latitudeDelta: 0.05, longitudeDelta: 0.05}
    : validStops.length > 0
    ? {latitude: validStops[0].lat, longitude: validStops[0].lng, latitudeDelta: 0.5, longitudeDelta: 0.5}
    : {latitude: 12.9716, longitude: 77.5946, latitudeDelta: 5, longitudeDelta: 5};

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Map */}
      <MapView ref={mapRef} provider={PROVIDER_GOOGLE} style={styles.map}
        initialRegion={initialRegion} showsUserLocation={false} customMapStyle={darkMapStyle}>

        {roadPolyline.length > 1 && (
          <Polyline coordinates={roadPolyline.map((p: any) => ({latitude: p.lat, longitude: p.lng}))}
            strokeColor="#05d440" strokeWidth={5} lineDashPattern={[6, 8]} />
        )}
        {traveledPolyline.length > 1 && (
          <Polyline coordinates={traveledPolyline.map((p: any) => ({latitude: p.lat, longitude: p.lng}))}
            strokeColor="#FF6B35" strokeWidth={5} />
        )}

        {validStops.map((stop: any, index: number) => {
          const isPassed = nextStopInfo?.passedStops?.includes(index);
          const isNext = nextStopInfo?.nextIndex === index;
          return (
            <Marker key={stop.id} coordinate={{latitude: stop.lat, longitude: stop.lng}}
              title={`#${index + 1} ${stop.name}`} description={stop.time}>
              <View style={styles.markerWrapper}>
                <View style={[styles.markerContainer, {backgroundColor: STOP_COLORS[stop.type] || colors.primary},
                  isPassed && styles.markerPassed, isNext && styles.markerNext]}>
                  <Text style={styles.markerIcon}>{STOP_ICONS[stop.type] || '📍'}</Text>
                  <View style={styles.markerNumberBadge}><Text style={styles.markerNumberText}>{index + 1}</Text></View>
                </View>
                <View style={styles.markerLabel}>
                  <Text style={styles.markerLabelText} numberOfLines={1}>
                    {stop.name.length > 18 ? stop.name.substring(0, 18) + '…' : stop.name}
                  </Text>
                </View>
              </View>
            </Marker>
          );
        })}

        {currentLocation && (
          <Marker coordinate={{latitude: currentLocation.lat, longitude: currentLocation.lng}} anchor={{x: 0.5, y: 0.5}}>
            <View style={styles.riderMarker}>
              <View style={styles.riderRing} />
              <View style={styles.riderAvatar}>
                {profilePhoto
                  ? <Image source={{uri: profilePhoto}} style={styles.riderAvatarImage} />
                  : <Text style={styles.riderAvatarIcon}>🏍️</Text>}
              </View>
            </View>
          </Marker>
        )}

        {/* Nearby place marker from Jay */}
        {nearbyPlace && (
          <Marker
            coordinate={{ latitude: nearbyPlace.lat, longitude: nearbyPlace.lng }}
            title={nearbyPlace.name}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.nearbyPlaceMarker}>
              <Text style={styles.nearbyPlaceIcon}>📍</Text>
              <View style={styles.nearbyPlaceLabel}>
                <Text style={styles.nearbyPlaceLabelText} numberOfLines={1}>
                  {nearbyPlace.name.length > 20 ? nearbyPlace.name.substring(0, 20) + '…' : nearbyPlace.name}
                </Text>
              </View>
            </View>
          </Marker>
        )}

        {otherRiders.map(rider => (
          <Marker key={rider.uid} coordinate={{latitude: rider.lat, longitude: rider.lng}} anchor={{x: 0.5, y: 0.5}}
            title={rider.name}>
            <View style={styles.groupRiderMarker}>
              <View style={[styles.groupRiderRing, {borderColor: rider.status === 'off_route' ? '#DC262688' : '#7C3AED88'}]} />
              {rider.photoURL
                ? <Image source={{uri: rider.photoURL}} style={styles.groupRiderAvatar} />
                : <View style={[styles.groupRiderAvatar, styles.groupRiderAvatarFallback]}>
                    <Text style={styles.groupRiderInitial}>{rider.name?.charAt(0)?.toUpperCase() || '?'}</Text>
                  </View>}
              <View style={[styles.groupRiderStatusDot, {
                backgroundColor: rider.status === 'on_track' ? '#059669' :
                  rider.status === 'off_route' ? '#DC2626' :
                  rider.status === 'near_stop' ? '#2563EB' : '#D97706',
              }]} />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.topBarTitle}>
          <Text style={styles.tripTitle} numberOfLines={1}>{trip?.title}</Text>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE TRACKING</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.listBtn} onPress={() => setShowStopList(true)}>
          <Text style={styles.listBtnIcon}>📋</Text>
        </TouchableOpacity>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}><View style={styles.legendOrange} /><Text style={styles.legendText}>Traveled</Text></View>
        <View style={styles.legendItem}><View style={styles.legendGreen} /><Text style={styles.legendText}>Planned</Text></View>
      </View>

      {loadingRoute && (
        <View style={styles.routeLoadingBadge}>
          <Text style={styles.routeLoadingText}>🗺️ Loading road route...</Text>
        </View>
      )}

      {/* Status card */}
      <View style={[styles.statusCard, trip?.riders?.length > 0 && {bottom: panelExpanded ? 310 : 136}]}>
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, {backgroundColor: currentStatus.color + '33'}]}>
            <Text style={[styles.statusBadgeText, {color: currentStatus.color}]}>{currentStatus.label}</Text>
          </View>
          {nextStopInfo?.nextStop && (
            <TouchableOpacity style={styles.nextStopBtn} onPress={() => {
              if (!nextStopInfo?.nextStop || !currentLocation || !mapRef.current) return;
              mapRef.current.fitToCoordinates([
                {latitude: currentLocation.lat, longitude: currentLocation.lng},
                {latitude: nextStopInfo.nextStop.lat, longitude: nextStopInfo.nextStop.lng},
              ], {edgePadding: {top: 100, right: 60, bottom: 250, left: 60}, animated: true});
            }}>
              <Text style={styles.nextStopLabel}>Next</Text>
              <Text style={styles.nextStopText} numberOfLines={1}>#{nextStopInfo.nextIndex + 1} {nextStopInfo.nextStop.name}</Text>
              <Text style={styles.nextStopArrow}>🗺️</Text>
            </TouchableOpacity>
          )}
        </View>
        {routeStatus?.distanceToNearestStop >= 0 && (
          <Text style={styles.distanceText}>{routeStatus.distanceToNearestStop.toFixed(1)} km to nearest checkpoint</Text>
        )}
        {currentLocation?.speed > 0 && (
          <Text style={styles.speedText}>🏍️ {Math.round(currentLocation.speed * 3.6)} km/h</Text>
        )}
      </View>

      {/* Floating voice meet bar — shown when minimized */}
      {voiceMeetActive && voiceMeetMinimized && (
        <View style={styles.voiceMeetBar}>
          <TouchableOpacity
            style={styles.voiceMeetBarLeft}
            onPress={() => setShowVoiceMeet(true)}
            activeOpacity={0.9}>
            <View style={styles.voiceMeetBarDot} />
            <Text style={styles.voiceMeetBarText}>● LIVE</Text>
            <Text style={styles.voiceMeetBarRiders}>
              👥 {(trip?.riders?.length || 0) + 1} riders
            </Text>
            <Text style={styles.voiceMeetBarExpand}>tap to expand</Text>
          </TouchableOpacity>
          <View style={styles.voiceMeetBarActions}>
            <TouchableOpacity
              style={[styles.voiceMeetBarBtn, voiceMeetMuted && styles.voiceMeetBarBtnMuted]}
              onPress={() => setVoiceMeetMuted(prev => !prev)}>
              <Text style={styles.voiceMeetBarBtnIcon}>{voiceMeetMuted ? '🔇' : '🎙️'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Floating capture button */}
      <TouchableOpacity
        style={[styles.captureBtn, panelExpanded && { bottom: 280 }]}
        onPress={() => setShowCapture(true)}>
        <Text style={styles.captureBtnIcon}>📸</Text>
      </TouchableOpacity>

      {/* Bottom controls */}
      <View style={[styles.bottomControls, trip?.riders?.length > 0 && {bottom: panelExpanded ? 268 : 76}]}>
        <TouchableOpacity style={styles.recenterBtn} onPress={() => { if (currentLocation) centerMap(currentLocation); }}>
          <Text style={styles.recenterIcon}>🎯</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sosBtn} onPress={async () => {
          if (currentLocation) {
            try {
              const data = await (await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${currentLocation.lat},${currentLocation.lng}&key=AIzaSyAmINnlsVMmBideXP9MeFwVaBxYSH5ijEI`)).json();
              if (data.results?.[0]) setCurrentAddress(data.results[0].formatted_address);
            } catch {}
          }
          setShowSOS(true);
        }}>
          <Text style={styles.sosBtnText}>🆘 SOS</Text>
        </TouchableOpacity>
        {(trip?.riders?.length > 0) && (
          <TouchableOpacity
            style={[styles.voiceMeetBtn, voiceMeetActive && styles.voiceMeetBtnActive]}
            onPress={() => setShowVoiceMeet(true)}>
            <Text style={styles.voiceMeetBtnText}>{voiceMeetActive ? '📞' : '🎙️'}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.fmBtn} onPress={() => setShowFM(true)}>
          <Text style={styles.fmBtnText}>📻</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.jayBtn} onPress={() => setShowJay(true)}>
          <Text style={styles.jayBtnText}>🤖 Jay</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.endTripBtn} onPress={handleEndTrip}>
          <Text style={styles.endTripText}>🏁 End</Text>
        </TouchableOpacity>
      </View>

      {/* ── Group Panel ── */}
      {trip?.riders?.length > 0 && (
        <View style={[styles.groupPanel, panelExpanded && styles.groupPanelExpanded]}>
          {/* Collapsed bar — always visible */}
          <TouchableOpacity style={styles.panelHandle} onPress={() => setPanelExpanded(p => !p)}>
            <View style={styles.panelHandleBar} />
            <View style={styles.panelHandleRow}>
              <View style={styles.panelHandleLeft}>
                <Text style={styles.panelHandleTitle}>👥 {otherRiders.length} riders on road</Text>
                {offRouteCount > 0 && (
                  <View style={styles.offRouteBadge}>
                    <Text style={styles.offRouteBadgeText}>⚠️ {offRouteCount} off route</Text>
                  </View>
                )}
                {unreadChat > 0 && (
                  <View style={styles.chatBadge}>
                    <Text style={styles.chatBadgeText}>💬 {unreadChat}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.panelChevron}>{panelExpanded ? '▼' : '▲'}</Text>
            </View>
          </TouchableOpacity>

          {/* Expanded content */}
          {panelExpanded && (
            <View style={styles.panelContent}>
              {/* Tabs */}
              <View style={styles.tabs}>
                <TouchableOpacity style={[styles.tab, activeTab === 'riders' && styles.tabActive]}
                  onPress={() => setActiveTab('riders')}>
                  <Text style={[styles.tabText, activeTab === 'riders' && styles.tabTextActive]}>🏍️ Riders</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tab, activeTab === 'chat' && styles.tabActive]}
                  onPress={() => { setActiveTab('chat'); setUnreadChat(0); }}>
                  <Text style={[styles.tabText, activeTab === 'chat' && styles.tabTextActive]}>
                    💬 Chat {unreadChat > 0 ? `(${unreadChat})` : ''}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Riders tab */}
              {activeTab === 'riders' && (
                <ScrollView style={styles.ridersList} showsVerticalScrollIndicator={false}>
                  {otherRiders.map(rider => {
                    const distKm = currentLocation
                      ? getDistanceKm(currentLocation.lat, currentLocation.lng, rider.lat, rider.lng)
                      : null;
                    const isOff = rider.status === 'off_route';
                    return (
                      <TouchableOpacity key={rider.uid}
                        style={[styles.riderRow, isOff && styles.riderRowOffRoute]}
                        onPress={() => mapRef.current?.animateToRegion({
                          latitude: rider.lat, longitude: rider.lng,
                          latitudeDelta: 0.02, longitudeDelta: 0.02,
                        }, 800)}>
                        {rider.photoURL
                          ? <Image source={{uri: rider.photoURL}} style={styles.riderRowAvatar} />
                          : <View style={[styles.riderRowAvatar, styles.riderRowAvatarFallback]}>
                              <Text style={styles.riderRowInitial}>{rider.name?.charAt(0)?.toUpperCase()}</Text>
                            </View>}
                        <View style={styles.riderRowInfo}>
                          <Text style={styles.riderRowName}>{rider.name}</Text>
                          <Text style={[styles.riderRowStatus, {
                            color: isOff ? '#DC2626' : rider.status === 'on_track' ? '#059669' : '#D97706',
                          }]}>
                            {rider.status === 'on_track' ? '✅ On route' :
                             rider.status === 'off_route' ? '⚠️ Off route' :
                             rider.status === 'near_stop' ? '📍 At stop' : '🛰️ Locating'}
                            {rider.speed > 0 ? ` · ${Math.round(rider.speed * 3.6)} km/h` : ''}
                          </Text>
                        </View>
                        <View style={styles.riderRowRight}>
                          {distKm !== null && (
                            <Text style={styles.riderRowDist}>
                              {distKm < 1 ? `${Math.round(distKm * 1000)}m` : `${distKm.toFixed(1)}km`}
                            </Text>
                          )}
                          <TouchableOpacity style={styles.tagBtn}
                            onPress={() => { setTaggedRider({uid: rider.uid, name: rider.name}); setActiveTab('chat'); }}>
                            <Text style={styles.tagBtnText}>@ Tag</Text>
                          </TouchableOpacity>
                          <Text style={styles.riderRowLocate}>📍</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {/* Chat tab */}
              {activeTab === 'chat' && (
                <View style={styles.chatContainer}>
                  {/* Messages */}
                  <FlatList
                    ref={chatListRef}
                    data={messages}
                    keyExtractor={item => item.id}
                    style={styles.messagesList}
                    onContentSizeChange={() => chatListRef.current?.scrollToEnd({animated: false})}
                    ListEmptyComponent={
                      <View style={styles.chatEmpty}>
                        <Text style={styles.chatEmptyText}>No messages yet. Say hi! 👋</Text>
                      </View>
                    }
                    renderItem={({item}) => {
                      const isMine = item.senderUid === currentUid;
                      const isAlert = (item as any).isAlert;
                      if (isAlert) {
                        return (
                          <View style={styles.alertMsg}>
                            <Text style={styles.alertMsgText}>{item.message}</Text>
                          </View>
                        );
                      }
                      return (
                        <TouchableOpacity
                          style={[styles.msgRow, isMine && styles.msgRowMine]}
                          onLongPress={() => setReplyTo(item)}
                          activeOpacity={0.85}
                        >
                          {!isMine && (
                            item.senderPhoto
                              ? <Image source={{uri: item.senderPhoto}} style={styles.msgAvatar} />
                              : <View style={[styles.msgAvatar, styles.msgAvatarFallback]}>
                                  <Text style={styles.msgAvatarInitial}>{item.senderName?.charAt(0)}</Text>
                                </View>
                          )}
                          <View style={[styles.msgBubble, isMine && styles.msgBubbleMine]}>
                            {!isMine && <Text style={styles.msgSender}>{item.senderName}</Text>}
                            {item.replyToMessage && (
                              <View style={styles.replyPreviewBubble}>
                                <Text style={styles.replyPreviewSender}>{item.replyToSender}</Text>
                                <Text style={styles.replyPreviewText} numberOfLines={1}>{item.replyToMessage}</Text>
                              </View>
                            )}
                            {item.taggedName && (
                              <Text style={styles.msgTag}>@{item.taggedName}</Text>
                            )}
                            <Text style={[styles.msgText, isMine && styles.msgTextMine]}>{item.message}</Text>
                            <View style={styles.msgFooter}>
                              <Text style={[styles.msgTime, isMine && styles.msgTimeMine]}>{formatTime(item.createdAt)}</Text>
                              <TouchableOpacity onPress={() => setReplyTo(item)} style={styles.replyBtn}>
                                <Text style={styles.replyBtnText}>↩ Reply</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    }}
                  />

                  {/* Quick messages */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickMsgScroll}>
                    {QUICK_MESSAGES.map(q => (
                      <TouchableOpacity key={q.id} style={styles.quickMsgBtn}
                        onPress={() => handleSendQuick(q.text)} disabled={sending}>
                        <Text style={styles.quickMsgText}>{q.text}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {/* Reply preview */}
                  {replyTo && (
                    <View style={styles.replyPreviewRow}>
                      <View style={styles.replyPreviewContent}>
                        <Text style={styles.replyPreviewLabel}>↩ Replying to {replyTo.senderName}</Text>
                        <Text style={styles.replyPreviewMsg} numberOfLines={1}>{replyTo.message}</Text>
                      </View>
                      <TouchableOpacity onPress={() => setReplyTo(null)}>
                        <Text style={styles.taggedPillClose}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Tagged rider pill */}
                  {taggedRider && (
                    <View style={styles.taggedPill}>
                      <Text style={styles.taggedPillText}>@{taggedRider.name}</Text>
                      <TouchableOpacity onPress={() => setTaggedRider(null)}>
                        <Text style={styles.taggedPillClose}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* @ Mention list */}
                  {showMentionList && otherRiders.length > 0 && (
                    <View style={styles.mentionList}>
                      {otherRiders
                        .filter(r => r.name.toLowerCase().includes(mentionQuery))
                        .map(rider => (
                          <TouchableOpacity
                            key={rider.uid}
                            style={styles.mentionItem}
                            onPress={() => {
                              // Replace @query with @name in input
                              const atIdx = chatInput.lastIndexOf('@');
                              const newText = chatInput.slice(0, atIdx) + `@${rider.name} `;
                              setChatInput(newText);
                              setTaggedRider({uid: rider.uid, name: rider.name});
                              setShowMentionList(false);
                            }}
                          >
                            {rider.photoURL
                              ? <Image source={{uri: rider.photoURL}} style={styles.mentionAvatar} />
                              : <View style={[styles.mentionAvatar, styles.riderRowAvatarFallback]}>
                                  <Text style={styles.riderRowInitial}>{rider.name?.charAt(0)}</Text>
                                </View>}
                            <Text style={styles.mentionName}>{rider.name}</Text>
                            <Text style={[styles.mentionStatus, {
                              color: rider.status === 'on_track' ? '#059669' : '#DC2626'
                            }]}>
                              {rider.status === 'on_track' ? '✅' : '⚠️'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                    </View>
                  )}

                  {/* Emoji picker */}
                  {showEmoji && (
                    <View style={styles.emojiPicker}>
                      {EMOJI_LIST.map(e => (
                        <TouchableOpacity key={e} style={styles.emojiBtn}
                          onPress={() => setChatInput(prev => prev + e)}>
                          <Text style={styles.emojiBtnText}>{e}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Input row */}
                  <View style={styles.chatInputRow}>
                    <TouchableOpacity style={styles.emojiToggleBtn}
                      onPress={() => setShowEmoji(p => !p)}>
                      <Text style={styles.emojiToggleText}>😊</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={styles.chatInput}
                      placeholder="Type a message... (@ to tag)"
                      placeholderTextColor={colors.textMuted}
                      value={chatInput}
                      onChangeText={(text) => {
                        setChatInput(text);
                        // Detect @ mention
                        const atIdx = text.lastIndexOf('@');
                        if (atIdx >= 0) {
                          const query = text.slice(atIdx + 1).toLowerCase();
                          setMentionQuery(query);
                          setShowMentionList(true);
                        } else {
                          setShowMentionList(false);
                        }
                      }}
                      multiline={false}
                      returnKeyType="send"
                      onSubmitEditing={handleSendCustom}
                      onFocus={() => setShowEmoji(false)}
                    />
                    <TouchableOpacity style={[styles.sendBtn, !chatInput.trim() && styles.sendBtnDisabled]}
                      onPress={handleSendCustom} disabled={!chatInput.trim() || sending}>
                      <Text style={styles.sendBtnText}>↑</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* Nearby place banner */}
      {nearbyPlace && (
        <View style={styles.nearbyPlaceBanner}>
          <Text style={styles.nearbyPlaceBannerText} numberOfLines={1}>
            📍 {nearbyPlace.name}
          </Text>
          <TouchableOpacity onPress={() => setNearbyPlace(null)}>
            <Text style={styles.nearbyPlaceBannerClose}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Off-route alert banner — shown to off-route rider (info only) */}
      {offRouteAlertActive && !alertDismissed && !isLeader && (
        <View style={styles.offRouteAlertBanner}>
          <View style={styles.offRouteAlertLeft}>
            <Text style={styles.offRouteAlertIcon}>⚠️</Text>
            <View>
              <Text style={styles.offRouteAlertTitle}>You are off route!</Text>
              <Text style={styles.offRouteAlertSub}>All riders are being alerted every 30s</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.offRouteAlertDismiss}
            onPress={() => {
              setAlertDismissed(true);
              setOffRouteAlertActive(false);
              if (offRouteTimerRef.current) { clearInterval(offRouteTimerRef.current); offRouteTimerRef.current = null; }
            }}>
            <Text style={styles.offRouteAlertDismissText}>Mute</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Nearby place banner */}
      {nearbyPlace && (
        <View style={styles.nearbyPlaceBanner}>
          <Text style={styles.nearbyPlaceBannerText} numberOfLines={1}>
            📍 {nearbyPlace.name}
          </Text>
          <TouchableOpacity onPress={() => setNearbyPlace(null)}>
            <Text style={styles.nearbyPlaceBannerClose}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Off-route alert banner — shown to leader with Stop Alerts */}
      {isLeader && otherRiders.some(r => r.status === 'off_route') && (
        <View style={[styles.offRouteAlertBanner, {borderColor: '#F59E0B', backgroundColor: '#1A1000'}]}>
          <View style={styles.offRouteAlertLeft}>
            <Text style={styles.offRouteAlertIcon}>⚠️</Text>
            <View>
              <Text style={[styles.offRouteAlertTitle, {color: '#F59E0B'}]}>
                {otherRiders.filter(r => r.status === 'off_route').map(r => r.name.split(' ')[0]).join(', ')} off route!
              </Text>
              <Text style={styles.offRouteAlertSub}>Riders are being alerted every 30s</Text>
            </View>
          </View>
          <TouchableOpacity style={[styles.offRouteAlertDismiss, {borderColor: '#F59E0B'}]}
            onPress={async () => {
              // Leader can stop alerts by sending a system message
              if (trip?.id) {
                const { getFirestore, collection, setDoc, doc } = require('@react-native-firebase/firestore');
                const db = getFirestore();
                const stopId = `stopalert_${Date.now()}`;
                await setDoc(doc(collection(db, `trips/${trip.id}/rideChat`), stopId), {
                  id: stopId, senderUid: 'system', senderName: 'Leader',
                  senderPhoto: '', message: '✅ Leader stopped off-route alerts',
                  isQuick: false, isAlert: true, createdAt: new Date().toISOString(),
                });
              }
            }}>
            <Text style={[styles.offRouteAlertDismissText, {color: '#F59E0B'}]}>Stop Alerts</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Group Voice Meet */}
      <GroupVoiceMeet
        visible={showVoiceMeet}
        onClose={() => setShowVoiceMeet(false)}
        tripId={trip?.id || ''}
        tripTitle={trip?.title || ''}
        isLeader={isLeader}
        riders={trip?.riders || []}
        onJoined={() => setVoiceMeetActive(true)}
        onLeft={() => { setVoiceMeetActive(false); setVoiceMeetMinimized(false); setVoiceMeetMuted(false); }}
        onMinimize={() => { setVoiceMeetMinimized(true); setShowVoiceMeet(false); }}
        externalMuted={voiceMeetMuted}
        rideContext={{
          currentSpeed: currentLocation?.speed || 0,
          routeStatus: routeStatus?.status || 'unknown',
          currentLat: currentLocation?.lat,
          currentLng: currentLocation?.lng,
          currentAddress,
          tripTitle: trip?.title || '',
          origin: trip?.stops?.[0]?.name || '',
          destination: trip?.stops?.[trip?.stops?.length - 1]?.name || '',
          riders: otherRiders.map(r => ({ name: r.name, status: r.status })),
          language: 'en-IN',
        }}
      />

      {/* Capture Memory Modal */}
      <CaptureMemoryModal
        visible={showCapture}
        onClose={() => setShowCapture(false)}
        tripId={trip?.id || ''}
        currentLocation={currentLocation}
        currentAddress={currentAddress}
      />

      {/* Jay's FM */}
      <JayFMPlayer
        visible={showFM}
        onClose={() => setShowFM(false)}
        currentLocation={currentAddress}
        isVoiceMeetActive={voiceMeetActive}
      />

      {/* Jay Voice Companion */}
      <VoiceCompanionPanel
        visible={showJay}
        onClose={() => setShowJay(false)}
        isGroup={(trip?.riders?.length || 0) > 0}
        tripId={trip?.id}
        isVoiceMeetActive={voiceMeetActive}
        onNavigateToPlace={(lat, lng, name) => {
          setNearbyPlace({ lat, lng, name });
          mapRef.current?.animateToRegion({
            latitude: lat, longitude: lng,
            latitudeDelta: 0.01, longitudeDelta: 0.01,
          }, 1000);
        }}
        rideContext={{
          currentSpeed: currentLocation?.speed || 0,
          routeStatus: routeStatus?.status || 'unknown',
          nextStop: nextStopInfo?.nextStop ? {
            name: nextStopInfo.nextStop.name,
            type: nextStopInfo.nextStop.type,
            distance: routeStatus?.distanceToNearestStop || 0,
          } : undefined,
          tripTitle: trip?.title || '',
          origin: trip?.stops?.[0]?.name || '',
          destination: trip?.stops?.[trip?.stops?.length - 1]?.name || '',
          currentLat: currentLocation?.lat,
          currentLng: currentLocation?.lng,
          currentAddress,
          stops: trip?.stops || [],
          riders: otherRiders.map(r => ({
            name: r.name,
            status: r.status,
            gender: r.gender,
            distance: currentLocation
              ? getDistanceKm(currentLocation.lat, currentLocation.lng, r.lat, r.lng)
              : undefined,
          })),
          language: 'en-IN',
        }}
      />

      <SOSModal visible={showSOS} onClose={() => setShowSOS(false)}
        location={currentLocation ? {lat: currentLocation.lat, lng: currentLocation.lng, address: currentAddress} : null}
        tripTitle={trip?.title} />

      {/* Stop List Modal */}
      {showStopList && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📋 Checkpoints</Text>
              <TouchableOpacity onPress={() => setShowStopList(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{paddingBottom: 20}}>
              {validStops.map((stop: any, index: number) => {
                const isPassed = nextStopInfo?.passedStops?.includes(index);
                const isNext = nextStopInfo?.nextIndex === index;
                return (
                  <TouchableOpacity key={stop.id}
                    style={[styles.stopListItem, isNext && styles.stopListItemActive]}
                    onPress={() => {
                      setShowStopList(false);
                      if (mapRef.current && stop.lat && stop.lng) {
                        mapRef.current.animateToRegion({latitude: stop.lat, longitude: stop.lng, latitudeDelta: 0.03, longitudeDelta: 0.03}, 1000);
                      }
                    }}>
                    <View style={[styles.stopListNum, {backgroundColor: STOP_COLORS[stop.type] || colors.primary}, isPassed && {opacity: 0.4}]}>
                      <Text style={styles.stopListNumText}>{index + 1}</Text>
                    </View>
                    <View style={styles.stopListInfo}>
                      <Text style={[styles.stopListName, isPassed && styles.stopListNamePassed]} numberOfLines={1}>
                        {STOP_ICONS[stop.type] || '📍'} {stop.name}
                      </Text>
                      <Text style={styles.stopListTime}>{stop.time || ''}</Text>
                    </View>
                    {isPassed && <Text style={styles.stopListCheck}>✓</Text>}
                    {isNext && <Text style={styles.stopListNextBadge}>NEXT</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  map: {width, height},
  topBar: {position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingTop: 44, paddingHorizontal: 12, paddingBottom: 12, backgroundColor: 'rgba(15,15,26,0.85)'},
  backBtn: {width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', marginRight: 12},
  backArrow: {fontSize: 20, color: colors.text},
  topBarTitle: {flex: 1},
  tripTitle: {fontSize: 16, fontWeight: '700', color: colors.text},
  liveIndicator: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2},
  liveDot: {width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger},
  liveText: {fontSize: 11, color: colors.danger, fontWeight: '700', letterSpacing: 1},
  listBtn: {width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', marginLeft: 12},
  listBtnIcon: {fontSize: 18},
  legend: {position: 'absolute', top: 100, right: 12, backgroundColor: 'rgba(15,15,26,0.85)', borderRadius: 10, padding: 8, gap: 6, borderWidth: 0.5, borderColor: colors.border},
  legendItem: {flexDirection: 'row', alignItems: 'center', gap: 6},
  legendOrange: {width: 20, height: 4, borderRadius: 2, backgroundColor: '#FF6B35'},
  legendGreen: {width: 20, height: 4, borderRadius: 2, backgroundColor: '#22C55E'},
  legendText: {fontSize: 10, color: colors.text, fontWeight: '600'},
  routeLoadingBadge: {position: 'absolute', top: 90, left: 12, right: 12, backgroundColor: colors.card, borderRadius: 10, padding: 8, alignItems: 'center', borderWidth: 0.5, borderColor: colors.border},
  routeLoadingText: {fontSize: 11, color: colors.textSecondary},
  markerWrapper: {alignItems: 'center'},
  markerContainer: {width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF'},
  markerPassed: {opacity: 0.4},
  markerNext: {borderColor: '#FFF', borderWidth: 3, elevation: 8},
  markerIcon: {fontSize: 16},
  markerNumberBadge: {position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center'},
  markerNumberText: {fontSize: 10, fontWeight: '700', color: '#000'},
  markerLabel: {backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginTop: 2, maxWidth: 110},
  markerLabelText: {fontSize: 9, color: '#FFF', fontWeight: '600'},
  riderMarker: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  riderRing: {position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: '#2563EB33', borderWidth: 2, borderColor: '#2563EB88'},
  riderAvatar: {width: 32, height: 32, borderRadius: 16, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF'},
  riderAvatarIcon: {fontSize: 16},
  riderAvatarImage: {width: 28, height: 28, borderRadius: 14},
  groupRiderMarker: {width: 48, height: 48, alignItems: 'center', justifyContent: 'center'},
  groupRiderRing: {position: 'absolute', width: 48, height: 48, borderRadius: 24, backgroundColor: '#7C3AED33', borderWidth: 2},
  groupRiderAvatar: {width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#FFF'},
  groupRiderAvatarFallback: {backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center'},
  groupRiderInitial: {color: '#FFF', fontSize: 14, fontWeight: '700'},
  groupRiderStatusDot: {position: 'absolute', bottom: 2, right: 2, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#FFF'},
  statusCard: {position: 'absolute', bottom: 100, left: 12, right: 12, backgroundColor: 'rgba(22,33,62,0.95)', borderRadius: 16, padding: 14, borderWidth: 0.5, borderColor: colors.border},
  statusRow: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6},
  statusBadge: {paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10},
  statusBadgeText: {fontSize: 13, fontWeight: '700'},
  nextStopBtn: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#2563EB22', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 0.5, borderColor: '#2563EB'},
  nextStopLabel: {fontSize: 10, color: '#2563EB', fontWeight: '700'},
  nextStopText: {flex: 1, fontSize: 11, color: colors.text, fontWeight: '600'},
  nextStopArrow: {fontSize: 14},
  distanceText: {fontSize: 11, color: colors.textMuted, marginTop: 2},
  speedText: {fontSize: 11, color: colors.textMuted, marginTop: 4},
  bottomControls: {position: 'absolute', bottom: 24, left: 16, right: 16, flexDirection: 'row', gap: 12, alignItems: 'center'},
  recenterBtn: {width: 52, height: 52, borderRadius: 26, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: colors.border},
  recenterIcon: {fontSize: 22},
  sosBtn: {flex: 1, backgroundColor: '#DC2626', borderRadius: 26, padding: 16, alignItems: 'center', borderWidth: 2, borderColor: '#FF000060'},
  sosBtnText: {fontSize: 16, fontWeight: '800', color: '#FFF', letterSpacing: 0.5},
  endTripBtn: {flex: 1, backgroundColor: colors.danger, borderRadius: 26, padding: 16, alignItems: 'center'},
  endTripText: {fontSize: 16, fontWeight: '700', color: colors.text},
  jayBtn: {flex: 1, backgroundColor: '#7C3AED', borderRadius: 26, padding: 16, alignItems: 'center'},
  fmBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' },
  fmBtnText: { fontSize: 22 },
  voiceMeetBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' },
  voiceMeetBar: {
    position: 'absolute', top: 72, left: 12, right: 12, zIndex: 100,
    backgroundColor: '#05966988', borderRadius: 12, padding: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 0.5, borderColor: '#059669',
  },
  voiceMeetBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voiceMeetBarDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#DC2626' },
  voiceMeetBarText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  voiceMeetBarRiders: { color: '#FFF', fontSize: 12 },
  voiceMeetBarExpand: { color: '#FFF', fontSize: 11, opacity: 0.8 },
  voiceMeetBarActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  voiceMeetBarBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  voiceMeetBarBtnMuted: { backgroundColor: 'rgba(220,38,38,0.4)' },
  voiceMeetBarBtnIcon: { fontSize: 18 },
  captureBtn: { position: 'absolute', bottom: 180, right: 16, width: 52, height: 52, borderRadius: 26, backgroundColor: '#DB2777', alignItems: 'center', justifyContent: 'center', elevation: 5, shadowColor: '#DB2777', shadowOpacity: 0.4, shadowRadius: 8 },
  captureBtnIcon: { fontSize: 24 },
  voiceMeetBtnActive: { backgroundColor: '#DC2626', borderWidth: 2, borderColor: '#FF0000' },
  voiceMeetBtnText: { fontSize: 22 },
  jayBtnText: {fontSize: 15, fontWeight: '700', color: '#FFF'},

  // Group Panel
  groupPanel: {position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(15,15,26,0.97)', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 0.5, borderColor: colors.border},
  groupPanelExpanded: {height: 340},
  panelHandle: {padding: 12},
  panelHandleBar: {width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 10},
  panelHandleRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  panelHandleLeft: {flexDirection: 'row', alignItems: 'center', gap: 8},
  panelHandleTitle: {color: colors.text, fontSize: 13, fontWeight: '700'},
  offRouteBadge: {backgroundColor: '#DC262622', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2},
  offRouteBadgeText: {color: '#DC2626', fontSize: 10, fontWeight: '700'},
  chatBadge: {backgroundColor: colors.primary + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2},
  chatBadgeText: {color: colors.primary, fontSize: 10, fontWeight: '700'},
  panelChevron: {color: colors.textMuted, fontSize: 12},
  panelContent: {flex: 1},
  tabs: {flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 8},
  tab: {flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: colors.card},
  tabActive: {backgroundColor: colors.primary},
  tabText: {fontSize: 13, color: colors.textSecondary, fontWeight: '600'},
  tabTextActive: {color: colors.text},
  ridersList: {flex: 1, paddingHorizontal: 12},
  riderRow: {flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 10, padding: 10, marginBottom: 6},
  riderRowOffRoute: {backgroundColor: '#1A0000', borderWidth: 0.5, borderColor: '#DC262640'},
  riderRowAvatar: {width: 36, height: 36, borderRadius: 18, backgroundColor: '#333'},
  riderRowAvatarFallback: {backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center'},
  riderRowInitial: {color: '#FFF', fontSize: 14, fontWeight: '700'},
  riderRowInfo: {flex: 1},
  riderRowName: {color: colors.text, fontSize: 13, fontWeight: '600'},
  riderRowStatus: {fontSize: 11, marginTop: 2},
  riderRowRight: {alignItems: 'flex-end', gap: 4},
  riderRowDist: {color: colors.text, fontSize: 12, fontWeight: '700'},
  tagBtn: {backgroundColor: colors.primary + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3},
  tagBtnText: {color: colors.primary, fontSize: 10, fontWeight: '700'},
  riderRowLocate: {fontSize: 16},

  // Chat
  chatContainer: {flex: 1, paddingHorizontal: 12},
  messagesList: {flex: 1, marginBottom: 4},
  chatEmpty: {flex: 1, alignItems: 'center', paddingTop: 20},
  chatEmptyText: {color: colors.textMuted, fontSize: 13},
  msgRow: {flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 8},
  msgRowMine: {flexDirection: 'row-reverse'},
  msgAvatar: {width: 28, height: 28, borderRadius: 14, backgroundColor: '#333'},
  msgAvatarFallback: {backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center'},
  msgAvatarInitial: {color: '#FFF', fontSize: 11, fontWeight: '700'},
  msgBubble: {maxWidth: '75%', backgroundColor: colors.card, borderRadius: 12, borderBottomLeftRadius: 4, padding: 8},
  msgBubbleMine: {backgroundColor: colors.primary, borderBottomLeftRadius: 12, borderBottomRightRadius: 4},
  msgSender: {color: colors.primary, fontSize: 11, fontWeight: '700', marginBottom: 2},
  msgTag: {color: '#FFB347', fontSize: 11, fontWeight: '600', marginBottom: 2},
  msgText: {color: colors.text, fontSize: 13},
  msgTextMine: {color: '#FFF'},
  msgTime: {color: colors.textMuted, fontSize: 10, marginTop: 3, textAlign: 'right'},
  msgTimeMine: {color: 'rgba(255,255,255,0.6)'},
  quickMsgScroll: {maxHeight: 40, marginBottom: 6},
  quickMsgBtn: {backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, marginRight: 6, borderWidth: 0.5, borderColor: colors.border},
  quickMsgText: {color: colors.text, fontSize: 11},
  taggedPill: {flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary + '22', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 4, alignSelf: 'flex-start'},
  taggedPillText: {color: colors.primary, fontSize: 12, fontWeight: '600'},
  taggedPillClose: {color: colors.primary, fontSize: 14, fontWeight: '700'},
  chatInputRow: {flexDirection: 'row', gap: 8, alignItems: 'center', paddingBottom: 8},
  chatInput: {flex: 1, backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, color: colors.text, fontSize: 14, borderWidth: 0.5, borderColor: colors.border},
  sendBtn: {width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center'},
  sendBtnDisabled: {opacity: 0.4},
  sendBtnText: {color: '#FFF', fontSize: 18, fontWeight: '700'},
  emojiToggleBtn: {width: 36, height: 36, alignItems: 'center', justifyContent: 'center'},
  emojiToggleText: {fontSize: 22},
  emojiPicker: {flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.card, borderRadius: 12, padding: 8, marginBottom: 6, gap: 4},
  emojiBtn: {width: 36, height: 36, alignItems: 'center', justifyContent: 'center'},
  emojiBtnText: {fontSize: 20},
  replyPreviewBubble: {backgroundColor: '#FFFFFF15', borderLeftWidth: 3, borderLeftColor: colors.primary, borderRadius: 6, padding: 6, marginBottom: 4},
  replyPreviewSender: {color: colors.primary, fontSize: 10, fontWeight: '700'},
  replyPreviewText: {color: colors.textSecondary, fontSize: 11},
  replyPreviewRow: {flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, padding: 8, marginBottom: 4, gap: 8, borderLeftWidth: 3, borderLeftColor: colors.primary},
  replyPreviewContent: {flex: 1},
  replyPreviewLabel: {color: colors.primary, fontSize: 11, fontWeight: '700'},
  replyPreviewMsg: {color: colors.textSecondary, fontSize: 11, marginTop: 1},
  replyBtn: {paddingHorizontal: 6, paddingVertical: 2},
  replyBtnText: {color: colors.textMuted, fontSize: 10},
  msgFooter: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3},
  alertMsg: {alignSelf: 'center', backgroundColor: '#DC262622', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, marginVertical: 4, borderWidth: 0.5, borderColor: '#DC2626'},
  alertMsgText: {color: '#DC2626', fontSize: 12, fontWeight: '600', textAlign: 'center'},
  offRouteAlertBanner: {position: 'absolute', top: 96, left: 12, right: 12, backgroundColor: '#1A0000', borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#DC2626', zIndex: 100},
  offRouteAlertLeft: {flexDirection: 'row', alignItems: 'center', gap: 10},
  offRouteAlertIcon: {fontSize: 22},
  offRouteAlertTitle: {color: '#DC2626', fontSize: 13, fontWeight: '700'},
  offRouteAlertSub: {color: colors.textMuted, fontSize: 11, marginTop: 1},
  offRouteAlertDismiss: {backgroundColor: '#DC262622', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 0.5, borderColor: '#DC2626'},
  offRouteAlertDismissText: {color: '#DC2626', fontSize: 11, fontWeight: '700'},
  nearbyPlaceMarker: { alignItems: 'center' },
  nearbyPlaceIcon: { fontSize: 28 },
  nearbyPlaceLabel: { backgroundColor: '#059669', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginTop: 2 },
  nearbyPlaceLabelText: { fontSize: 9, color: '#FFF', fontWeight: '700', maxWidth: 100 },
  nearbyPlaceBanner: {
    position: 'absolute', top: 96, left: 12, right: 12,
    backgroundColor: '#05966922', borderRadius: 12, padding: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 0.5, borderColor: '#059669', zIndex: 100,
  },
  nearbyPlaceBannerText: { flex: 1, color: '#059669', fontSize: 13, fontWeight: '600' },
  nearbyPlaceBannerClose: { color: colors.textMuted, fontSize: 16, paddingLeft: 8 },
  mentionList: {backgroundColor: colors.card, borderRadius: 12, marginBottom: 4, borderWidth: 0.5, borderColor: colors.border, maxHeight: 120},
  mentionItem: {flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderBottomWidth: 0.5, borderBottomColor: colors.border},
  mentionAvatar: {width: 28, height: 28, borderRadius: 14, backgroundColor: '#333'},
  mentionName: {flex: 1, color: colors.text, fontSize: 13, fontWeight: '600'},
  mentionStatus: {fontSize: 14},

  // Modals
  modalOverlay: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', zIndex: 999},
  modalBox: {backgroundColor: colors.card, borderRadius: 20, width: '90%', maxHeight: '75%', borderWidth: 0.5, borderColor: colors.border, overflow: 'hidden'},
  modalHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border},
  modalTitle: {fontSize: 16, fontWeight: '700', color: colors.text},
  modalClose: {fontSize: 18, color: colors.textMuted, padding: 4},
  stopListItem: {flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border},
  stopListItemActive: {backgroundColor: colors.primary + '15'},
  stopListNum: {width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center'},
  stopListNumText: {fontSize: 12, fontWeight: '700', color: '#FFF'},
  stopListInfo: {flex: 1},
  stopListName: {fontSize: 13, color: colors.text, fontWeight: '600'},
  stopListNamePassed: {color: colors.textMuted, textDecorationLine: 'line-through'},
  stopListTime: {fontSize: 11, color: colors.textMuted, marginTop: 2},
  stopListCheck: {fontSize: 16, color: colors.success},
  stopListNextBadge: {fontSize: 9, fontWeight: '700', color: colors.primary, backgroundColor: colors.primary + '22', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6},
});

export default ActiveRideScreen;
