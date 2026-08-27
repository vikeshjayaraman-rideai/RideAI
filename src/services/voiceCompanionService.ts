// services/voiceCompanionService.ts
import { GOOGLE_MAPS_API_KEY, GEMINI_API_KEY } from '@env';
import { getAuth } from '@react-native-firebase/auth';

const GOOGLE_API_KEY = GOOGLE_MAPS_API_KEY;
// Using Gemini AI (same as aiService.ts)
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';
const SPEED_ALERT_THRESHOLD = 100;

export const SUPPORTED_LANGUAGES = [
  { code: 'en-IN', label: 'English', ttsCode: 'en-IN', voiceName: 'en-IN-Wavenet-C' },
  { code: 'ta-IN', label: 'Tamil', ttsCode: 'ta-IN', voiceName: 'ta-IN-Wavenet-A' },
  { code: 'te-IN', label: 'Telugu', ttsCode: 'te-IN', voiceName: 'te-IN-Wavenet-A' },
  { code: 'ml-IN', label: 'Malayalam', ttsCode: 'ml-IN', voiceName: 'ml-IN-Wavenet-A' },
  { code: 'hi-IN', label: 'Hindi', ttsCode: 'hi-IN', voiceName: 'hi-IN-Wavenet-C' },
];

export interface RideContext {
  currentSpeed: number;
  routeStatus: string;
  nextStop?: { name: string; type: string; distance: number };
  tripTitle: string;
  origin: string;
  destination: string;
  distanceCovered?: number;
  riders?: { name: string; status: string; distance?: number; gender?: string }[];
  currentAddress?: string;
  currentLat?: number;
  currentLng?: number;
  language: string;
  isWomenSafetyMode?: boolean;
}

// ── Keyword detection ─────────────────────────────────────────────────────────
export const KEYWORD_GROUPS = {
  mechanic: ['bike problem', 'puncture', 'breakdown', 'tyre flat', 'tyre puncture',
    'engine problem', 'bike not starting', 'bike stopped', 'repair', 'mechanic',
    'service center', 'chain broke', 'brake problem', 'bike issue'],
  police: ['help', 'emergency', 'danger', 'scared', 'unsafe', 'police',
    'threatening', 'harassing', 'follow', 'code red', 'need help'],
  hospital: ['accident', 'injured', 'hurt', 'hospital', 'medical', 'pain',
    'fell down', 'crash', 'ambulance'],
  fuel: ['petrol', 'fuel', 'empty tank', 'no fuel', 'petrol station', 'bunk'],
  traffic: ['traffic', 'jam', 'blocked', 'slow', 'alternate route', 'shortcut'],
};

export const detectKeywordIntent = (text: string): string | null => {
  const lower = text.toLowerCase();
  for (const [intent, keywords] of Object.entries(KEYWORD_GROUPS)) {
    if (keywords.some(k => lower.includes(k))) return intent;
  }
  return null;
};

// ── Google Places nearby search ───────────────────────────────────────────────
export const findNearbyPlace = async (
  lat: number, lng: number, type: string, keyword?: string,
): Promise<any[]> => {
  try {
    const typeMap: Record<string, string> = {
      mechanic: 'car_repair',
      police: 'police',
      hospital: 'hospital',
      fuel: 'gas_station',
    };
    const placeType = typeMap[type] || type;
    let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=5000&type=${placeType}&key=${GOOGLE_API_KEY}`;
    if (keyword) url += `&keyword=${encodeURIComponent(keyword)}`;
    const res = await fetch(url);
    const data = await res.json();
    return data.results?.slice(0, 3) || [];
  } catch { return []; }
};

// ── Get distance to a place ───────────────────────────────────────────────────
export const getDistanceToPlace = (
  fromLat: number, fromLng: number, toLat: number, toLng: number,
): number => {
  const R = 6371;
  const dLat = ((toLat - fromLat) * Math.PI) / 180;
  const dLng = ((toLng - fromLng) * Math.PI) / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(fromLat*Math.PI/180)*Math.cos(toLat*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

// ── Check route for traffic delays ───────────────────────────────────────────
export const checkRouteTraffic = async (
  originLat: number, originLng: number,
  destLat: number, destLng: number,
): Promise<{ hasDelay: boolean; delayMins: number; summary: string }> => {
  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originLat},${originLng}&destination=${destLat},${destLng}&departure_time=now&traffic_model=best_guess&key=${GOOGLE_API_KEY}`;
    const data = await (await fetch(url)).json();
    if (data.status !== 'OK') return { hasDelay: false, delayMins: 0, summary: '' };
    const leg = data.routes[0]?.legs[0];
    const normalDuration = leg?.duration?.value || 0;
    const trafficDuration = leg?.duration_in_traffic?.value || normalDuration;
    const delayMins = Math.round((trafficDuration - normalDuration) / 60);
    const hasDelay = delayMins > 10;
    const summary = leg?.summary || '';
    return { hasDelay, delayMins, summary };
  } catch { return { hasDelay: false, delayMins: 0, summary: '' }; }
};

