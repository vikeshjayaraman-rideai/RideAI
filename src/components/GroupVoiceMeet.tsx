// components/GroupVoiceMeet.tsx
import { AGORA_APP_ID, AGORA_TEMP_TOKEN, AGORA_CHANNEL } from '@env';
// Agora group voice meet — pure rider-to-rider audio
// Jay is separate (ActiveRideScreen 🤖 button) — not mixed here
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  ScrollView, Image, Alert, PermissionsAndroid,
} from 'react-native';
import { colors } from '../theme/colors';
import { getAuth } from '@react-native-firebase/auth';
import {
  getFirestore, collection, doc, setDoc, onSnapshot,
  deleteDoc, getDocs,
} from '@react-native-firebase/firestore';

// Agora v4.x
let createAgoraRtcEngine: any = null;
let ChannelProfileType: any = null;
let ClientRoleType: any = null;
try {
  const Agora = require('react-native-agora');
  createAgoraRtcEngine = Agora.createAgoraRtcEngine;
  ChannelProfileType = Agora.ChannelProfileType;
  ClientRoleType = Agora.ClientRoleType;
} catch (e) { console.log('Agora import error:', e); }

// InCallManager for speaker routing
let InCallManager: any = null;
try { InCallManager = require('react-native-incall-manager').default; } catch {}

// Keep screen/connection alive during voice meet
import { AppState, AppStateStatus } from 'react-native';

// AGORA_APP_ID from @env
const AGORA_TOKEN = '007eJxTYLDw7ysqX3KvJ+Fb4AynJueWFl2lu/9mqXlYr//Ben/q2SAFBgvT5GRzo0QLM3PLRBMjS0sLcyOjJHNLwzQTC7OUpJS04leOWQ2BjAzLGacxMjJAIIjPxVCUmZKamFmSWlzCwAAAHYQh8A==';
const CHANNEL_NAME = AGORA_CHANNEL || 'rideaitest'; // temp for testing

interface Participant {
  uid: string;
  name: string;
  photoURL: string;
  isMuted: boolean;
  agoraUid: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  tripTitle: string;
  isLeader: boolean;
  riders: any[];
  onJoined?: () => void;
  onLeft?: () => void;
  onMinimize?: () => void;
  externalMuted?: boolean; // mute from floating bar
}

const toAgoraUid = (uid: string): number => {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = ((hash << 5) - hash) + uid.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash) % 100000 + 1;
};

