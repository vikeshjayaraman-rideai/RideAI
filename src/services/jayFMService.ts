// services/jayFMService.ts — Jay's FM Scheduled Radio Station
import TrackPlayer, { Event, State } from 'react-native-track-player';
import { NativeModules, AppState } from 'react-native';
const { SoundPoolModule } = NativeModules;
import { GEMINI_API_KEY, GOOGLE_MAPS_API_KEY } from '@env';
import firestore from '@react-native-firebase/firestore';
const SEARCH_SONGS_CF = 'https://searchsongsu5phkx5mxa-el.a.run.app';

// ── Memory Monitor ────────────────────────────────────────────────────────────
let _memMonitorInterval: any = null;
const HEAP_WARN_MB = 150;  // warn at 150MB
const HEAP_CRIT_MB = 220;  // critical at 220MB

export const startMemoryMonitor = () => {
  if (_memMonitorInterval) return;
  _memMonitorInterval = setInterval(() => {
    try {
      const { NativeModules: NM } = require('react-native');
      // Android memory via global.performance.memory (if available)
      const mem = (global as any).performance?.memory;
      if (mem) {
        const usedMB = Math.round(mem.usedJSHeapSize / 1024 / 1024);
        const totalMB = Math.round(mem.jsHeapSizeLimit / 1024 / 1024);
        const pct = Math.round((usedMB / totalMB) * 100);
        if (usedMB >= HEAP_CRIT_MB) {
          console.log(`🔴 MEMORY CRITICAL: ${usedMB}MB / ${totalMB}MB (${pct}%) - OOM risk!`);
        } else if (usedMB >= HEAP_WARN_MB) {
          console.log(`🟡 MEMORY WARNING: ${usedMB}MB / ${totalMB}MB (${pct}%)`);
        } else {
          console.log(`🟢 Memory OK: ${usedMB}MB / ${totalMB}MB (${pct}%)`);
        }
      }
    } catch {}
  }, 10000); // check every 10s
};

export const stopMemoryMonitor = () => {
  if (_memMonitorInterval) { clearInterval(_memMonitorInterval); _memMonitorInterval = null; }
};

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const YOUTUBE_API_KEY = GOOGLE_MAPS_API_KEY; // same Google project
const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';

// ── TTS ───────────────────────────────────────────────────────────────────────
let _tts: any = null;
let _isSpeaking = false;

// ── TrackPlayer setup with foreground service ────────────────────────────────
let _trackPlayerReady = false;

export const setupTrackPlayer = async () => {
  if (_trackPlayerReady) return;
  try {
    await TrackPlayer.setupPlayer();
    _trackPlayerReady = true;
    console.log('FM: TrackPlayer ready ✅');
  } catch (e: any) {
    if (e?.message?.includes('already') || e?.message?.includes('initialized')) {
      _trackPlayerReady = true;
    } else {
      console.log('FM: TrackPlayer setup error:', e?.message);
    }
  }
};


export const initFMTts = async (): Promise<void> => {
  return new Promise((resolve) => {
    try {
      const Tts = require('react-native-tts').default;
      if (typeof Tts?.speak !== 'function') { resolve(); return; }
      _tts = Tts;
      Tts.setDefaultRate(0.48);
      Tts.setDefaultPitch(1.3);
      try { Tts.setDefaultEngine('com.google.android.tts'); } catch {}
      if (Tts.getInitStatus) {
        Tts.getInitStatus().then(() => resolve()).catch(() => resolve());
      } else { resolve(); }
    } catch { resolve(); }
  });
};

let _speakCount = 0;

export const stopFMTts = async (): Promise<void> => {
  try {
    if (_tts && _isSpeaking) {
      _tts.stop();
      _isSpeaking = false;
    }
  } catch {}
};

