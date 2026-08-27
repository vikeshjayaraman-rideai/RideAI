// services/echoService.ts
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

import { GOOGLE_MAPS_API_KEY } from '@env';
const GOOGLE_API_KEY = GOOGLE_MAPS_API_KEY;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';
let GEMINI_API_KEY = '';
try { GEMINI_API_KEY = require('@env').GEMINI_API_KEY; } catch {}

export type MemoryTag = 'hidden_gem' | 'scenic_view' | 'food_stop' | 'just_vibes' | 'incident';

export const TAG_CONFIG: Record<MemoryTag, { emoji: string; label: string; color: string }> = {
  hidden_gem: { emoji: '💎', label: 'Hidden Gem', color: '#DB2777' },
  scenic_view: { emoji: '🏔️', label: 'Scenic View', color: '#2563EB' },
  food_stop:   { emoji: '🍽️', label: 'Food Stop',  color: '#D97706' },
  just_vibes:  { emoji: '😎', label: 'Just Vibes', color: '#7C3AED' },
  incident:    { emoji: '⚠️', label: 'Incident',   color: '#DC2626' },
};

export interface TripMemory {
  id: string; tripId: string; uid: string; riderName: string;
  photoURL: string; photoURLs?: string[];
  lat: number; lng: number; address: string;
  tag: MemoryTag; name: string; description: string;
  isHiddenGem: boolean; validatedHiddenGem: boolean;
  timestamp: string; createdAt: string;
}

