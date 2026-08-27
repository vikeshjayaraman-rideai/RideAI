// functions/src/fmLiveState.ts
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

const FM_SCHEDULE = [
  { id: 'rhythms',      title: 'Rhythms',        startHour: 6,  startMin: 0,  endHour: 8,  endMin: 0  },
  { id: 'rasi_palan',  title: 'Rasi Palan',      startHour: 8,  startMin: 0,  endHour: 8,  endMin: 30 },
  { id: 'morning_news',title: 'Morning News',    startHour: 8,  startMin: 30, endHour: 9,  endMin: 30 },
  { id: 'thalaivar',   title: 'Thalaivar Valga', startHour: 9,  startMin: 30, endHour: 10, endMin: 30 },
  { id: 'health',      title: 'Healthy Tips',    startHour: 10, startMin: 30, endHour: 11, endMin: 30 },
  { id: 'movie_review',title: 'Movie Masala',    startHour: 11, startMin: 30, endHour: 12, endMin: 30 },
  { id: 'agriculture', title: 'Vivasayam',       startHour: 12, startMin: 0,  endHour: 12, endMin: 30 },
  { id: 'travel',      title: 'Travel Time',     startHour: 12, startMin: 30, endHour: 14, endMin: 0  },
  { id: 'local_news',  title: 'Local News',      startHour: 14, startMin: 0,  endHour: 14, endMin: 30 },
  { id: 'weather',     title: 'Weather Update',  startHour: 14, startMin: 30, endHour: 14, endMin: 45 },
  { id: 'comedy',      title: 'Comedy Stop',     startHour: 14, startMin: 45, endHour: 16, endMin: 30 },
  { id: 'science',     title: 'Science Time',    startHour: 16, startMin: 30, endHour: 18, endMin: 0  },
  { id: 'evening_news',title: 'Evening News',    startHour: 18, startMin: 0,  endHour: 19, endMin: 0  },
  { id: 'horror',      title: 'Horror Hour',     startHour: 19, startMin: 0,  endHour: 20, endMin: 0  },
  { id: 'love',        title: 'Love Stories',    startHour: 20, startMin: 0,  endHour: 21, endMin: 0  },
  { id: 'night',       title: 'Night Life',      startHour: 21, startMin: 0,  endHour: 6,  endMin: 0  },
];

function getCurrentSlot() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const currentMins = ist.getHours() * 60 + ist.getMinutes();
  for (const slot of FM_SCHEDULE) {
    const startMins = slot.startHour * 60 + slot.startMin;
    let endMins = slot.endHour * 60 + slot.endMin;
    if (endMins < startMins) endMins += 24 * 60;
    const adj = currentMins < startMins ? currentMins + 24 * 60 : currentMins;
    if (adj >= startMins && adj < endMins) return slot;
  }
  return FM_SCHEDULE[0];
}

export const updateFMLiveState = onSchedule({
  schedule: '* * * * *',
  timeZone: 'Asia/Kolkata',
  timeoutSeconds: 60,
  memory: '256MiB',
}, async () => {
  const db = admin.firestore();
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const dateStr = ist.toISOString().split('T')[0];

  const targetSlot = getCurrentSlot();

  // Get current live state
  const liveDoc = await db.collection('jaysfm_live').doc('now_playing').get();
  const liveData = liveDoc.exists ? liveDoc.data()! : {};
  const currentSlotId = liveData.slotId;
  const isComplete = liveData.playlistComplete === true;
  const slotChanged = currentSlotId !== targetSlot.id || isComplete;

  if (slotChanged) {
    await db.collection('jaysfm_live').doc('now_playing').set({
      slotId: targetSlot.id,
      slotTitle: targetSlot.title,
      dateStr,
      slotStartedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      playlistComplete: false,
    });
    console.log(`New slot: ${targetSlot.id}`);
  } else {
    await db.collection('jaysfm_live').doc('now_playing').update({
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`Same slot: ${targetSlot.id}`);
  }
});