export const reinitTTS = async (): Promise<void> => {
  try {
    console.log('🔄 FM: TTS reinit - freeing memory');
    if (_tts) {
      try { _tts.stop(); } catch {}
      try { _tts.removeAllListeners?.('tts-finish'); } catch {}
      try { _tts.removeAllListeners?.('tts-cancel'); } catch {}
      try { _tts.removeAllListeners?.('tts-error'); } catch {}
      try { _tts.removeAllListeners?.('tts-start'); } catch {}
      _tts = null;
    }
    // Force GC hint
    if ((global as any).gc) { try { (global as any).gc(); } catch {} }
    await initFMTts();
    console.log('✅ FM: TTS reinit done');
  } catch (e: any) {
    console.log('FM: TTS reinit error:', e?.message);
  }
};

export const speakFM = async (text: string, language: string): Promise<void> => {
  if (!text) return;



  _speakCount++;
  if (!_tts) { await initFMTts(); }
  if (!_tts) { console.log('FM: TTS not available'); return; }

  while (_isSpeaking) { await new Promise(r => setTimeout(r, 200)); }
  _isSpeaking = true;
  try {
    try { _tts.setDefaultLanguage(language); } catch { try { _tts.setDefaultLanguage('en-IN'); } catch {} }
    // Tamil text: ~5 chars/sec at rate 0.48, plus 90s safety buffer
    const estimatedMs = Math.max(60000, (text.length / 5) * 1000 + 90000);
    console.log('FM speakFM: chars', text.length, 'timeout', Math.round(estimatedMs/1000)+'s');
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => { _isSpeaking = false; resolve(); }, estimatedMs);
      _tts.removeAllListeners?.('tts-finish');
      _tts.removeAllListeners?.('tts-cancel');
      _tts.addEventListener('tts-finish', () => { console.log('FM TTS: finish event'); clearTimeout(t); _isSpeaking = false; resolve(); });
      _tts.addEventListener('tts-cancel', () => { console.log('FM TTS: cancel event'); clearTimeout(t); _isSpeaking = false; resolve(); });
      console.log('FM TTS: calling speak, text length:', text.length, 'tts:', typeof _tts?.speak);
      _tts.speak(text);
      console.log('FM TTS: speak called');
    });
  } catch (e: any) { _isSpeaking = false; console.log('speakFM error:', e?.message); }
};


// ── Language config ───────────────────────────────────────────────────────────
export const FM_LANGUAGES = [
  { code: 'en-IN', label: 'English', flag: '🇬🇧' },
  { code: 'ta-IN', label: 'Tamil',   flag: '🌺' },
  { code: 'hi-IN', label: 'Hindi',   flag: '🇮🇳' },
  { code: 'te-IN', label: 'Telugu',  flag: '⭐' },
  { code: 'ml-IN', label: 'Malayalam', flag: '🌴' },
];

// ── Schedule — slot durations determine content count ─────────────────────────
export interface ScheduleSlot {
  startHour: number; startMin: number;
  endHour: number;   endMin: number;
  episodeId: string; title: string; emoji: string;
  contentType: string; songQuery: string;
}