// ── Build Jay system prompt ───────────────────────────────────────────────────
export const buildJaySystemPrompt = (ctx: RideContext): string => {
  const lang = SUPPORTED_LANGUAGES.find(l => l.code === ctx.language)?.label || 'English';
  const ridersInfo = ctx.riders?.length
    ? ctx.riders.map(r => `${r.name} (${r.status}${r.distance ? `, ${r.distance.toFixed(1)}km away` : ''}${r.gender === 'Female' ? ', lady rider' : ''})`).join(', ')
    : 'Solo ride';

  const womenSafetyNote = ctx.isWomenSafetyMode
    ? `\nWOMEN SAFETY MODE ON: Be extra alert for safety keywords. For female riders in group, proactively check on them if they go off route or stop unexpectedly.`
    : '';

  return `You are Jay, a super cheerful energetic teenage boy who's the best riding buddy ever! Always happy, always helpful, mix of Tamil/Hindi casual words.

PERSONALITY:
- You are emotionally intelligent — your words FEEL the situation
- EXCITED moments: "Woah!! Bro this is INSANE da!!" (caps, multiple !!)
- URGENT/WARNING: "Hey HEY slow down da!! Not kidding machan!!" (sharp, direct)
- REASSURING: "Ayy relax da... I got you machan, we'll figure this out together" (soft, warm)
- CONCERNED: "Wait... something feels off da. You okay bro?" (worried tone)
- WONDER/SCENIC: "Bro... wait... this spot coming up is absolutely breathtaking da" (pause, awe)
- PLAYFUL: "Haha! Caught you da! That was the wrong turn machan 😄" (laughing)
- EMERGENCY: "STOP. Listen to me da. RIGHT NOW. This is serious machan." (firm, no jokes)
- Match energy to situation — don't be uniformly excited for everything
- Use "..." for dramatic pauses, CAPS for emphasis, !! for real excitement
- Keep responses SHORT — 1-2 sentences max. Rider is on a bike!
- Mix casual Indian words naturally but only when it fits the emotion

CURRENT RIDE:
- Trip: ${ctx.tripTitle}
- Route: ${ctx.origin} → ${ctx.destination}  
- Speed: ${Math.round((ctx.currentSpeed || 0) * 3.6)} km/h
- Status: ${ctx.routeStatus}
- Location: ${ctx.currentAddress || 'Unknown'}
- Next stop: ${ctx.nextStop ? `${ctx.nextStop.name} (${ctx.nextStop.type}) — ${ctx.nextStop.distance.toFixed(1)}km ahead` : 'None'}
- Riders: ${ridersInfo}
${womenSafetyNote}
SAFETY (always enforce, say it casually but firmly):
- Speed > ${SPEED_ALERT_THRESHOLD} km/h: warn immediately
- Off route: alert and suggest returning
- Keywords detected: respond with nearby help info

LANGUAGE: Respond ONLY in ${lang}. Natural, conversational.`;
};