export default function GroupVoiceMeet({
  visible, onClose, tripId, tripTitle, isLeader, riders, onJoined, onLeft, onMinimize, externalMuted,
}: Props) {
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const engineRef = useRef<any>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const appStateRef = useRef<AppStateStatus>('active');
  const appStateSubRef = useRef<any>(null);
  const db = getFirestore();
  const currentUid = getAuth().currentUser?.uid || '';

  // Sync external mute from floating bar
  useEffect(() => {
    if (!joined || externalMuted === undefined) return;
    engineRef.current?.muteLocalAudioStream(externalMuted);
    setMuted(externalMuted);
  }, [externalMuted, joined]);

  // Handle app going to background — keep Agora alive
  useEffect(() => {
    if (!joined) return;

    appStateSubRef.current = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === 'background' || nextState === 'inactive') {
        console.log('📱 App backgrounded — keeping Agora alive');
        // Keep audio running in background
        engineRef.current?.muteLocalAudioStream(muted);
        engineRef.current?.setEnableSpeakerphone(false); // switch to earpiece in bg
      } else if (nextState === 'active' && prevState !== 'active') {
        console.log('📱 App foregrounded — restoring audio');
        engineRef.current?.muteAllRemoteAudioStreams(false);
        engineRef.current?.setEnableSpeakerphone(true);
        engineRef.current?.adjustPlaybackSignalVolume(400);
        if (InCallManager) {
          InCallManager.setSpeakerphoneOn(true);
        }
      }
    });

    return () => appStateSubRef.current?.remove();
  }, [joined, muted]);

  // Subscribe to voice participants
  useEffect(() => {
    if (!visible) return;
    unsubRef.current = onSnapshot(
      collection(db, `trips/${tripId}/voiceParticipants`),
      (snap) => setParticipants(snap.docs.map(d => d.data() as Participant))
    );
    return () => unsubRef.current?.();
  }, [visible, tripId]);

  // Join channel
  const joinChannel = async () => {
    console.log('createAgoraRtcEngine available:', !!createAgoraRtcEngine);
    if (!createAgoraRtcEngine) {
      Alert.alert('Setup needed', 'Run: npm install react-native-agora');
      return;
    }
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      { title: 'Mic Permission', message: 'Needed for voice meet', buttonPositive: 'Allow' }
    );
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      Alert.alert('Permission Denied', 'Mic permission required.'); return;
    }
    setConnecting(true);
    try {
      console.log('Creating Agora engine...');
      engineRef.current = createAgoraRtcEngine();
      engineRef.current.initialize({ appId: AGORA_APP_ID || '85cc72a8c19e4894bb2e934de3b5ed35' });
      engineRef.current.setChannelProfile(ChannelProfileType?.ChannelProfileLiveBroadcasting ?? 1);
      engineRef.current.setClientRole(ClientRoleType?.ClientRoleBroadcaster ?? 1);
      engineRef.current.enableAudio();
      engineRef.current.setEnableSpeakerphone(true);
      engineRef.current.adjustRecordingSignalVolume(100);
      engineRef.current.adjustPlaybackSignalVolume(200);

      engineRef.current.registerEventHandler({
        onJoinChannelSuccess: async (connection: any, elapsed: number) => {
          console.log('✅ Agora joined! Channel:', connection?.channelId, 'elapsed:', elapsed);
          // Force audio on after join
          setTimeout(() => {
            engineRef.current?.muteAllRemoteAudioStreams(false);
            engineRef.current?.setEnableSpeakerphone(true);
            engineRef.current?.adjustPlaybackSignalVolume(400);
            if (InCallManager) {
              InCallManager.start({ media: 'audio' });
              InCallManager.setSpeakerphoneOn(true);
            }
            console.log('🔊 Audio settings applied');
          }, 1000);

          // Register in Firestore
          const { getFirestore: gf, doc: fd, collection: fc, getDoc } = require('@react-native-firebase/firestore');
          const userSnap = await getDoc(fd(fc(gf(), 'users'), currentUid));
          const userData = userSnap.exists() ? userSnap.data() : {};
          await setDoc(doc(collection(db, `trips/${tripId}/voiceParticipants`), currentUid), {
            uid: currentUid, name: userData.name || 'Rider',
            photoURL: userData.photoURL || '', isMuted: false,
            agoraUid: toAgoraUid(currentUid), joinedAt: new Date().toISOString(),
          });
          setJoined(true); onJoined?.(); setConnecting(false);

          // Post to chat
          await setDoc(doc(collection(db, `trips/${tripId}/rideChat`), `voicemeet_${Date.now()}`), {
            id: `voicemeet_${Date.now()}`, senderUid: 'system', senderName: 'System',
            senderPhoto: '', message: `🎙️ Voice meet started!`,
            isQuick: false, isAlert: true, createdAt: new Date().toISOString(),
          });

          // Notify riders (leader only)
          if (isLeader) {
            const us = await getDoc(fd(fc(gf(), 'users'), currentUid));
            const ud = us.exists() ? us.data() : {};
            for (const rider of riders) {
              if (rider.uid !== currentUid && rider.status === 'accepted') {
                await setDoc(doc(collection(db, 'notifications'), `voicemeet_${tripId}_${rider.uid}`), {
                  type: 'voice_meet_started', notifType: 'voice_meet',
                  recipientUid: rider.uid, senderUid: currentUid,
                  senderName: ud.name || 'Leader', tripId, tripTitle,
                  message: `${ud.name || 'Leader'} started a voice meet — join now!`,
                  read: false, createdAt: new Date().toISOString(),
                });
              }
            }
          }
        },
        onError: (err: number, msg: string) => {
          console.log('❌ Agora error:', err, msg);
          Alert.alert('Voice Meet Error', `Error ${err}: ${msg}`);
          setConnecting(false);
        },
        onUserJoined: (connection: any, uid: number) => {
          console.log('👤 Remote user joined:', uid);
          // Unmute remote audio when user joins
          engineRef.current?.muteRemoteAudioStream(uid, false);
        },
        onUserOffline: async (connection: any, uid: number, reason: number) => {
          console.log('👤 Remote user left:', uid, 'reason:', reason);
          const snap = await getDocs(collection(db, `trips/${tripId}/voiceParticipants`));
          snap.docs.forEach(d => { if ((d.data() as any).agoraUid === uid) deleteDoc(d.ref); });
        },
        onRemoteAudioStateChanged: (connection: any, uid: number, state: number, reason: number) => {
          console.log('🔊 Remote audio:', uid, 'state:', state, 'reason:', reason);
        },
        onLocalAudioStateChanged: (connection: any, state: number, error: number) => {
          console.log('🎙️ Local audio state:', state, 'error:', error);
        },
      });

      const agoraUid = toAgoraUid(currentUid);
      console.log('Joining channel:', CHANNEL_NAME, 'uid:', agoraUid);
      engineRef.current.joinChannel(AGORA_TOKEN, CHANNEL_NAME, agoraUid, {
        channelProfile: ChannelProfileType?.ChannelProfileLiveBroadcasting ?? 1,
        clientRoleType: ClientRoleType?.ClientRoleBroadcaster ?? 1,
      });
      console.log('joinChannel called — waiting for callback...');
    } catch (e: any) {
      console.log('Agora error:', e?.message, JSON.stringify(e));
      Alert.alert('Error', 'Could not join: ' + (e?.message || JSON.stringify(e)));
      setConnecting(false);
    }
  };

  // Leave channel
  const leaveChannel = async () => {
    try {
      engineRef.current?.leaveChannel();
      engineRef.current?.release();
      engineRef.current = null;
      if (InCallManager) InCallManager.stop();
      await deleteDoc(doc(collection(db, `trips/${tripId}/voiceParticipants`), currentUid));
    } catch {}
    setJoined(false); setMuted(false);
    onLeft?.(); onClose();
  };

  // Toggle mute
  const toggleMute = async () => {
    const newMuted = !muted;
    setMuted(newMuted);
    engineRef.current?.muteLocalAudioStream(newMuted);
    await setDoc(doc(collection(db, `trips/${tripId}/voiceParticipants`), currentUid),
      { isMuted: newMuted }, { merge: true });
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current.leaveChannel();
        engineRef.current.release();
        deleteDoc(doc(collection(db, `trips/${tripId}/voiceParticipants`), currentUid));
      }
      unsubRef.current?.();
      if (InCallManager) InCallManager.stop();
    };
  }, []);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.overlay}>
        <View style={s.panel}>
          {/* Header */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <View style={s.liveRow}>
                {joined && <View style={s.liveDot} />}
                <Text style={[s.liveText, joined && s.liveTextActive]}>
                  {joined ? '● LIVE VOICE MEET' : '○ VOICE MEET'}
                </Text>
              </View>
              <Text style={s.tripName} numberOfLines={1}>{tripTitle}</Text>
            </View>
            <View style={s.headerBtns}>
              {joined && (
                <TouchableOpacity style={s.minimizeBtn} onPress={() => {
                  setMinimized(true);
                  onMinimize?.();
                }}>
                  <Text style={s.minimizeBtnText}>⌃</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.closeBtn} onPress={joined ? leaveChannel : onClose}>
                <Text style={s.closeBtnText}>{joined ? '📞 Leave' : '✕'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Participants */}
          <ScrollView style={s.list} showsVerticalScrollIndicator={false}>
            {participants.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyIcon}>🎙️</Text>
                <Text style={s.emptyText}>
                  {joined ? 'Waiting for others to join...' : 'No one in meet yet'}
                </Text>
              </View>
            ) : (
              participants.map(p => (
                <View key={p.uid} style={s.participantRow}>
                  {p.photoURL && p.photoURL.startsWith('https')
                    ? <Image source={{ uri: p.photoURL }} style={s.avatar} />
                    : <View style={[s.avatar, s.avatarFallback]}>
                        <Text style={s.avatarInitial}>{p.name?.charAt(0)?.toUpperCase()}</Text>
                      </View>}
                  <Text style={s.participantName}>
                    {p.uid === currentUid ? `${p.name} (You)` : p.name}
                  </Text>
                  <Text style={s.muteIcon}>{p.isMuted ? '🔇' : '🎙️'}</Text>
                </View>
              ))
            )}
          </ScrollView>

          {/* Controls */}
          {!joined ? (
            <TouchableOpacity
              style={[s.joinBtn, connecting && s.joinBtnDisabled]}
              onPress={joinChannel} disabled={connecting}>
              <Text style={s.joinBtnText}>
                {connecting ? '⏳ Connecting...' : isLeader ? '🎙️ Start Voice Meet' : '🎙️ Join Voice Meet'}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={s.controls}>
              <TouchableOpacity style={[s.muteBtn, muted && s.muteBtnMuted]} onPress={toggleMute}>
                <Text style={s.muteBtnIcon}>{muted ? '🔇' : '🎙️'}</Text>
                <Text style={s.muteBtnText}>{muted ? 'Unmute' : 'Mute'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.leaveBtn} onPress={leaveChannel}>
                <Text style={s.leaveBtnText}>📞 Leave</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={s.hint}>
            {joined
              ? '🔊 Use earphones for best experience · Tap 🤖 Jay on map screen anytime'
              : isLeader
              ? '💡 Start the meet — all accepted riders get notified instantly'
              : '💡 Join to talk with your group riders live'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  panel: { backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 32, borderTopWidth: 0.5, borderColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  headerLeft: { flex: 1 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#DC2626' },
  liveText: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 1 },
  liveTextActive: { color: '#DC2626' },
  tripName: { fontSize: 15, fontWeight: '700', color: colors.text },
  closeBtn: { backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  closeBtnText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  list: { maxHeight: 220, padding: 16 },
  empty: { alignItems: 'center', paddingVertical: 28 },
  emptyIcon: { fontSize: 36, marginBottom: 8 },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  participantRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 0.5, borderColor: colors.border },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#333' },
  avatarFallback: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  participantName: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  muteIcon: { fontSize: 18 },
  joinBtn: { marginHorizontal: 16, backgroundColor: '#059669', borderRadius: 16, padding: 16, alignItems: 'center', marginBottom: 12 },
  joinBtnDisabled: { opacity: 0.6 },
  joinBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  controls: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginBottom: 12 },
  muteBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.card, borderRadius: 16, padding: 14, borderWidth: 0.5, borderColor: colors.border },
  muteBtnMuted: { backgroundColor: '#DC262622', borderColor: '#DC2626' },
  muteBtnIcon: { fontSize: 20 },
  muteBtnText: { fontSize: 14, fontWeight: '600', color: colors.text },
  leaveBtn: { flex: 1, backgroundColor: '#DC2626', borderRadius: 16, padding: 14, alignItems: 'center' },
  leaveBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  hint: { fontSize: 12, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 24 },
  headerBtns: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  minimizeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  minimizeBtnText: { color: colors.text, fontSize: 18, fontWeight: '700' },
});
