import React, {useState, useEffect} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, StatusBar, ActivityIndicator, Alert, Share,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {colors} from '../theme/colors';
import {generateTripPlan} from '../services/aiService';
import {getAuth} from '@react-native-firebase/auth';
import TripMapView from '../components/TripMapView';
import {geocodeAllStops} from '../services/geocodeService';
import {useFocusEffect} from '@react-navigation/native';
import {saveTripPlan, getTripById, TripPlan,startTrip, endTrip} from '../services/tripService';
//import {GooglePlacesAutocomplete} from 'react-native-google-places-autocomplete';
import {GOOGLE_MAPS_API_KEY} from '@env';
import GroupRidersSection, { GroupRider } from '../components/GroupRidersSection';
import { respondToInvite } from '../services/tripService';


const PREFERENCES = [
  'Scenic Roads', 'Mountain Passes', 'Coastal Route',
  'Avoid Highways', 'Hidden Gems', 'Food Stops',
  'Fuel Efficient', 'Beginner Friendly',
];

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

const recalculateTimes = (stops: any[], startTimeStr: string): any[] => {
  try {
    if (!startTimeStr) return stops;
    const timeParts = startTimeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!timeParts) return stops;
    let hours = parseInt(timeParts[1]);
    const minutes = parseInt(timeParts[2]);
    const period = timeParts[3].toUpperCase();
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    let currentTime = new Date();
    currentTime.setHours(hours, minutes, 0, 0);
    return stops.map((stop, index) => {
      const timeStr = currentTime.toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true,
      });
      const updatedStop = {...stop, time: timeStr};
      const durationMatch = stop.duration?.match(/(\d+)/);
      const durationMins = durationMatch ? parseInt(durationMatch[1]) : 0;
      if (durationMins > 0) currentTime = new Date(currentTime.getTime() + durationMins * 60000);
      if (index < stops.length - 1) {
        const d1 = parseFloat(stop.distance?.replace(/[^0-9.]/g, '')) || 0;
        const d2 = parseFloat(stops[index + 1]?.distance?.replace(/[^0-9.]/g, '')) || 0;
        const km = Math.max(0, d2 - d1);
        if (km > 0) currentTime = new Date(currentTime.getTime() + Math.round((km / 55) * 60) * 60000);
      }
      return updatedStop;
    });
  } catch (e) { return stops; }
};

const parseTime = (t: string): number => {
  const m = t?.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return 0;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const p = m[3].toUpperCase();
  if (p === 'PM' && h !== 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  return h * 60 + min;
};

const TripPlannerScreen = ({navigation, route}: any) => {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [riderCount, setRiderCount] = useState(1);
  const [selectedPrefs, setSelectedPrefs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [tripPlan, setTripPlan] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingStop, setEditingStop] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [extraDestinations, setExtraDestinations] = useState<string[]>([]);
  const [isRoundTrip, setIsRoundTrip] = useState(false);
  const [totalDays, setTotalDays] = useState(1);
  const [newDestination, setNewDestination] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showStopTimePicker, setShowStopTimePicker] = useState<string | null>(null);
  const [showInsertModal, setShowInsertModal] = useState(false);
const [currentTripId, setCurrentTripId] = useState<string | null>(null);
const [showPlaceSearch, setShowPlaceSearch] = useState<string | null>(null);
const [groupRiders, setGroupRiders] = useState<GroupRider[]>([]);

const [isInvited, setIsInvited] = useState(false);
const [inviteId, setInviteId] = useState<string | null>(null);
const [respondingInvite, setRespondingInvite] = useState(false);

const [tripCreatorUid, setTripCreatorUid] = useState('');
const [tripCreatorName, setTripCreatorName] = useState('');
const [tripCreatorPhoto, setTripCreatorPhoto] = useState('');

  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'});

  const [tripStatus, setTripStatus] = useState<'planned' | 'active' | 'completed'>('planned');
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const [routeStatus, setRouteStatus] = useState<any>(null);
  const [watchId, setWatchId] = useState<number | null>(null);
  const formatTime = (d: Date) =>
    d.toLocaleTimeString('en-IN', {hour: '2-digit', minute: '2-digit', hour12: true});
  const togglePref = (pref: string) =>
    setSelectedPrefs(prev => prev.includes(pref) ? prev.filter(p => p !== pref) : [...prev, pref]);

  const handleGeneratePlan = async () => {
    if (!origin.trim() || !destination.trim()) {
      Alert.alert('Missing Info', 'Please enter both origin and destination.');
      return;
    }
    setLoading(true); setTripPlan(null); setSaved(false);
    try {
      const plan = await generateTripPlan(
        origin, destination, formatDate(date), formatTime(date),
        riderCount, selectedPrefs, extraDestinations, isRoundTrip, totalDays,
      );
      setTripPlan(plan);
      geocodeAllStops(plan.stops).then(geocoded => {
        setTripPlan((prev: any) => ({...prev, stops: geocoded}));
      });
    } catch (e) {
      Alert.alert('Error', 'Could not generate trip plan. Please try again.');
    } finally { setLoading(false); }
  };

  const handleStartTrip = () => {
  if (!currentTripId) {
    Alert.alert('Save First', 'Please save the trip plan before starting.');
    return;
  }
  Alert.alert(
    '🏁 Start Trip?',
    'This will notify all group riders and begin live GPS tracking.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Start Trip',
        onPress: async () => {
          try {
            await startTrip(currentTripId);
            setTripStatus('active');
            // Notify all accepted riders
            if (groupRiders.length > 0) {
              const { notifyRidersOfTripStart } = require('../services/riderTrackingService');
              await notifyRidersOfTripStart(currentTripId, tripPlan.title, groupRiders);
            }
            navigation.navigate('ActiveRide', {
              trip: {
                id: currentTripId,
                uid: getAuth().currentUser?.uid,
                title: tripPlan.title,
                stops: tripPlan.stops,
                riders: groupRiders,
              },
            });
          } catch (e) {
            Alert.alert('Error', 'Could not start trip.');
          }
        },
      },
    ],
  );
};