export const SCHEDULE: ScheduleSlot[] = [
  { startHour:6,  startMin:0,  endHour:8,  endMin:0,  episodeId:'rhythms',      title:'Rhythms',        emoji:'🎵', contentType:'motivational', songQuery:'AR Rahman Tamil songs' },
  { startHour:8,  startMin:0,  endHour:8,  endMin:30, episodeId:'rasi_palan',   title:'Rasi Palan',     emoji:'⭐', contentType:'astrology',    songQuery:'Tamil melody songs' },
  { startHour:8,  startMin:30, endHour:9,  endMin:30, episodeId:'morning_news', title:'Morning News',   emoji:'📰', contentType:'news',         songQuery:'Tamil news songs' },
  { startHour:9,  startMin:30, endHour:10, endMin:30, episodeId:'thalaivar',    title:'Thalaivar Valga',emoji:'👑', contentType:'leader',       songQuery:'Tamil patriotic songs' },
  { startHour:10, startMin:30, endHour:11, endMin:30, episodeId:'health',       title:'Healthy Tips',   emoji:'💪', contentType:'health',       songQuery:'Tamil peppy songs' },
  { startHour:11, startMin:30, endHour:12, endMin:30, episodeId:'movie_review', title:'Movie Masala',   emoji:'🎬', contentType:'movie',        songQuery:'Tamil movie songs 2024' },
  { startHour:12, startMin:0,  endHour:12, endMin:30, episodeId:'agriculture',  title:'Vivasayam',      emoji:'🌾', contentType:'agriculture',  songQuery:'Tamil folk songs' },
  { startHour:12, startMin:30, endHour:14, endMin:0,  episodeId:'travel',       title:'Travel Time',    emoji:'🛣️', contentType:'travel',       songQuery:'Tamil road trip songs' },
  { startHour:14, startMin:0,  endHour:14, endMin:30, episodeId:'local_news',   title:'Local News',     emoji:'📡', contentType:'local_news',   songQuery:'Tamil hits songs' },
  { startHour:14, startMin:30, endHour:14, endMin:45, episodeId:'weather',      title:'Weather Update', emoji:'🌤️', contentType:'weather',      songQuery:'Tamil rain songs' },
  { startHour:14, startMin:45, endHour:16, endMin:30, episodeId:'comedy',       title:'Comedy Stop',    emoji:'😂', contentType:'comedy',       songQuery:'Tamil comedy songs' },
  { startHour:16, startMin:30, endHour:18, endMin:0,  episodeId:'science',      title:'Science Time',   emoji:'🔬', contentType:'science',      songQuery:'Tamil instrumental songs' },
  { startHour:18, startMin:0,  endHour:19, endMin:0,  episodeId:'evening_news', title:'Evening News',   emoji:'📺', contentType:'news',         songQuery:'Tamil evening songs' },
  { startHour:19, startMin:0,  endHour:20, endMin:0,  episodeId:'horror',       title:'Horror Hour',    emoji:'👻', contentType:'horror',       songQuery:'Tamil horror bgm' },
  { startHour:20, startMin:0,  endHour:21, endMin:0,  episodeId:'love',         title:'Love Stories',   emoji:'❤️', contentType:'love',         songQuery:'Tamil love songs' },
  { startHour:21, startMin:0,  endHour:6,  endMin:0,  episodeId:'night',        title:'Night Life',     emoji:'🌙', contentType:'night',        songQuery:'Tamil chill songs' },
];

export const getCurrentSlot = (): ScheduleSlot => {
  const h = new Date().getHours();
  const m = new Date().getMinutes();
  const total = h * 60 + m;
  for (const slot of SCHEDULE) {
    const start = slot.startHour * 60 + slot.startMin;
    const end = slot.endHour * 60 + slot.endMin;
    if (end > start ? (total >= start && total < end) : (total >= start || total < end)) return slot;
  }
  return SCHEDULE[SCHEDULE.length - 1];
};

export const getSlotDurationMins = (slot: ScheduleSlot): number => {
  const start = slot.startHour * 60 + slot.startMin;
  const end = slot.endHour * 60 + slot.endMin;
  return end > start ? end - start : (24 * 60 - start) + end;
};

export const getCurrentSegmentIndex = (slot: ScheduleSlot): number => {
  const now = new Date();
  const elapsed = (now.getHours() - slot.startHour) * 60 + (now.getMinutes() - slot.startMin);
  return Math.max(0, Math.floor(elapsed / 4)); // new segment every 4 mins
};

// ── Deezer song search — works globally, no geo-blocking ─────────────────────
const playedIds = new Set<string>();

export const searchYouTubeSongs = async (query: string, count = 20): Promise<any[]> => {
  return searchJioSaavnSongs(query, count);
};

const decodeHtml = (str: string): string => (str || '')
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#039;/g, "'").replace(/&apos;/g, "'")
  .trim();

