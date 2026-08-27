// functions/src/generateFMContent.ts
// Cloud Functions: Generate Jay FM content on schedule
// Morning: 5AM IST | Afternoon: 11AM IST (configurable in jayFMServerConfig.js)

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import * as https from 'https';

const CONFIG = {
  MORNING_HOUR: 5, MORNING_MINUTE: 0,
  AFTERNOON_HOUR: 11, AFTERNOON_MINUTE: 0,
  MORNING_SLOTS: ['rhythms','rasi_palan','morning_news','thalaivar','health','movie_review','agriculture','travel'],
  AFTERNOON_SLOTS: ['local_news','weather','comedy','science','evening_news','horror','love','night'],
  TIMEZONE: 'Asia/Kolkata',
};

const SLOT_CONFIG: Record<string, {title: string, segments: number, contentType: string, emoji: string}> = {
  rhythms:      { title: 'Rhythms',        segments: 8,  contentType: 'spiritual',   emoji: '[music]' },
  rasi_palan:   { title: 'Rasi Palan',      segments: 12, contentType: 'astrology',   emoji: '[star]' },
  morning_news: { title: 'Morning News',    segments: 8,  contentType: 'news',        emoji: '[news]' },
  thalaivar:    { title: 'Thalaivar Valga', segments: 8,  contentType: 'leader',      emoji: '[crown]' },
  health:       { title: 'Healthy Tips',    segments: 8,  contentType: 'health',      emoji: '[health]' },
  movie_review: { title: 'Movie Masala',    segments: 8,  contentType: 'movie',       emoji: '[movie]' },
  agriculture:  { title: 'Vivasayam',       segments: 8,  contentType: 'agriculture', emoji: '[farm]' },
  travel:       { title: 'Travel Time',     segments: 8,  contentType: 'travel',      emoji: '[road]' },
  local_news:   { title: 'Local News',      segments: 8,  contentType: 'news',        emoji: '[signal]' },
  weather:      { title: 'Weather Update',  segments: 4,  contentType: 'weather',     emoji: '[weather]' },
  comedy:       { title: 'Comedy Stop',     segments: 8,  contentType: 'comedy',      emoji: '[comedy]' },
  science:      { title: 'Science Time',    segments: 8,  contentType: 'science',     emoji: '[science]' },
  evening_news: { title: 'Evening News',    segments: 8,  contentType: 'news',        emoji: '[tv]' },
  horror:       { title: 'Horror Hour',     segments: 8,  contentType: 'horror',      emoji: '[ghost]' },
  love:         { title: 'Love Stories',    segments: 8,  contentType: 'love',        emoji: '[heart]' },
  night:        { title: 'Night Life',      segments: 8,  contentType: 'music',       emoji: '[moon]' },
};

