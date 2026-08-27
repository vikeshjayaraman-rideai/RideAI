// components/JayFMPlayer.tsx — Jay's FM with YouTube full songs
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView,
  Image, ActivityIndicator, Animated, Easing, AppState,
} from 'react-native';
import { colors } from '../theme/colors';
import {
  FM_LANGUAGES, SCHEDULE, getCurrentSlot, getSlotDurationMins,
  getCurrentSegmentIndex, searchYouTubeSongs, loadPrescriptedContent,
  getPrescriptedSegment, getPrescriptedSongs, getPrescriptedTopic,
  getNextContent, prefetchContent, clearContentQueue, clearPlayedSongs,
  generateTuneInAnnouncement, generateSongIntro, speakFM, stopFM,
  initFMTts, setupTrackPlayer, parseScript, loadSfxSounds, playSfxTransition,
  clearPrescriptedCache, preloadSongQueue,
  startMemoryMonitor, stopMemoryMonitor, reinitTTS,
  getPrescriptedPlaylist, hasPrescriptedPlaylist,
  playComedyClip, playSfxBackground,
  playSongSet,
} from '../services/jayFMService';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Props {
  visible: boolean;
  onClose: () => void;
  currentLocation?: string;
  isVoiceMeetActive?: boolean;
  testSlotId?: string; // For testing — override current slot
}

type FMState = 'idle' | 'loading' | 'speaking' | 'playing_song' | 'paused';

const decodeHtml = (str: string) => (str || '')
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/&#039;/g, "'").trim();

