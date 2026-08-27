// scripts/generateJayFMContent.js — Jay's FM Radio Script Generator
// Run: node scripts/generateJayFMContent.js --today
// Run single slot: node scripts/generateJayFMContent.js --today --slot=rhythms

const admin = require('firebase-admin');
const path = require('path');
const CONFIG = require('./jayFMConfig');
const Parser = require('rss-parser');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

let fetch;
try { fetch = globalThis.fetch; if (!fetch) throw new Error('no fetch'); }
catch { fetch = require('node-fetch'); }

const rssParser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'Mozilla/5.0 RideAI/1.0' },
});

// ── RSS News Fetcher ──────────────────────────────────────────────────────────
const NEWS_FEEDS = {
  india_general: [
    'https://www.thehindu.com/news/national/feeder/default.rss',
    'https://www.thehindu.com/news/national/feeder/default.rss',
    'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',
  ],
  india_politics: [
    'https://www.thehindu.com/news/national/feeder/default.rss',
    'https://www.thehindu.com/news/national/feeder/default.rss',
  ],
  world: [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
  ],
  technology: [
    'https://www.thehindu.com/news/national/feeder/default.rss',
    'https://www.thehindu.com/sci-tech/feeder/default.rss',
  ],
  sports: [
    'https://www.thehindu.com/news/national/feeder/default.rss',
    'https://www.thehindu.com/sport/feeder/default.rss',
  ],
  tamil_local: [
    'https://www.thehindu.com/news/national/feeder/default.rss',
    'https://www.thehindu.com/news/states/tamil-nadu/feeder/default.rss',
  ],
  cinema: [
    'https://www.thehindu.com/entertainment/movies/feeder/default.rss',
  ],
};

async function fetchRealRasiPalan() {
  try {
    const signs = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
    const tamil = ['மேஷம்','ரிஷபம்','மிதுனம்','கடகம்','சிம்மம்','கன்னி','துலாம்','விருச்சிகம்','தனுசு','மகரம்','கும்பம்','மீனம்'];
    const results = {};
    for (let i = 0; i < signs.length; i++) {
      const res = await fetch(`https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=${signs[i]}&day=TODAY`);
      if (res.ok) { const d = await res.json(); if (d?.data?.horoscope) results[tamil[i]] = d.data.horoscope; }
    }
    return results;
  } catch { return {}; }
}

async function fetchNewsFromRSS(feedType = 'india_general', count = 6) {
  const feeds = NEWS_FEEDS[feedType] || NEWS_FEEDS.india_general;
  const allItems = [];
  
  for (const feedUrl of feeds) {
    try {
      console.log(`  📡 Fetching RSS: ${feedUrl.split('/')[2]}`);
      const feed = await rssParser.parseURL(feedUrl);
      const items = (feed.items || []).slice(0, count).map(item => ({
        title: item.title || '',
        summary: item.contentSnippet || item.content || '',
        link: item.link || '',
        date: item.pubDate || '',
      }));
      allItems.push(...items);
      if (allItems.length >= count) break;
    } catch (e) {
      console.log(`  ⚠️ RSS failed ${feedUrl.split('/')[2]}: ${e.message?.substring(0, 50)}`);
    }
  }
  
  // Return unique items
  const unique = allItems.filter((item, i, arr) => 
    item.title && arr.findIndex(x => x.title === item.title) === i
  ).slice(0, count);
  
  console.log(`  ✅ Fetched ${unique.length} real news items`);
  return unique;
}

// Map slot/segment to RSS feed type
function getRSSFeedType(slotId, segIdx, isLocal = false) {
  if (isLocal) return 'tamil_local';
  const newsCategories = CONFIG.NEWS_CATEGORIES;
  const category = newsCategories[Math.min(segIdx, newsCategories.length - 1)];
  if (segIdx >= newsCategories.length - 1) return 'sports';
  if (category.includes('அரசியல்')) return 'india_politics';
  if (category.includes('உலக')) return 'world';
  if (category.includes('அறிவியல்')) return 'technology';
  if (category.includes('சினிமா')) return 'cinema';
  return 'india_general';
}

// ── Song search via Firebase Cloud Function (JioSaavn proxy in Mumbai) ──────

async function searchViaCloudFunction(query, count = 10, page = 1) {
  try {
    const url = `${CLOUD_FUNCTION_URL}?query=${encodeURIComponent(query)}&count=${count}&page=${page}`;
    console.log('  🎵 CF:', url.substring(0, 80));
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) { console.log('  CF returned:', res.status); return []; }
    const json = await res.json();
    if (json?.success && json?.songs?.length > 0) {
      const valid = json.songs.filter(s => s.url && s.url.startsWith('http'));
      console.log(`  ✅ JioSaavn: ${valid.length} songs with audio URLs`);
      valid.slice(0,3).forEach(s => console.log(`    🎵 ${s.title} (${Math.round(s.duration/60)}min)`));
      return valid;
    }
    console.log('  CF: no songs'); return [];
  } catch (e) { console.log('  CF error:', e.message?.substring(0,60)); return []; }
}