export const searchJioSaavnSongs = async (query: string, count = 10): Promise<any[]> => {
  try {
    console.log('FM: calling searchSongs Cloud Function:', query);
    // v2 callable function - call via Firebase Functions SDK
    // Call via Firebase Functions SDK (handles auth automatically)
    const result = await fn({query, count});
    const data = result.data as any;
    if (data?.success && data?.songs?.length > 0) {
      const songs = data.songs.filter((s: any) => 
        !playedIds.has(s.id) && s.url?.startsWith('http')
      );
      console.log('FM: JioSaavn songs:', songs.length);
      if (songs.length < 3) playedIds.clear();
      return songs;
    }
    console.log('FM: CF no songs, falling back to Deezer');
    return await searchDeezerFallback(query, count);
  } catch (e: any) {
    console.log('FM: Cloud Function error:', e?.message, '— falling back to Deezer');
    return await searchDeezerFallback(query, count);
  }
};

// Deezer as fallback when Cloud Function fails
const searchDeezerFallback = async (query: string, count = 20): Promise<any[]> => {
  try {
    const offset = Math.floor(Math.random() * 30);
    const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${count}&index=${offset}`);
    const data = await res.json();
    const songs = (data.data || [])
      .filter((t: any) => t.preview && !playedIds.has(String(t.id)))
      .sort(() => Math.random() - 0.5)
      .slice(0, count)
      .map((t: any) => ({
        id: String(t.id), url: t.preview,
        title: t.title, artist: t.artist?.name || 'Unknown',
        artwork: t.album?.cover_medium || '', duration: 30,
      }));
    if (songs.length < 5) playedIds.clear();
    console.log('FM: Deezer fallback:', songs.length, 'songs');
    return songs;
  } catch (e: any) { return []; }
};

// ── Pre-scripted content from Firestore ──────────────────────────────────────
let prescriptedSlotData: any = null;
let prescriptedDate: string = '';

export const clearPrescriptedCache = () => {
  prescriptedSlotData = null;
  prescriptedDate = '';
};

export const loadPrescriptedContent = async (slotId: string): Promise<boolean> => {
  try {
    const today = new Date().toISOString().split('T')[0];
    // Cache hit only if same slot AND same date
    if (prescriptedDate === today && prescriptedSlotData?.id === slotId) {
      console.log('FM: cache hit for', slotId, 'segs:', prescriptedSlotData?.segments?.length);
      return true;
    }
    // Different slot — clear cache and reload
    prescriptedSlotData = null;
    prescriptedDate = '';
    console.log('FM: loading pre-scripted for', today, slotId);
    const doc = await firestore().collection('jaysfm').doc(today).collection('slots').doc(slotId).get();
    if (doc.exists) {
      prescriptedSlotData = doc.data();
      prescriptedDate = today;
      console.log('FM: ✅ loaded', slotId, 'segs:', prescriptedSlotData?.segments?.length, 'songs:', prescriptedSlotData?.songs?.length);
      return true;
    }
    console.log('FM: no pre-scripted for today, using live');
    return false;
  } catch (e: any) { console.log('FM: load error:', e?.message); return false; }
};

// ── Playlist support ─────────────────────────────────────────────────────────
export const getPrescriptedPlaylist = (): any[] => {
  return prescriptedSlotData?.playlist || [];
};

export const hasPrescriptedPlaylist = (): boolean => {
  const playlist = prescriptedSlotData?.playlist || [];
  return playlist.length > 0;
};

export const getPrescriptedSegment = (segIdx: number): string => {
  if (!prescriptedSlotData?.segments?.length) return '';
  if (segIdx >= prescriptedSlotData.segments.length) return '';
  return prescriptedSlotData.segments[segIdx]?.text || '';
};

export const getPrescriptedSongs = (): any[] => {
  const songs = prescriptedSlotData?.songs || [];
  const validSongs = songs
    .filter((s: any) => s?.url && s.url.startsWith('http'))
    .map((s: any) => ({
      ...s,
      title: decodeHtml(s.title || 'Unknown'),
      artist: decodeHtml(s.artist || 'Unknown'),
    }));
  console.log('FM: songs with audio URL:', validSongs.length, '/', songs.length);
  return validSongs;
};

export const getPrescriptedTopic = (): string => {
  return prescriptedSlotData?.topic || '';
};

// ── Content queue for live generation ────────────────────────────────────────
const contentQueue: string[] = [];
let isGenerating = false;

const generateSerial = async (contentType: string, language: string, segIdx: number, location?: string): Promise<string> => {
  while (isGenerating) { await new Promise(r => setTimeout(r, 500)); }
  isGenerating = true;
  try { return await generateContent(contentType, language, segIdx, location); }
  finally { isGenerating = false; }
};

export const getNextContent = async (contentType: string, language: string, segIdx: number, location?: string): Promise<string> => {
  if (contentQueue.length > 0) {
    const next = contentQueue.shift()!;
    if (contentQueue.length < 2) setTimeout(() => prefetchContent(contentType, language, segIdx + 1, location), 500);
    return next;
  }
  return generateSerial(contentType, language, segIdx, location);
};

export const prefetchContent = async (contentType: string, language: string, startIdx: number, location?: string, count = 2) => {
  if (contentQueue.length >= 4) return;
  for (let i = 0; i < count; i++) {
    if (contentQueue.length >= 4) break;
    const c = await generateSerial(contentType, language, startIdx + i, location);
    if (c) contentQueue.push(c);
    await new Promise(r => setTimeout(r, 1500));
  }
};

export const clearContentQueue = () => { contentQueue.length = 0; isGenerating = false; };

// ── Live content generation ───────────────────────────────────────────────────
export const generateContent = async (contentType: string, language: string, segIdx: number, location?: string): Promise<string> => {
  const lang = FM_LANGUAGES.find(l => l.code === language)?.label || 'English';
  const prompt = `You are Jay, energetic Indian radio RJ on Jay's FM.
Write ONLY spoken dialogue. No [SFX]. No stage directions. Pure what Jay says.
Content type: ${contentType}. Segment: ${segIdx + 1}.
Language: ${lang} (Tanglish - mix Tamil words like machan, da, bro with English).
Write 6-8 sentences. Be entertaining, energetic, conversational.`;

  try {
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 400 },
      }),
    });
    if (res.status === 503 || res.status === 429) {
      await new Promise(r => setTimeout(r, 10000));
      return generateContent(contentType, language, segIdx, location);
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  } catch (e: any) { console.log('FM Gemini error:', e?.message); return ''; }
};

// ── Announcement ──────────────────────────────────────────────────────────────
export const generateTuneInAnnouncement = (slot: ScheduleSlot, language: string): string => {
  const msgs: Record<string, string> = {
    'en-IN': `You're tuned into Jay's FM da! 📻 It's ${slot.emoji} ${slot.title} time! All riders across India are on the same station right now machan! Let's go! 🏍️`,
    'ta-IN': `Jay's FM-ல வருகிறீர்கள்! ${slot.emoji} ${slot.title} நேரம் machan! India riders கேக்குறாங்க! 🏍️`,
    'hi-IN': `Jay's FM pe aagaye da! ${slot.emoji} ${slot.title} chal raha hai machan! 🏍️`,
    'te-IN': `Jay's FM ki tune chesaaru! ${slot.emoji} ${slot.title} jarugutondi machan! 🏍️`,
    'ml-IN': `Jay's FM il swagatham! ${slot.emoji} ${slot.title} nadakkunnu machan! 🏍️`,
  };
  return msgs[language] || msgs['en-IN'];
};

