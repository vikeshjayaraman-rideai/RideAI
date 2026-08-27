// services/agoraService.ts
// Agora voice channel for group ride voice meet

const AGORA_APP_ID = 'YOUR_AGORA_APP_ID'; // Replace with actual App ID

export const getAgoraAppId = () => AGORA_APP_ID;

// Generate a simple channel name from trip ID
export const getChannelName = (tripId: string): string => {
  return `rideai_${tripId.replace(/[^a-zA-Z0-9]/g, '')}`.substring(0, 64);
};

// Generate a numeric UID from Firebase UID
export const getAgoraUid = (firebaseUid: string): number => {
  let hash = 0;
  for (let i = 0; i < firebaseUid.length; i++) {
    const char = firebaseUid.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash) % 100000;
};