const handleEndTrip = () => {
  Alert.alert(
    '🏁 End Trip?',
    'This will mark the trip as completed and stop GPS tracking.',
    [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'End Trip',
        style: 'destructive',
        onPress: async () => {
          if (!currentTripId) return;
          try {
            await endTrip(currentTripId);
            setTripStatus('completed');
            Alert.alert('🎉 Trip Completed!', 'Great ride! Your trip has been marked as completed.');
          } catch (e) {
            Alert.alert('Error', 'Could not end trip.');
          }
        },
      },
    ],
  );
};

  const handleSavePlan = async () => {
  if (!tripPlan) return;
  setSaving(true);
  try {
    const uid = getAuth().currentUser?.uid || '';
    
const plan: TripPlan = {
  id: currentTripId || `trip_${Date.now()}`,
  uid,
  title: tripPlan.title,
  origin,
  destination,
  date: formatDate(date),
  startTime: formatTime(date),
  riderCount,
  totalDistance: tripPlan.estimatedDistance || '',
  totalDuration: tripPlan.estimatedDuration || '',
  difficulty: tripPlan.difficulty || 'Moderate',
  stops: tripPlan.stops || [],
  weatherAdvice: tripPlan.weatherAdvice || '',
  tips: tripPlan.tips || [],
  createdAt: new Date().toISOString(),
  creatorName: getAuth().currentUser?.displayName || '',
  creatorPhoto: getAuth().currentUser?.photoURL || '',
};

    console.log('Saving plan ID:', plan.id, 'stops:', plan.stops.length);
    await saveTripPlan(plan);
    if (!currentTripId) setCurrentTripId(plan.id);  // store new trip ID
    setSaved(true);
    Alert.alert(
      currentTripId ? '✅ Updated!' : '✅ Saved!',
      currentTripId ? 'Trip plan updated.' : 'Trip plan saved.',
    );
  } catch (e) {
    Alert.alert('Error', 'Could not save trip plan.');
  }
  setSaving(false);
};