export const generateSongIntro = (track: any, language: string): string => {
  // Always decode HTML entities in title
  const title = decodeHtml(track.title || 'Unknown');
  const artist = decodeHtml(track.artist || '');
  const intros: Record<string, string[]> = {
    'en-IN': [
      `Music time da! 🎵 Here's "${title}" by ${artist} — enjoy machan!`,
      `Song break! 🎵 "${title}" playing now on Jay's FM!`,
      `Chill time da! 🎵 "${title}" — this one's for all riders!`,
    ],
    'ta-IN': [`Music time da! 🎵 "${title}" கேளுங்க machan!`],
    'hi-IN': [`Music break da! 🎵 "${title}" suno machan!`],
    'te-IN': [`Music break da! 🎵 "${title}" vinandi machan!`],
    'ml-IN': [`Music break da! 🎵 "${title}" kettukku machan!`],
  };
  const list = intros[language] || intros['en-IN'];
  return list[Math.floor(Math.random() * list.length)];
};

// ── SFX chime before Jay speaks ───────────────────────────────────────────────
const SFX_QUERIES: Record<string, string> = {
  rhythms: 'morning bell chime', rasi_palan: 'mystical bell', morning_news: 'news jingle',
  thalaivar: 'trumpet fanfare short', health: 'upbeat chime', movie_review: 'cinema bell',
  agriculture: 'nature sound', travel: 'road wind chime', local_news: 'alert chime',
  weather: 'rain chime', comedy: 'comedy sound effect', science: 'discovery chime',
  evening_news: 'news bell', horror: 'horror sting scary', love: 'romantic harp',
  night: 'night ambient chime',
};