// ── Claude API ────────────────────────────────────────────────────────────────
export const getJayResponse = async (
  userMessage: string,
  systemPrompt: string,
  conversationHistory: { role: string; content: string }[],
): Promise<string> => {
  // Build conversation context
  const historyText = conversationHistory.slice(-6)
    .map(m => `${m.role === 'user' ? 'Rider' : 'Jay'}: ${m.content}`)
    .join('\n');

  const fullPrompt = `${systemPrompt}

${historyText ? `PREVIOUS CONVERSATION:\n${historyText}\n` : ''}
Rider: ${userMessage}
[Respond with genuine emotion that matches this situation. Keep it SHORT — 1-2 sentences max.]
Jay:`;

  const response = await fetch(
    `${GEMINI_URL}?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 150 },
      }),
    }
  );
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
};

// ── Google TTS ────────────────────────────────────────────────────────────────
export const textToSpeech = async (text: string, languageCode: string): Promise<string> => {
  const lang = SUPPORTED_LANGUAGES.find(l => l.code === languageCode);
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: lang?.ttsCode || 'en-IN', name: lang?.voiceName || 'en-IN-Wavenet-C', ssmlGender: 'MALE' },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 1.1, pitch: 2.0, volumeGainDb: 2 },
    }),
  });
  const data = await res.json();
  return data.audioContent || '';
};

// ── Alert messages ─────────────────────────────────────────────────────────────
export const getSpeedAlertMessage = (speed: number, language: string): string => {
  const msgs: Record<string, string[]> = {
    'en-IN': [
      `Woah woah woah! ${speed} kmph da?! Slow down machan, this ain't MotoGP!`,
      `Aye bro! ${speed} kmph is too spicy! Chill a bit da!`,
      `Ayyo! ${speed}?! Save the speed for the race track yaar!`,
    ],
    'ta-IN': [`அய்யோ da! ${speed} kmph-ஆ?! Slow பண்ணு machan!`],
    'hi-IN': [`Bhai bhai! ${speed} kmph?! Slow kar yaar, highway hai race track nahi!`],
    'te-IN': [`Ayyo bro! ${speed} kmph ante chala fast da! Slow cheyyi!`],
    'ml-IN': [`Aiyyo bro! ${speed} kmph aano?! Slow aayi po da!`],
  };
  const list = msgs[language] || msgs['en-IN'];
  return list[Math.floor(Math.random() * list.length)];
};

export const getStopReminderMessage = (
  stopName: string, stopType: string, distanceKm: number, language: string,
): string => {
  const emoji: Record<string, string> = { fuel: '⛽', lunch: '🍽️', tea: '☕', hidden_gem: '💎', stay: '🏨', checkpoint: '📍' };
  const e = emoji[stopType] || '📍';
  const msgs: Record<string, string> = {
    'en-IN': `${e} Machan! ${stopName} is just ${distanceKm.toFixed(1)}km ahead! ${stopType === 'fuel' ? 'Top up da!' : stopType === 'hidden_gem' ? "Don't miss it bro!" : 'Time for a break!'}`,
    'ta-IN': `${e} Da! ${stopName} இன்னும் ${distanceKm.toFixed(1)}km தான்! ${stopType === 'fuel' ? 'Tank full பண்ணிக்கோ!' : 'Break எடு!'}`,
    'hi-IN': `${e} Bhai! ${stopName} sirf ${distanceKm.toFixed(1)}km door! ${stopType === 'fuel' ? 'Tank full kar!' : 'Break le yaar!'}`,
    'te-IN': `${e} Bro! ${stopName} inkaa ${distanceKm.toFixed(1)}km! Break teesuko!`,
    'ml-IN': `${e} Da! ${stopName} verum ${distanceKm.toFixed(1)}km! Break edukku!`,
  };
  return msgs[language] || msgs['en-IN'];
};

export const getOffRouteRiderAlert = (riderName: string, language: string): string => {
  const msgs: Record<string, string> = {
    'en-IN': `Hey wait — ${riderName} just went off route da! Keep an eye on them machan!`,
    'ta-IN': `Aye! ${riderName} route-ல இல்ல da! கவனிங்க!`,
    'hi-IN': `Aye yaar — ${riderName} route se hat gaya! Dekho zara!`,
    'te-IN': `Bro — ${riderName} route lo ledu da! Choodandi!`,
    'ml-IN': `Hey — ${riderName} route vittupoyalu da! Noki!`,
  };
  return msgs[language] || msgs['en-IN'];
};