const handleInviteResponse = async (accept: boolean) => {
  if (!inviteId || !currentTripId) {
    Alert.alert('Error', `Missing data: inviteId=${inviteId}, tripId=${currentTripId}`);
    return;
  }
  setRespondingInvite(true);
  try {
    console.log('Responding to invite:', inviteId, 'trip:', currentTripId, 'accept:', accept);
    await respondToInvite(inviteId, currentTripId, accept);
    setIsInvited(false);
    Alert.alert(
      accept ? '🎉 Joined!' : 'Declined',
      accept ? "You've joined this ride!" : "You've declined this invite.",
      [{ text: 'OK', onPress: () => navigation.goBack() }]
    );
  } catch (e: any) {
    console.log('Invite response error:', JSON.stringify(e), e?.message);
    Alert.alert('Error', e?.message || 'Could not respond. Please try again.');
  }
  setRespondingInvite(false);
};
useFocusEffect(
  React.useCallback(() => {
    const loadedTrip = route?.params?.loadedTrip;
    if (loadedTrip?.id) {
      getTripById(loadedTrip.id).then((freshTrip: any) => {
        const trip = freshTrip || loadedTrip;
        setCurrentTripId(trip.id);
        setTripStatus(trip.status || 'planned');
        setOrigin(trip.origin || '');
        setDestination(trip.destination || '');
        setRiderCount(trip.riderCount || 1);
        setSaved(false);

        setTripPlan({
          title: trip.title,
          routeSummary: trip.routeSummary || '',
          estimatedDistance: trip.totalDistance || '',
          estimatedDuration: trip.totalDuration || '',
          difficulty: trip.difficulty || 'Moderate',
          weatherAdvice: trip.weatherAdvice || '',
          stops: trip.stops || [],
          tips: trip.tips || [],
        });

        // Fetch creator profile
        if (trip.uid) {
          (async () => {
            const { getFirestore, getDoc, doc, collection } = require('@react-native-firebase/firestore');
            const creatorSnap = await getDoc(doc(collection(getFirestore(), 'users'), trip.uid));
            if (creatorSnap.exists()) {
              const creator = creatorSnap.data();
              setTripCreatorUid(trip.uid);
              setTripCreatorName(creator.name || 'Trip Leader');
              setTripCreatorPhoto(creator.photoURL || creator.profilePhoto || '');
            }
          })();
        }

        setGroupRiders(trip.riders || []);

        // Check if viewing as invited rider
        if (route?.params?.isInvited) {
          const invId = route?.params?.inviteId || null;
          setInviteId(invId);
          if (invId) {
            (async () => {
              const { getFirestore, getDoc, doc, collection } = require('@react-native-firebase/firestore');
              const invSnap = await getDoc(doc(collection(getFirestore(), 'trip_invites'), invId));
              if (invSnap.exists()) {
                const invData = invSnap.data();
                setIsInvited(invData.status === 'pending');
              } else {
                setIsInvited(false);
              }
            })();
          } else {
            setIsInvited(false);
          }
        }
      });
    } else {
      setCurrentTripId(null);
      setTripStatus('planned');
    }
  }, [route?.params?.loadedTrip?.id]),
);

   const handleSharePlan = async () => {
    if (!tripPlan) return;
    const stopsList = tripPlan.stops
      .map((s: any) => `${STOP_ICONS[s.type] || '📍'} ${s.time || ''} — ${s.name}`)
      .join('\n');
    await Share.share({
      message: `🏍️ ${tripPlan.title}\n📅 ${formatDate(date)}\n📍 ${origin} → ${destination}\n\n${stopsList}\n\nShared via RideAI`,
      title: tripPlan.title,
    }); };


 const handleEditStop = (stopId: string, field: string, value: any) => {
  setSaved(false); // ← reset so user can save again
  setTripPlan((prev: any) => ({
    ...prev,
    stops: prev.stops.map((s: any) => s.id === stopId ? {...s, [field]: value} : s),
  }));
};

  const handleAddStop = () => {
    setShowInsertModal(true);
  };

  const insertCustomStop = (afterStopId: string) => {
    setShowInsertModal(false);
    const afterIndex = tripPlan.stops.findIndex((s: any) => s.id === afterStopId);
    const afterStop = tripPlan.stops[afterIndex];
    const nextStop = tripPlan.stops[afterIndex + 1];

    // Calculate suggested time as midpoint between afterStop end time and nextStop start time
    let suggestedTime = '';
    if (afterStop?.time && nextStop?.time) {
      const afterMins = parseTime(afterStop.time) + (parseInt(afterStop.duration) || 30);
      const nextMins = parseTime(nextStop.time);
      const midMins = Math.round((afterMins + nextMins) / 2);
      const midH = Math.floor(midMins / 60) % 24;
      const midM = midMins % 60;
      const d = new Date();
      d.setHours(midH, midM, 0, 0);
      suggestedTime = d.toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true,
      });
    } else if (afterStop?.time) {
      const d = new Date();
      const afterMins = parseTime(afterStop.time) + (parseInt(afterStop.duration) || 30);
      d.setHours(Math.floor(afterMins / 60) % 24, afterMins % 60, 0, 0);
      suggestedTime = d.toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true,
      });
    }

    const newStop: any = {
      id: `stop_custom_${Date.now()}`,
      name: 'Custom Stop',
      description: 'Add your notes here',
      type: 'checkpoint',
      time: suggestedTime,
      duration: '30',
      distance: afterStop?.distance || '',
      address: '',
      speciality: '',
      day: afterStop?.day || 1,
      dayLabel: afterStop?.dayLabel || 'Day 1',
    };

    setTripPlan((prev: any) => {
      const newStops = [...prev.stops];
      newStops.splice(afterIndex + 1, 0, newStop);
      return {...prev, stops: newStops};
    });
    setEditingStop(newStop.id);
  };

  const handleRemoveStop = (stopId: string) => {
    setTripPlan((prev: any) => {
      const removedStop = prev.stops.find((s: any) => s.id === stopId);
      const filtered = prev.stops.filter((s: any) => s.id !== stopId);
      if (removedStop?.time && removedStop?.duration) {
        const durationMins = parseInt(removedStop.duration) || 0;
        if (durationMins > 0) {
          const removedIndex = prev.stops.findIndex((s: any) => s.id === stopId);
          const updated = filtered.map((s: any) => {
            const origIndex = prev.stops.findIndex((os: any) => os.id === s.id);
            if (origIndex <= removedIndex || s.day !== removedStop.day || !s.time) return s;
            const timeMins = parseTime(s.time) - durationMins;
            const d = new Date();
            d.setHours(Math.floor(timeMins / 60) % 24, timeMins % 60, 0, 0);
            return {
              ...s,
              time: d.toLocaleTimeString('en-IN', {hour: '2-digit', minute: '2-digit', hour12: true}),
            };
          });
          return {...prev, stops: updated};
        }
      }
      return {...prev, stops: filtered};
    });
  };

  const difficultyColor = (d: string) =>
    d === 'Easy' ? colors.success : d === 'Moderate' ? colors.warning : colors.danger;

  const renderStop = (stop: any, index: number) => {
    const prevStop = tripPlan.stops[index - 1];
    const showDayHeader = stop.day && (!prevStop || prevStop.day !== stop.day);
    return (
      <View key={stop.id}>
        {showDayHeader && (
          <View style={styles.dayHeader}>
            <Text style={styles.dayHeaderText}>📅 Day {stop.day} — {stop.dayLabel}</Text>
          </View>
        )}
        <View style={styles.stopContainer}>
          {index < tripPlan.stops.length - 1 && <View style={styles.timelineLine} />}
          <View style={[styles.stopDot, {backgroundColor: STOP_COLORS[stop.type] || colors.primary}]}>
            <Text style={styles.stopDotIcon}>{STOP_ICONS[stop.type] || '📍'}</Text>
          </View>
          <View style={styles.stopContent}>
           {editingStop === stop.id ? (
            <View style={styles.editMode}>
  {/* Google Places Search */}
  <Text style={styles.editLabel}>🔍 Search Place</Text>
  {/* <TouchableOpacity
    style={styles.searchPlaceBtn}
    onPress={() => setShowPlaceSearch(stop.id)}>
    <Text style={styles.searchPlaceBtnText}>🔍 Search cafe, temple, landmark...</Text>
  </TouchableOpacity> */}
  {false && (
<TouchableOpacity
  style={styles.searchPlaceBtn}
  onPress={() => setShowPlaceSearch(stop.id)}>
  <Text style={styles.searchPlaceBtnText}>🔍 Search cafe, temple, landmark...</Text>
</TouchableOpacity>
)}
  <Text style={styles.editLabel}>Or enter name manually</Text>
  <TextInput style={styles.editInput} value={stop.name}
    onChangeText={v => handleEditStop(stop.id, 'name', v)}
    placeholder="Stop name" placeholderTextColor={colors.textMuted} />

                <Text style={styles.editLabel}>Stop Time</Text>
                <TouchableOpacity
                  style={styles.editTimeBtn}
                  onPress={() => setShowStopTimePicker(stop.id)}>
                  <Text style={styles.editTimeBtnText}>
                    ⏰ {stop.time || 'Tap to set time'}
                  </Text>
                </TouchableOpacity>
                {showStopTimePicker === stop.id && (
                  <DateTimePicker
                    value={new Date()}
                    mode="time"
                    display="default"
                    onChange={(_, selectedTime) => {
                      setShowStopTimePicker(null);
                      if (selectedTime) {
                        const timeStr = selectedTime.toLocaleTimeString('en-IN', {
                          hour: '2-digit', minute: '2-digit', hour12: true,
                        });
                        handleEditStop(stop.id, 'time', timeStr);
                      }
                    }}
                  />
                )}

                <Text style={styles.editLabel}>Duration at Stop</Text>
                <View style={styles.durationRow}>
                  {['15', '30', '45', '60', '90', '120'].map(mins => (
                    <TouchableOpacity
                      key={mins}
                      style={[styles.durationChip, stop.duration === mins && styles.durationChipActive]}
                      onPress={() => handleEditStop(stop.id, 'duration', mins)}>
                      <Text style={[styles.durationChipText, stop.duration === mins && styles.durationChipTextActive]}>
                        {parseInt(mins) >= 60 ? `${parseInt(mins) / 60}h` : `${mins}m`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {totalDays > 1 && (
                  <>
                    <Text style={styles.editLabel}>Day</Text>
                    <View style={styles.durationRow}>
                      {Array.from({length: totalDays}, (_, i) => i + 1).map(d => (
                        <TouchableOpacity
                          key={d}
                          style={[styles.durationChip, stop.day === d && styles.durationChipActive]}
                          onPress={() => {
                            handleEditStop(stop.id, 'day', d);
                            handleEditStop(stop.id, 'dayLabel', `Day ${d}`);
                          }}>
                          <Text style={[styles.durationChipText, stop.day === d && styles.durationChipTextActive]}>
                            Day {d}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                <TextInput style={[styles.editInput, {height: 70}]} value={stop.description}
                  onChangeText={v => handleEditStop(stop.id, 'description', v)}
                  placeholder="Description" placeholderTextColor={colors.textMuted} multiline />

                <View style={styles.editActions}>
                  <TouchableOpacity style={styles.editDoneBtn} onPress={() => {
                    setTripPlan((prev: any) => {
                      const idx = prev.stops.findIndex((s: any) => s.id === stop.id);
                      const durationMins = parseInt(stop.duration) || 30;

                      // Sort stops by day then time
                      const dest = prev.stops.find((s: any) => s.type === 'destination');
                      const rest = prev.stops.filter((s: any) => s.type !== 'destination');
                      const sorted = rest.sort((a: any, b: any) => {
                        if ((a.day || 1) !== (b.day || 1)) return (a.day || 1) - (b.day || 1);
                        if (!a.time) return 1;
                        if (!b.time) return -1;
                        return parseTime(a.time) - parseTime(b.time);
                      });

                      // Recalculate subsequent stops on same day
                      const newIdx = sorted.findIndex((s: any) => s.id === stop.id);
                      const finalStops = sorted.map((s: any, i: number) => {
                        if (i <= newIdx || s.day !== stop.day || !stop.time) return s;
                        const origTimeParts = s.time?.match(/(\d+):(\d+)\s*(AM|PM)/i);
                        if (!origTimeParts) return s;
                        let h = parseInt(origTimeParts[1]);
                        const m = parseInt(origTimeParts[2]);
                        const p = origTimeParts[3].toUpperCase();
                        if (p === 'PM' && h !== 12) h += 12;
                        if (p === 'AM' && h === 12) h = 0;
                        const newTime = new Date();
                        newTime.setHours(h, m + durationMins, 0, 0);
                        return {
                          ...s,
                          time: newTime.toLocaleTimeString('en-IN', {
                            hour: '2-digit', minute: '2-digit', hour12: true,
                          }),
                        };
                      });

                      return {...prev, stops: dest ? [...finalStops, dest] : finalStops};
                    });
                    setEditingStop(null);
                  }}>
                    <Text style={styles.editDoneText}>✅ Done & Recalculate</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.editDeleteBtn} onPress={() => {
                    handleRemoveStop(stop.id); setEditingStop(null);
                  }}>
                    <Text style={styles.editDeleteText}>🗑️ Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity 
  style={styles.stopCard} 
  onLongPress={() => tripStatus === 'planned' && setEditingStop(stop.id)}
  disabled={tripStatus !== 'planned'}>
                <View style={styles.stopHeader}>
                  <View style={[styles.stopTypeBadge, {backgroundColor: (STOP_COLORS[stop.type] || colors.primary) + '33'}]}>
                    <Text style={[styles.stopTypeText, {color: STOP_COLORS[stop.type] || colors.primary}]}>
                      {stop.type?.replace('_', ' ').toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.stopTime}>{stop.time || 'Set time'}</Text>
                </View>
                {stop.dayLabel && !stop.day && <Text style={styles.dayLabel}>{stop.dayLabel}</Text>}
                <Text style={styles.stopName}>{stop.name}</Text>
                {stop.address ? <Text style={styles.stopAddress}>📍 {stop.address}</Text> : null}
                {stop.speciality ? (
                  <View style={styles.specialityBadge}>
                    <Text style={styles.specialityText}>⭐ {stop.speciality}</Text>
                  </View>
                ) : null}
                <Text style={styles.stopDesc}>{stop.description}</Text>
                <View style={styles.stopMeta}>
                  {stop.duration ? <Text style={styles.stopMetaText}>⏱ {stop.duration} mins</Text> : null}
                  {stop.distance ? <Text style={styles.stopMetaText}>📏 {stop.distance}</Text> : null}
                </View>
                <Text style={styles.longPressHint}>
  {tripStatus === 'planned' ? 'Long press to edit' : '🔒 Locked during ride'}
</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <ScrollView showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <Text style={styles.headerTitle}>🗺️ Plan a Ride</Text>
          <Text style={styles.headerSubtitle}>AI-powered group itinerary</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>🏁 Route</Text>
          <Text style={styles.label}>Starting From</Text>
          <TextInput style={styles.input} placeholder="e.g. Bangalore"
            placeholderTextColor={colors.textMuted} value={origin} onChangeText={setOrigin} />
          <Text style={styles.label}>Destination</Text>
          <TextInput style={styles.input} placeholder="e.g. Coorg"
            placeholderTextColor={colors.textMuted} value={destination} onChangeText={setDestination} />

          <Text style={styles.label}>Additional Destinations</Text>
          <View style={styles.addDestRow}>
            <TextInput style={[styles.input, {flex: 1}]} placeholder="Add another stop city"
              placeholderTextColor={colors.textMuted} value={newDestination} onChangeText={setNewDestination} />
            <TouchableOpacity style={styles.addDestBtn} onPress={() => {
              if (newDestination.trim()) {
                setExtraDestinations(prev => [...prev, newDestination.trim()]);
                setNewDestination('');
              }
            }}>
              <Text style={styles.addDestBtnText}>+</Text>
            </TouchableOpacity>
          </View>
          {extraDestinations.length > 0 && (
            <View style={styles.destChips}>
              {extraDestinations.map((dest, i) => (
                <View key={i} style={styles.destChip}>
                  <Text style={styles.destChipText}>📍 {dest}</Text>
                  <TouchableOpacity onPress={() => setExtraDestinations(prev => prev.filter((_, idx) => idx !== i))}>
                    <Text style={styles.destChipRemove}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.label}>Trip Type</Text>
          <View style={styles.tripTypeRow}>
            <TouchableOpacity style={[styles.tripTypeBtn, !isRoundTrip && styles.tripTypeBtnActive]} onPress={() => setIsRoundTrip(false)}>
              <Text style={[styles.tripTypeText, !isRoundTrip && styles.tripTypeTextActive]}>➡️ One Way</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tripTypeBtn, isRoundTrip && styles.tripTypeBtnActive]} onPress={() => setIsRoundTrip(true)}>
              <Text style={[styles.tripTypeText, isRoundTrip && styles.tripTypeTextActive]}>🔄 Round Trip</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Number of Days</Text>
          <View style={styles.riderRow}>
            <TouchableOpacity style={styles.riderBtn} onPress={() => setTotalDays(Math.max(1, totalDays - 1))}>
              <Text style={styles.riderBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.riderCount}>{totalDays}</Text>
            <TouchableOpacity style={styles.riderBtn} onPress={() => setTotalDays(Math.min(14, totalDays + 1))}>
              <Text style={styles.riderBtnText}>+</Text>
            </TouchableOpacity>
            <Text style={styles.riderLabel}>{totalDays === 1 ? 'Day trip' : `${totalDays} days`}</Text>
          </View>

          <View style={styles.dateTimeRow}>
            <View style={styles.dateTimeCol}>
              <Text style={styles.label}>Date</Text>
              <TouchableOpacity style={styles.dateTimeBtn} onPress={() => setShowDatePicker(true)}>
                <Text style={styles.dateTimeText}>📅 {formatDate(date)}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.dateTimeCol}>
              <Text style={styles.label}>Start Time</Text>
              <TouchableOpacity style={styles.dateTimeBtn} onPress={() => setShowTimePicker(true)}>
                <Text style={styles.dateTimeText}>⏰ {formatTime(date)}</Text>
              </TouchableOpacity>
            </View>
          </View>
          {showDatePicker && (
            <DateTimePicker value={date} mode="date" display="default" minimumDate={new Date()}
              onChange={(_, d) => { setShowDatePicker(false); if (d) setDate(d); }} />
          )}
          {showTimePicker && (
            <DateTimePicker value={date} mode="time" display="default"
              onChange={(_, d) => { setShowTimePicker(false); if (d) setDate(d); }} />
          )}

          <Text style={styles.label}>Number of Riders</Text>
          <View style={styles.riderRow}>
            <TouchableOpacity style={styles.riderBtn} onPress={() => setRiderCount(Math.max(1, riderCount - 1))}>
              <Text style={styles.riderBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.riderCount}>{riderCount}</Text>
            <TouchableOpacity style={styles.riderBtn} onPress={() => setRiderCount(Math.min(50, riderCount + 1))}>
              <Text style={styles.riderBtnText}>+</Text>
            </TouchableOpacity>
            <Text style={styles.riderLabel}>{riderCount === 1 ? 'Solo ride' : `${riderCount} riders`}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>⚡ Preferences</Text>
          <View style={styles.prefGrid}>
            {PREFERENCES.map(pref => (
              <TouchableOpacity key={pref}
                style={[styles.prefChip, selectedPrefs.includes(pref) && styles.prefChipActive]}
                onPress={() => togglePref(pref)}>
                <Text style={[styles.prefText, selectedPrefs.includes(pref) && styles.prefTextActive]}>{pref}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={[styles.generateBtn, loading && styles.generateBtnDisabled]}
          onPress={handleGeneratePlan} disabled={loading}>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.text} size="small" />
              <Text style={styles.generateBtnText}>  AI crafting your itinerary...</Text>
            </View>
          ) : (
            <Text style={styles.generateBtnText}>🤖 Generate AI Itinerary</Text>
          )}
        </TouchableOpacity>

        {tripPlan && (
          <View>
            <View style={styles.card}>
              <Text style={styles.tripTitle}>{tripPlan.title}</Text>
              <Text style={styles.summaryText}>{tripPlan.routeSummary}</Text>
              <View style={styles.statsRow}>
                <View style={styles.statPill}>
                  <Text style={styles.statPillValue}>{tripPlan.estimatedDistance}</Text>
                  <Text style={styles.statPillLabel}>Distance</Text>
                </View>
                <View style={styles.statPill}>
                  <Text style={styles.statPillValue}>{tripPlan.estimatedDuration}</Text>
                  <Text style={styles.statPillLabel}>Duration</Text>
                </View>
                <View style={styles.statPill}>
                  <Text style={[styles.statPillValue, {color: difficultyColor(tripPlan.difficulty)}]}>
                    {tripPlan.difficulty}
                  </Text>
                  <Text style={styles.statPillLabel}>Difficulty</Text>
                </View>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoIcon}>🌤️</Text>
                <Text style={styles.infoText}>{tripPlan.weatherAdvice}</Text>
              </View>
            </View>

            <View style={styles.toggleRow}>
              <TouchableOpacity style={[styles.toggleBtn, !showMap && styles.toggleBtnActive]} onPress={() => setShowMap(false)}>
                <Text style={[styles.toggleText, !showMap && styles.toggleTextActive]}>📋 Itinerary</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.toggleBtn, showMap && styles.toggleBtnActive]} onPress={() => setShowMap(true)}>
                <Text style={[styles.toggleText, showMap && styles.toggleTextActive]}>🗺️ Map View</Text>
              </TouchableOpacity>
            </View>

            {showMap ? (
              <View style={styles.mapCard}>
                <TripMapView stops={tripPlan.stops} origin={origin} destination={destination} />
              </View>
            ) : (
              <View style={styles.card}>
                <View style={styles.itineraryHeader}>
                  <Text style={styles.cardTitle}>🗓️ Itinerary</Text>
                {tripStatus === 'planned' && (
  <TouchableOpacity style={styles.addStopBtn} onPress={handleAddStop}>
    <Text style={styles.addStopText}>+ Add Stop</Text>
  </TouchableOpacity>
)}
                </View>
                {tripPlan.stops.map((stop: any, index: number) => renderStop(stop, index))}
              </View>
            )}

            {tripPlan.tips?.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>💡 Rider Tips</Text>
                {tripPlan.tips.map((tip: string, i: number) => (
                  <View key={i} style={styles.tipRow}>
                    <Text style={styles.tipNumber}>{i + 1}</Text>
                    <Text style={styles.tipText}>{tip}</Text>
                  </View>
                ))}
              </View>
            )}

           <View style={styles.actionRow}>
  {!isInvited && (
    <TouchableOpacity
      style={[styles.actionBtn, styles.saveBtn, saved && styles.savedBtn]}
      onPress={handleSavePlan} disabled={saving || saved}>
      {saving ? <ActivityIndicator color={colors.text} size="small" /> : (
        <Text style={styles.actionBtnText}>
          {saved ? '✅ Saved' : route?.params?.loadedTrip ? '💾 Update Plan' : '💾 Save Plan'}
        </Text>
      )}
    </TouchableOpacity>
  )}
  <TouchableOpacity style={[styles.actionBtn, styles.shareBtn]} onPress={handleSharePlan}>
    <Text style={styles.actionBtnText}>📤 Share</Text>
  </TouchableOpacity>
</View>




        {/* Trip Status Banner */}
{tripStatus === 'active' && (
  <TouchableOpacity
    style={styles.activeBanner}
    onPress={() => navigation.navigate('ActiveRide', {
      trip: {id: currentTripId, title: tripPlan.title, stops: tripPlan.stops},
    })}>
    <View style={styles.activeBannerLeft}>
      <View style={styles.pulsingDot} />
      <Text style={styles.activeBannerText}>🔴 Trip In Progress — Tap for live map</Text>
    </View>
    <Text style={{color: colors.text, fontSize: 18}}>→</Text>
  </TouchableOpacity>
)}

{tripStatus === 'completed' && (
  <View style={styles.completedBanner}>
    <Text style={styles.completedBannerText}>✅ Trip Completed</Text>
  </View>
)}

{/* Start/End Trip Buttons */}
{tripStatus === 'planned' && currentTripId && (
  <TouchableOpacity style={styles.startTripBtn} onPress={handleStartTrip}>
    <Text style={styles.startTripBtnText}>🏁 Start Trip</Text>
  </TouchableOpacity>
)}

{tripStatus === 'active' && (
  <TouchableOpacity style={styles.endTripBtn} onPress={handleEndTrip}>
    <Text style={styles.endTripBtnText}>🏁 End Trip</Text>
  </TouchableOpacity>
)}

{currentTripId && (
  <GroupRidersSection
    tripId={currentTripId}
    tripTitle={tripPlan?.title || ''}
    tripCreatorUid={tripCreatorUid || getAuth().currentUser?.uid || ''}
    tripCreatorName={tripCreatorName || getAuth().currentUser?.displayName || 'Trip Leader'}
    tripCreatorPhoto={tripCreatorPhoto || getAuth().currentUser?.photoURL || ''}
    riders={groupRiders}
    onRidersChange={setGroupRiders}
    disabled={isInvited || tripStatus !== 'planned'}
  />
)}


{/* Accept/Decline row — shown only when viewing as invited rider */}
{isInvited && (
  <View style={styles.inviteResponseRow}>
    <Text style={styles.inviteResponseLabel}>
      You've been invited to this ride!
    </Text>
    <View style={styles.inviteResponseBtns}>
      <TouchableOpacity
        style={[styles.declineBtn, respondingInvite && { opacity: 0.6 }]}
        onPress={() => handleInviteResponse(false)}
        disabled={respondingInvite}>
        <Text style={styles.declineBtnText}>✕ Decline</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.acceptBtn, respondingInvite && { opacity: 0.6 }]}
        onPress={() => handleInviteResponse(true)}
        disabled={respondingInvite}>
        {respondingInvite
          ? <ActivityIndicator size="small" color={colors.text} />
          : <Text style={styles.acceptBtnText}>✓ Join Ride</Text>}
      </TouchableOpacity>
    </View>
  </View>
)}
</View>
        )}
        <View style={styles.bottomPad} />
      </ScrollView>

      {/* Place Search Modal */}
{false  && (
  <View style={styles.modalOverlay}>
    <View style={styles.placeSearchModalBox}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>🔍 Search Place</Text>
        <TouchableOpacity onPress={() => setShowPlaceSearch(null)}>
          <Text style={styles.modalClose}>✕</Text>
        </TouchableOpacity>
      </View>
      <View style={{flex: 1, padding: 12}}>
        <GooglePlacesAutocomplete
          placeholder="Search for cafe, temple, landmark..."
          onPress={(data, details = null) => {
            if (details && showPlaceSearch) {
              handleEditStop(showPlaceSearch, 'name', data.description);
              handleEditStop(showPlaceSearch, 'address', details.formatted_address || data.description);
              handleEditStop(showPlaceSearch, 'lat', details.geometry.location.lat);
              handleEditStop(showPlaceSearch, 'lng', details.geometry.location.lng);

              const types = details.types || [];
              let speciality = '';
              if (types.includes('cafe')) speciality = '☕ Cafe';
              else if (types.includes('restaurant')) speciality = '🍽️ Restaurant';
              else if (types.includes('hindu_temple') || types.includes('place_of_worship')) speciality = '🛕 Temple';
              else if (types.includes('tourist_attraction')) speciality = '📸 Tourist Attraction';
              else if (types.includes('lodging')) speciality = '🏨 Hotel/Stay';
              else if (types.includes('gas_station')) speciality = '⛽ Fuel Station';
              if (speciality) handleEditStop(showPlaceSearch, 'speciality', speciality);
            }
            setShowPlaceSearch(null);
          }}
          query={{
            key: GOOGLE_MAPS_API_KEY,
            language: 'en',
            components: 'country:in',
          }}
          fetchDetails={true}
          keyboardShouldPersistTaps="always"
          enablePoweredByContainer={false}
          styles={{
            container: {flex: 1},
            textInput: styles.placesInput,
            listView: styles.placesListView,
            row: styles.placesRow,
            description: styles.placesDescription,
            poweredContainer: {display: 'none'},
          }}
          textInputProps={{
            placeholderTextColor: colors.textMuted,
            autoFocus: true,
          }}
        />
      </View>
    </View>
  </View>
)}

      {/* Insert Stop Modal — outside ScrollView so it scrolls independently */}
      {showInsertModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Insert Stop After...</Text>
              <TouchableOpacity onPress={() => setShowInsertModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{paddingBottom: 20}}>
              {tripPlan?.stops
                .filter((s: any) => s.type !== 'destination')
                .map((s: any, i: number) => (
                  <TouchableOpacity key={s.id} style={styles.modalOption} onPress={() => insertCustomStop(s.id)}>
                    <View style={[styles.modalStopNum, {backgroundColor: STOP_COLORS[s.type] || colors.primary}]}>
                      <Text style={styles.modalStopNumText}>#{i + 1}</Text>
                    </View>
                    <View style={styles.modalStopInfo}>
                      <View style={styles.modalStopRow}>
                        <View style={[styles.stopTypeBadge, {backgroundColor: (STOP_COLORS[s.type] || colors.primary) + '33'}]}>
                          <Text style={[styles.stopTypeText, {color: STOP_COLORS[s.type] || colors.primary}]}>
                            {s.type?.replace('_', ' ').toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.modalStopTime}>{s.time || 'No time'}</Text>
                        <Text style={styles.modalStopDay}>Day {s.day || 1}</Text>
                      </View>
                      <Text style={styles.modalStopName} numberOfLines={1}>{s.name}</Text>
                    </View>
                    <Text style={styles.modalArrow}>+</Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  header: {padding: 20, paddingBottom: 8},
  headerTitle: {fontSize: 22, fontWeight: '700', color: colors.text},
  headerSubtitle: {fontSize: 13, color: colors.textSecondary, marginTop: 2},
  card: {backgroundColor: colors.card, borderRadius: 16, padding: 18, marginHorizontal: 16, marginBottom: 14, borderWidth: 0.5, borderColor: colors.border},
  cardTitle: {fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 14},
  label: {fontSize: 13, color: colors.textSecondary, marginBottom: 6, marginTop: 8},
  input: {backgroundColor: colors.background, borderRadius: 10, padding: 12, color: colors.text, fontSize: 15, borderWidth: 0.5, borderColor: colors.border},
  addDestRow: {flexDirection: 'row', gap: 8, alignItems: 'center'},
  addDestBtn: {width: 44, height: 44, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center'},
  addDestBtnText: {fontSize: 24, color: colors.text, fontWeight: '700'},
  destChips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8},
  destChip: {flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.cardLight, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 0.5, borderColor: colors.primary},
  destChipText: {fontSize: 13, color: colors.primary, fontWeight: '600'},
  destChipRemove: {fontSize: 12, color: colors.danger, fontWeight: '700'},
  tripTypeRow: {flexDirection: 'row', gap: 10},
  tripTypeBtn: {flex: 1, padding: 12, borderRadius: 10, backgroundColor: colors.background, borderWidth: 0.5, borderColor: colors.border, alignItems: 'center'},
  tripTypeBtnActive: {backgroundColor: colors.primary, borderColor: colors.primary},
  tripTypeText: {fontSize: 13, color: colors.textSecondary, fontWeight: '600'},
  tripTypeTextActive: {color: colors.text},
  dateTimeRow: {flexDirection: 'row', gap: 10},
  dateTimeCol: {flex: 1},
  dateTimeBtn: {backgroundColor: colors.background, borderRadius: 10, padding: 12, borderWidth: 0.5, borderColor: colors.border},
  dateTimeText: {fontSize: 13, color: colors.text},
  riderRow: {flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4},
  riderBtn: {width: 36, height: 36, borderRadius: 18, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: colors.border},
  riderBtnText: {fontSize: 20, color: colors.primary, fontWeight: '700'},
  riderCount: {fontSize: 22, fontWeight: '700', color: colors.text, minWidth: 30, textAlign: 'center'},
  riderLabel: {fontSize: 13, color: colors.textSecondary},
  prefGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  prefChip: {paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.background, borderWidth: 0.5, borderColor: colors.border},
  prefChipActive: {backgroundColor: colors.primary, borderColor: colors.primary},
  prefText: {fontSize: 12, color: colors.textSecondary},
  prefTextActive: {color: colors.text, fontWeight: '600'},
  generateBtn: {backgroundColor: colors.primary, marginHorizontal: 16, borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 16},
  generateBtnDisabled: {opacity: 0.7},
  generateBtnText: {fontSize: 16, fontWeight: '700', color: colors.text},
  loadingRow: {flexDirection: 'row', alignItems: 'center'},
  tripTitle: {fontSize: 18, fontWeight: '700', color: colors.primary, marginBottom: 8},
  summaryText: {fontSize: 14, color: colors.textSecondary, lineHeight: 22, marginBottom: 14},
  statsRow: {flexDirection: 'row', gap: 10, marginBottom: 12},
  statPill: {flex: 1, backgroundColor: colors.background, borderRadius: 10, padding: 10, alignItems: 'center'},
  statPillValue: {fontSize: 13, fontWeight: '700', color: colors.primary},
  statPillLabel: {fontSize: 11, color: colors.textMuted, marginTop: 2},
  infoRow: {flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4},
  infoIcon: {fontSize: 14},
  infoText: {fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 20},
  toggleRow: {flexDirection: 'row', marginHorizontal: 16, marginBottom: 14, backgroundColor: colors.card, borderRadius: 12, padding: 4, gap: 4, borderWidth: 0.5, borderColor: colors.border},
  toggleBtn: {flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center'},
  toggleBtnActive: {backgroundColor: colors.primary},
  toggleText: {fontSize: 14, fontWeight: '600', color: colors.textSecondary},
  toggleTextActive: {color: colors.text},
  mapCard: {marginHorizontal: 16, marginBottom: 14, borderRadius: 16, overflow: 'hidden', borderWidth: 0.5, borderColor: colors.border},
  itineraryHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14},
  addStopBtn: {backgroundColor: colors.primary + '22', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10},
  addStopText: {fontSize: 13, color: colors.primary, fontWeight: '600'},
  dayHeader: {backgroundColor: colors.accent + '33', borderRadius: 10, padding: 10, marginBottom: 10, marginTop: 6, borderLeftWidth: 3, borderLeftColor: colors.accent},
  dayHeaderText: {fontSize: 13, fontWeight: '700', color: colors.accent},
  stopContainer: {flexDirection: 'row', marginBottom: 8, position: 'relative'},
  timelineLine: {position: 'absolute', left: 17, top: 40, width: 2, height: '100%', backgroundColor: colors.border, zIndex: 0},
  stopDot: {width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 12, zIndex: 1, flexShrink: 0},
  stopDotIcon: {fontSize: 16},
  stopContent: {flex: 1},
  stopCard: {backgroundColor: colors.background, borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: colors.border},
  stopHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6},
  stopTypeBadge: {paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6},
  stopTypeText: {fontSize: 10, fontWeight: '700'},
  stopTime: {fontSize: 13, fontWeight: '700', color: colors.text},
  stopName: {fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 4},
  dayLabel: {fontSize: 11, color: colors.accent, fontWeight: '700', marginBottom: 3},
  stopAddress: {fontSize: 12, color: colors.textMuted, marginBottom: 4},
  specialityBadge: {backgroundColor: colors.warning + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 6, alignSelf: 'flex-start'},
  specialityText: {fontSize: 12, color: colors.warning, fontWeight: '600'},
  stopDesc: {fontSize: 13, color: colors.textSecondary, lineHeight: 18},
  stopMeta: {flexDirection: 'row', gap: 12, marginTop: 6},
  stopMetaText: {fontSize: 12, color: colors.textMuted},
  longPressHint: {fontSize: 10, color: colors.textMuted, marginTop: 4, textAlign: 'right'},
  editMode: {backgroundColor: colors.background, borderRadius: 12, padding: 12},
  editInput: {backgroundColor: colors.card, borderRadius: 8, padding: 10, color: colors.text, fontSize: 14, borderWidth: 0.5, borderColor: colors.border, marginBottom: 8},
  editLabel: {fontSize: 12, color: colors.textSecondary, marginBottom: 6, marginTop: 8},
 editTimeBtn: {backgroundColor: colors.card, borderRadius: 8, padding: 12, borderWidth: 0.5, borderColor: colors.primary, marginBottom: 8},
  editTimeBtnText: {fontSize: 14, color: colors.text, fontWeight: '600'},
  searchPlaceBtn: {
    backgroundColor: colors.card, borderRadius: 8, padding: 12,
    borderWidth: 0.5, borderColor: colors.primary, marginBottom: 8,
  },
  searchPlaceBtnText: {fontSize: 13, color: colors.primary, fontWeight: '600'},
  placeSearchModalBox: {
    backgroundColor: colors.card, borderRadius: 20,
    width: '95%', height: '80%',
    borderWidth: 0.5, borderColor: colors.border, overflow: 'hidden',
  },
  durationRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8},
  durationChip: {paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.card, borderWidth: 0.5, borderColor: colors.border},
  durationChipActive: {backgroundColor: colors.primary, borderColor: colors.primary},
  durationChipText: {fontSize: 13, color: colors.textSecondary},
  durationChipTextActive: {color: colors.text, fontWeight: '600'},
  editActions: {flexDirection: 'row', gap: 8},
  editDoneBtn: {flex: 1, backgroundColor: colors.success, borderRadius: 8, padding: 10, alignItems: 'center'},
  editDoneText: {fontSize: 13, fontWeight: '700', color: colors.text},
  editDeleteBtn: {flex: 1, backgroundColor: colors.danger + '33', borderRadius: 8, padding: 10, alignItems: 'center'},
  editDeleteText: {fontSize: 13, fontWeight: '700', color: colors.danger},
  tipRow: {flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10},
  tipNumber: {width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, color: colors.text, fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 22},
  tipText: {fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 20},
  actionRow: {flexDirection: 'row', gap: 12, marginHorizontal: 16, marginBottom: 10},
  actionBtn: {flex: 1, borderRadius: 14, padding: 16, alignItems: 'center'},
  saveBtn: {backgroundColor: colors.success},
  savedBtn: {backgroundColor: colors.textMuted},
  shareBtn: {backgroundColor: colors.primary},
  actionBtnText: {fontSize: 15, fontWeight: '700', color: colors.text},
  bottomPad: {height: 30},
  modalOverlay: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', zIndex: 999},
  modalBox: {backgroundColor: colors.card, borderRadius: 20, width: '90%', maxHeight: '75%', borderWidth: 0.5, borderColor: colors.border, overflow: 'hidden'},
  modalHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border},
  modalTitle: {fontSize: 16, fontWeight: '700', color: colors.text},
  modalClose: {fontSize: 18, color: colors.textMuted, padding: 4},
  modalOption: {flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border, gap: 10},
  modalStopNum: {width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center'},
  modalStopNumText: {fontSize: 11, fontWeight: '700', color: colors.text},
  modalStopInfo: {flex: 1},
  modalStopRow: {flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3},
  modalStopTime: {fontSize: 11, color: colors.text, fontWeight: '600'},
  modalStopDay: {fontSize: 10, color: colors.textMuted},
  modalStopName: {fontSize: 12, color: colors.textSecondary},
  modalArrow: {fontSize: 20, color: colors.primary, fontWeight: '700', paddingHorizontal: 4},
  activeBanner: {
  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  backgroundColor: colors.danger + '22', borderRadius: 14,
  padding: 14, marginHorizontal: 16, marginBottom: 14,
  borderWidth: 1, borderColor: colors.danger,
},
placesSearchContainer: {
  marginBottom: 8, zIndex: 100,
},
placesInput: {
  backgroundColor: colors.card, borderRadius: 8, padding: 10,
  color: colors.text, fontSize: 14, borderWidth: 0.5,
  borderColor: colors.primary,
},
placesListView: {
  backgroundColor: colors.card, borderRadius: 8,
  marginTop: 4, borderWidth: 0.5, borderColor: colors.border,
},
placesRow: {
  backgroundColor: colors.card, padding: 10,
  borderBottomWidth: 0.5, borderBottomColor: colors.border,
},
placesDescription: {
  fontSize: 12, color: colors.text,
},
activeBannerLeft: {flexDirection: 'row', alignItems: 'center', gap: 8},
pulsingDot: {
  width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger,
},
activeBannerText: {fontSize: 14, fontWeight: '700', color: colors.text},
routeStatusBadge: {paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10},
routeStatusText: {fontSize: 12, fontWeight: '700'},
completedBanner: {
  backgroundColor: colors.success + '22', borderRadius: 14,
  padding: 14, marginHorizontal: 16, marginBottom: 14,
  borderWidth: 1, borderColor: colors.success, alignItems: 'center',
},
completedBannerText: {fontSize: 14, fontWeight: '700', color: colors.success},
offRouteCard: {
  backgroundColor: colors.danger + '11', borderRadius: 12,
  padding: 12, marginHorizontal: 16, marginBottom: 14,
  borderWidth: 0.5, borderColor: colors.danger,
},
offRouteText: {fontSize: 12, color: colors.danger, lineHeight: 18},
startTripBtn: {
  backgroundColor: colors.success, marginHorizontal: 16,
  borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 14,
},
startTripBtnText: {fontSize: 16, fontWeight: '700', color: colors.text},
endTripBtn: {
  backgroundColor: colors.danger, marginHorizontal: 16,
  borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 14,
},
endTripBtnText: {fontSize: 16, fontWeight: '700', color: colors.text},
searchPlaceBtn: {
  backgroundColor: colors.card, borderRadius: 8, padding: 12,
  borderWidth: 0.5, borderColor: colors.primary, marginBottom: 8,
},
searchPlaceBtnText: {fontSize: 13, color: colors.primary, fontWeight: '600'},
placeSearchModalBox: {
  backgroundColor: colors.card, borderRadius: 20,
  width: '95%', height: '80%',
  borderWidth: 0.5, borderColor: colors.border, overflow: 'hidden',
},
inviteResponseRow: {
  backgroundColor: colors.primary + '15', borderRadius: 14,
  padding: 16, marginHorizontal: 16, marginBottom: 14,
  borderWidth: 1, borderColor: colors.primary + '40',
},
inviteResponseLabel: {
  fontSize: 14, fontWeight: '600', color: colors.text,
  textAlign: 'center', marginBottom: 12,
},
inviteResponseBtns: { flexDirection: 'row', gap: 10 },
declineBtn: {
  flex: 1, backgroundColor: colors.danger + '22', borderRadius: 10,
  paddingVertical: 13, alignItems: 'center',
  borderWidth: 0.5, borderColor: colors.danger,
},
declineBtnText: { color: colors.danger, fontWeight: '700', fontSize: 14 },
acceptBtn: {
  flex: 2, backgroundColor: colors.success, borderRadius: 10,
  paddingVertical: 13, alignItems: 'center',
},
acceptBtnText: { color: colors.text, fontWeight: '700', fontSize: 14 },

});

export default TripPlannerScreen;