// ── SFX and comedy clips cache ───────────────────────────────────────────────
const sfxCache: Record<string, string[]> = {};
const comedyCache: string[] = [];

// Slot-specific SFX search queries

// Comedy/funny clip queries — Deezer has BGM not actual dialogues
const COMEDY_QUERIES = [
  'Tamil comedy bgm music',
  'funny bgm Tamil cinema',
  'Tamil comedy background music',
  'comic bgm Tamil movies',
  'Tamil funny music bgm',
  'Goundamani Senthil bgm',
  'comedy sound Tamil film',
];

export const loadSfxSounds = async (slotId: string) => {
  // Load slot SFX
  if (!sfxCache[slotId]) {
    try {
      const query = SFX_QUERIES[slotId] || 'radio jingle chime';
      const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=10`);
      const data = await res.json();
      const previews = (data.data || []).filter((t: any) => t.preview).map((t: any) => t.preview);
      if (previews.length > 0) sfxCache[slotId] = previews;
    } catch {}
  }
  // Load comedy clips
  if (comedyCache.length === 0) {
    try {
      const query = COMEDY_QUERIES[Math.floor(Math.random() * COMEDY_QUERIES.length)];
      const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=15`);
      const data = await res.json();
      const previews = (data.data || []).filter((t: any) => t.preview).map((t: any) => t.preview);
      if (previews.length > 0) comedyCache.push(...previews);
      console.log('FM: loaded', comedyCache.length, 'comedy clips');
    } catch {}
  }
};

// Play SFX chime (non-blocking — fire and continue)
// Play SFX - works during sleep by NOT calling reset()
// Just adds to queue and plays - TrackPlayer handles it natively
export const playSfxBackground = (sfxUrl: string): void => {
  if (!sfxUrl) return;
  try {
    console.log('FM: SoundPoolModule:', typeof SoundPoolModule, Object.keys(NativeModules).join(',').substring(0,100));
    if (!SoundPoolModule) { console.log('FM: SoundPoolModule null'); return; }
    SoundPoolModule.play(sfxUrl, 0.3)
      .then(() => console.log('FM: SFX ✅'))
      .catch((e: any) => console.log('FM: SFX err:', e));
  } catch (e: any) { console.log('FM: SFX exception:', e?.message); }
};

