// services/rideChatService.ts
import {
  getFirestore, collection, doc, setDoc, onSnapshot,
  query, orderBy, getDoc, getDocs,
} from '@react-native-firebase/firestore';
import { getAuth } from '@react-native-firebase/auth';

const db = getFirestore();

export interface RideMessage {
  id: string;
  senderUid: string;
  senderName: string;
  senderPhoto: string;
  message: string;
  taggedUid?: string;
  taggedName?: string;
  replyToId?: string;
  replyToSender?: string;
  replyToMessage?: string;
  isQuick: boolean;
  createdAt: string;
}

export const EMOJI_LIST = ['👍','👎','❤️','😂','😮','😢','🔥','💯','🏍️','✅','⚠️','📍','☕','⛽','🆘','👋','🙏','💪','🎉','😎'];

export const QUICK_MESSAGES = [
  { id: 'q1', text: '👋 Hey, wait for me!', emoji: '👋' },
  { id: 'q2', text: '☕ Stopped for a break', emoji: '☕' },
  { id: 'q3', text: '⛽ Fuel stop, 5 mins', emoji: '⛽' },
  { id: 'q4', text: '✅ I am on route', emoji: '✅' },
  { id: 'q5', text: '🏍️ Starting now', emoji: '🏍️' },
  { id: 'q6', text: '📍 At checkpoint', emoji: '📍' },
  { id: 'q7', text: '⚠️ Road block ahead', emoji: '⚠️' },
  { id: 'q8', text: '🆘 Need help!', emoji: '🆘' },
];

// ── Send a message ────────────────────────────────────────────────────────────
export const sendRideMessage = async (
  tripId: string,
  message: string,
  isQuick: boolean,
  taggedUid?: string,
  taggedName?: string,
  replyTo?: { id: string; senderName: string; message: string },
): Promise<void> => {
  const uid = getAuth().currentUser?.uid;
  if (!uid) return;

  try {
    const userSnap = await getDoc(doc(collection(db, 'users'), uid));
    const userData = userSnap.exists() ? userSnap.data() : {};
    const senderName = userData.name || 'Rider';
    const senderPhoto = (userData.photoURL || '').startsWith('https') ? userData.photoURL : '';

    const msgId = `msg_${Date.now()}_${uid}`;
    const msgData: any = {
      id: msgId,
      senderUid: uid,
      senderName,
      senderPhoto,
      message,
      isQuick,
      createdAt: new Date().toISOString(),
    };
    if (taggedUid) { msgData.taggedUid = taggedUid; msgData.taggedName = taggedName; }
    if (replyTo) { msgData.replyToId = replyTo.id; msgData.replyToSender = replyTo.senderName; msgData.replyToMessage = replyTo.message; }

    await setDoc(doc(collection(db, `trips/${tripId}/rideChat`), msgId), msgData);

    // Notify all other riders
    const locSnap = await getDocs(collection(db, `trips/${tripId}/riderLocations`));
    const otherUids = locSnap.docs.map(d => d.id).filter(id => id !== uid);

    for (const recipientUid of otherUids) {
      await setDoc(
        doc(collection(db, 'notifications'), `chat_${msgId}_${recipientUid}`),
        {
          type: 'ride_chat',
          notifType: 'ride_chat',
          recipientUid,
          senderUid: uid,
          senderName,
          tripId,
          message: taggedUid ? `@${taggedName}: ${message}` : message,
          read: false,
          createdAt: new Date().toISOString(),
        }
      );
    }
  } catch (e) {
    console.error('sendRideMessage error:', e);
    throw e;
  }
};

// ── Subscribe to chat messages ────────────────────────────────────────────────
export const subscribeToRideChat = (
  tripId: string,
  onUpdate: (messages: RideMessage[]) => void,
): (() => void) => {
  const q = query(
    collection(db, `trips/${tripId}/rideChat`),
    orderBy('createdAt', 'asc'),
  );
  return onSnapshot(q, (snap) => {
    const messages = snap.docs.map(d => d.data() as RideMessage);
    onUpdate(messages);
  });
};

// ── Off-route alert ───────────────────────────────────────────────────────────
export const sendOffRouteAlert = async (
  tripId: string,
  riderName: string,
  location: { lat: number; lng: number },
): Promise<void> => {
  const uid = getAuth().currentUser?.uid;
  if (!uid) return;
  try {
    const locSnap = await getDocs(collection(db, `trips/${tripId}/riderLocations`));
    const otherUids = locSnap.docs.map(d => d.id).filter(id => id !== uid);
    const message = `⚠️ ${riderName} is off route! Check on them.`;
    const alertId = `offalert_${tripId}_${uid}_${Date.now()}`;

    // Send as a chat message visible to all
    await setDoc(doc(collection(db, `trips/${tripId}/rideChat`), alertId), {
      id: alertId,
      senderUid: 'system',
      senderName: 'Alert',
      senderPhoto: '',
      message,
      isQuick: false,
      isAlert: true,
      alertUid: uid,
      createdAt: new Date().toISOString(),
    });

    // Notify all riders
    for (const recipientUid of otherUids) {
      await setDoc(
        doc(collection(db, 'notifications'), `offalert_${alertId}_${recipientUid}`),
        {
          type: 'off_route_alert',
          notifType: 'off_route',
          recipientUid,
          senderUid: uid,
          senderName: riderName,
          tripId,
          message,
          read: false,
          createdAt: new Date().toISOString(),
        }
      );
    }
  } catch (e) { console.error('sendOffRouteAlert error:', e); }
};
