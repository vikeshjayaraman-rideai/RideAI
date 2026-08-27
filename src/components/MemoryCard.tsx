// components/MemoryCard.tsx
import React from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet, Dimensions,
} from 'react-native';

const W = Dimensions.get('window').width;

export type MemoryType = 'hidden_gem' | 'scenic_view' | 'food_stop' | 'landmark' | 'rest_stop' | 'general';
export type PostType = 'personal' | 'community' | 'group' | 'sponsored';
export type Feeling = 'amazing' | 'adventurous' | 'peaceful' | 'tired' | 'excited' | 'grateful' | 'proud' | 'nostalgic';
export interface TaggedUser { uid: string; name: string; photoURL?: string; }
export interface Memory {
  id: string; uid: string; userName: string; userPhoto: string;
  title: string; description: string; type: MemoryType; postType?: PostType;
  photos: string[];
  location: { lat: number; lng: number; address: string; placeName: string; };
  tripId?: string; tripTitle?: string; feeling?: Feeling;
  music?: { title: string; artist?: string; spotifyUrl?: string; previewUrl?: string; artwork?: string; };
  taggedUsers?: TaggedUser[]; likes: string[]; createdAt: string;
}
interface Props { memory: Memory; onPress: (m: Memory) => void; onMapPress: (m: Memory) => void; }

export const FEELING_MAP: Record<Feeling, { emoji: string; label: string }> = {
  amazing:     { emoji: '🤩', label: 'Amazing' },
  adventurous: { emoji: '🏔️', label: 'Adventurous' },
  peaceful:    { emoji: '😌', label: 'Peaceful' },
  tired:       { emoji: '😅', label: 'Tired but happy' },
  excited:     { emoji: '🤸', label: 'Excited' },
  grateful:    { emoji: '🙏', label: 'Grateful' },
  proud:       { emoji: '💪', label: 'Proud' },
  nostalgic:   { emoji: '🥹', label: 'Nostalgic' },
};
export const TYPE_MAP: Record<MemoryType, { label: string; bg: string; text: string }> = {
  hidden_gem:  { label: '💎 Hidden Gem',  bg: '#DB277722', text: '#F472B6' },
  scenic_view: { label: '🏔️ Scenic',      bg: '#2563EB22', text: '#60A5FA' },
  food_stop:   { label: '🍽️ Food Stop',   bg: '#DC262622', text: '#F87171' },
  landmark:    { label: '🏛️ Landmark',    bg: '#D9770622', text: '#FBBF24' },
  rest_stop:   { label: '☕ Rest Stop',   bg: '#05966922', text: '#34D399' },
  general:     { label: '🏍️ Ride Memory', bg: '#7C3AED22', text: '#A78BFA' },
};