// Deezer fallback
async function searchDeezer(query, count = 20) {
  try {
    const offset = Math.floor(Math.random() * 30);
    const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${count}&index=${offset}`);
    const data = await res.json();
    return (data.data || [])
      .filter(t => t.preview)
      .sort(() => Math.random() - 0.5)
      .map(t => ({
        id: String(t.id), url: t.preview,
        title: t.title, artist: t.artist?.name || 'Unknown',
        artwork: t.album?.cover_medium || '', duration: 30,
      }));
  } catch (e) { return []; }
}

const serviceAccount = require(path.join(__dirname, '..', 'google-services-admin.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const CLOUD_FUNCTION_URL = 'https://asia-southeast1-rideai-84dff.cloudfunctions.net/searchSongs';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Schedule ──────────────────────────────────────────────────────────────────
// Language-aware song queries per slot
const SONG_QUERIES = {
  rhythms:      { 'ta-IN': 'Tamil morning motivation rhythm songs', 'hi-IN': 'Hindi morning motivation songs', 'te-IN': 'Telugu morning songs', 'ml-IN': 'Malayalam morning songs', 'en-IN': 'English morning motivation songs' },
  rasi_palan:   { 'ta-IN': 'Tamil melody songs Ilaiyaraaja', 'hi-IN': 'Hindi melody songs', 'te-IN': 'Telugu melody songs', 'ml-IN': 'Malayalam melody songs', 'en-IN': 'Indian melody songs' },
  morning_news: { 'ta-IN': 'Tamil superhit songs 2024', 'hi-IN': 'Bollywood hits 2024', 'te-IN': 'Telugu hits 2024', 'ml-IN': 'Malayalam hits 2024', 'en-IN': 'Hindi Tamil popular songs' },
  thalaivar:    { 'ta-IN': 'Tamil patriotic inspirational songs', 'hi-IN': 'Hindi desh bhakti songs', 'te-IN': 'Telugu patriotic songs', 'ml-IN': 'Malayalam patriotic songs', 'en-IN': 'Indian patriotic songs' },
  health:       { 'ta-IN': 'Tamil peppy energetic songs', 'hi-IN': 'Hindi energetic songs', 'te-IN': 'Telugu peppy songs', 'ml-IN': 'Malayalam peppy songs', 'en-IN': 'Tamil upbeat songs' },
  movie_review: { 'ta-IN': 'Tamil movie songs 2024 latest', 'hi-IN': 'Bollywood movie songs 2024', 'te-IN': 'Telugu movie songs 2024', 'ml-IN': 'Malayalam movie songs 2024', 'en-IN': 'Tamil Hindi movie songs' },
  agriculture:  { 'ta-IN': 'Tamil folk village songs', 'hi-IN': 'Hindi folk songs', 'te-IN': 'Telugu folk songs', 'ml-IN': 'Malayalam folk songs', 'en-IN': 'Indian folk songs' },
  travel:       { 'ta-IN': 'Tamil road trip travel songs', 'hi-IN': 'Hindi road trip songs', 'te-IN': 'Telugu travel songs', 'ml-IN': 'Malayalam travel songs', 'en-IN': 'Tamil travel songs' },
  local_news:   { 'ta-IN': 'Tamil melody songs hits', 'hi-IN': 'Hindi melody hits', 'te-IN': 'Telugu melody hits', 'ml-IN': 'Malayalam melody hits', 'en-IN': 'Indian melody songs' },
  weather:      { 'ta-IN': 'Tamil mazhai rain songs', 'hi-IN': 'Hindi barish rain songs', 'te-IN': 'Telugu rain songs', 'ml-IN': 'Malayalam rain songs', 'en-IN': 'Tamil rain songs' },
  comedy:       { 'ta-IN': 'Tamil comedy fun songs kuthu', 'hi-IN': 'Hindi comedy songs', 'te-IN': 'Telugu comedy songs', 'ml-IN': 'Malayalam comedy songs', 'en-IN': 'Tamil fun songs' },
  science:      { 'ta-IN': 'Tamil instrumental BGM songs', 'hi-IN': 'Hindi instrumental songs', 'te-IN': 'Telugu instrumental', 'ml-IN': 'Malayalam instrumental', 'en-IN': 'Indian instrumental songs' },
  evening_news: { 'ta-IN': 'Tamil evening melody songs', 'hi-IN': 'Hindi evening songs', 'te-IN': 'Telugu evening songs', 'ml-IN': 'Malayalam evening songs', 'en-IN': 'Indian evening songs' },
  horror:       { 'ta-IN': 'Tamil thriller horror BGM songs', 'hi-IN': 'Hindi thriller BGM', 'te-IN': 'Telugu horror BGM', 'ml-IN': 'Malayalam thriller BGM', 'en-IN': 'Tamil horror BGM songs' },
  love:         { 'ta-IN': 'Tamil love romantic songs', 'hi-IN': 'Hindi romantic songs', 'te-IN': 'Telugu romantic songs', 'ml-IN': 'Malayalam romantic songs', 'en-IN': 'Tamil romantic songs' },
  night:        { 'ta-IN': 'Tamil chill night melody songs', 'hi-IN': 'Hindi night chill songs', 'te-IN': 'Telugu night songs', 'ml-IN': 'Malayalam night songs', 'en-IN': 'Indian chill night songs' },
};

// Use CONFIG.SCHEDULE so segments stay in sync with jayFMConfig.js
const SCHEDULE = CONFIG.SCHEDULE;

// ── Parse script — extract only RJ JAY dialogue ─────────────────────────────
function parseScript(script) {
  if (!script) return '';
  // Remove lines with [tags] and stage directions
  const lines = script.split('\n');
  const spoken = lines
    .filter(function(line) {
      var t = line.trim();
      return t.length > 0 && !t.startsWith('[') && !/^RJ JAY:/i.test(t);
    })
    .join(' ')
    .replace(/\[.*?\]/g, '')
    .replace(/[\u201c\u201d]/g, '')
    .trim();
  return spoken || script.trim();
}

// ── Rate limiter ──────────────────────────────────────────────────────────────
let requestTimes = [];
async function waitForRateLimit() {
  const now = Date.now();
  requestTimes = requestTimes.filter(t => now - t < 60000);
  if (requestTimes.length >= 12) {
    const waitMs = 60000 - (now - requestTimes[0]) + 2000;
    process.stdout.write(`  ⏸️ Rate limit ${Math.ceil(waitMs/1000)}s... `);
    await sleep(waitMs);
    requestTimes = requestTimes.filter(t => Date.now() - t < 60000);
  }
  requestTimes.push(Date.now());
}

// ── Gemini call ───────────────────────────────────────────────────────────────
async function callGemini(prompt, minLength = 100) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await waitForRateLimit();
      const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 8192 },
        }),
      });
      if (res.status === 503) { await sleep((attempt+1)*10000); continue; }
      if (res.status === 429) { process.stdout.write('⏳ quota 65s... '); await sleep(65000); requestTimes=[]; continue; }
      const data = await res.json();
      if (res.status !== 200) { console.log('\n  ❌', res.status, JSON.stringify(data).substring(0,80)); continue; }
      const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      if (text.length < minLength) { process.stdout.write(`short(${text.length})... `); await sleep(3000); continue; }
      return text;
    } catch(e) { console.log('\n  ❌', e.message); await sleep(5000); }
  }
  return '';
}

// ── Dynamic topic picker ──────────────────────────────────────────────────────
async function pickTopicOfDay(contentType, dateStr) {
  // Check if already picked today
  // Skip cache - always pick fresh topic
  // try {
  //   const doc = await db.collection('jaysfm').doc(dateStr).get();
  //   if (doc.exists && doc.data()?.[`topic_${contentType}`]) return doc.data()[`topic_${contentType}`];
  // } catch {}

  // Get used topics to avoid repeats
  let usedList = '';
  try {
    const doc = await db.collection('jaysfm_topics').doc(contentType).get();
    if (doc.exists) {
      const used = (doc.data().used || []).slice(-30).map(t => t.topic);
      if (used.length) usedList = `Do NOT pick these (already used): ${used.join(', ')}`;
    }
  } catch {}

  const topicPrompts = {
    motivational: `பைக் ஓட்டுபவர்களுக்கான காலை ரேடியோ நிகழ்ச்சிக்கு ஒரு தூண்டுதல் தலைப்பு தமிழில் சொல்லவும். சுருக்கமாக, குறிப்பிட்டதாக இருக்கட்டும். உதாரணம்: "தோல்வியிலிருந்து எழுவதே வீரம்". ${usedList} தலைப்பு மட்டும் சொல்லவும்.`,
    astrology:    `சரியாக இதை சொல்லவும்: "அனைத்து 12 ராசிகளுக்கும் இன்றைய ராசி பலன்"`,
    news:         `இன்றைய இந்திய ரேடியோவுக்கு ஒரு குறிப்பிட்ட செய்தி தலைப்பு தமிழில் சொல்லவும். ${usedList} தலைப்பு மட்டும் சொல்லவும்.`,
    leader:       `ஒரு ஊக்கமளிக்கும் இந்திய தலைவர், சுதந்திர போராட்டவீரர், அல்லது விஞ்ஞானி பெயரை தமிழில் சொல்லவும். உதாரணம்: "டாக்டர் ஏபிஜே அப்துல் கலாம் - இந்தியாவின் மிசைல் மனிதர்". ${usedList} பெயரும் விளக்கமும் மட்டும் சொல்லவும்.`,
    health:       `பைக் ஓட்டுபவர்களுக்கான ஒரு குறிப்பிட்ட ஆரோக்கிய தலைப்பை தமிழில் சொல்லவும். உதாரணம்: "நீண்ட பயணத்தில் முதுகு வலி தவிர்க்கும் வழிகள்". ${usedList} தலைப்பு மட்டும் சொல்லவும்.`,
    movie:        `ஒரு சமீபத்திய தமிழ் திரைப்படத்தை (2020-2026) ரேடியோ மதிப்பீட்டுக்கு பரிந்துரைக்கவும். உதாரணம்: "லியோ (2023) - விஜய்". ${usedList} திரைப்பட தலைப்பு, வருடம், நடிகர் மட்டும் சொல்லவும்.`,
    agriculture:  `தமிழ்நாடு விவசாயிகளுக்கான ஒரு குறிப்பிட்ட விவசாய தலைப்பை தமிழில் சொல்லவும். உதாரணம்: "சிறு விவசாயிகளுக்கு சொட்டு நீர் பாசனம்". ${usedList} தலைப்பு மட்டும் சொல்லவும்.`,
    travel:       `பைக் ஓட்டுபவர்களுக்கான ஒரு குறிப்பிட்ட இந்திய பயண இடத்தை தமிழில் சொல்லவும். உதாரணம்: "ஊட்டி - மலை ராணி". ${usedList} இட பெயரும் சுருக்கமான விளக்கமும் மட்டும் சொல்லவும்.`,
    local_news:   `தமிழ்நாடு பைக் ஓட்டுபவர்களுக்கான இன்றைய உள்ளூர் செய்தி தலைப்பை தமிழில் சொல்லவும். ${usedList} தலைப்பு மட்டும் சொல்லவும்.`,
    weather:      `தமிழ்நாடு பைக் ஓட்டுபவர்களுக்கான வானிலை தலைப்பை தமிழில் சொல்லவும். உதாரணம்: "மழைக்காலத்தில் பாதுகாப்பான பைக் பயணம்". ${usedList} தலைப்பு மட்டும் சொல்லவும்.`,
    comedy:       `பைக் ஓட்டுதல் அல்லது இந்திய அன்றாட வாழ்க்கையில் ஒரு வேடிக்கையான தலைப்பை தமிழில் சொல்லவும். உதாரணம்: "டிராஃபிக் போலீஸும் பைக்காரனும் - காமெடி சந்திப்பு". ${usedList} தலைப்பு மட்டும் சொல்லவும்.`,
    science:      `ரேடியோ நிகழ்ச்சிக்கு ஒரு சுவாரஸ்யமான அறிவியல் தலைப்பை தமிழில் சொல்லவும். உதாரணம்: "எரிமலை - பூமி எப்படி சுவாசிக்கிறது". ${usedList} தலைப்பு மட்டும் சொல்லவும்.`,
    horror:       `இந்திய நெடுஞ்சாலையில் ஒரு திகில் கதை தலைப்பை தமிழில் சொல்லவும். உதாரணம்: "NH44-ல் ஆவி பைக்கர்". ${usedList} தலைப்பு மட்டும் சொல்லவும்.`,
    love:         `இந்தியாவில் பைக் ஓட்டுபவர்களை உள்ளடக்கிய ஒரு காதல் கதை தலைப்பை தமிழில் சொல்லவும். உதாரணம்: "ஊட்டியில் காதலில் விழுந்த இரண்டு பைக்கர்கள்". ${usedList} தலைப்பு மட்டும் சொல்லவும்.`,
    night:        `இரவு பைக் ஓட்டுபவர்களுக்கான ஒரு அமைதியான சிந்தனை தலைப்பை தமிழில் சொல்லவும். உதாரணம்: "வெறும் சாலையில் அமைதியை கண்டடைவது". ${usedList} தலைப்பு மட்டும் சொல்லவும்.`,
  };

  const prompt = topicPrompts[contentType] || topicPrompts.science;
  const topic = await callGemini(prompt, 5);
  const cleanTopic = (topic || '').trim().split('\n')[0].trim() || `${contentType} content`;

  // Save used topic
  try {
    const ref = db.collection('jaysfm_topics').doc(contentType);
    const doc = await ref.get();
    const used = doc.exists ? (doc.data().used || []) : [];
    used.push({ topic: cleanTopic, date: dateStr });
    await ref.set({ used: used.slice(-365) });
  } catch {}

  // Save today's topic
  try {
    await db.collection('jaysfm').doc(dateStr).set({ [`topic_${contentType}`]: cleanTopic }, { merge: true });
  } catch {}

  return cleanTopic;
}

// ── Generate radio script segment ─────────────────────────────────────────────
async function generateSegment(slot, segIdx, topic, prevScript, dateStr) {
  const partNames = ['Opening Segment', 'Middle Segment', 'Closing Segment', 'Bonus Segment'];
  const partName = partNames[segIdx % partNames.length];
  const isFirst = segIdx === 0;
  const isLast = segIdx === slot.segments - 1;

  const contentGuide = {
    motivational: `தமிழிலேயே மட்டும் எழுதவும். காலை உற்சாக பேச்சு - ஒரு தூண்டுதல் கதை அல்லது எண்ணம் பகிரவும். பைக் ஓட்டுபவர்களுக்கு தொடர்பு படுத்தவும். ஆற்றலுடன் முடிக்கவும்! 800 முதல் 1200 எழுத்துகள் மட்டும். 1200 க்கு மேல் வேண்டாம்.`,
    astrology:    `தமிழிலேயே மட்டும் எழுதவும். இந்த 4 ராசிகளுக்கு வேடிக்கையான ராசிபலன் சொல்லவும் (${['மேஷம்/ரிஷபம்/மிதுனம்/கடகம்','சிம்மம்/கன்னி/துலாம்/விருச்சிகம்','தனுசு/மகரம்/கும்பம்/மீனம்'][segIdx%3]}). அதிர்ஷ்ட நிறம், எண், பைக் ஓட்டும் கணிப்பு சேர்க்கவும். 800 முதல் 1200 எழுத்துகள் மட்டும். 1200 க்கு மேல் வேண்டாம்.`,
        news:         (() => {
      const isSportsSeg = segIdx >= 5;
      if (isSportsSeg) {
        return `[SPORTS NEWS - TAMIL ONLY - தேதி: ${dateStr}]
தமிழிலேயே மட்டும் எழுதவும்.

செய்தி 1 - கிரிக்கெட்: (தலைப்பு + 4 வாக்கியங்கள் + Jay கமெண்ட்)
"சரி நண்பர்களே! அடுத்த விளையாட்டு செய்தி!"
செய்தி 2 - கால்பந்து: (தலைப்பு + 4 வாக்கியங்கள் + Jay கமெண்ட்)
"இன்னொரு ஆவேசமான செய்தி நண்பர்களே!"
செய்தி 3 - வேறு விளையாட்டு: Badminton/Tennis/Chess (தலைப்பு + 4 வாக்கியங்கள் + Jay கமெண்ட்)

முக்கியம்: ஒவ்வொரு செய்தியும் முழுமையாக இருக்கவேண்டும். 800 முதல் 1200 எழுத்துகள் மட்டும். 1200 க்கு மேல் வேண்டாம்.`;
      }
      return `[NEWS SEGMENT ${segIdx+1} of 5 - TAMIL ONLY - தேதி: ${dateStr}]
தமிழிலேயே மட்டும் எழுதவும். விளையாட்டு செய்தி வேண்டாம்.

கீழே உள்ள 3 செய்திகளை தனித்தனியாக முழுமையாக எழுதவும்:

செய்தி 1 - இந்தியா தேசிய செய்தி (India national):
தலைப்பு + 4 வாக்கியங்கள் விளக்கம் + Jay கமெண்ட்

"சரி நண்பர்களே, அடுத்த செய்தி பாக்கலாம்!"

செய்தி 2 - தமிழ்நாடு செய்தி (Tamil Nadu local):
தலைப்பு + 4 வாக்கியங்கள் விளக்கம் + Jay கமெண்ட்

"இன்னொரு முக்கியமான செய்தி நண்பர்களே!"

செய்தி 3 - உலக செய்தி (World/International):
தலைப்பு + 4 வாக்கியங்கள் விளக்கம் + Jay கமெண்ட்

முக்கியம்: ஒவ்வொரு செய்தியும் முழுமையாக இருக்கவேண்டும். 800 முதல் 1200 எழுத்துகள் மட்டும். 1200 க்கு மேல் வேண்டாம்.`;
    })(),
    leader:       `தமிழிலேயே மட்டும் எழுதவும். இந்த தலைவரின் கதை சொல்லவும். ${isFirst?'ஆரம்ப வாழ்க்கை மற்றும் போராட்டங்களிலிருந்து தொடங்கவும்.':isLast?'இவரின் மரபு மற்றும் பைக் ஓட்டுபவர்களுக்கான பாடங்கள்.':'முக்கிய சாதனைகள் மற்றும் புகழ்பெற்ற தருணங்கள்.'} 800 முதல் 1200 எழுத்துகள் மட்டும். 1200 க்கு மேல் வேண்டாம்.`,
    health:       'தமிழிலேயே மட்டும் எழுதவும். 2-3 குறிப்பிட்ட நடைமுறை ஆரோக்கிய குறிப்புகள். ஏன் முக்கியம், எப்படி செய்வது என்று விளக்கவும். 800 முதல் 1200 எழுத்துகள் மட்டும். 1200 க்கு மேல் வேண்டாம்.',
    movie:        `தமிழிலேயே மட்டும் எழுதவும். இந்த திரைப்படத்தை ரிவியூ பண்ணவும். ${isFirst?'கதாநாயகன் நடிப்பு மற்றும் கதையை விவரிக்கவும்.':isLast?'5 இல் மதிப்பீடு மற்றும் வடிவேல் ஸ்டைல் கமெண்ட்.':'துணை நடிகர்கள் மற்றும் சிறந்த காட்சிகள்.'} 800 முதல் 1200 எழுத்துகள் மட்டும். 1200 க்கு மேல் வேண்டாம்.`,
    agriculture:  'தமிழிலேயே மட்டும் எழுதவும். தமிழ்நாடு விவசாயிகளிடமிருந்து நடைமுறை விவசாய குறிப்புகள் 2-3. 800 முதல் 1200 எழுத்துகள் மட்டும். 1200 க்கு மேல் வேண்டாம்.',
    travel:       `தமிழிலேயே மட்டும் எழுதவும். இந்த இடத்தை விவரிக்கவும். ${['பைக் ஓட்டுபவர்கள் ஏன் வர வேண்டும் என்று சொல்லவும்.','வரலாறு, கலாச்சாரம் மற்றும் உள்ளூர் மக்கள் வாழ்க்கை.','சாப்பிட வேண்டிய உணவுகள் மற்றும் புகழ்பெற்ற உணவகங்கள்.','சிறந்த பைக் ரூட்டுகள் மற்றும் உள்ளூர்வாசிகளுக்கு மட்டும் தெரிந்த இடங்கள்.'][segIdx%4]} 800 முதல் 1200 எழுத்துகள் மட்டும். 1200 க்கு மேல் வேண்டாம்.`,
    local_news:   `You are Jay on Tamil FM. Write EXACTLY 3 Tamil Nadu local news stories for segment ${segIdx+1} of 3. Date: ${dateStr}.

WRITE IN PURE TAMIL ONLY.

Cover real recent TN news from these categories:
- Tamil Nadu CM/politics, DMK/AIADMK news
- Chennai city news, traffic, new projects
- Tamil movies, Kollywood, actor news
- Tamil Nadu sports, local cricket/football
- Regional festivals, temple events
- TN government schemes, welfare programs
- Local business, economy news

FORMAT:
Story 1: Start directly with headline
"சரி, அடுத்த தமிழ்நாடு செய்தி!" before story 2
"இன்னொரு முக்கியமான செய்தி நண்பர்களே!" before story 3

Each story: headline + 2-3 sentences + Jay reaction
Total minimum 900 characters`,
    weather:      `Write Tamil Nadu weather forecast for today ${dateStr} and tomorrow in PURE TAMIL. Cover: Chennai, Coimbatore, Madurai, Trichy weather. Include: temperature, rain chances, wind, visibility for riders. Give riding safety tips based on actual weather. Style: Like real Kalaignar TV weather report but in FM RJ style. Minimum 500 characters.`,
    comedy:       'தமிழிலேயே மட்டும் எழுதவும். வடிவேல்/கவுண்டமணி ஸ்டைல் வேடிக்கையான கதை சொல்லவும். உரையாடலுடன், பஞ்ச்லைனுடன் முடிக்கவும். 800 முதல் 1200 எழுத்துகள் மட்டும். 1200 க்கு மேல் வேண்டாம்.',
    science:      `தமிழிலேயே மட்டும் எழுதவும். ${isFirst?'அதிர்ச்சியான அறிவியல் உண்மையிலிருந்து தொடங்கவும்!':isLast?'இந்த அறிவியலை பைக் ஓட்டுபவர்களின் வாழ்க்கையுடன் தொடர்புபடுத்தவும்.':'ஆழமாக விளக்கவும் - பைக் ஓட்டுபவர்களுக்கு புரியும் உதாரணங்களுடன்.'} 800 முதல் 1200 எழுத்துகள் மட்டும். 1200 க்கு மேல் வேண்டாம்.`,
    horror:       `தமிழிலேயே மட்டும் எழுதவும். ${isFirst?'இருண்ட நெடுஞ்சாலையில் காட்சியை அமைக்கவும். மர்மத்தை அறிமுகப்படுத்தவும்.':isLast?'திகிலான முடிவு - அதிர்ச்சியான திருப்பம்!':'பதற்றத்தை அதிகரிக்கவும் - விசித்திர நிகழ்வுகள்.'} 800 முதல் 1200 எழுத்துகள் மட்டும். 1200 க்கு மேல் வேண்டாம்.`,
    love:         `தமிழிலேயே மட்டும் எழுதவும். ${isFirst?'காட்சியை அமைக்கவும் - சந்தித்த முதல் தருணம்.':isLast?'அழகான முடிவு - பைக் ஓட்டுதலும் காதலும் ஒரே மாதிரி.':'பயணம் - தடைகளும் ஒன்றிணைத்த சாலையும்.'} 800 முதல் 1200 எழுத்துகள் மட்டும். 1200 க்கு மேல் வேண்டாம்.`,
    night:        `தமிழிலேயே மட்டும் எழுதவும். ${isFirst?'இரவு பைக் ஓட்டுபவர்களை வெப்பமாக வரவேற்கவும். அமைதியான மனநிலையை உருவாக்கவும்.':isLast?'சாரதி - பாதுகாப்பான பயணம் மற்றும் அமைதியான ஓய்வை வாழ்த்தவும்.':'நாள் மற்றும் இரவு பைக் ஓட்டுதலைப் பற்றி அமைதியான எண்ணம் பகிரவும்.'} 800 முதல் 1200 எழுத்துகள் மட்டும். 1200 க்கு மேல் வேண்டாம்.`,
  };

  const continuation = prevScript 
    ? `\nPREVIOUS SEGMENT ENDED WITH:\n"...${prevScript.slice(-250)}"\nContinue naturally from where it left off.\n` 
    : '';

  const isAstrology = slot.contentType === 'astrology';
  const isNews = slot.contentType === 'news' || slot.contentType === 'local_news' || slot.contentType === 'evening_news';
  const isNewsType = isNews || slot.contentType === 'weather';
  const isLocalNews = slot.contentType === 'local_news';

  // Fetch real news from RSS for news slots
  let realNewsItems = [];
  if (isNews) {
    try {
      const feedType = getRSSFeedType(slot.id, segIdx, isLocalNews);
      realNewsItems = await fetchNewsFromRSS(feedType, 5);
    } catch (e) {
      console.log('  ⚠️ RSS fetch failed, using Gemini knowledge');
    }
  }
  
  const realNewsContext = realNewsItems.length > 0
    ? '\n\n=== REAL NEWS FROM RSS FEEDS (MUST USE THESE) ===\n' + 
      realNewsItems.map((item, i) => `News ${i+1}: ${item.title}${item.summary ? '\nDetails: ' + item.summary.substring(0, 150) : ''}`).join('\n\n') +
      '\n=== END OF REAL NEWS ===\nYOU MUST cover these exact news stories. Do not make up news.'
    : '\nNote: Use your knowledge of recent India/world events for ' + dateStr + '.';
  const rasiBatch = [
    'மேஷம் மற்றும் ரிஷபம்',
    'மிதுனம் மற்றும் கடகம்',
    'சிம்மம் மற்றும் கன்னி',
    'துலாம் மற்றும் விருச்சிகம்',
    'தனுசு மற்றும் மகரம்',
    'கும்பம் மற்றும் மீனம்',
    'மேஷம் மற்றும் சிம்மம்',
    'ரிஷபம் மற்றும் கடகம்',
  ][Math.max(0, segIdx - 1) % 6]; // seg1→index0(மேஷம்+ரிஷபம்), seg6→index5(கும்பம்+மீனம்)

  // Get base contentDirection
  let contentDirection = '';
  
  // For news slots - build direction based on segIdx (can't use IIFE in contentGuide)
  if (isNews) {
    const isSportsSeg = segIdx >= 5;
    if (isSportsSeg) {
      contentDirection = `[SPORTS NEWS - TAMIL ONLY - தேதி: ${dateStr}]
தமிழிலேயே மட்டும் எழுதவும்.

செய்தி 1 - கிரிக்கெட்: (தலைப்பு + 4 வாக்கியங்கள் விளக்கம் + Jay கமெண்ட்)
"சரி நண்பர்களே! அடுத்த விளையாட்டு செய்தி!"
செய்தி 2 - கால்பந்து: (தலைப்பு + 4 வாக்கியங்கள் விளக்கம் + Jay கமெண்ட்)
"இன்னொரு ஆவேசமான செய்தி நண்பர்களே!"
செய்தி 3 - வேறு விளையாட்டு (தலைப்பு + 4 வாக்கியங்கள் விளக்கம் + Jay கமெண்ட்)
800 முதல் 1200 எழுத்துகள் மட்டும். 1200 க்கு மேல் வேண்டாம்.`;
    } else if (isLocalNews) {
      const localCats = ['TN அரசியல், CM, Government schemes', 'Chennai city, Development', 'Tamil cinema, Kollywood', 'TN sports, local events'];
      contentDirection = `[LOCAL NEWS SEGMENT ${segIdx+1} - TAMIL ONLY - தேதி: ${dateStr}]
${localCats[segIdx % localCats.length]} பற்றி 3 செய்திகள்:

செய்தி 1 (தலைப்பு + 4 வாக்கியங்கள் + Jay கமெண்ட்)
"சரி நண்பர்களே, அடுத்த செய்தி!"
செய்தி 2 (தலைப்பு + 4 வாக்கியங்கள் + Jay கமெண்ட்)
"இன்னொரு முக்கியமான செய்தி!"
செய்தி 3 (தலைப்பு + 4 வாக்கியங்கள் + Jay கமெண்ட்)
800 முதல் 1200 எழுத்துகள் மட்டும். 1200 க்கு மேல் வேண்டாம்.`;
    } else {
      contentDirection = `[NEWS SEGMENT ${segIdx+1} of 5 - TAMIL ONLY - தேதி: ${dateStr}]
தமிழிலேயே மட்டும் எழுதவும். விளையாட்டு செய்தி வேண்டாம்.

கீழே உள்ள 3 செய்திகளை முழுமையாக எழுதவும்:

செய்தி 1 - இந்தியா தேசிய செய்தி:
தலைப்பு + 4 வாக்கியங்கள் விளக்கம் + Jay கமெண்ட்

"சரி நண்பர்களே, அடுத்த செய்தி பாக்கலாம்!"

செய்தி 2 - தமிழ்நாடு செய்தி:
தலைப்பு + 4 வாக்கியங்கள் விளக்கம் + Jay கமெண்ட்

"இன்னொரு முக்கியமான செய்தி நண்பர்களே!"

செய்தி 3 - உலக செய்தி:
தலைப்பு + 4 வாக்கியங்கள் விளக்கம் + Jay கமெண்ட்

800 முதல் 1200 எழுத்துகள் மட்டும். 1200 க்கு மேல் வேண்டாம். ஒவ்வொரு செய்தியும் முழுமையாக இருக்கவேண்டும்.`;
    }
  } else {
    contentDirection = contentGuide[slot.contentType] || 'Be engaging and entertaining.';
  }
  // Rasi Palan structure (6 segments - 3 rashis each + song between):
  // 0: Intro - day info, special days, auspicious timing + Song
  // 1: Rashis 1-3 (Mesha, Rishabha, Mithuna) + Song
  // 2: Rashis 4-6 (Kataka, Simha, Kanni) + Song
  // 3: Rashis 7-9 (Thulam, Viruchigam, Dhanusu) + Song
  // 4: Rashis 10-12 (Makara, Kumbha, Meena) + Song
  // 5: Outro - general tip, farewell + Song

  const RASI_BATCHES = [
    'மேஷம் (Aries), ரிஷபம் (Taurus), மிதுனம் (Gemini)',
    'கடகம் (Cancer), சிம்மம் (Leo), கன்னி (Virgo)',
    'துலாம் (Libra), விருச்சிகம் (Scorpio), தனுசு (Sagittarius)',
    'மகரம் (Capricorn), கும்பம் (Aquarius), மீனம் (Pisces)',
  ];

  if (isAstrology) {
    console.log(`  🌟 Rasi seg${segIdx}: ${rasiBatch} (slot.segments=${slot.segments})`);
    if (segIdx === 0) {
      contentDirection = `Write the INTRO for today's Rasi Palan show in Tamil.
Include:
1. Warm morning greeting: "அன்பான நேயர்களுக்கு இனிய காலை வணக்கம்!"
2. Today's date: ${dateStr} and day of week
3. Today's special significance - check if public holiday, festival, full moon (பௌர்ணமி), new moon (அமாவாசை), auspicious day, Tamil calendar event
4. Brief planetary overview for today
5. Announce all 12 rasi predictions coming in segments
6. Excitement about first song coming up

Write in pure Tamil. Minimum 600 characters. Warm energetic RJ style.`;

    } else if (segIdx >= 1 && segIdx <= slot.segments - 2) {
      contentDirection = `இன்றைய ராசி பலன் - ${rasiBatch} - தமிழிலேயே எழுதவும்.

இந்த 2 ராசிகளுக்கும் முழுமையான பலன் எழுதவும்:
${rasiBatch}

ஒவ்வொரு ராசிக்கும் இப்படி எழுதவும்:
"[ராசி பெயர்] ராசி அன்பர்களே!"
- தொழில்/வேலை: 2 வாக்கியங்கள்
- உடல்நலம்: 2 வாக்கியங்கள்  
- காதல்/குடும்பம்: 2 வாக்கியங்கள்
- பொருளாதாரம்: 1 வாக்கியம்
- அதிர்ஷ்ட நிறம் மற்றும் எண்: 1 வாக்கியம்
- Jay-ஓட வேடிக்கையான கமெண்ட்: 1 வாக்கியம்

800 முதல் 1200 எழுத்துகள் மட்டும்.`

    } else {
      contentDirection = `Write the CLOSING OUTRO for today's Rasi Palan show in Tamil.
Include:
1. "பன்னிரண்டு ராசிகளுக்கான பலன்களையும் நாம பார்த்து முடிச்சுட்டோம்"
2. A general star wisdom/tip applicable to all rashis today
3. Motivational message about hard work + planetary guidance
4. Warm farewell: invite listeners tomorrow same time
5. Final song announcement

Write in pure Tamil. Minimum 500 characters. Warm closing style.`;
    }
  } else if (isNews) {
    // contentGuide handles news direction
  }

  const tamilInstruction = isNewsType
    ? 'முழுவதும் தமிழிலேயே மட்டும் எழுதவும். No English at all. ONLY TAMIL SCRIPT.'
    : 'Tanglish style - mix Tamil and English naturally. Use machan, da, nanbargale.';

  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayName = dayNames[new Date(dateStr).getDay()];
  const prompt = 'You are Jay, energetic Tamil FM radio RJ on Jay FM.\n' +
    'Write ONLY spoken dialogue. No stage directions. No [SFX]. No brackets.\n' +
    tamilInstruction + '\n\n' +
    'SHOW: ' + slot.emoji + ' ' + slot.title + '\n' +
    'DATE: ' + dateStr + ' (' + dayName + ')\n' +
    (isAstrology ? 'RASHIS: ' + rasiBatch + '\n' : '') +
    (!isNews && !isAstrology ? 'TOPIC: ' + topic + '\n' : '') +
    'SEGMENT: ' + (segIdx+1) + ' of ' + slot.segments + '\n' +
    (continuation ? 'CONTINUES FROM: ' + continuation.substring(0, 100) + '...\n' : '') +
    realNewsContext + '\n' +
    '\nCONTENT INSTRUCTIONS:\n' + contentDirection + '\n' +
    '\nMINIMUM: 1000 characters. Be detailed.\n' +
    (isFirst && !isNews ? 'OPENING segment - welcome listeners warmly.\n' : '') +
    (isFirst && isNews ? 'Start directly with first news story - no long intro needed, just brief welcome and dive into news.\n' : '') +
    (isLast ? 'CLOSING segment - end with energy.\n' : '') +
    '\nStart speaking directly now:';

  return await callGemini(prompt, 200);
}

// ── Fetch songs ───────────────────────────────────────────────────────────────
const QUERY_VARIATIONS = CONFIG.SONG_QUERIES;

async function fetchSongs(query, count = 10, slotId = '') {
  const variations = QUERY_VARIATIONS[slotId] || [];
  // Shuffle variations array to avoid same 2 queries repeating
  const shuffled = [...variations].sort(() => Math.random() - 0.5);
  
  const allSongs = [];
  const seenTitles = new Set();
  
  // Try each variation until we have enough songs
  const queriesToTry = shuffled.length > 0 ? shuffled : [query];
  
  for (const q of queriesToTry) {
    if (allSongs.length >= count) break;
    
    const randomOffset = Math.floor(Math.random() * 8) + 1;
    console.log(`  🎵 Searching: "${q}" (page ${randomOffset})`);
    
    let songs = await searchViaCloudFunction(q, count, randomOffset);
    
    if (songs.length === 0) {
      console.log(`  ⚠️ CF empty for "${q}", trying Deezer...`);
      songs = await searchDeezer(q, 20);
    }
    
    // Deduplicate and add
    for (const s of songs) {
      // Dedup by normalized title (remove special chars, spaces, HTML entities)
      const key = (s.title || '').toLowerCase()
        .replace(/&[^;]+;/g, '') // remove HTML entities like &quot;
        .replace(/[^a-z0-9]/g, ''); // remove non-alphanumeric
      if (!seenTitles.has(key) && s.url && key.length > 3) {
        seenTitles.add(key);
        allSongs.push(s);
      }
    }
    console.log(`  ✅ Total songs so far: ${allSongs.length}`);
  }
  
  return allSongs.slice(0, count);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const isToday = process.argv.includes('--today');
  const slotFilter = process.argv.find(a => a.startsWith('--slot='))?.replace('--slot=', '');
  const resumeFrom = process.argv.find(a => a.startsWith('--resume='))?.replace('--resume=', '');

  const date = new Date();
  if (!isToday) date.setDate(date.getDate() + 1);
  const dateStr = date.toISOString().split('T')[0];

  console.log(`\n🎙️  Jay's FM Script Generator`);
  console.log(`📅 Date: ${dateStr} ${isToday ? '(TODAY)' : '(TOMORROW)'}`);
  console.log(`🔑 Gemini: ${GEMINI_API_KEY ? GEMINI_API_KEY.substring(0,8)+'...' : '❌ MISSING!'}`);
  if (!GEMINI_API_KEY) { console.log('Add GEMINI_API_KEY to .env'); process.exit(1); }

  const isMorning = process.argv.includes('--morning');   // 5AM run: slots before 2PM
  const isAfternoon = process.argv.includes('--afternoon'); // 1PM run: slots 2PM onwards

  // Morning slot IDs (6AM-2PM)
  const morningSlots = ['rhythms','rasi_palan','morning_news','thalaivar','health','movie_review','agriculture','travel'];
  // Afternoon slot IDs (2PM-midnight)
  const afternoonSlots = ['local_news','weather','comedy','science','evening_news','horror','love','night'];

  let slots = SCHEDULE;
  if (slotFilter) slots = SCHEDULE.filter(s => s.id === slotFilter);
  else if (isMorning) slots = SCHEDULE.filter(s => morningSlots.includes(s.id));
  else if (isAfternoon) slots = SCHEDULE.filter(s => afternoonSlots.includes(s.id));
  else if (resumeFrom) { const i = SCHEDULE.findIndex(s => s.id === resumeFrom); if (i>=0) slots = SCHEDULE.slice(i); }
  console.log(`📻 Generating ${slots.length} slot(s)\n`);

  for (const slot of slots) {
    const isNewsSlot = ['morning_news', 'local_news', 'evening_news', 'weather'].includes(slot.id);
    const isAstrologySlot = slot.id === 'rasi_palan';
    process.stdout.write(`\n${slot.emoji} ${slot.title} — `);
    let topic;
    if (isNewsSlot) {
      topic = slot.id === 'local_news' ? 'Tamil Nadu Local News' : 'India and World News';
      console.log(`topic: "${topic}"`);
    } else if (isAstrologySlot) {
      topic = 'Daily Rasi Palan for all 12 Rashis';
      console.log(`topic: "${topic}"`);
      // Try to get real horoscope data
      process.stdout.write('  📡 Fetching real horoscope... ');
      const realRasiResult = await fetchRealRasiPalan(dateStr);
      const rasiCount = Object.keys(realRasiResult).length;
      if (rasiCount > 0) {
        console.log(`🌟 REAL data: ${rasiCount}/12 rashis from API`);
      } else {
        console.log(`🤖 API unavailable - Gemini will generate predictions`);
      }
    } else {
      process.stdout.write('picking topic... ');
      topic = await pickTopicOfDay(slot.contentType, dateStr);
      console.log(`"${topic.substring(0,60)}"`);
    }
    console.log('─'.repeat(55));

    const slotData = { id: slot.id, title: slot.title, emoji: slot.emoji, contentType: slot.contentType, topic, segments: [], songs: [], generatedAt: new Date().toISOString() };

    let prevScript = '';
    for (let i = 0; i < slot.segments; i++) {
      process.stdout.write(`  Segment ${i+1}/${slot.segments}... `);
      const script = await generateSegment(slot, i, topic, prevScript, dateStr);
      if (script) {
        prevScript = script; // keep full script for continuation context
      }
      // Store only the spoken RJ dialogue (strip [SFX] and [MUSIC CUE])
      // If segment is empty after retries, use fallback with explicit length
      let finalScript = script;
      if (!finalScript || finalScript.length < 200) {
        console.log('  ⚠️ Content too short or empty, retrying with explicit length request...');
        const fallbackPrompt = `நீங்கள் Jay FM-ல் Jay என்ற தமிழ் ரேடியோ RJ. ${slot.contentType} பற்றி விரிவான பகுதி ${i+1} of ${slot.segments} எழுதவும்.
தலைப்பு: ${topic}.
முழுவதும் தமிழிலேயே மட்டும் எழுதவும். 800 முதல் 1200 எழுத்துகள் மட்டும். 1200 க்கு மேல் வேண்டாம்.`;
        finalScript = await callGemini(fallbackPrompt, 200);
      }
      const spokenText = finalScript ? parseScript(finalScript) : '';
      const fullScript = finalScript || '';
      slotData.segments.push({ 
        index: i, 
        text: spokenText,
        fullScript: fullScript,
        contentType: slot.contentType 
      });
      console.log(script ? `✅ (${script.length} chars)` : '❌ Empty');
      await sleep(1500);
    }

    // Pick random query from SONG_QUERIES array (shuffled in fetchSongs)
    const songVariations = SONG_QUERIES[slot.id] || [];
    const songQuery = songVariations.length > 0
      ? songVariations[Math.floor(Math.random() * songVariations.length)]
      : 'Tamil melody songs';
    process.stdout.write(`  🎵 Songs "${songQuery}"... `);
    let songs = await fetchSongs(songQuery, 6, slot.id);
    // Retry if not enough songs
    if (songs.length < slot.segments) {
      console.log(`  ⚠️ Only ${songs.length} songs, retrying...`);
      const moreSongs = await fetchSongs(songQuery, 6, slot.id);
      const combined = [...songs, ...moreSongs];
      // Deduplicate
      const seen = new Set();
      songs = combined.filter(s => {
        const key = s.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      console.log(`  ✅ After retry: ${songs.length} songs`);
    }
    slotData.songs = songs;
    slotData.songQuery = songQuery;
    console.log(`✅ ${songs.length} songs`);

    // Build interleaved playlist: SFX → content → comedy → song → SFX → content...
    const playlist = [];
    const validSongs = songs.filter(s => s.url && s.url.startsWith('http'));
    const segs = slotData.segments || [];
    
    // Fetch SFX URLs for this slot from Deezer
    let sfxUrls = [];
    let comedyUrls = [];
    try {
      const sfxQueries = {
        rhythms: 'morning bell chime', rasi_palan: 'mystical bell chime',
        morning_news: 'news jingle radio', thalaivar: 'trumpet fanfare',
        health: 'upbeat chime', movie_review: 'cinema bell',
        agriculture: 'nature birds', travel: 'road wind chime',
        local_news: 'news alert bell', weather: 'rain chime',
        comedy: 'comedy sound effect', science: 'discovery chime',
        evening_news: 'news bell', horror: 'horror sting scary',
        love: 'romantic harp', night: 'night ambient chime',
      };
      const sfxQuery = sfxQueries[slot.id] || 'radio jingle';
      const sfxRes = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(sfxQuery)}&limit=10`);
      const sfxData = await sfxRes.json();
      sfxUrls = (sfxData.data || []).filter(t => t.preview).map(t => t.preview).slice(0, 5);
      
      // Comedy clips for news/rasi/comedy slots
      const needsComedy = ['rasi_palan','morning_news','local_news','evening_news','comedy'].includes(slot.id);
      if (needsComedy) {
        // Try multiple Deezer queries for comedy/fun clips
        const comedyQueries = [
          'Tamil kuthu songs', 'Tamil party songs', 'Tamil dance hits',
          'comedy bgm film', 'funny instrumental music'
        ];
        for (const cq of comedyQueries) {
          try {
            const comedyRes = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(cq)}&limit=15`);
            const comedyData = await comedyRes.json();
            const clips = (comedyData.data || []).filter(t => t.preview).map(t => t.preview);
            if (clips.length > 0) {
              comedyUrls = clips.slice(0, 5);
              console.log(`  😂 Comedy clips: ${clips.length} found with "${cq}"`);
              break;
            }
          } catch(ce) { console.log(`  ⚠️ Comedy query failed: ${ce.message?.substring(0,30)}`); }
        }
        // Fallback: reuse SFX urls as comedy transitions
        if (comedyUrls.length === 0 && sfxUrls.length > 0) {
          comedyUrls = [...sfxUrls];
          console.log(`  😂 Using SFX as comedy fallback: ${comedyUrls.length} clips`);
        }
      }
      console.log(`  🔔 SFX: ${sfxUrls.length} clips, 😂 Comedy: ${comedyUrls.length} clips`);
    } catch (e) {
      console.log('  ⚠️ SFX fetch failed:', e.message?.substring(0, 40));
    }

    for (let i = 0; i < segs.length; i++) {
      // Content segment
      if (segs[i].text) {
        playlist.push({
          type: 'content',
          segIndex: i,
          text: segs[i].text,
          contentType: segs[i].contentType || slot.contentType,
          // Don't store SFX URLs - Deezer URLs expire! App fetches fresh ones at runtime
          sfxSlotId: slot.id, // store slot ID so app can fetch fresh SFX
        });
      }
      // Song after content
      if (validSongs.length > 0) {
        const song = validSongs[i % validSongs.length];
        playlist.push({
          type: 'song',
          id: song.id,
          url: song.url,
          title: song.title,
          artist: song.artist,
          artwork: song.artwork,
          duration: song.duration,
        });
      }
    }
    slotData.playlist = playlist;
    const counts = {content: 0, song: 0};
    playlist.forEach(p => { if (counts[p.type] !== undefined) counts[p.type]++; });
    console.log(`  📋 Playlist: ${playlist.length} items (${counts.content} content + ${counts.song} songs)`);
    console.log(`  🔔 SFX: ${sfxUrls.length} clips stored, 😂 Comedy: ${comedyUrls.length} clips stored`);

    await db.collection('jaysfm').doc(dateStr).collection('slots').doc(slot.id).set(slotData);
    console.log(`  💾 Firestore ✅`);
    await sleep(1000);
  }

  await db.collection('jaysfm').doc(dateStr).set({ date: dateStr, generatedAt: new Date().toISOString(), slots: slots.map(s=>s.id) }, { merge: true });
  console.log(`\n✅ Done! Jay's FM ready for ${dateStr}`);
  console.log('📱 Open app → Start ride → tap 📻 Jay\'s FM');
  process.exit(0);
}

main().catch(e => { console.error('\n❌', e.message); console.error(e.stack); process.exit(1); });