const NEWS_FEEDS: Record<string, string[]> = {
  tamilnadu:    ['https://www.thehindu.com/news/states/tamil-nadu/feeder/default.rss'],
  world:        ['https://feeds.bbci.co.uk/news/world/rss.xml', 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml'],
  india_general:['https://www.thehindu.com/news/national/feeder/default.rss', 'https://feeds.bbci.co.uk/news/india/rss.xml'],
  sports:       ['https://www.thehindu.com/sport/feeder/default.rss', 'https://feeds.bbci.co.uk/sport/rss.xml'],
  climate:      ['https://www.thehindu.com/sci-tech/energy-and-environment/feeder/default.rss'],
  entertainment:['https://www.thehindu.com/entertainment/feeder/default.rss'],
  science:      ['https://www.thehindu.com/sci-tech/feeder/default.rss'],
  india_politics:['https://www.thehindu.com/news/national/feeder/default.rss'],
};
const FEED_ROTATION = ['tamilnadu','world','india_general','sports','climate','entertainment','science','india_politics'];

function getDate(daysAhead = 0): string {
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: CONFIG.TIMEZONE }));
  ist.setDate(ist.getDate() + daysAhead);
  return ist.toISOString().split('T')[0];
}

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 RideAI/1.0' } }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function fetchRSS(url: string, count = 5) {
  try {
    const xml = await httpsGet(url);
    const items: Array<{title: string, summary: string}> = [];
    const re = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = re.exec(xml)) !== null && items.length < count) {
      const x = m[1];
      const title = (/<title><!\[CDATA\[(.*?)\]\]>/.exec(x) || /<title>(.*?)<\/title>/.exec(x))?.[1]?.trim() || '';
      const summary = (/<description><!\[CDATA\[(.*?)\]\]>/.exec(x) || /<description>(.*?)<\/description>/.exec(x))?.[1]?.trim().substring(0,200) || '';
      if (title) items.push({ title, summary });
    }
    return items;
  } catch { return []; }
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.FUNCTIONS_EMULATOR ? process.env.GEMINI_API_KEY : '';
  if (!apiKey) { console.log('Missing GEMINI_API_KEY'); return ''; }
  try {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 1500 },
    });
    const response = await new Promise<string>((resolve, reject) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const req = https.request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, (res) => {
        let d = '';
        res.on('data', (c) => d += c);
        res.on('end', () => resolve(d));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    return JSON.parse(response).candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch { return ''; }
}

async function searchSongs(query: string, count = 8) {
  try {
    const url = `https://asia-southeast1-rideai-84dff.cloudfunctions.net/searchSongs?query=${encodeURIComponent(query)}&count=${count}`;
    const data = await httpsGet(url);
    return JSON.parse(data).songs || [];
  } catch { return []; }
}

async function generateSlot(db: admin.firestore.Firestore, slotId: string, dateStr: string) {
  const slot = SLOT_CONFIG[slotId];
  if (!slot) return;
  console.log(`\n${slot.emoji} Generating: ${slot.title}`);

  const segments: Array<{text: string, segIndex: number}> = [];
  const usedHeadlines = new Set<string>();

  for (let i = 0; i < slot.segments; i++) {
    let newsContext = '';
    if (['news', 'weather'].includes(slot.contentType)) {
      const feedType = FEED_ROTATION[i % FEED_ROTATION.length];
      const feeds = [...(NEWS_FEEDS[feedType] || NEWS_FEEDS.india_general)].sort(() => Math.random() - 0.5);
      for (const feedUrl of feeds) {
        const items = await fetchRSS(feedUrl, 5);
        const fresh = items.filter(item => {
          const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30);
          return !usedHeadlines.has(key);
        });
        if (fresh.length > 0) {
          fresh.forEach(item => usedHeadlines.add(item.title.toLowerCase().replace(/[^a-z0-9]/g,'').substring(0,30)));
          newsContext = `\n\nREAL NEWS (use ONLY these):\n${fresh.map(n => `- ${n.title}\n${n.summary}`).join('\n\n')}`;
          break;
        }
      }
    }

    const prompt = `You are Jay, energetic Tamil FM radio host. Write segment ${i+1}/${slot.segments} for "${slot.title}".
ContentType: ${slot.contentType}${newsContext}
Write ONLY in Tamil. 800-1200 chars. Jay's style: engaging, humorous, informative. Start directly.`;

    const text = await callGemini(prompt);
    if (text) {
      segments.push({ text: text.trim(), segIndex: i });
      process.stdout.write(`  Seg ${i+1}/${slot.segments} ✅ (${text.length}c)\n`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  // Songs
  const songs = await searchSongs('Tamil hits songs', 12);
  const seen = new Set<string>();
  const uniqueSongs = songs.filter((s: any) => {
    const key = s.title?.toLowerCase().replace(/[^a-z]/g,'').substring(0,15);
    if (seen.has(key)) return false;
    seen.add(key);
    return !!s.url;
  }).slice(0, 8);

  // Playlist
  const playlist: any[] = [];
  for (let i = 0; i < segments.length; i++) {
    playlist.push({ type: 'content', segIndex: i, text: segments[i].text });
    if (uniqueSongs[i]) playlist.push({ type: 'song', ...uniqueSongs[i] });
  }

  await db.collection('jaysfm').doc(dateStr).collection('slots').doc(slotId).set({
    slotId, title: slot.title, emoji: slot.emoji,
    segments, songs: uniqueSongs, playlist,
    generatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`  ✅ Done: ${segments.length} segs, ${uniqueSongs.length} songs`);
}

async function runGeneration(slots: string[]) {
  const db = admin.firestore();
  const dateStr = getDate(0); // Today
  console.log(`\n🎙️ Jay FM Content — ${dateStr} — ${slots.length} slots`);
  
  for (const slotId of slots) {
    try { await generateSlot(db, slotId, dateStr); }
    catch (e: any) { console.error(`❌ ${slotId}:`, e.message?.substring(0,60)); }
  }
  
  await db.collection('jaysfm_live').doc('status').set({
    lastContentGenerated: dateStr,
    contentAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

// Morning: 5AM IST
export const generateFMContentMorning = onSchedule({
  schedule: `${CONFIG.MORNING_MINUTE} ${CONFIG.MORNING_HOUR} * * *`,
  timeZone: CONFIG.TIMEZONE,
  timeoutSeconds: 540,
  memory: '512MiB',
}, async () => runGeneration(CONFIG.MORNING_SLOTS));

// Afternoon: 11AM IST
export const generateFMContentAfternoon = onSchedule({
  schedule: `${CONFIG.AFTERNOON_MINUTE} ${CONFIG.AFTERNOON_HOUR} * * *`,
  timeZone: CONFIG.TIMEZONE,
  timeoutSeconds: 540,
  memory: '512MiB',
}, async () => runGeneration(CONFIG.AFTERNOON_SLOTS));