export const validateHiddenGem = async (lat: number, lng: number) => {
  try {
    const types = ['tourist_attraction','point_of_interest','natural_feature','park','museum'];
    const ids = new Set<string>();
    for (const type of types) {
      const r = await fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=500&type=${type}&key=${GOOGLE_API_KEY}`);
      const d = await r.json();
      (d.results || []).forEach((p: any) => ids.add(p.place_id));
    }
    const count = ids.size;
    return count >= 3
      ? { isValid: false, reason: `Found ${count} known attractions within 500m`, nearbyCount: count }
      : { isValid: true, reason: count === 0 ? 'No known attractions — true hidden gem! 💎' : `Only ${count} nearby`, nearbyCount: count };
  } catch {
    return { isValid: true, reason: 'Could not validate', nearbyCount: 0 };
  }
};

export const saveTripMemory = async (tripId: string, memory: Omit<TripMemory, 'id'|'uid'|'riderName'|'createdAt'>) => {
  const uid = auth().currentUser?.uid || '';
  const userSnap = await firestore().collection('users').doc(uid).get();
  const userData = userSnap.exists ? userSnap.data() : {};
  const memoryId = `memory_${Date.now()}_${uid}`;
  await firestore().collection(`trips/${tripId}/memories`).doc(memoryId).set({
    ...memory, id: memoryId, tripId, uid,
    riderName: (userData as any)?.name || 'Rider',
    createdAt: new Date().toISOString(),
  });
  return memoryId;
};

export const getTripMemories = async (tripId: string): Promise<TripMemory[]> => {
  const snap = await firestore().collection(`trips/${tripId}/memories`).orderBy('createdAt', 'asc').get();
  return snap.docs.map(d => d.data() as TripMemory);
};

export const generateEchoStory = async (trip: any, memories: TripMemory[], riders: any[], chatMessages: any[]) => {
  // Get all unique riders from memories + riders array (includes trip creator)
  const allRiderNames = new Map<string, {name: string, uid: string}>();
  // Add from memories
  memories.forEach(m => { if (m.uid && m.riderName) allRiderNames.set(m.uid, {name: m.riderName, uid: m.uid}); });
  // Add from riders array
  riders.forEach(r => { if (r.uid && r.name) allRiderNames.set(r.uid, {name: r.name, uid: r.uid}); });

  const riderStats = Array.from(allRiderNames.values()).map(r => {
    const mems = memories.filter(m => m.uid === r.uid);
    return { name: r.name, uid: r.uid, memoriesCaptured: mems.length, hiddenGems: mems.filter(m => m.isHiddenGem).length };
  });
  const chatHighlights = chatMessages
    .filter((m: any) => !m.isAlert && m.senderUid !== 'system' && m.message?.length > 5)
    .slice(0, 10).map((m: any) => `${m.senderName}: "${m.message}"`).join('\n');

  // Build stop highlights
  const stopHighlights = (trip.stops || [])
    .filter((s: any) => ['tea','lunch','hidden_gem','stay','checkpoint'].includes(s.type))
    .map((s: any) => `@${s.name} (${s.type})`)
    .join(', ');

  // Build rider tags
  const riderTags = riderStats.map(r => `@${r.name}`).join(', ');

  // Build memory place tags
  const memoryTags = memories.map(m => `@${m.name}`).join(', ');

  const prompt = `You are Jay, a super cheerful energetic teenage boy RJ. Generate a FUNNY ROAST-STYLE trip story!

TRIP: ${trip.title}
ROUTE: ${trip.stops?.[0]?.name || 'Start'} → ${trip.stops?.[trip.stops?.length-1]?.name || 'End'}
DISTANCE: ${trip.totalDistance || 'unknown'}
RIDERS: ${riderStats.map(r => `${r.name} (${r.memoriesCaptured} photos, ${r.hiddenGems} gems)`).join(', ') || 'Solo'}
STOPS VISITED: ${stopHighlights || 'None recorded'}
MEMORIES: ${memories.map(m => `${m.name} (${m.tag}) by ${m.riderName}`).join(', ') || 'None yet'}
HIDDEN GEMS: ${memories.filter(m => m.isHiddenGem).map(m => m.name).join(', ') || 'None'}
${trip.weather ? `WEATHER: ${trip.weather}` : ''}
${chatHighlights ? `CHAT MOMENTS: ${chatHighlights}` : ''}
${trip.speedPeaks?.length ? `SPEED MOMENTS: ${trip.speedPeaks.map((s:any)=>`${s.rider} hit ${s.speed}kmph`).join(', ')}` : ''}

FORMAT — exactly this structure:
🎬 [One dramatic opener mentioning route/weather/distance]

[Funny roast line per rider using @RiderName — mention their photos, stops, speed, off-routes]
[Mention stops/cafes/hotels visited using @PlaceName]

📍 Checkpoints: [list key stops visited]
💎 [hidden gem name if any] | 📸 [memory count] snaps | 🏍️ [distance]

[Warm closer ending with "until next ride machan! 🤙"]

RULES:
- Tag riders as @${riderTags || 'Rider'}
- Tag places as @${memoryTags || 'places visited'}  
- Mention km traveled, weather if known
- MAX 150 words. Punchy and shareable!`;

  console.log('Generating story, trip:', trip.title, 'memories:', memories.length);
  try {
    const callGemini = async () => {
      const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.9, maxOutputTokens: 800 } }),
      });
      const data = await res.json();
      console.log('Gemini status:', res.status);
      if (res.status === 503 || res.status === 429) {
        console.log('Gemini overloaded, retrying in 10s...');
        await new Promise(r => setTimeout(r, 10000));
        return callGemini();
      }
      return data;
    };
    const data = await callGemini();
    const story = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    if (!story) { console.log('No story:', JSON.stringify(data).substring(0,200)); return 'Epic ride! 🏍️'; }
    await firestore().collection('trips').doc(trip.id).update({
      echoStory: story,
      echoStoryGeneratedAt: new Date().toISOString(),
    });
    return story;
  } catch (e: any) {
    console.log('Story error:', e?.message);
    return 'Epic ride completed! 🏍️';
  }
};

export const getEchoStory = async (tripId: string) => {
  try {
    const snap = await firestore().collection('trips').doc(tripId).get();
    return snap.exists ? snap.data()?.echoStory || null : null;
  } catch { return null; }
};

export const getMyEchoTrips = async () => {
  try {
    const uid = auth().currentUser?.uid;
    if (!uid) return [];
    const snap = await firestore().collection('trips').get();
    const trips = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter((t: any) => t.uid === uid || t.sharedWith?.includes(uid) || t.riders?.some((r: any) => r.uid === uid && r.status === 'accepted'));

    const result = await Promise.all(trips.map(async (trip: any) => {
      try {
        const memSnap = await firestore().collection(`trips/${trip.id}/memories`).get();
        const mems = memSnap.docs.map(d => d.data());
        const sorted = [...mems].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return {
          ...trip,
          memoryCount: mems.length,
          myMemoryCount: mems.filter((m: any) => m.uid === uid).length,
          hiddenGemCount: mems.filter((m: any) => m.isHiddenGem).length,
          thumbnail: sorted.find((m: any) => m.photoURL)?.photoURL || null,
          isOwner: trip.uid === uid,
        };
      } catch { return { ...trip, memoryCount: 0, thumbnail: null, isOwner: trip.uid === uid }; }
    }));

    return result.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  } catch (e: any) {
    console.log('getMyEchoTrips error:', e?.message);
    return [];
  }
};
  