// screens/PostDetailScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity,
  StyleSheet, Dimensions, Modal, ActivityIndicator,
  Alert, Platform, PermissionsAndroid, FlatList,
} from 'react-native';
import TrackPlayer, { State, usePlaybackState, useProgress } from 'react-native-track-player';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { Memory, FEELING_MAP, TYPE_MAP } from '../components/MemoryCard';
import { likeMemory, unlikeMemory } from '../services/memoryService';
import { getAuth } from '@react-native-firebase/auth';

const { width: W, height: H } = Dimensions.get('window');

interface Props {
  route: { params: { memory: Memory } };
  navigation: any;
}

export default function PostDetailScreen({ route, navigation }: Props) {
  const { memory } = route.params;
  const uid = getAuth().currentUser?.uid || '';

  const [selectedPhoto, setSelectedPhoto] = useState(memory.photos?.[0] || '');
  const [imageModal, setImageModal]   = useState(false);
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicError, setMusicError]   = useState('');
  const [muted, setMuted]             = useState(false);
  const [liked, setLiked]             = useState(memory.likes?.includes(uid));
  const [likeCount, setLikeCount]     = useState(memory.likes?.length ?? 0);

  const playbackState = usePlaybackState();
  const progress      = useProgress(500);
  const isPlaying     = (playbackState as any)?.state === State.Playing;
  const pct           = progress.duration > 0 ? progress.position / progress.duration : 0;

  // ── Auto-play on open ──────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!memory.music?.title) return;
      try {
        setMusicLoading(true);

        // Deezer preview URLs expire in ~24h — always fetch a fresh one
        let playUrl = memory.music.previewUrl || '';

        // Try to get fresh URL via Deezer search
        const searchQuery = encodeURIComponent(
          `${memory.music.title} ${memory.music.artist || ''}`.trim()
        );
        const res = await fetch(
          `https://api.deezer.com/search?q=${searchQuery}&limit=1`,
          { headers: { 'Accept': 'application/json' } }
        );
        const json = await res.json();
        const freshUrl = json?.data?.[0]?.preview;
        if (freshUrl) {
          playUrl = freshUrl;
          console.log('Fresh Deezer preview URL fetched:', freshUrl);
        } else {
          console.log('No fresh URL found, using stored URL');
        }

        if (!playUrl) {
          if (alive) setMusicError('No preview available for this track.');
          return;
        }

        await TrackPlayer.reset();
        await TrackPlayer.add({
          id: memory.id,
          url: playUrl,
          title: memory.music.title,
          artist: memory.music.artist || '',
          artwork: memory.music.artwork,
        });
        await TrackPlayer.setVolume(1);
        await TrackPlayer.play();
        console.log('Music autoplay started:', playUrl);
      } catch (e: any) {
        console.log('Music autoplay error:', JSON.stringify(e));
        if (alive) setMusicError('Preview unavailable.');
      } finally {
        if (alive) setMusicLoading(false);
      }
    })();
    return () => {
      alive = false;
      TrackPlayer.reset().catch(() => {});
    };
  }, []);

  // Mute toggle
  const toggleMute = async () => {
    const next = !muted;
    setMuted(next);
    await TrackPlayer.setVolume(next ? 0 : 1);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // Like
  const handleLike = async () => {
    try {
      if (liked) { await unlikeMemory(memory.id); setLiked(false); setLikeCount(c => c - 1); }
      else        { await likeMemory(memory.id);   setLiked(true);  setLikeCount(c => c + 1); }
    } catch {}
  };

  // Download
  const download = async (url: string) => {
    if (!url) return;
    if (Platform.OS === 'android' && Platform.Version < 33) {
      const g = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        { title: 'Storage', message: 'RideAI needs storage access.', buttonPositive: 'Allow' }
      );
      if (g !== PermissionsAndroid.RESULTS.GRANTED) return;
    }
    try {
      if (Platform.OS === 'ios') {
        await CameraRoll.save(url, { type: 'photo' });
        Alert.alert('Saved!', 'Image saved to Photos.');
        return;
      }
      const blob = await (await fetch(url)).blob();
      const b64: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onloadend = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(blob);
      });
      await CameraRoll.save(b64, { type: 'photo' });
      Alert.alert('Saved!', 'Image saved to gallery.');
    } catch (e: any) {
      Alert.alert('Failed', e?.message ?? 'Could not save.');
    }
  };

  const feeling = memory.feeling ? FEELING_MAP[memory.feeling] : null;
  const type    = TYPE_MAP[memory.type] ?? TYPE_MAP.general;
  const place   = memory.location?.placeName || memory.location?.address || '';
  const tagged  = memory.taggedUsers ?? [];

  return (
    <View style={s.root}>
      {/* Nav */}
      <View style={s.nav}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={s.navTitle} numberOfLines={1}>{memory.title}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Author block ── */}
        <View style={s.authorBlock}>
          <Image
            source={{ uri: memory.userPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(memory.userName)}&background=FF4500&color=fff&size=128` }}
            style={s.avatar}
          />
          <View style={s.authorText}>
            <Text style={s.username}>{memory.userName}</Text>
            {(feeling || tagged.length > 0) ? (
              <Text style={s.contextLine}>
                {feeling ? `feeling ${feeling.emoji} ${feeling.label}` : ''}
                {feeling && tagged.length > 0 ? ' ' : ''}
                {tagged.length > 0
                  ? `with ${tagged.map(u => `@${u.name}`).join(', ')}`
                  : ''}
              </Text>
            ) : null}
            <Text style={s.metaLine}>
              {place ? `📍 ${place}  ·  ` : ''}{new Date(memory.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </View>
          <View style={[s.badge, { backgroundColor: type.bg }]}>
            <Text style={[s.badgeText, { color: type.text }]}>{type.label}</Text>
          </View>
        </View>

        {/* ── Title + Description ── */}
        <View style={s.textBlock}>
          <Text style={s.title}>{memory.title}</Text>
          {memory.description ? <Text style={s.desc}>{memory.description}</Text> : null}
          {memory.tripTitle ? (
            <View style={s.tripTag}>
              <Text style={s.tripTagText}>🏍️ {memory.tripTitle}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Main photo ── */}
        {selectedPhoto ? (
          <TouchableOpacity onPress={() => setImageModal(true)} activeOpacity={0.93}>
            <Image source={{ uri: selectedPhoto }} style={s.hero} resizeMode="cover" />
            <View style={s.heroOverlay}>
              <TouchableOpacity style={s.overlayPill} onPress={() => download(selectedPhoto)}>
                <Text style={s.overlayPillText}>⬇ Save</Text>
              </TouchableOpacity>
              <View style={s.overlayPill}>
                <Text style={s.overlayPillText}>⛶ Expand</Text>
              </View>
            </View>
          </TouchableOpacity>
        ) : null}

        {/* Thumbnail strip */}
        {(memory.photos?.length ?? 0) > 1 ? (
          <FlatList
            horizontal data={memory.photos} keyExtractor={(_, i) => `${i}`}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.thumbRow}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => setSelectedPhoto(item)}>
                <Image source={{ uri: item }}
                  style={[s.thumb, selectedPhoto === item && s.thumbActive]} />
              </TouchableOpacity>
            )}
          />
        ) : null}

        {/* ── Music bar ── */}
        {memory.music?.title ? (
          <View style={s.musicBar}>
            {memory.music.artwork ? (
              <Image source={{ uri: memory.music.artwork }} style={s.musicArt} />
            ) : (
              <View style={[s.musicArt, s.musicArtFallback]}>
                <Text style={{ fontSize: 18 }}>🎵</Text>
              </View>
            )}
            <View style={s.musicMeta}>
              <Text style={s.musicTitle} numberOfLines={1}>{memory.music.title}</Text>
              {memory.music.artist ? <Text style={s.musicArtist}>{memory.music.artist}</Text> : null}

              {/* Progress bar — visible while playing */}
              {progress.duration > 0 ? (
                <View style={s.progressWrap}>
                  <View style={s.progressTrack}>
                    <View style={[s.progressFill, { width: `${pct * 100}%` as any }]} />
                  </View>
                  <Text style={s.progressTime}>{fmt(progress.position)} / {fmt(progress.duration)}</Text>
                </View>
              ) : null}

              {musicLoading ? (
                <View style={s.loadingRow}>
                  <ActivityIndicator size="small" color="#FF4500" />
                  <Text style={s.loadingText}> Loading…</Text>
                </View>
              ) : musicError ? (
                <Text style={s.errorText}>{musicError}</Text>
              ) : isPlaying ? (
                <Text style={s.playingText}>♫ Now playing</Text>
              ) : null}
            </View>

            {/* Mute button only */}
            {memory.music.previewUrl && !musicLoading && !musicError ? (
              <TouchableOpacity style={s.muteBtn} onPress={toggleMute}>
                <Text style={s.muteBtnText}>{muted ? '🔇' : '🔊'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        <View style={s.body}>
          {/* Actions */}
          <View style={s.actions}>
            <TouchableOpacity style={s.actionBtn} onPress={handleLike}>
              <Text style={s.actionIcon}>{liked ? '❤️' : '🤍'}</Text>
              <Text style={s.actionLabel}>{likeCount}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={() => navigation.navigate('MapView', { memory })}>
              <Text style={s.actionIcon}>🗺️</Text>
              <Text style={s.actionLabel}>Map</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn}>
              <Text style={s.actionIcon}>💬</Text>
              <Text style={s.actionLabel}>Comment</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn}>
              <Text style={s.actionIcon}>↗️</Text>
              <Text style={s.actionLabel}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Fullscreen image modal */}
      <Modal visible={imageModal} transparent animationType="fade">
        <View style={s.modalBg}>
          <TouchableOpacity style={s.modalClose} onPress={() => setImageModal(false)}>
            <Text style={s.modalCloseText}>✕</Text>
          </TouchableOpacity>
          <Image source={{ uri: selectedPhoto }} style={s.fullImg} resizeMode="contain" />
          <TouchableOpacity style={s.modalDownload} onPress={() => download(selectedPhoto)}>
            <Text style={s.overlayPillText}>⬇  Save to Gallery</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D1A' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: Platform.OS === 'ios' ? 50 : 16, paddingBottom: 12, backgroundColor: '#16162A', borderBottomWidth: 1, borderBottomColor: '#FFFFFF0A' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  backIcon: { color: '#FF4500', fontSize: 24 },
  navTitle: { color: '#FFF', fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },

  authorBlock: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#FF4500', backgroundColor: '#222', marginTop: 2 },
  authorText: { flex: 1 },
  username: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  contextLine: { color: '#AAA', fontWeight: '400', fontSize: 12, marginTop: 2, flexWrap: 'wrap' },
  metaLine: { color: '#555', fontSize: 11, marginTop: 3 },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginTop: 3 },
  badgeText: { fontSize: 10, fontWeight: '700' },

  textBlock: { paddingHorizontal: 14, paddingBottom: 12 },
  title: { color: '#FFF', fontSize: 20, fontWeight: '800', marginBottom: 5, letterSpacing: 0.1 },
  desc: { color: '#AAA', fontSize: 14, lineHeight: 21, marginBottom: 8 },
  tripTag: { alignSelf: 'flex-start', backgroundColor: '#FF450015', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  tripTagText: { color: '#FF7043', fontSize: 12, fontWeight: '600' },

  hero: { width: W, height: W * 0.72, backgroundColor: '#111' },
  heroOverlay: { position: 'absolute', bottom: 10, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  overlayPill: { backgroundColor: '#000000BB', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  overlayPillText: { color: '#FFF', fontSize: 12, fontWeight: '600' },

  thumbRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  thumb: { width: 60, height: 60, borderRadius: 8, backgroundColor: '#222' },
  thumbActive: { borderWidth: 2, borderColor: '#FF4500' },

  musicBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#16162A',
    paddingHorizontal: 14, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: '#FFFFFF08',
    borderBottomWidth: 1, borderBottomColor: '#FFFFFF08',
    gap: 12,
  },
  musicArt: { width: 52, height: 52, borderRadius: 8, backgroundColor: '#222' },
  musicArtFallback: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#1E1E35' },
  musicMeta: { flex: 1 },
  musicTitle: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  musicArtist: { color: '#888', fontSize: 12, marginTop: 2 },
  progressWrap: { marginTop: 6 },
  progressTrack: { height: 2, backgroundColor: '#FFFFFF15', borderRadius: 1, overflow: 'hidden', marginBottom: 3 },
  progressFill: { height: 2, backgroundColor: '#FF4500', borderRadius: 1 },
  progressTime: { color: '#555', fontSize: 10 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  loadingText: { color: '#888', fontSize: 12 },
  errorText: { color: '#666', fontSize: 11, fontStyle: 'italic', marginTop: 3 },
  playingText: { color: '#FF4500', fontSize: 11, marginTop: 3, fontWeight: '600' },
  muteBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFFFFF0D', justifyContent: 'center', alignItems: 'center' },
  muteBtnText: { fontSize: 18 },

  body: { padding: 14 },
  actions: { flexDirection: 'row', gap: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#FFFFFF08' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionIcon: { fontSize: 22 },
  actionLabel: { color: '#888', fontSize: 13 },

  modalBg: { flex: 1, backgroundColor: '#000000F2', justifyContent: 'center', alignItems: 'center' },
  modalClose: { position: 'absolute', top: Platform.OS === 'ios' ? 52 : 20, right: 16, zIndex: 10, backgroundColor: '#FFFFFF22', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  modalCloseText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  fullImg: { width: W, height: H * 0.82 },
  modalDownload: { position: 'absolute', bottom: 40, backgroundColor: '#FF4500', borderRadius: 24, paddingHorizontal: 20, paddingVertical: 12 },
});