export const playSfxTransition = async (slotId: string): Promise<void> => {
  const sounds = sfxCache[slotId] || [];
  if (sounds.length === 0) return;
  // Non-blocking — don't await, just play and move on
  const url = sounds[Math.floor(Math.random() * sounds.length)];
  try {
    await TrackPlayer.reset();
    await TrackPlayer.setVolume(0.25);
    await TrackPlayer.add({ id: 'sfx_' + Date.now(), url, title: 'SFX', artist: '' });
    await TrackPlayer.play();
    await new Promise(r => setTimeout(r, 1500));
    await TrackPlayer.stop();
    await TrackPlayer.reset();
    await TrackPlayer.setVolume(1.0);
  } catch {}
};

// Play comedy clip between news items / rashis (3-4 seconds)
export const playComedyClip = async (): Promise<void> => {
  if (comedyCache.length === 0) return;
  try {
    const url = comedyCache[Math.floor(Math.random() * comedyCache.length)];
    await TrackPlayer.reset();
    await TrackPlayer.setVolume(0.6); // slightly louder - comedy should be heard
    await TrackPlayer.add({ id: 'comedy_' + Date.now(), url, title: 'Comedy', artist: '' });
    await TrackPlayer.play();
    await new Promise(r => setTimeout(r, 3500)); // 3.5 seconds max
    await TrackPlayer.stop();
    await TrackPlayer.reset();
    await TrackPlayer.setVolume(1.0);
    console.log('FM: comedy clip played ✅');
  } catch (e: any) {
    console.log('FM: comedy clip error:', e?.message);
  }
};


// ── Song queue — one song at a time, JS controls flow ───────────────────────
let _queueTracks: any[] = [];
let _queueIndex = 0;

export const preloadSongQueue = async (tracks: any[]): Promise<void> => {
  const valid = tracks.filter((t: any) => t?.url?.startsWith('http')).slice(0, 8);
  if (valid.length === 0) { console.log('FM: no valid tracks'); return; }
  _queueTracks = valid;
  _queueIndex = 0;
  console.log('FM: ✅ song queue ready with', valid.length, 'songs');
  // Pre-setup TrackPlayer while in foreground
  try {
    await TrackPlayer.reset();
    console.log('FM: TrackPlayer ready for songs');
  } catch (e: any) { console.log('FM: TrackPlayer pre-setup:', e?.message); }
};

