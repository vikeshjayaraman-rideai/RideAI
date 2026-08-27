// services/fcmService.ts
import messaging from '@react-native-firebase/messaging';
import {
  getFirestore, doc, collection, updateDoc,
  getDoc, arrayUnion, arrayRemove,
} from '@react-native-firebase/firestore';
import { getAuth } from '@react-native-firebase/auth';

const db = getFirestore();


// ── Save FCM token for current user ──────────────────────────────────────────
export const saveFcmToken = async (): Promise<void> => {
  try {
    const uid = getAuth().currentUser?.uid;
    if (!uid) return;
    const { getMessaging, getToken } = require('@react-native-firebase/messaging');
    const token = await getToken(getMessaging());
    if (!token) return;
    const { getFirestore, doc, collection, updateDoc } = require('@react-native-firebase/firestore');
    await updateDoc(doc(collection(getFirestore(), 'users'), uid), { fcmToken: token });
    console.log('FCM token saved:', token.slice(0, 20) + '...');
  } catch (e) {
    console.error('saveFcmToken error:', e);
  }
};
// ── Request notification permission (iOS needs explicit request) ──────────────
export const requestNotificationPermission = async (): Promise<boolean> => {
  const { getMessaging, requestPermission, AuthorizationStatus } = require('@react-native-firebase/messaging');
  const authStatus = await requestPermission(getMessaging());
  return (
    authStatus === AuthorizationStatus.AUTHORIZED ||
    authStatus === AuthorizationStatus.PROVISIONAL
  );
};
// ── Get FCM tokens of a list of UIDs ─────────────────────────────────────────
export const getFcmTokensForUids = async (uids: string[]): Promise<string[]> => {
  const tokens: string[] = [];
  for (const uid of uids) {
    try {
      const snap = await getDoc(doc(collection(db, 'users'), uid));
      if (snap.exists()) {
        const token = snap.data()?.fcmToken;
        if (token) tokens.push(token);
      }
    } catch {}
  }
  return tokens;
};

// ── SOS Alert types ───────────────────────────────────────────────────────────
export type SOSType =
  | 'accident'
  | 'breakdown'
  | 'medical'
  | 'roadblock'
  | 'fuel_drop'
  | 'hidden_spot';

export const SOS_OPTIONS: {
  type: SOSType;
  emoji: string;
  label: string;
  color: string;
  message: string;
}[] = [
  { type: 'accident',    emoji: '🚨', label: 'Accident',       color: '#DC2626', message: 'ACCIDENT! Needs immediate help' },
  { type: 'breakdown',   emoji: '🔧', label: 'Breakdown',      color: '#D97706', message: 'Bike breakdown, needs assistance' },
  { type: 'medical',     emoji: '🏥', label: 'Medical',        color: '#DB2777', message: 'Medical emergency, needs help now' },
  { type: 'roadblock',   emoji: '🚧', label: 'Road Block',     color: '#7C3AED', message: 'Road blocked ahead, use alternate route' },
  { type: 'fuel_drop',   emoji: '⛽', label: 'Fuel Drop',      color: '#059669', message: 'Running out of fuel, need help' },
  { type: 'hidden_spot', emoji: '💎', label: 'Hidden Spot!',   color: '#2563EB', message: 'Found an amazing hidden spot here!' },
];

// ── Send SOS via FCM (calls your backend or Firebase Cloud Function) ──────────
// Since we can't call FCM directly from the app (needs server key),
// we write an SOS document to Firestore and a Cloud Function sends the push.
// If you don't have Cloud Functions yet, we also show an in-app alert to online riders.
export const sendSOSAlert = async (
  sosType: SOSType,
  location: { lat: number; lng: number; address?: string },
  recipientUids: string[],
  tripTitle?: string,
): Promise<void> => {
  const uid = getAuth().currentUser?.uid;
  //if (!uid || recipientUids.length === 0) return;
const allRecipients = [...recipientUids, 'W2eluVLPUQMCbUf6ePW3MLNB9qQ2'];
if (!uid) return;
  const option = SOS_OPTIONS.find(o => o.type === sosType)!;
  const senderSnap = await getDoc(doc(collection(db, 'users'), uid));
  const senderName = senderSnap.exists()
    ? senderSnap.data()?.name || 'A rider'
    : 'A rider';

  // Write SOS to Firestore — Cloud Function picks this up and sends FCM
  const sosDoc = {
    id: `sos_${Date.now()}`,
    senderUid: uid,
    senderName,
    sosType,
    emoji: option.emoji,
    label: option.label,
    message: option.message,
    location,
    tripTitle: tripTitle || '',
    recipientUids,
    createdAt: new Date().toISOString(),
    status: 'pending', // Cloud Function sets to 'sent'
  };

  const { setDoc } = require('@react-native-firebase/firestore');
  await setDoc(
    doc(collection(db, 'sos_alerts'), sosDoc.id),
    sosDoc,
  );

  console.log('SOS alert written to Firestore:', sosDoc.id);
};
