// functions/src/generateFMAudioCF.ts
// Cloud Functions: Generate Jay FM audio on schedule
// Morning audio: 5:30AM IST | Afternoon audio: 11:30AM IST

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';


const CONFIG = {
  MORNING_HOUR: 5,    MORNING_MINUTE: 30,
  AFTERNOON_HOUR: 11, AFTERNOON_MINUTE: 30,
  MORNING_SLOTS:   ['rhythms','rasi_palan','morning_news','thalaivar','health','movie_review','agriculture','travel'],
  AFTERNOON_SLOTS: ['local_news','weather','comedy','science','evening_news','horror','love','night'],
  TIMEZONE: 'Asia/Kolkata',
  BUCKET: 'rideai-84dff.firebasestorage.app',
  // Voice per slot - change here to customize
  SLOT_VOICES: {
    rasi_palan:   'ta-IN-Wavenet-A', // female
    morning_news: 'ta-IN-Wavenet-D',
    thalaivar:    'ta-IN-Wavenet-B',
    love:         'ta-IN-Wavenet-C',
  } as Record<string, string>,
  DEFAULT_VOICE: 'ta-IN-Wavenet-D',
};

function getDate(): string {
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: CONFIG.TIMEZONE }));
  return ist.toISOString().split('T')[0];
}

async function synthesize(client: any, text: string, voice: string, outPath: string): Promise<number> {
  const MAX = 4000;
  const enc = new TextEncoder();
  const synth = async (t: string) => {
    const [r] = await client.synthesizeSpeech({
      input: { text: t },
      voice: { languageCode: 'ta-IN', name: voice },
      audioConfig: { audioEncoding: 'MP3' as const, speakingRate: 0.95 },
    });
    return r.audioContent as Uint8Array;
  };

  if (enc.encode(text).length <= MAX) {
    fs.writeFileSync(outPath, Buffer.from(await synth(text)));
  } else {
    const chunks: string[] = [];
    let rem = text;
    while (rem.length > 0) {
      const sub = rem.substring(0, 500);
      const cut = Math.max(sub.lastIndexOf('.'), sub.lastIndexOf('!'), sub.lastIndexOf('?'));
      const at = cut > 100 ? cut + 1 : Math.min(500, rem.length);
      chunks.push(rem.substring(0, at).trim());
      rem = rem.substring(at).trim();
    }
    const bufs: Buffer[] = [];
    for (const c of chunks) {
      if (c) { bufs.push(Buffer.from(await synth(c))); await new Promise(r => setTimeout(r, 200)); }
    }
    fs.writeFileSync(outPath, Buffer.concat(bufs));
  }
  return fs.statSync(outPath).size;
}

async function generateAudio(db: admin.firestore.Firestore, slots: string[]) {
  const dateStr = getDate();
  console.log(`\n[mic] Jay FM Audio — ${dateStr}`);

  // eslint-disable-next-line @typescript-eslint/no-var-requires
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
const client = new TextToSpeechClient();
  const bucket = admin.storage().bucket(CONFIG.BUCKET);

  for (const slotId of slots) {
    try {
      console.log(`\n[audio] ${slotId}`);
      const slotDoc = await db.collection('jaysfm').doc(dateStr).collection('slots').doc(slotId).get();
      if (!slotDoc.exists) { console.log('  ⚠️ No content'); continue; }

      const data = slotDoc.data()!;
      const segments: any[] = data.segments || [];
      const playlist: any[] = data.playlist || [];
      const audioUrls: Record<string, string> = data.audioUrls || {};
      const voice = CONFIG.SLOT_VOICES[slotId] || CONFIG.DEFAULT_VOICE;

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (!seg?.text) continue;
        const key = `seg_${i}`;
        if (audioUrls[key]) {
          if (!seg.audioDuration) seg.audioDuration = 60;
          process.stdout.write(`  Seg ${i+1} ✅ cached\n`);
          continue;
        }
        process.stdout.write(`  Seg ${i+1}/${segments.length} (${voice})... `);
        const tmp = path.join(os.tmpdir(), `fm_${slotId}_${i}.mp3`);
        const storagePath = `jayfm/audio/${dateStr}/${slotId}/seg_${i}.mp3`;
        try {
          const size = await synthesize(client, seg.text, voice, tmp);
          seg.audioDuration = Math.round(size / 1024 / 16);
          await bucket.upload(tmp, { destination: storagePath, metadata: { contentType: 'audio/mpeg' }, public: true });
          audioUrls[key] = `https://storage.googleapis.com/${CONFIG.BUCKET}/${storagePath}`;
          process.stdout.write(`✅ (~${seg.audioDuration}s)\n`);
          try { fs.unlinkSync(tmp); } catch {}
        } catch (e: any) { process.stdout.write(`❌ ${e.message?.substring(0,40)}\n`); }
        await new Promise(r => setTimeout(r, 300));
      }

      // Build timeline
      let cum = 0;
      const timeline = playlist.map((item: any) => {
        const start = cum;
        const dur = item.type === 'content'
          ? (segments[item.segIndex]?.audioDuration || 60) * 1000
          : (item.duration || 180) * 1000;
        cum += dur;
        return { ...item, startMs: start, durationMs: dur, endMs: cum };
      });

      await db.collection('jaysfm').doc(dateStr).collection('slots').doc(slotId).update({
        audioUrls, segments, timeline, totalDurationMs: cum,
        audioGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`  ✅ Timeline: ${Math.round(cum/60000)}min`);
    } catch (e: any) { console.error(`❌ ${slotId}:`, e.message); }
  }
}

// Morning audio: 5:30AM IST
export const generateFMAudioMorning = onSchedule({
  schedule: `${CONFIG.MORNING_MINUTE} ${CONFIG.MORNING_HOUR} * * *`,
  timeZone: CONFIG.TIMEZONE,
  timeoutSeconds: 540,
  memory: '1GiB',
}, async () => {
  const db = admin.firestore();
  await generateAudio(db, CONFIG.MORNING_SLOTS);
});

// Afternoon audio: 11:30AM IST
export const generateFMAudioAfternoon = onSchedule({
  schedule: `${CONFIG.AFTERNOON_MINUTE} ${CONFIG.AFTERNOON_HOUR} * * *`,
  timeZone: CONFIG.TIMEZONE,
  timeoutSeconds: 540,
  memory: '1GiB',
}, async () => {
  const db = admin.firestore();
  await generateAudio(db, CONFIG.AFTERNOON_SLOTS);
});