export const playSongSet = async (tracks: any[], _count = 1, maxSeconds?: number): Promise<void> => {
  const track = tracks[0];
  if (!track?.url?.startsWith('http')) { console.log('FM: no valid track url'); return; }
  const duration = (track.duration && track.duration > 0) ? track.duration : 240;
  const playDuration = maxSeconds ? Math.min(maxSeconds, duration) : duration;
  console.log('FM playing:', track.title, maxSeconds ? `(${maxSeconds}s mini)` : `(${Math.round(duration/60)}min)`);
  try {
    try { await TrackPlayer.reset(); } catch {}
    await TrackPlayer.add({
      id: String(track.id || Date.now()),
      url: track.url,
      title: decodeHtml(track.title || ''),
      artist: decodeHtml(track.artist || ''),
      artwork: track.artwork || 'https://placehold.co/100x100.png',
      duration,
    });
    await TrackPlayer.setVolume(1.0);
    await TrackPlayer.play();
    console.log('FM: song started ✅');
  } catch (e: any) {
    console.log('FM: song play error:', e?.message);
    return;
  }
  // Wait for song end
  const songStartTime = Date.now();
  console.log('FM: waiting for song end...');
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = (reason: string) => {
      if (done) return;
      done = true;
      console.log('FM: song ended via', reason, '✅');
      resolve();
    };
    // AppState listener - fires when device wakes from sleep
    const appStateSub = AppState.addEventListener('change', async (state: string) => {
      if (state === 'active' && maxSeconds) {
        const elapsed = (Date.now() - songStartTime) / 1000;
        console.log('FM: device woke during mini-song, elapsed:', Math.round(elapsed), 's');
        // Always stop mini-song on wake and continue - avoids stuck state
        appStateSub?.remove?.();
        try { await TrackPlayer.stop(); } catch {}
        finish('wake-' + Math.round(elapsed) + 's');
      }
    });
    let s1: any = null;
    let s2: any = null;

    const checkElapsed = async () => {
      const elapsed = (Date.now() - songStartTime) / 1000;
      if (maxSeconds && elapsed >= maxSeconds) {
        try { await TrackPlayer.stop(); } catch {}
        try { s1?.remove?.(); s2?.remove?.(); } catch {}
        finish('elapsed-' + Math.round(elapsed) + 's');
      }
    };

    s1 = TrackPlayer.addEventListener(Event.PlaybackQueueEnded as any, () => {
      try { s1?.remove?.(); s2?.remove?.(); } catch {}
      finish('QueueEnded');
    });

    s2 = TrackPlayer.addEventListener(Event.PlaybackState as any, async (e: any) => {
      const elapsed = (Date.now() - songStartTime) / 1000;
      if (maxSeconds) {
        // Mini-song: stop if enough time passed
        if (elapsed >= maxSeconds) {
          try { await TrackPlayer.stop(); } catch {}
          try { s1?.remove?.(); s2?.remove?.(); } catch {}
          finish('elapsed-' + Math.round(elapsed) + 's');
        } else if (e.state === State.Stopped || e.state === State.None || e.state === State.Ready) {
          // Song stopped but not enough time — may have been interrupted, try restart
          if (elapsed < 5) {
            // Too early — ignore, might be transitioning
          } else {
            // Probably device wake killed it, move on
            try { s1?.remove?.(); s2?.remove?.(); } catch {}
            finish('interrupted-' + Math.round(elapsed) + 's');
          }
        }
      } else if (e.state === State.Stopped || e.state === State.None) {
        try { s1?.remove?.(); s2?.remove?.(); } catch {}
        finish('Stopped');
      }
    });

    // Normal timeout for full songs (not throttled issue since full songs use QueueEnded)
    const waitMs = (playDuration * 1000) + 5000;
    console.log('FM: song timeout', Math.round(waitMs/1000), 's');
    if (!maxSeconds) {
      setTimeout(() => {
        try { s1?.remove?.(); s2?.remove?.(); } catch {}
        finish('timeout');
      }, waitMs);
    }
    // For mini-songs: no setTimeout (throttled during sleep)
    // Instead relies on PlaybackState firing on device wake + elapsed check
  });
};

// ── Stop FM ───────────────────────────────────────────────────────────────────
export const stopFM = async () => {
  clearContentQueue();
  clearPlayedSongs();
  // Aggressive cleanup to prevent memory leak
  try { _tts?.stop(); } catch {}
  try { _tts?.removeAllListeners?.('tts-finish'); } catch {}
  try { _tts?.removeAllListeners?.('tts-cancel'); } catch {}
  try { _tts?.removeAllListeners?.('tts-start'); } catch {}
  try { _tts?.removeAllListeners?.('tts-error'); } catch {}
  _tts = null;
  _isSpeaking = false;
  _speakCount = 0;
  try { await TrackPlayer.stop(); } catch {}
  try { await TrackPlayer.reset(); } catch {}
  stopMemoryMonitor();
  console.log('FM: stopped and memory released');
};

// ── parseScript — extract only spoken dialogue ────────────────────────────────
export const parseScript = (script: string): string => {
  if (!script) return '';
  const lines = script.split('\n').filter(line => {
    const t = line.trim();
    return t.length > 0 && !t.startsWith('[') && !/^RJ JAY:/i.test(t);
  });
  return lines.join(' ').replace(/\[.*?\]/g, '').replace(/[""]/g, '').trim() || script.trim();
};

export const clearPlayedSongs = () => playedIds.clear();export const playSfxAndWait = async (sfxUrl: string): Promise<void> => {
  playSfxBackground(sfxUrl);
};