function timeAgo(iso: string) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default function MemoryCard({ memory, onPress, onMapPress }: Props) {
  const type    = TYPE_MAP[memory.type] ?? TYPE_MAP.general;
  const feeling = memory.feeling ? FEELING_MAP[memory.feeling] : null;
  const photo   = memory.photos?.[0];
  const place   = memory.location?.placeName || memory.location?.address || '';
  const tagged  = memory.taggedUsers?.map(u => u.name) ?? [];

  // "feeling 😌 Peaceful with @Vikesh and 2 more"
  let contextLine = '';
  if (feeling) contextLine += `feeling ${feeling.emoji} ${feeling.label}`;
  if (tagged.length) {
    const first = `@${tagged[0]}`;
    const extra = tagged.length - 1;
    const tagStr = extra > 0 ? `${first} and ${extra} more` : first;
    contextLine += (contextLine ? ' ' : '') + `with ${tagStr}`;
  }

  return (
    <TouchableOpacity style={s.card} activeOpacity={0.96} onPress={() => onPress(memory)}>

      {/* ── Row 1: Avatar + name + context + badge ── */}
      <View style={s.header}>
        <Image
          source={{ uri: memory.userPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(memory.userName)}&background=FF4500&color=fff&size=128` }}
          style={s.avatar}
        />
        <View style={s.headerText}>
          {/* Name + feeling + tagged in one natural line */}
          {/* Name */}
          <Text style={s.username}>{memory.userName}</Text>
          {/* Feeling + tagged on next line */}
          {(feeling || tagged.length > 0) ? (
            <Text style={s.contextLine}>
              {feeling ? `feeling ${feeling.emoji} ${feeling.label}` : ''}
              {feeling && tagged.length > 0 ? ' ' : ''}
              {tagged.length > 0 ? `with @${tagged[0]}` : ''}
              {tagged.length > 1 ? (
                <Text style={s.moreLink} onPress={() => onPress(memory)}>{` and ${tagged.length - 1} more`}</Text>
              ) : null}
            </Text>
          ) : null}
          {/* Time + place */}
          <Text style={s.metaLine} numberOfLines={1}>
            {timeAgo(memory.createdAt)} ago
            {place ? `  ·  📍 ${place}` : ''}
          </Text>
        </View>
        <View style={[s.badge, { backgroundColor: type.bg }]}>
          <Text style={[s.badgeText, { color: type.text }]}>{type.label}</Text>
        </View>
      </View>

      {/* ── Row 2: Title ── */}
      <View style={s.textBlock}>
        <Text style={s.title}>{memory.title}</Text>
        {memory.description ? (
          <Text style={s.desc} numberOfLines={3}>{memory.description}</Text>
        ) : null}
      </View>

      {/* ── Row 3: Photo ── */}
      {photo ? (
        <Image source={{ uri: photo }} style={s.photo} resizeMode="cover" />
      ) : null}

      {/* ── Row 4: Music strip (info only, no button) ── */}
      {memory.music?.title ? (
        <View style={s.musicStrip}>
          {memory.music.artwork ? (
            <Image source={{ uri: memory.music.artwork }} style={s.musicArt} />
          ) : (
            <View style={[s.musicArt, s.musicArtFallback]}>
              <Text style={{ fontSize: 13 }}>🎵</Text>
            </View>
          )}
          <View style={s.musicMeta}>
            <Text style={s.musicTitle} numberOfLines={1}>{memory.music.title}</Text>
            {memory.music.artist ? (
              <Text style={s.musicArtist} numberOfLines={1}>{memory.music.artist}</Text>
            ) : null}
          </View>
          <Text style={s.musicHint}>♫</Text>
        </View>
      ) : null}

      {/* ── Row 5: Footer actions ── */}
      <View style={s.footer}>
        <TouchableOpacity style={s.footerBtn}>
          <Text style={s.footerIcon}>🤍</Text>
          <Text style={s.footerLabel}>{memory.likes?.length ?? 0}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.footerBtn} onPress={() => onMapPress(memory)}>
          <Text style={s.footerIcon}>🗺️</Text>
          <Text style={s.footerLabel}>Map</Text>
        </TouchableOpacity>
        {(memory.photos?.length ?? 0) > 1 && (
          <View style={s.footerBtn}>
            <Text style={s.footerIcon}>📷</Text>
            <Text style={s.footerLabel}>{memory.photos.length}</Text>
          </View>
        )}
        <TouchableOpacity style={s.footerBtn}>
          <Text style={s.footerIcon}>↗️</Text>
          <Text style={s.footerLabel}>Share</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#16162A',
    borderRadius: 14,
    marginHorizontal: 10,
    marginVertical: 6,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    gap: 10,
  },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    borderWidth: 2, borderColor: '#FF4500', backgroundColor: '#222',
    marginTop: 2,
  },
  headerText: { flex: 1 },
  username: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  contextLine: { color: '#AAA', fontWeight: '400', fontSize: 12, marginTop: 1, flexWrap: 'wrap' },
  moreLink: { color: '#FF4500', fontWeight: '600', fontSize: 12 },
  metaLine: { color: '#555', fontSize: 11, marginTop: 3 },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginTop: 2 },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },

  // Text block
  textBlock: { paddingHorizontal: 12, paddingBottom: 10 },
  title: { color: '#FFF', fontSize: 16, fontWeight: '800', marginBottom: 3, letterSpacing: 0.1 },
  desc: { color: '#999', fontSize: 13, lineHeight: 18 },

  // Photo
  photo: { width: W - 20, height: (W - 20) * 0.62, backgroundColor: '#111' },

  // Music strip
  musicStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#FFFFFF08',
    backgroundColor: '#0D0D1A',
  },
  musicArt: { width: 36, height: 36, borderRadius: 6, backgroundColor: '#222' },
  musicArtFallback: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#1E1E35' },
  musicMeta: { flex: 1 },
  musicTitle: { color: '#EEE', fontSize: 12, fontWeight: '600' },
  musicArtist: { color: '#666', fontSize: 11, marginTop: 1 },
  musicHint: { color: '#FF4500', fontSize: 16, fontWeight: '600', opacity: 0.7 },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#FFFFFF08',
    gap: 20,
  },
  footerBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  footerIcon: { fontSize: 17 },
  footerLabel: { color: '#666', fontSize: 12, fontWeight: '500' },
});
