// scripts/generateFMAudio.js
// Converts Jay FM text segments to MP3 using Google TTS
// Usage: node scripts/generateFMAudio.js --today --slot=rhythms
//        node scripts/generateFMAudio.js --today --morning

require('dotenv').config();
const admin = require('firebase-admin');
const textToSpeech = require('@google-cloud/text-to-speech');
const fs = require('fs');
const path = require('path');
const os = require('os');

const FM_CONFIG = require('./jayFMConfig');

const serviceAccount = require(path.join(__dirname, '..', 'google-services-admin.json'));
if (!admin.apps.length) {
  admin.initializeApp({ 
    credential: admin.credential.cert(serviceAccount),
    storageBucket: `${serviceAccount.project_id}.firebasestorage.app`,
  });
}
const db = admin.firestore();
const bucket = admin.storage().bucket();

const ttsClient = new textToSpeech.TextToSpeechClient({
  credentials: {
    client_email: serviceAccount.client_email,
    private_key: serviceAccount.private_key,
  },
  projectId: serviceAccount.project_id,
});

const VOICE_NAME = 'ta-IN-Wavenet-D';

async function synthesizeChunk(text) {
  const [response] = await ttsClient.synthesizeSpeech({
    input: { text },
    voice: { languageCode: 'ta-IN', name: VOICE_NAME },
    audioConfig: { audioEncoding: 'MP3', speakingRate: 0.95 },
  });
  return response.audioContent;
}

async function textToMp3(text, outputPath) {
  try {
    // Google TTS limit is 5000 bytes - split long text
    const MAX_BYTES = 4000;
    const encoder = new TextEncoder();
    
    if (encoder.encode(text).length <= MAX_BYTES) {
      const [response] = await ttsClient.synthesizeSpeech({
        input: { text },
        voice: { languageCode: 'ta-IN', name: VOICE_NAME },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 0.95 },
      });
      fs.writeFileSync(outputPath, response.audioContent, 'binary');
      return fs.statSync(outputPath).size > 0;
    }

    // Split text at sentence boundaries
    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
      let cutAt = remaining.length;
      const sub = remaining.substring(0, 600); // ~4000 bytes for Tamil
      const lastDot = Math.max(sub.lastIndexOf('.'), sub.lastIndexOf('!'), sub.lastIndexOf('?'));
      if (lastDot > 200) cutAt = lastDot + 1;
      else cutAt = Math.min(600, remaining.length);
      chunks.push(remaining.substring(0, cutAt).trim());
      remaining = remaining.substring(cutAt).trim();
    }

    // Generate and combine MP3 chunks
    const buffers = [];
    for (const chunk of chunks) {
      if (!chunk) continue;
      const audio = await synthesizeChunk(chunk);
      buffers.push(Buffer.from(audio));
      await new Promise(r => setTimeout(r, 100));
    }
    
    fs.writeFileSync(outputPath, Buffer.concat(buffers));
    return fs.statSync(outputPath).size > 0;
  } catch (e) {
    console.error('    TTS error:', e.message?.substring(0, 80));
    return false;
  }
}

