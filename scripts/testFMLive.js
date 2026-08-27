// scripts/testFMLive.js
const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const serviceAccount = require(path.join(__dirname, '..', 'google-services-admin.json'));
if (!admin.apps.length) {
  admin.initializeApp({ 
    credential: admin.credential.cert(serviceAccount),
    storageBucket: `${serviceAccount.project_id}.firebasestorage.app`,
  });
}
const db = admin.firestore();
const FM_CONFIG = require('./jayFMConfig');

function getCurrentSlot() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const currentMins = ist.getHours() * 60 + ist.getMinutes();
  for (const slot of FM_CONFIG.SCHEDULE) {
    const startMins = slot.startHour * 60 + slot.startMin;
    let endMins = slot.endHour * 60 + slot.endMin;
    if (endMins < startMins) endMins += 24 * 60;
    const adj = currentMins < startMins ? currentMins + 24 * 60 : currentMins;
    if (adj >= startMins && adj < endMins) return slot;
  }
  return FM_CONFIG.SCHEDULE[0];
}

async function setLiveState() {
  const slot = getCurrentSlot();
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const dateStr = ist.toISOString().split('T')[0];

  console.log('Current slot:', slot.id, slot.title, 'date:', dateStr);

  const slotDoc = await db.collection('jaysfm').doc(dateStr).collection('slots').doc(slot.id).get();
  if (!slotDoc.exists) {
    console.log('No content - run generateJayFMContent first!');
    process.exit(1);
  }

  const data = slotDoc.data();
  const playlist = data.playlist || [];
  const audioUrls = data.audioUrls || {}; // Google TTS MP3 URLs

  console.log('Playlist:', playlist.length, 'items');
  console.log('Audio URLs:', Object.keys(audioUrls).length, 'segments');

  // Find first content item with audio URL
  const firstContent = playlist.find(i => i.type === 'content' && audioUrls[`seg_${i.segIndex}`]);
  const firstSong = playlist.find(i => i.type === 'song' && i.url);

  // Use content with audio if available, else song
  const item = firstContent || firstSong || playlist[0];
  const audioUrl = firstContent 
    ? audioUrls[`seg_${firstContent.segIndex}`]
    : (firstSong?.url || null);

  console.log('Playing:', item?.type, audioUrl ? '✅ has audio URL' : '⚠️ no audio URL');

  await db.collection('jaysfm_live').doc('now_playing').set({
    slotId: slot.id,
    slotTitle: slot.title,
    slotEmoji: slot.emoji,
    dateStr,
    slotStartedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    playlistComplete: false,
    itemIndex: 0,
    totalItems: playlist.length,
    positionMs: 0,
  });

  console.log('✅ Live state updated!');
  if (audioUrl) console.log('🎵 Audio URL:', audioUrl.substring(0, 80));
  console.log('🌐 https://rideai-84dff.web.app/jayfm/');
  process.exit(0);
}

setLiveState().catch(console.error);