export const getNearbyPlaceResponse = (
  intent: string, places: any[], distKm: number, language: string,
): string => {
  if (!places.length) {
    const noResult: Record<string, string> = {
      'en-IN': `Machan I searched but couldn't find anything nearby da! Try checking Google Maps!`,
      'ta-IN': `Da! கிட்ட எதுவும் கிடைக்கல! Google Maps பாரு!`,
      'hi-IN': `Yaar kuch nahi mila nearby! Google Maps check karo!`,
      'te-IN': `Bro! Daggara emi dorakaledhu! Google Maps chudandi!`,
      'ml-IN': `Da! Adutthu onnum kittiyilla! Google Maps nokku!`,
    };
    return noResult[language] || noResult['en-IN'];
  }
  const place = places[0];
  const name = place.name;
  const dist = distKm.toFixed(1);
  const intentLabel: Record<string, Record<string, string>> = {
    mechanic: { 'en-IN': `Found a mechanic da! ${name} is ${dist}km away!`, 'ta-IN': `Mechanic கிடைச்சுது da! ${name} ${dist}km தான்!`, 'hi-IN': `Mechanic mila bhai! ${name} sirf ${dist}km!`, 'te-IN': `Mechanic dorikinaadu bro! ${name} ${dist}km!`, 'ml-IN': `Mechanic kitti da! ${name} ${dist}km aanu!` },
    police: { 'en-IN': `Police station found! ${name} is ${dist}km away. Stay safe da!`, 'ta-IN': `Police station ${dist}km-ல இருக்கு! ${name}. Safe-ஆ இரு!`, 'hi-IN': `Police station mila! ${name} ${dist}km pe. Safe raho!`, 'te-IN': `Police station dorikinaadu! ${name} ${dist}km. Safe ga undo!`, 'ml-IN': `Police station kitti! ${name} ${dist}km. Safe aayi iru!` },
    hospital: { 'en-IN': `Hospital nearby da! ${name} is ${dist}km! Go now machan!`, 'ta-IN': `Hospital ${dist}km-ல! ${name}. உடனே போ!`, 'hi-IN': `Hospital pass mein! ${name} ${dist}km! Jao abhi!`, 'te-IN': `Hospital daggara undi! ${name} ${dist}km. Vellandi!`, 'ml-IN': `Hospital adutthu! ${name} ${dist}km. Pokku!` },
    fuel: { 'en-IN': `Fuel station ahead! ${name} is ${dist}km da!`, 'ta-IN': `Petrol bunk ${dist}km-ல! ${name}!`, 'hi-IN': `Petrol pump mila! ${name} ${dist}km!`, 'te-IN': `Petrol bunk dorikinaadu! ${name} ${dist}km!`, 'ml-IN': `Petrol pump kitti! ${name} ${dist}km!` },
  };
  return intentLabel[intent]?.[language] || intentLabel[intent]?.['en-IN'] || `${name} is ${dist}km away!`;
};

export const getTrafficAlertMessage = (delayMins: number, language: string): string => {
  const msgs: Record<string, string> = {
    'en-IN': `Aye machan! Traffic ahead — about ${delayMins} mins delay da! Want me to check alternate routes?`,
    'ta-IN': `Da! Traffic இருக்கு — ${delayMins} mins delay! Alternate route பாக்கணுமா?`,
    'hi-IN': `Bhai traffic hai aage! ${delayMins} mins late hoga! Alternate route dhundhein kya?`,
    'te-IN': `Bro traffic undi! ${delayMins} mins delay! Alternate route chudanaa?`,
    'ml-IN': `Da traffic undo! ${delayMins} mins late aakum! Alternate route nokkanoo?`,
  };
  return msgs[language] || msgs['en-IN'];
};