async function uploadMp3(localPath, storagePath) {
  try {
    await bucket.upload(localPath, {
      destination: storagePath,
      metadata: { contentType: 'audio/mpeg', cacheControl: 'public, max-age=86400' },
      public: true,
    });
    return `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
  } catch (e) {
    console.error('    Upload error:', e.message?.substring(0, 80));
    return null;
  }
}

async function generateSlotAudio(slotId, dateStr) {
  const slot = FM_CONFIG.SCHEDULE.find(s => s.id === slotId);
  console.log(`\n${slot?.emoji || '🎙️'} Generating audio: ${slotId} (${dateStr})`);

  const slotDoc = await db.collection('jaysfm').doc(dateStr).collection('slots').doc(slotId).get();
  if (!slotDoc.exists) {
    console.log(`  ⚠️ No content - run generateJayFMContent first!`);
    return false;
  }

  const data = slotDoc.data();
  const segments = data.segments || [];
  if (segments.length === 0) { console.log(`  ⚠️ No segments`); return false; }

  const audioUrls = data.audioUrls || {};
  let generated = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg.text) continue;

    const storageKey = `seg_${i}`;
    const forceRegen = process.argv.includes('--force');
    if (audioUrls[storageKey] && !forceRegen) {
      // Use cached but update duration from file size estimate
      if (!segments[i].audioDuration) {
        segments[i].audioDuration = 60; // default if not known
      }
      console.log(`  Seg ${i+1}/${segments.length} ✅ (cached)`);
      continue;
    }

    process.stdout.write(`  Seg ${i+1}/${segments.length}... `);
    const tempPath = path.join(os.tmpdir(), `jayfm_${slotId}_${i}.mp3`);
    const storagePath = `jayfm/audio/${dateStr}/${slotId}/seg_${i}.mp3`;

    const ok = await textToMp3(seg.text, tempPath);
    if (!ok) { process.stdout.write('❌ TTS failed\n'); continue; }

    const url = await uploadMp3(tempPath, storagePath);
    if (url) {
      audioUrls[storageKey] = url;
      // Store duration estimate based on file size (128kbps MP3: ~16KB/s)
      const fileSizeKb = Math.round(fs.statSync(tempPath).size / 1024);
      const estDurationSec = Math.round(fileSizeKb / 16);
      if (!segments[i].audioDuration) {
        segments[i].audioDuration = estDurationSec;
      }
      generated++;
      process.stdout.write(`✅ (${fileSizeKb}KB ~${estDurationSec}s)\n`);
    } else {
      process.stdout.write('❌ Upload failed\n');
    }

    try { fs.unlinkSync(tempPath); } catch {}
    await new Promise(r => setTimeout(r, 300));
  }

  // Build timeline - cumulative start times for each playlist item
  // Need to read full slot to get playlist + songs
  const fullDoc = await db.collection('jaysfm').doc(dateStr).collection('slots').doc(slotId).get();
  const playlist = fullDoc.data()?.playlist || [];
  
  let cumulative = 0;
  const timeline = playlist.map(item => {
    const startMs = cumulative;
    let durationMs = 0;
    if (item.type === 'content') {
      const seg = segments[item.segIndex];
      durationMs = (seg?.audioDuration || 60) * 1000;
    } else if (item.type === 'song') {
      durationMs = (item.duration || 180) * 1000;
    }
    cumulative += durationMs;
    return { ...item, startMs, durationMs, endMs: cumulative };
  });
  
  const totalDurationMs = cumulative;
  
  // Get scheduled slot duration
  const slotConfig = FM_CONFIG.SCHEDULE.find(s => s.id === slotId);
  let scheduledMins = 60; // default
  if (slotConfig) {
    const startMins = slotConfig.startHour * 60 + slotConfig.startMin;
    let endMins = slotConfig.endHour * 60 + slotConfig.endMin;
    if (endMins < startMins) endMins += 24 * 60;
    scheduledMins = endMins - startMins;
  }
  const scheduledMs = scheduledMins * 60 * 1000;
  const diffMins = Math.round((scheduledMs - totalDurationMs) / 60000);
  
  console.log(`  ⏱️ Content+Songs: ${Math.round(totalDurationMs/60000)}min / Scheduled: ${scheduledMins}min`);
  
  if (diffMins > 5) {
    console.log(`  ⚠️ Short by ${diffMins}min - fetching filler songs...`);
    
    // Fetch additional songs to fill the gap
    const fillerNeededMs = scheduledMs - totalDurationMs;
    const fillerSongsNeeded = Math.ceil(fillerNeededMs / (180 * 1000)); // ~3min per song
    
    try {
      const fillerQueries = ['Tamil melody instrumental', 'Tamil BGM music', 'Tamil soft songs'];
      const fillerSongs = [];
      const seenTitles = new Set(playlist.filter(i => i.type === 'song').map(i => 
        i.title?.toLowerCase().replace(/[^a-z]/g,'').substring(0,15)
      ));
      
      for (const query of fillerQueries) {
        if (fillerSongs.length >= fillerSongsNeeded) break;
        const res = await fetch(`${CLOUD_FUNCTION_URL}?query=${encodeURIComponent(query)}&count=10`);
        const json = await res.json();
        const songs = (json.songs || []).filter(s => {
          const key = s.title?.toLowerCase().replace(/[^a-z]/g,'').substring(0,15);
          return s.url && !seenTitles.has(key);
        });
        for (const s of songs) {
          if (fillerSongs.length >= fillerSongsNeeded) break;
          const key = s.title?.toLowerCase().replace(/[^a-z]/g,'').substring(0,15);
          seenTitles.add(key);
          fillerSongs.push(s);
        }
      }
      
      // Add filler songs to playlist and timeline
      let fillerCumulative = totalDurationMs;
      for (const song of fillerSongs) {
        const dur = (song.duration || 180) * 1000;
        timeline.push({ type: 'song', ...song, startMs: fillerCumulative, durationMs: dur, endMs: fillerCumulative + dur, isFiller: true });
        playlist.push({ type: 'song', ...song, isFiller: true });
        fillerCumulative += dur;
        console.log(`  🎵 Filler: ${song.title?.substring(0,40)} (+${Math.round(dur/60000)}min)`);
      }
      
      const newTotal = fillerCumulative;
      console.log(`  ✅ After filler: ${Math.round(newTotal/60000)}min / ${scheduledMins}min scheduled`);
    } catch (e) {
      console.log(`  ⚠️ Filler fetch failed: ${e.message}`);
    }
  } else if (diffMins < -5) {
    console.log(`  ⚠️ Over by ${Math.abs(diffMins)}min - slot will run long`);
  } else {
    console.log(`  ✅ Duration OK (within 5min)`);
  }

  await db.collection('jaysfm').doc(dateStr).collection('slots').doc(slotId).update({
    audioUrls,
    segments,
    timeline,
    totalDurationMs,
    audioGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Save playlist.json to Firebase Storage for fast CDN access
  try {
    const fullDoc = await db.collection('jaysfm').doc(dateStr).collection('slots').doc(slotId).get();
    const fullData = fullDoc.data();
    const playlistJson = JSON.stringify({
      slotId,
      dateStr,
      totalDurationMs,
      audioUrls,
      playlist: fullData.playlist || [],
      timeline,
      generatedAt: new Date().toISOString(),
    });
    const jsonPath = `jayfm/data/${dateStr}/${slotId}/playlist.json`;
    const tmpPath = require('path').join(require('os').tmpdir(), `pl_${slotId}.json`);
    require('fs').writeFileSync(tmpPath, playlistJson);
    await bucket.upload(tmpPath, {
      destination: jsonPath,
      metadata: { contentType: 'application/json', cacheControl: 'public, max-age=3600' },
      public: true,
    });
    console.log(`  ✅ playlist.json saved to CDN`);
    try { require('fs').unlinkSync(tmpPath); } catch {}
  } catch(e) {
    console.log(`  ⚠️ playlist.json failed: ${e.message}`);
  }

  console.log(`  ✅ ${generated}/${segments.length} segments audio ready`);
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const slotArg = args.find(a => a.startsWith('--slot='))?.split('=')[1];
  const morning = args.includes('--morning');
  const afternoon = args.includes('--afternoon');
  const all = args.includes('--all') || args.includes('--today');

  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const dateStr = ist.toISOString().split('T')[0];

  console.log(`\n🎙️ Jay FM Audio Generator — ${dateStr}`);
  console.log(`🎤 Voice: ${VOICE_NAME}\n`);

  let slots = [];
  if (slotArg) slots = [slotArg];
  else if (morning) slots = ['rhythms','rasi_palan','morning_news','thalaivar','health','movie_review','agriculture','travel'];
  else if (afternoon) slots = ['local_news','weather','comedy','science','evening_news','horror','love','night'];
  else if (all) slots = FM_CONFIG.SCHEDULE.map(s => s.id);
  else {
    console.log('Usage: node scripts/generateFMAudio.js --today [--slot=rhythms|--morning|--afternoon]');
    process.exit(0);
  }

  for (const slotId of slots) await generateSlotAudio(slotId, dateStr);

  console.log('\n✅ Audio generation complete!');
  console.log('🌐 Refresh portal: https://rideai-84dff.web.app/jayfm/');
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });