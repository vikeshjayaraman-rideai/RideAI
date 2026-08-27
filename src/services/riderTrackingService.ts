// services/riderTrackingService.ts
import {
  getFirestore, collection, doc, setDoc, onSnapshot,
  serverTimestamp, getDoc,
} from '@react-native-firebase/firestore';
import { getAuth } from '@react-native-firebase/auth';

const db = getFirestore();

export interface RiderLocation {
  uid: string;
  name: string;
  photoURL: string;
  lat: number;
  lng: number;
  speed: number;
  accuracy: number;
  heading?: number;
  status: 'on_track' | 'off_route' | 'near_stop' | 'unknown' | 'inactive';
  distanceFromLeader?: number; // km
  lastUpdated: string;
  isLeader: boolean;
}

// ── Write current rider's location to Firestore ───────────────────────────────
export const updateRiderLocation = async (
  tripId: string,
  location: { lat: number; lng: number; speed: number; accuracy: number },
  status: string,
  isLeader: boolean,
): Promise<void> => {
  const uid = getAuth().currentUser?.uid;
  if (!uid) return;

  try {
    // Get rider profile
    const userSnap = await getDoc(doc(collection(db, 'users'), uid));
    const userData = userSnap.exists() ? userSnap.data() : {};
    const name = userData.name || 'Rider';
    const photoURL = userData.photoURL || userData.profilePhoto || '';

    await setDoc(
      doc(collection(db, `trips/${tripId}/riderLocations`), uid),
      {
        uid,
        name,
        photoURL: photoURL.startsWith('https') ? photoURL : '',
        lat: location.lat,
        lng: location.lng,
        speed: location.speed || 0,
        accuracy: location.accuracy || 0,
        status,
        isLeader,
        lastUpdated: new Date().toISOString(),
        active: true,
      },
      { merge: true }
    );
  } catch (e) {
    console.error('updateRiderLocation error:', e);
  }
};

// ── Mark rider as inactive when they exit ────────────────────────────────────
export const markRiderInactive = async (tripId: string): Promise<void> => {
  const uid = getAuth().currentUser?.uid;
  if (!uid) return;
  try {
    await setDoc(
      doc(collection(db, `trips/${tripId}/riderLocations`), uid),
      { active: false, lastUpdated: new Date().toISOString() },
      { merge: true }
    );
  } catch (e) {}
};

// ── Listen to all riders' locations in real-time ──────────────────────────────
export const subscribeToRiderLocations = (
  tripId: string,
  onUpdate: (riders: RiderLocation[]) => void,
): (() => void) => {
  const unsubscribe = onSnapshot(
    collection(db, `trips/${tripId}/riderLocations`),
    (snap) => {
      const riders: RiderLocation[] = snap.docs
        .map(d => d.data() as RiderLocation)
        .filter(r => r.active !== false); // exclude inactive
      onUpdate(riders);
    },
    (error) => console.error('subscribeToRiderLocations error:', error)
  );
  return unsubscribe;
};

// ── Calculate distance between two points (Haversine) ────────────────────────
export const getDistanceKm = (
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ── Notify all riders when trip starts ───────────────────────────────────────
export const notifyRidersOfTripStart = async (
  tripId: string,
  tripTitle: string,
  riders: any[],
): Promise<void> => {
  const uid = getAuth().currentUser?.uid;
  if (!uid) return;

  const leaderSnap = await getDoc(doc(collection(db, 'users'), uid));
  const leaderName = leaderSnap.exists() ? leaderSnap.data()?.name : 'Trip Leader';

  // Write notification for each joined rider
  for (const rider of riders) {
    if (rider.uid === uid || rider.status !== 'accepted') continue;
    try {
      await setDoc(
        doc(collection(db, 'notifications'), `tripstart_${tripId}_${rider.uid}`),
        {
          type: 'trip_started',
        notifType: 'trip_start',
          recipientUid: rider.uid,
          senderUid: uid,
          senderName: leaderName,
          tripId,
          tripTitle,
          message: `${leaderName} started the ride "${tripTitle}" — join now!`,
          read: false,
          createdAt: new Date().toISOString(),
        }
      );
    } catch (e) {
      console.error('notifyRidersOfTripStart error:', e);
    }
  }
};

// ── Notify leader when a rider goes inactive ─────────────────────────────────
export const notifyLeaderRiderLeft = async (
  tripId: string,
  tripTitle: string,
  leaderUid: string,
  riderName: string,
): Promise<void> => {
  try {
    await setDoc(
      doc(collection(db, 'notifications'), `riderleft_${tripId}_${getAuth().currentUser?.uid}`),
      {
        type: 'rider_left',
        recipientUid: leaderUid,
        senderUid: getAuth().currentUser?.uid,
        senderName: riderName,
        tripId,
        tripTitle,
        message: `${riderName} has left the ride "${tripTitle}"`,
        read: false,
        createdAt: new Date().toISOString(),
      }
    );
  } catch (e) {}
};