export default function JayFMPlayer({ visible, onClose, currentLocation, isVoiceMeetActive, testSlotId }: Props) {
  const [language, setLanguage] = useState('en-IN');
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showSlotPicker, setShowSlotPicker] = useState(false);
  const [testMode, setTestMode] = useState(false); // Skip songs in test mode
  const [selectedTestSlot, setSelectedTestSlot] = useState<string | undefined>(testSlotId);
  const testSlotRef = useRef<string | undefined>(testSlotId);
  const [fmState, setFmState] = useState<FMState>('idle');
  const [currentScript, setCurrentScript] = useState('');
  const [currentTrack, setCurrentTrack] = useState<any>(null);
  const [statusText, setStatusText] = useState('');
  const [started, setStarted] = useState(false);

  const isRunningRef = useRef(false);
  const isPausedRef = useRef(false);
  const loopActiveRef = useRef(false); // Prevents multiple loops
  const sfxCacheRef = useRef<Record<string, string[]>>({}); // Fresh SFX URLs
  const sfxIndexRef = useRef(0); // Cycle through SFX URLs
  const segmentIndexRef = useRef(0);
  const songsRef = useRef<any[]>([]);
  const songIndexRef = useRef(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<any>(null);

  useEffect(() => {
    AsyncStorage.getItem('jay_language').then(l => { if (l) setLanguage(l); });
  }, []);

  // Resume when device wakes from sleep
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active' && started && isRunningRef.current) {
        console.log('FM: device woke, fmState:', fmState);
        isPausedRef.current = false;
      }
    });
    return () => sub.remove();
  }, [started, fmState]);

  useEffect(() => {
    if (visible && !started) startStation();
    if (!visible) stopStation();
  }, [visible]);



  const startPulse = () => {
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    pulseLoop.current.start();
  };
  const stopPulse = () => { pulseLoop.current?.stop(); pulseAnim.setValue(1); };

  const waitIfPaused = () => new Promise<void>(resolve => {
    if (!isPausedRef.current) { resolve(); return; }
    const iv = setInterval(() => {
      if (!isPausedRef.current || !isRunningRef.current) { clearInterval(iv); resolve(); }
    }, 300);
  });

  // ── Play ONE full song ────────────────────────────────────────────────────
  const playYouTube = useCallback(async (track: any): Promise<void> => {
    if (!track) return;
    const duration = track.duration || 240;
    
    // Show song info
    setCurrentTrack(track);
    setCurrentScript('');
    setFmState('playing_song');
    setStatusText(`🎵 ${track.title} — ${track.artist} (${Math.round(duration/60)}min)`);
    console.log('FM: playing full song:', track.title, `${Math.round(duration/60)}min`);
    
    // Play full song
    await playSongSet([track], 1);
  }, []);

  // ── Station loop — playlist based ──────────────────────────────────────────
  const runStationLoop = useCallback(async (slot: any, lang: string, usePreScripted: boolean) => {
    if (loopActiveRef.current) {
      console.log('FM: loop already active, skipping duplicate');
      return;
    }
    loopActiveRef.current = true;
    // Clear any stale event listeners from previous loops
    console.log('FM: loop started, slot:', slot.episodeId, 'preScripted:', usePreScripted);

    // Check if we have a playlist
    const playlist = usePreScripted ? getPrescriptedPlaylist() : [];
    const hasPlaylist = playlist.length > 0;
    console.log('FM: playlist items:', playlist.length, hasPlaylist ? '✅' : '❌ using segment loop');

    if (hasPlaylist) {
      // ── PLAYLIST MODE — simple ordered loop ──────────────────────────────
      let playlistIndex = 0;
      while (isRunningRef.current) {
        await waitIfPaused();
        console.log('FM: playlist loop check, running:', isRunningRef.current, 'paused:', isPausedRef.current);
        if (!isRunningRef.current) break;

        // Check slot change
        const currentSlot = getCurrentSlot();
        if (!testSlotRef.current && currentSlot.episodeId !== slot.episodeId) {
          slot = currentSlot;
          const newPre = await loadPrescriptedContent(slot.episodeId);
          const newPlaylist = newPre ? getPrescriptedPlaylist() : [];
          if (newPlaylist.length > 0) {
            playlist.length = 0;
            playlist.push(...newPlaylist);
            playlistIndex = 0;
          }
          const ann = generateTuneInAnnouncement(slot, lang);
          setCurrentScript(ann); setFmState('speaking'); startPulse();
          await speakFM(ann, lang); stopPulse();
          continue;
        }

        // Playlist exhausted - break to advance to next slot
        if (playlistIndex >= playlist.length) {
          console.log('FM: playlist complete, advancing to next slot');
          break;
        }

        // Check if playlist is exhausted
        if (playlistIndex >= playlist.length) {
          console.log('FM: playlist exhausted at', playlistIndex, '/', playlist.length);
          break;
        }
        const item = playlist[playlistIndex];
        playlistIndex++;
        console.log('FM: playlist item', playlistIndex, '/', playlist.length, '-', item.type);

        try {
          if (item.type === 'content') {
          // SFX - loop during content segment, auto-stop when segment ends
          try {
            const sfxUrls = sfxCacheRef.current[slot.episodeId] || [];
            if (sfxUrls.length > 0) {
              const sfxUrl = sfxUrls[sfxIndexRef.current % sfxUrls.length];
              sfxIndexRef.current++;
              // Estimate content duration (chars * ~0.3s per char)
              const estDurationMs = Math.min((item.text?.length || 500) * 300, 120000);
              const { NativeModules: NM } = require('react-native');
              if (NM.SoundPoolModule?.playLoop) {
                NM.SoundPoolModule.playLoop(sfxUrl, 0.12, estDurationMs).catch(() => {});
              } else {
                playSfxBackground(sfxUrl); // fallback
              }
            }
          } catch {}
          const spoken = parseScript(item.text);
          setCurrentScript(spoken || item.text);
          setCurrentTrack(null);
          setFmState('speaking');
          setStatusText(`${slot.emoji} ${slot.title}`);
          startPulse();
          // Chunk long content + mini-song between chunks to prevent OOM
          const fullText = spoken || item.text;
          const CHUNK = 400;
          if (fullText.length > CHUNK) {
            const chunks: string[] = [];
            let rem = fullText;
            while (rem.length > 0) {
              let cut = CHUNK;
              const best = Math.max(
                rem.lastIndexOf('.', CHUNK),
                rem.lastIndexOf('!', CHUNK),
                rem.lastIndexOf('?', CHUNK),
                rem.lastIndexOf('।', CHUNK),
                rem.lastIndexOf('\n', CHUNK),
              );
              if (best > CHUNK / 2) cut = best + 1;
              chunks.push(rem.substring(0, cut).trim());
              rem = rem.substring(cut).trim();
            }
            // Merge ALL small trailing chunks (< 300 chars) with previous
            while (chunks.length > 1 && chunks[chunks.length - 1].length < 300) {
              const last = chunks.pop()!;
              chunks[chunks.length - 1] += ' ' + last;
            }
            console.log('FM: content chunks:', chunks.length);

            for (let ci = 0; ci < chunks.length; ci++) {
              if (!isRunningRef.current) break;
              if (chunks[ci]) await speakFM(chunks[ci], lang);
              // Ad slot placeholder - will go here later
            }
          } else {
            await speakFM(fullText, lang);
          }
          stopPulse();
          console.log('FM: content done, next item:', playlistIndex, '/', playlist.length);
          // reinitTTS happens during song playback (see below)
          // Comedy clips removed - SFX handles transitions

        } else if (item.type === 'song') {
          const intro = generateSongIntro(item, lang);
          setCurrentScript(intro);
          setFmState('speaking');
          startPulse();
          await speakFM(intro, lang);
          stopPulse();

          if (!isRunningRef.current) break;
          setCurrentTrack(item);
          setFmState('playing_song');
          setStatusText(`🎵 ${decodeHtml(item.title || '')}`);
          await playSongSet([item], 1);
          console.log('FM: song done, next item:', playlistIndex, '/', playlist.length);
          // Play SFX right after song ends - get fresh URL from runtime cache
          const nextItem = playlist[playlistIndex];
          if (nextItem?.type === 'content') {
            const freshSfx = (sfxCacheRef.current[slot.episodeId] || [])[Math.floor(Math.random() * ((sfxCacheRef.current[slot.episodeId] || []).length || 1))] || '';
            if (freshSfx) {
              console.log('FM: SFX after song ✅');
              playSfxBackground(freshSfx);
            }
          }
        }
        } catch (itemErr: any) {
          console.log('FM: playlist item error:', itemErr?.message);
        }
        // No setTimeout here - it gets throttled during sleep!
      }
      loopActiveRef.current = false;
      console.log('FM: playlist loop ended');
      // Auto-play next scheduled slot (clear test slot so schedule takes over)
      if (isRunningRef.current) {
        // Hardcoded schedule order
        const FM_SCHEDULE_ORDER = [
          'rhythms', 'rasi_palan', 'morning_news', 'thalaivar',
          'health', 'movie_review', 'agriculture', 'travel',
          'local_news', 'weather', 'comedy', 'science',
          'evening_news', 'horror', 'love', 'night'
        ];
        const currentIdx = FM_SCHEDULE_ORDER.indexOf(slot.episodeId);
        const nextId = FM_SCHEDULE_ORDER[(currentIdx + 1) % FM_SCHEDULE_ORDER.length];
        testSlotRef.current = nextId;
        console.log('FM: auto-advancing to next slot:', nextId);
        // Play transition SFX
        const transUrl = (sfxCacheRef.current[slot.episodeId] || [])[0];
        if (transUrl) playSfxBackground(transUrl);
        // Clear cache for new slot
        clearPrescriptedCache();
        sfxCacheRef.current = {};
        sfxIndexRef.current = 0;
        // Direct restart for next slot - no setTimeout (throttled during sleep)
        loopActiveRef.current = false;
        isRunningRef.current = true;
        console.log('FM: starting next slot directly...');
        await startStation();
        return;
      }
      return;
    }

    // ── FALLBACK SEGMENT LOOP (no playlist) ──────────────────────────────────
    while (isRunningRef.current) {
      await waitIfPaused();
      if (!isRunningRef.current) break;
      console.log('FM: seg loop iteration, seg:', segmentIndexRef.current);

      // Check slot change — skip in test mode
      const currentSlot = getCurrentSlot();
      if (!testSlotRef.current && currentSlot.episodeId !== slot.episodeId) {
        slot = currentSlot;
        const newPre = await loadPrescriptedContent(slot.episodeId);
        usePreScripted = newPre;
        if (newPre) {
          const preSongs = getPrescriptedSongs();
          songsRef.current = preSongs.length > 0 ? preSongs : await searchYouTubeSongs(getSongQuery(slot.episodeId, lang), 15);
        } else {
          songsRef.current = await searchYouTubeSongs(getSongQuery(slot.episodeId, lang), 15);
        }
        songIndexRef.current = 0;
        segmentIndexRef.current = 0;
        const ann = generateTuneInAnnouncement(slot, lang);
        setCurrentScript(ann);
        setFmState('speaking');
        startPulse();
        await speakFM(ann, lang);
        stopPulse();
        continue;
      }

      // Get content
      setFmState('loading');
      setStatusText('Jay is preparing...');
      let content = '';
      if (usePreScripted) {
        content = getPrescriptedSegment(segmentIndexRef.current);
        // Cycle back to 0 when all pre-scripted segments used
        if (!content && segmentIndexRef.current > 0) {
          console.log('FM: cycling pre-scripted segments from 0');
          segmentIndexRef.current = 0;
          content = getPrescriptedSegment(0);
        }
        console.log('FM: pre-scripted seg', segmentIndexRef.current, 'length:', content.length);
      }
      if (!content) {
        content = await getNextContent(slot.contentType, lang, segmentIndexRef.current, currentLocation);
        console.log('FM: live content length:', content.length);
      }
      segmentIndexRef.current++;

      if (!isRunningRef.current) break;
      await waitIfPaused();

      // Speak content
      if (content) {
        const spoken = parseScript(content);
        setCurrentScript(spoken || content);
        setCurrentTrack(null);
        setFmState('speaking');
        setStatusText(`${slot.emoji} ${slot.title}`);
        // SFX chime before Jay speaks
        console.log('FM: about to play SFX and speak, chars:', (spoken||content).length);
        await playSfxTransition(slot.episodeId);
        console.log('FM: SFX done, calling speakFM now');
        startPulse();
        await speakFM(spoken || content, lang);
        console.log('FM: speakFM returned');
        stopPulse();
      }

      if (!isRunningRef.current) break;
      await waitIfPaused();

      // Play song after content
      const songs = songsRef.current;
      if (songs.length > 0) {
        // Cycle songs when all played
        if (songIndexRef.current >= songs.length) {
          console.log('FM: cycling songs from beginning');
          songIndexRef.current = 0;
        }
        const song = songs[songIndexRef.current % songs.length];
        songIndexRef.current++;

        // Song intro by Jay
        const intro = generateSongIntro(song, lang);
        setCurrentScript(intro);
        setCurrentTrack(null);
        setFmState('speaking');
        startPulse();
        await speakFM(intro, lang);
        stopPulse();

        if (!isRunningRef.current) break;
        await waitIfPaused();

        // Play song set (3 songs back to back = ~90s music break)
        await playYouTube(song);
        console.log('FM: song playYouTube returned, continuing loop...');
      }

      console.log('FM: loop iteration complete, next seg:', segmentIndexRef.current);
    }
    loopActiveRef.current = false;
    console.log('FM: loop ended');
  }, [currentLocation, playYouTube]);

  // ── Start station ──────────────────────────────────────────────────────────
  const startStation = useCallback(async () => {
    // Reset all state refs at start
    loopActiveRef.current = false;
    console.log('📊 Starting memory monitor...');
    startMemoryMonitor();
    sfxIndexRef.current = 0;
    isRunningRef.current = true;
    isPausedRef.current = false;
    setStarted(true);
    setFmState('loading');
    setStatusText("Tuning in to Jay's FM...");

    console.log('FM: step 1 - initFMTts');
    await initFMTts();
    console.log('FM: step 2 - getting slot');
    // Use test slot if selected, otherwise use current time slot
    const slot = testSlotRef.current
      ? (SCHEDULE.find(s => s.episodeId === testSlotRef.current) || getCurrentSlot())
      : getCurrentSlot();
    console.log('FM: starting slot:', slot.episodeId, testSlotRef.current ? '(TEST)' : '');
    const lang = await AsyncStorage.getItem('jay_language') || language;

    // Load fresh SFX URLs into local ref (fresh = no expiry issues)
    console.log('FM: step 3 - starting SFX fetch for slot:', slot.episodeId);
    // SFX queries - Deezer instrumental queries per slot
    // SFX queries - MUST be instrumental BGM only, no vocals
    const sfxQueryMap: Record<string, string> = {
      rhythms:      'morning instrumental bgm music',
      rasi_palan:   'temple bells instrumental',
      morning_news: 'news jingle instrumental bgm',
      thalaivar:    'epic bgm instrumental music',
      health:       'upbeat instrumental bgm',
      movie_review: 'cinematic bgm instrumental',
      agriculture:  'folk flute instrumental',
      travel:       'adventure bgm instrumental',
      local_news:   'news bgm instrumental',
      weather:      'ambient instrumental piano',
      comedy:       'comedy bgm instrumental',
      science:      'electronic ambient instrumental',
      evening_news: 'news bgm evening instrumental',
      horror:       'suspense bgm instrumental',
      love:         'romantic bgm instrumental',
      night:        'chill bgm instrumental',
    };
    try {
      const sfxQuery = sfxQueryMap[slot.episodeId] || 'radio jingle chime';
      console.log('FM: SFX query:', sfxQuery);
      const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(sfxQuery)}&limit=15`);
      const data = await res.json();
      const urls = (data.data || []).filter((t: any) => t.preview).map((t: any) => t.preview);
      if (urls.length > 0) {
        sfxCacheRef.current[slot.episodeId] = urls;
        console.log('FM: SFX loaded:', urls.length, 'clips for', slot.episodeId, '- first url:', urls[0]?.substring(0, 40));
      } else {
        console.log('FM: SFX load returned 0 clips');
      }
    } catch (e: any) { console.log('FM: SFX load EXCEPTION:', String(e)); }


    // Load pre-scripted content
    const hasPreScripted = await loadPrescriptedContent(slot.episodeId);
    console.log('FM: pre-scripted:', hasPreScripted ? '✅' : '❌');

    if (hasPreScripted) {
      const preSongs = getPrescriptedSongs();
      if (preSongs.length > 0) {
        songsRef.current = preSongs;
        console.log('FM: loaded', preSongs.length, 'pre-scripted songs');
      } else {
        console.log('FM: no valid pre-scripted songs, fetching from JioSaavn...');
        const liveSongs = await searchJioSaavnSongs(getSongQuery(slot.episodeId, lang), 5);
        songsRef.current = liveSongs;
      }
    } else {
      console.log('FM: no pre-scripted, fetching JioSaavn songs...');
      const liveSongs = await searchJioSaavnSongs(getSongQuery(slot.episodeId, lang), 5);
      songsRef.current = liveSongs;
      prefetchContent(slot.contentType, lang, segmentIndexRef.current, currentLocation, 2);
    }
    // Store songs for playlist - don't pre-queue, play directly
    console.log('FM: songs ready for playlist:', songsRef.current.length);
    console.log('FM: songs ready:', songsRef.current.length);

    // For pre-scripted: start from seg 0 (all content prepared)
    // For live: use clock-based index to sync riders
    const segIdx = hasPreScripted ? 0 : getCurrentSegmentIndex(slot);
    segmentIndexRef.current = segIdx;
    songIndexRef.current = Math.floor(Math.random() * Math.max(songsRef.current.length, 1));
    console.log('FM: starting at seg', segIdx, 'songs:', songsRef.current.length);

    // Welcome announcement
    const announcement = generateTuneInAnnouncement(slot, lang);
    setCurrentScript(announcement);
    setFmState('speaking');
    setStatusText(`${slot.emoji} ${slot.title}`);
    startPulse();
    await speakFM(announcement, lang);
    stopPulse();

    runStationLoop(slot, lang, hasPreScripted);
  }, [language, currentLocation, runStationLoop]);

  const stopStation = async () => {
    isRunningRef.current = false;
    isPausedRef.current = false;
    loopActiveRef.current = false;
clearContentQueue();
    await stopFM();
    stopPulse();
    setFmState('idle');
    setStarted(false);
    setCurrentScript('');
    setCurrentTrack(null);
  };

  const handleClose = async () => { await stopStation(); onClose(); };

  const handlePauseResume = async () => {
    if (fmState === 'paused') {
      isPausedRef.current = false;
      setFmState(youtubeVideoId ? 'playing_song' : 'speaking');
      if (youtubeVideoId) setYoutubePlay(true);
    } else {
      isPausedRef.current = true;
      try { require('react-native-tts').default.stop(); } catch {}
      try { const TP = require('react-native-track-player').default; await TP.pause(); } catch {}
      stopPulse();
      setFmState('paused');
    }
  };

  const handleChangeLang = async (lang: string) => {
    setLanguage(lang);
    await AsyncStorage.setItem('jay_language', lang);
    setShowLangPicker(false);
    await stopStation();
    setTimeout(() => startStation(), 500);
  };

  const slot = getCurrentSlot();
  const slotDuration = getSlotDurationMins(slot);
  const fmColor = fmState === 'playing_song' ? '#059669'
    : fmState === 'speaking' ? colors.primary
    : fmState === 'paused' ? '#D97706' : colors.textMuted;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.overlay}>
        <View style={s.panel}>



          {/* Header */}
          <View style={s.header}>
            <Animated.View style={[s.radioIcon, { transform: [{ scale: fmState === 'speaking' ? pulseAnim : 1 }], backgroundColor: fmColor + '22' }]}>
              <Text style={s.radioEmoji}>📻</Text>
            </Animated.View>
            <View style={s.headerInfo}>
              <Text style={s.headerTitle}>Jay's FM</Text>
              <Text style={[s.headerSub, { color: fmColor }]}>
                {fmState === 'loading' ? '⏳ Loading...'
                  : fmState === 'playing_song' ? '🎵 Full song playing'
                  : fmState === 'speaking' ? '🎙️ Jay is on air'
                  : fmState === 'paused' ? '⏸️ Paused'
                  : '📻 Ready'}
              </Text>
            </View>
            <View style={s.headerRight}>
              <TouchableOpacity style={s.iconBtn} onPress={() => setShowSlotPicker(!showSlotPicker)}>
                <Text style={s.iconBtnText}>📋</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.iconBtn} onPress={() => setShowLangPicker(!showLangPicker)}>
                <Text style={s.iconBtnText}>{FM_LANGUAGES.find(l => l.code === language)?.flag || '🌐'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.iconBtn} onPress={handleClose}>
                <Text style={s.iconBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Test slot picker */}
          {showSlotPicker && (
            <View style={s.langDropdown}>
              <Text style={[s.langLabel, {padding: 8, fontWeight: '700', color: colors.primary}]}>🧪 Test — Pick a slot</Text>
              <ScrollView style={{maxHeight: 200}}>
                {SCHEDULE.map(s2 => (
                  <TouchableOpacity key={s2.episodeId}
                    style={[s.langOption, selectedTestSlot === s2.episodeId && s.langOptionActive]}
                    onPress={async () => {
                      testSlotRef.current = s2.episodeId;
                      setSelectedTestSlot(s2.episodeId);
                      setShowSlotPicker(false);
                      // Clear cache so new slot loads fresh
                      clearPrescriptedCache();
                      clearContentQueue();
                      // Stop current station
                      isRunningRef.current = false;
                      isPausedRef.current = false;
                      clearContentQueue();
                      try { await stopFM(); } catch {}
                      stopPulse();
                      setFmState('idle');
                      setStarted(false);
                      setCurrentScript('');
                      setCurrentTrack(null);
                      // Start fresh after short delay
                      setTimeout(() => {
                        setStarted(false);
                        startStation();
                      }, 500);
                    }}>
                    <Text style={s.langFlag}>{s2.emoji}</Text>
                    <Text style={[s.langLabel, selectedTestSlot === s2.episodeId && {color: colors.primary, fontWeight: '700'}]}>
                      {s2.title}
                    </Text>
                    <Text style={{color: colors.textMuted, fontSize: 11}}>{s2.startHour}:{String(s2.startMin).padStart(2,'0')}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Language picker */}
          {showLangPicker && (
            <View style={s.langDropdown}>
              {FM_LANGUAGES.map(lang => (
                <TouchableOpacity key={lang.code}
                  style={[s.langOption, language === lang.code && s.langOptionActive]}
                  onPress={() => handleChangeLang(lang.code)}>
                  <Text style={s.langFlag}>{lang.flag}</Text>
                  <Text style={[s.langLabel, language === lang.code && { color: colors.primary, fontWeight: '700' }]}>{lang.label}</Text>
                  {language === lang.code && <Text style={{ color: colors.primary }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Current slot banner */}
          <View style={s.slotBanner}>
            <Text style={s.slotEmoji}>{slot.emoji}</Text>
            <View style={s.slotInfo}>
              <Text style={s.slotTitle}>{slot.title}</Text>
              <Text style={s.slotTime}>{slot.startHour}:{String(slot.startMin).padStart(2,'0')} — {slot.endHour}:{String(slot.endMin).padStart(2,'0')} · {slotDuration} mins · All India listeners</Text>
            </View>
            <View style={s.liveBadge}>
              <View style={s.liveDot} />
              <Text style={s.liveText}>LIVE</Text>
            </View>
          </View>

          {/* Content card */}
          <View style={s.contentCard}>
            {fmState === 'loading' && (
              <View style={s.centerWrap}>
                <ActivityIndicator color={colors.primary} />
                <Text style={s.loadingText}>{statusText}</Text>
              </View>
            )}
            {fmState === 'playing_song' && currentTrack && (
              <View style={s.trackWrap}>
                {currentTrack.artwork
                  ? <Image source={{ uri: currentTrack.artwork }} style={s.artwork} />
                  : <View style={[s.artwork, s.artworkFallback]}><Text style={{ fontSize: 40 }}>🎵</Text></View>}
                <View style={s.trackInfo}>
                  <Text style={s.trackTitle} numberOfLines={2}>{currentTrack.title}</Text>
                  <Text style={s.trackArtist} numberOfLines={1}>{currentTrack.artist}</Text>
                  <View style={s.playingPill}>
                    <View style={s.playingDot} />
                    <Text style={s.playingText}>🎵 MUSIC BREAK</Text>
                  </View>
                </View>
              </View>
            )}
            {(fmState === 'speaking' || fmState === 'paused') && currentScript ? (
              <View>
                <Text style={s.scriptText}>{currentScript}</Text>
                {fmState === 'speaking' && (
                  <View style={s.waveRow}>
                    {[1,2,3,4,5,6,7,8,9,10].map(i => (
                      <View key={i} style={[s.waveBar, { height: 6 + (i%5)*9, backgroundColor: colors.primary, opacity: 0.35 + (i%3)*0.2 }]} />
                    ))}
                  </View>
                )}
              </View>
            ) : null}
          </View>

          {/* Schedule strip */}
          <View style={s.scheduleStrip}>
            <Text style={s.scheduleTitle}>📅 Today on Jay's FM</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.scheduleRow}>
              {SCHEDULE.map(s2 => {
                const isCurrent = s2.episodeId === slot.episodeId;
                return (
                  <View key={s2.episodeId} style={[s.scheduleItem, isCurrent && s.scheduleItemActive]}>
                    <Text style={s.scheduleEmoji}>{s2.emoji}</Text>
                    <Text style={[s.scheduleLabel, isCurrent && { color: colors.primary, fontWeight: '700' }]} numberOfLines={1}>{s2.title}</Text>
                    <Text style={[s.scheduleTime, isCurrent && { color: colors.primary }]}>{String(s2.startHour).padStart(2,'0')}:{String(s2.startMin).padStart(2,'0')}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>

          {/* Controls */}
          <View style={s.controls}>
            <TouchableOpacity style={s.controlBtn} onPress={handlePauseResume}>
              <Text style={s.controlIcon}>{fmState === 'paused' ? '▶️' : '⏸️'}</Text>
              <Text style={s.controlLabel}>{fmState === 'paused' ? 'Resume' : 'Pause'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.controlBtn} onPress={() => {
              setTestMode(!testMode);
              // Skip current song
              try { require('react-native-track-player').default.stop(); } catch {}
            }}>
              <Text style={s.controlIcon}>{testMode ? '🐢' : '⏭️'}</Text>
              <Text style={s.controlLabel}>{testMode ? 'Normal' : 'Skip Song'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.controlBtn, { borderColor: '#DC262633' }]} onPress={handleClose}>
              <Text style={s.controlIcon}>⏹️</Text>
              <Text style={[s.controlLabel, { color: '#DC2626' }]}>Tune Off</Text>
            </TouchableOpacity>
          </View>

          {isVoiceMeetActive && (
            <View style={s.warnBanner}>
              <Text style={s.warnText}>⚠️ Voice meet active — FM may conflict with audio</Text>
            </View>
          )}
          <Text style={s.hint}>Full songs · All riders hear same content · Jay's FM 📻</Text>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  panel: { backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 28, borderTopWidth: 0.5, borderColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  radioIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  radioEmoji: { fontSize: 24 },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  headerSub: { fontSize: 12, marginTop: 2 },
  headerRight: { flexDirection: 'row', gap: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { fontSize: 18 },
  langDropdown: { backgroundColor: colors.card, marginHorizontal: 16, borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: colors.border, marginBottom: 8 },
  langOption: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  langOptionActive: { backgroundColor: colors.primary + '11' },
  langFlag: { fontSize: 22 },
  langLabel: { flex: 1, fontSize: 15, color: colors.text },
  slotBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, marginHorizontal: 16, marginTop: 12, borderRadius: 14, padding: 12, borderWidth: 0.5, borderColor: colors.border },
  slotEmoji: { fontSize: 28 },
  slotInfo: { flex: 1 },
  slotTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  slotTime: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#DC262622', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#DC2626' },
  liveText: { color: '#DC2626', fontSize: 11, fontWeight: '700' },
  contentCard: { margin: 16, backgroundColor: colors.card, borderRadius: 16, padding: 16, minHeight: 120, justifyContent: 'center', borderWidth: 0.5, borderColor: colors.border },
  centerWrap: { alignItems: 'center', gap: 10 },
  loadingText: { color: colors.textMuted, fontSize: 13 },
  trackWrap: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  artwork: { width: 80, height: 80, borderRadius: 12, backgroundColor: '#333' },
  artworkFallback: { alignItems: 'center', justifyContent: 'center' },
  trackInfo: { flex: 1 },
  trackTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 4 },
  trackArtist: { fontSize: 13, color: colors.textSecondary, marginBottom: 8 },
  playingPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#05966922', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  playingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#059669' },
  playingText: { color: '#059669', fontSize: 10, fontWeight: '700' },
  scriptText: { fontSize: 14, color: colors.text, lineHeight: 23 },
  waveRow: { flexDirection: 'row', gap: 3, marginTop: 12, justifyContent: 'center' },
  waveBar: { width: 5, borderRadius: 3 },
  scheduleStrip: { paddingHorizontal: 16, marginBottom: 10 },
  scheduleTitle: { fontSize: 11, color: colors.textMuted, marginBottom: 8, fontWeight: '600' },
  scheduleRow: { flexDirection: 'row', gap: 8, paddingRight: 16 },
  scheduleItem: { alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 0.5, borderColor: colors.border, minWidth: 68 },
  scheduleItemActive: { backgroundColor: colors.primary + '22', borderColor: colors.primary },
  scheduleEmoji: { fontSize: 18 },
  scheduleLabel: { fontSize: 9, color: colors.textMuted, marginTop: 2, textAlign: 'center', maxWidth: 64 },
  scheduleTime: { fontSize: 9, color: colors.textMuted, marginTop: 1, fontWeight: '600' },
  controls: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 10 },
  controlBtn: { flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14, alignItems: 'center', gap: 4, borderWidth: 0.5, borderColor: colors.border },
  controlIcon: { fontSize: 24 },
  controlLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  warnBanner: { backgroundColor: '#DC262611', borderRadius: 10, marginHorizontal: 16, padding: 8, marginBottom: 8 },
  warnText: { color: '#DC2626', fontSize: 12, textAlign: 'center' },
  hint: { fontSize: 12, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 24 },
});